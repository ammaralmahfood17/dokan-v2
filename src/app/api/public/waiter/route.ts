import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';

// NOTE: This route is currently UNUSED by the frontend (no "call waiter"
// button exists in the menu UI). It's documented in README as a planned
// feature; kept intentionally — product-scope decision pending (build the
// menu frontend for it, or remove it). Do not flag as accidental dead code.

/**
 * POST /api/public/waiter
 * Customer requests waiter attention — logged as a zero-amount order note.
 * No direct client DB writes.
 * Rate limited + existing anti-spam.
 *
 * Security: Uses service role only after slug + active validation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectSlug?: string;
      tableSlug?: string;
    };

    const projectSlug = body.projectSlug?.trim();
    const tableSlug = body.tableSlug?.trim();

    if (!projectSlug || !tableSlug) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    // Slug hardening: DB slugs are generated lowercase [a-z0-9-], bounded.
    // Reject oversized/malformed input before it reaches rate-limit keys or
    // the DB (defense against log/DB abuse via arbitrary-length payloads).
    if (projectSlug.length > 64 || !/^[a-z0-9-]+$/.test(projectSlug)) {
      return NextResponse.json({ error: 'معرّف المتجر غير صالح' }, { status: 400 });
    }
    if (tableSlug.length > 64 || !/^[a-z0-9-]+$/.test(tableSlug)) {
      return NextResponse.json({ error: 'معرّف الطاولة غير صالح' }, { status: 400 });
    }

    // Strict rate limit for waiter calls (anti-abuse) — first IP only; a
    // comma-list header would otherwise make the key vary per proxy hop.
    // B3: two independent limits — per (table+IP) burst AND a global per-IP
    // cap so one IP can't fan out across many tables in the same minute.
    const ip = getClientIp(request);
    const rateKey = `${projectSlug}:${tableSlug}:${ip}`;
    const [limitResult, ipLimitResult] = await Promise.all([
      rateLimit(rateKey, { limit: 8, windowMs: 60 * 1000, keyPrefix: 'public-waiter' }),
      rateLimit(`ip:${ip}`, { limit: 20, windowMs: 60 * 1000, keyPrefix: 'public-waiter-ip' }),
    ]);

    if (!limitResult.allowed) {
      const res = createRateLimitResponse(limitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    if (!ipLimitResult.allowed) {
      const res = createRateLimitResponse(ipLimitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    const supabase = createAdminClient();

    // HARD subscription cutoff — same as /api/public/order: gate on
    // is_project_publicly_available (exact expiry check) so an expired store
    // can't keep receiving waiter calls until the next cron is_active flip.
    const { data: isAvailable } = await supabase.rpc('is_project_publicly_available', {
      p_slug: projectSlug,
    });
    if (!isAvailable) {
      return NextResponse.json({ error: 'المتجر غير متاح' }, { status: 404 });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', projectSlug)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    }

    const { data: table } = await supabase
      .from('tables')
      .select('id, number')
      .eq('slug', tableSlug)
      .eq('project_id', project.id)
      .eq('is_active', true)
      .single();

    if (!table) {
      return NextResponse.json({ error: 'الطاولة غير موجودة' }, { status: 404 });
    }

    // Anti-spam: block if same table already has an open waiter call (5 min).
    // Race fix: a plain read-then-insert here lets two near-simultaneous
    // requests both pass the check and both insert. rateLimit() uses an
    // atomic counter (DB RPC / KV increment), so use it as the dedup guard
    // instead of a read-then-write on `orders`.
    const dedupResult = await rateLimit(`waiter-dedup:${project.id}:${table.id}`, {
      limit: 1,
      windowMs: 5 * 60 * 1000,
      keyPrefix: 'public-waiter-dedup',
    });
    if (!dedupResult.allowed) {
      return NextResponse.json(
        { error: 'تم إرسال طلب موظف مؤخراً' },
        { status: 429 }
      );
    }

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        project_id: project.id,
        table_id: table.id,
        type: 'dinein',
        status: 'pending',
        total_amount: 0,
        service_type: 'waiter',
        notes: `🔔 طلب موظف — طاولة ${table.number}`,
      })
      .select('id')
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'فشل إرسال الطلب' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: order.id });
  } catch (err) {
    console.error('Waiter API error:', err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
