/**
 * accounting-post.ts — single entry point for converting business events into
 * balanced journal entries (Dr/Cr).
 *
 * Design rule (AGENTS.md + phase-1 hardening): this module is called from API
 * routes under service role AFTER the business event (order, expense, purchase)
 * commits successfully. Never inline into a hot trigger on customer-facing
 * order tables (would hurt 100ms checkout latency + create mystery side-effects
 * when vendors rerun the same request). Idempotency is enforced by the unique
 * (project_id, reference_type, reference_id) key on journal_entries — calling
 * the same posting twice is a no-op.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type AdminClient = SupabaseClient<Database>;

/** Balanced postingero result — never throws, because checkout must never fail
 * because accounting failed. Errors are returned as non-null for Sentry. **/
export type PostResult =
  | { ok: true; journalEntryId: string }
  | { ok: false; skipped: 'already_posted' | 'no_coa' | 'db_error'; error?: string };

/**
 * Post a completed customer order (POS or QR) into the ledger as:
 *
 *   DR  1000 Cash on Hand            total_minor
 *     CR 4000 Restaurant Sales       (gross)
 *
 * Uses project.currency for minor-unit conversions (BHD=3, SAR=2 etc).
 * Caller: /api/pos/order, /api/public/order — AFTER the order row commits.
 */
export async function postOrderToJournal(
  admin: AdminClient,
  params: {
    projectId: string;
    orderId: string;
    totalMinor: number;       // total_amount in minor currency units
    userId: string;           // who placed the order (staff or guest service)
    isDelivery?: boolean;     // optional: route to delivery sales account
  }
): Promise<PostResult> {
  const { projectId, orderId, totalMinor, userId, isDelivery = false } = params;

  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    return { ok: false, skipped: 'db_error', error: `Invalid totalMinor=${totalMinor}` };
  }

  // Determine sales account (delivery vs restaurant)
  const salesCode = isDelivery ? '4100' : '4000';
  const [cashAcc, salesAcc] = await Promise.all([
    admin.from('accounts').select('id')
      .eq('project_id', projectId).eq('code', '1000').single(),
    admin.from('accounts').select('id')
      .eq('project_id', projectId).eq('code', salesCode).single(),
  ]);

  if (!cashAcc.data || !salesAcc.data) {
    return { ok: false, skipped: 'no_coa', error: 'Seeded COA missing cash/sales' };
  }

  // Check idempotency: has this order already been posted?
  const { data: existing } = await admin
    .from('journal_entries')
    .select('id')
    .eq('project_id', projectId)
    .eq('reference_type', 'order')
    .eq('reference_id', orderId)
    .maybeSingle();

  if (existing) {
    return { ok: true, journalEntryId: existing.id };
  }

  // Create the draft journal entry + lines in sequence. NOTE: draft has
  // posted=false, so lines can be created under service role, then flip
  // posted=true which fires the balance-guard trigger.
  const { data: entry, error: e1 } = await admin
    .from('journal_entries')
    .insert({
      project_id: projectId,
      reference_type: 'order',
      reference_id: orderId,
      memo: `POS/QR Order #${orderId.slice(0, 8)}`,
      posted_by: userId,
      posted: false,
    })
    .select('id')
    .single();

  if (e1 || !entry) {
    return { ok: false, skipped: 'db_error', error: e1?.message ?? 'entry insert failed' };
  }

  // Two lines — debit cash, credit sales. Balances automatically match.
  const { error: e2 } = await admin.from('journal_entry_lines').insert([
    {
      journal_entry_id: entry.id,
      project_id: projectId,
      account_id: cashAcc.data.id,
      debit_minor: totalMinor,
      credit_minor: 0,
      memo: 'استلام نقد / بطاقة',
    },
    {
      journal_entry_id: entry.id,
      project_id: projectId,
      account_id: salesAcc.data.id,
      debit_minor: 0,
      credit_minor: totalMinor,
      memo: isDelivery ? 'مبيعات توصيل' : 'مبيعات مطعم',
    },
  ]);

  if (e2) {
    // Cleanup partial entry to keep ledger consistent
    await admin.from('journal_entries').delete().eq('id', entry.id);
    return { ok: false, skipped: 'db_error', error: `lines: ${e2.message}` };
  }

  // Flip to posted (trigger validates balance). If it fails for any reason,
  // the journal_entries row remains as a pending draft (visible to auditors).
  const { error: e3 } = await admin
    .from('journal_entries')
    .update({ posted: true })
    .eq('id', entry.id);

  if (e3) {
    // Posted-fail = accounting anomaly; cleanup to avoid orphan draft
    await admin.from('journal_entries').delete().eq('id', entry.id);
    return { ok: false, skipped: 'db_error', error: `post: ${e3.message}` };
  }

  return { ok: true, journalEntryId: entry.id };
}

/**
 * Post an expense (creates when submitted via dashboard) into the ledger:
 *
 *   DR  5xxx Expense            amount_minor
 *     CR  1000 Cash on Hand      amount_minor
 *
 * Caller: /api/expenses (or client import), AFTER expense row commits.
 */
export async function postExpenseToJournal(
  admin: AdminClient,
  params: {
    projectId: string;
    expenseId: string;
    amountMinor: number;
    categoryCode?: string;      // default '5900' (Other) if null/unknown
    userId: string;
  }
): Promise<PostResult> {
  const { projectId, expenseId, amountMinor, userId, categoryCode = '5900' } = params;

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, skipped: 'db_error', error: `Invalid amountMinor=${amountMinor}` };
  }

  const [expenseAcc, cashAcc] = await Promise.all([
    admin.from('accounts').select('id')
      .eq('project_id', projectId).eq('code', categoryCode).single(),
    admin.from('accounts').select('id')
      .eq('project_id', projectId).eq('code', '1000').single(),
  ]);

  if (!expenseAcc.data || !cashAcc.data) {
    return { ok: false, skipped: 'no_coa', error: `COA missing ${categoryCode}/cash` };
  }

  const { data: existing } = await admin
    .from('journal_entries').select('id')
    .eq('project_id', projectId)
    .eq('reference_type', 'expense')
    .eq('reference_id', expenseId)
    .maybeSingle();

  if (existing) {
    return { ok: true, journalEntryId: existing.id };
  }

  const { data: entry, error: e1 } = await admin
    .from('journal_entries')
    .insert({
      project_id: projectId,
      reference_type: 'expense',
      reference_id: expenseId,
      memo: `Expense #${expenseId.slice(0, 8)}`,
      posted_by: userId,
      posted: false,
    })
    .select('id')
    .single();

  if (e1 || !entry) {
    return { ok: false, skipped: 'db_error', error: e1?.message ?? 'entry insert failed' };
  }

  const { error: e2 } = await admin.from('journal_entry_lines').insert([
    {
      journal_entry_id: entry.id,
      project_id: projectId,
      account_id: expenseAcc.data.id,
      debit_minor: amountMinor,
      credit_minor: 0,
      memo: 'تسجيل مصروف',
    },
    {
      journal_entry_id: entry.id,
      project_id: projectId,
      account_id: cashAcc.data.id,
      debit_minor: 0,
      credit_minor: amountMinor,
      memo: 'دفع مصروف نقدي/بنكي',
    },
  ]);

  if (e2) {
    await admin.from('journal_entries').delete().eq('id', entry.id);
    return { ok: false, skipped: 'db_error', error: `lines: ${e2.message}` };
  }

  const { error: e3 } = await admin
    .from('journal_entries')
    .update({ posted: true })
    .eq('id', entry.id);

  if (e3) {
    await admin.from('journal_entries').delete().eq('id', entry.id);
    return { ok: false, skipped: 'db_error', error: `post: ${e3.message}` };
  }

  return { ok: true, journalEntryId: entry.id };
}
