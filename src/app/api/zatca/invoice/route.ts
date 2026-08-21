import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { finalizeInvoice } from '@/lib/zatca';

/**
 * POST /api/zatca/invoice
 *
 * Generate a ZATCA-compliant (Phase 2) tax invoice from a project order.
 * Requires:
 *   - project has zatca_config configured (seller details, keys, certificate)
 *   - caller is project owner/manager OR service_role
 * Body: { orderId: uuid }
 * Response: { invoiceId, invoiceNumber, uuid, xmlHash, status }
 *
 * NON-BLOCKING: order fulfillment is never affected by this endpoint. Any
 * error or compliance check failure is surfaced via Sentry with a diagnostic;
 * the underlying order persists exactly as before.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = (await request.json()) as { orderId?: string };
    if (!body.orderId) {
      return NextResponse.json({ error: 'معرّف الطلب مطلوب' }, { status: 400 });
    }

    const admin = createAdminClient();

    // ── Resolve membership (owner/manager only) ────────────────────────────
    const { data: membership } = await admin
      .from('staff_members')
      .select('project_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'لا يوجد مشروع' }, { status: 404 });
    }
    if (!['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'مطلوب صلاحيات مدير أو مالك' }, { status: 403 });
    }

    const projectId = membership.project_id;

    // ── Load order + project + config ─────────────────────────────────────
    const [orderRes, projectRes, configRes, itemsRes] = await Promise.all([
      admin.from('orders').select('*').eq('id', body.orderId).eq('project_id', projectId).maybeSingle(),
      admin.from('projects').select('id, currency, name').eq('id', projectId).single(),
      admin.from('zatca_config').select('*').eq('project_id', projectId).maybeSingle(),
      admin.from('order_items').select('*').eq('order_id', body.orderId),
    ]);

    if (!orderRes.data) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    }
    if (!configRes.data) {
      return NextResponse.json({ error: 'الفاتورة الإلكترونية غير مُهيّأة لهذا المشروع' }, { status: 400 });
    }
    if (!configRes.data.onboarded_at) {
      return NextResponse.json({ error: 'ZATCA onboarding لم يكتمل بعد' }, { status: 400 });
    }

    const od = orderRes.data;
    const cfg = configRes.data as Record<string, unknown>;
    const cur = (projectRes.data?.currency as string | undefined) ?? 'SAR';
    const isSar = cur === 'SAR';

    // ── Idempotency: did we already generate a standard invoice for this order? ──
    const { data: existing } = await admin
      .from('zatca_invoices')
      .select('id, invoice_number, uuid, status')
      .eq('project_id', projectId)
      .eq('order_id', body.orderId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ duplicate: true, invoice: existing });
    }

    // ── Construct the invoice (simplified for now: walk-in B2C only) ────
    // total_amount is numeric(10,3) in DB — convert to minor units (fils)
    const totalGrossMinor = Math.round(Number(od.total_amount) * 100);
    const vatRateBps = 1500; // 15% Saudi standard rate; TODO: project config
    const netTotalMinor = Math.round(totalGrossMinor / (1 + vatRateBps / 10_000));
    const vatTotalMinor = totalGrossMinor - netTotalMinor;

    // Per-item breakdown — if items missing, create a single aggregated line
    const items = (itemsRes.data ?? []) as Array<{ quantity?: number | null; unit_price?: number | null; product_name?: string | null }>;
    const rawLines = items.length > 0
      ? items.map((it) => ({
          description: String(it.product_name ?? 'صنف'),
          quantity: Number(it.quantity ?? 1),
          unitPriceMinor: BigInt(Math.round(Number(it.unit_price ?? 0) * 100)),
          vatPercentBps: vatRateBps,
        }))
      : [{
          description: 'طلب رقم ' + od.order_number,
          quantity: 1,
          unitPriceMinor: BigInt(netTotalMinor),
          vatPercentBps: vatRateBps,
        }];

    // Build the input for the UBL generator
    const zatcaInput = {
      projectId,
      invoiceNumber: `INV-${od.order_number}`,
      invoiceKind: 'SIMPLIFIED' as const,
      paymentMeans: 'CASH' as const,
      currencyCode: cur,
      seller: {
        nameAr: String(cfg.seller_name_ar ?? ''),
        nameEn: String(cfg.seller_name_en ?? ''),
        vatNumber: String(cfg.vat_number ?? ''),
        buildingNo: (cfg as any).building_no ?? '',
        streetName: (cfg as any).street_name ?? '',
        city: (cfg as any).city ?? '',
        district: (cfg as any).district ?? '',
        postalCode: (cfg as any).postal_code ?? '',
        countryCode: 'SA',
      },
      customer: undefined,
      lines: rawLines,
      note: `ZATCA invoice for order #${od.order_number}`,
    };

    // Generate the final signed payload (XML + hash + QR TLV)
    const { xml, xmlHash, qrTlv, uuid, totalGrossMinor: finalGross, totalVatMinor: finalVat } =
      finalizeInvoice(
        zatcaInput,
        (cfg.private_key_vault_id as string | null) ?? ''
      );

    // ── Idempotency guard: same invoice was never submitted ───────────────
    // Insert invoice row with the signed payload, UUID, hash + QR
    const { data: inserted, error: insErr } = await admin
      .from('zatca_invoices')
      .insert({
        project_id: projectId,
        order_id: body.orderId,
        invoice_kind: 'simplified' as const,
        invoice_number: zatcaInput.invoiceNumber,
        uuid,
        issue_date: new Date().toISOString(),
        currency_code: zatcaInput.currencyCode,
        total_net_minor: Number(netTotalMinor),
        total_vat_minor: Number(vatTotalMinor),
        total_gross_minor: Number(totalGrossMinor),
        customer_name_ar: null,
        customer_name_en: null,
        customer_vat_number: null,
        customer_country_code: 'SA',
        xml_payload: xml,
        xml_hash: xmlHash,
        cryptographic_stamp: qrTlv,
        status: 'pending' as const,
      })
      .select('id, invoice_number, uuid, status, xml_hash')
      .single<{ id: string; invoice_number: string; uuid: string; status: string; xml_hash: string }>();

    if (insErr || !inserted) {
      // Cleanup partial insert cleanup
      const insertedId = (inserted as { id?: string } | null)?.id;
      if (insertedId) {
        await admin.from('zatca_invoices').delete().eq('id', insertedId);
      }
      Sentry.captureException(insErr, { tags: { area: 'zatca', orderId: body.orderId } });
      return NextResponse.json({ error: 'فشل إنشاء الفاتورة' }, { status: 500 });
    }

    return NextResponse.json({
      invoiceId: inserted.id,
      invoiceNumber: inserted.invoice_number,
      uuid: inserted.uuid,
      xmlHash: inserted.xml_hash,
      status: inserted.status,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
