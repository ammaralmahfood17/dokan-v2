import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSecureOrder } from '@/lib/order-pricing';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { sendPushToProject } from '@/lib/push';
import { sendTelegramAlert } from '@/lib/telegram';
import { formatMoney } from '@/lib/utils';
import type { PublicOrderItemInput } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectSlug?: string;
      tableSlug?: string;
      items?: PublicOrderItemInput[];
      notes?: string;
    };

    const { projectSlug, tableSlug, items, notes } = body;

    if (!projectSlug || !tableSlug || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
    }

    // Rate limit per project + per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateKey = `public-order:${projectSlug}`;
    const limitResult = await rateLimit(rateKey, { limit: 20, windowMs: 60 * 1000, keyPrefix: 'public-order' });
    const ipLimitResult = await rateLimit(`ip:${ip}`, { limit: 10, windowMs: 60 * 1000, keyPrefix: 'public-order-ip' });

    if (!limitResult.allowed) {
      const res = createRateLimitResponse(limitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    if (!ipLimitResult.allowed) {
      const res = createRateLimitResponse(ipLimitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    const supabase = createAdminClient();

    // 1. Validate project
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('id, is_active, currency')
      .eq('slug', projectSlug)
      .single();

    if (projectErr || !project || !project.is_active) {
      return NextResponse.json({ error: 'المتجر غير متاح' }, { status: 404 });
    }

    // 2. Validate table belongs to project
    const { data: table, error: tableErr } = await supabase
      .from('tables')
      .select('id, number, is_active')
      .eq('slug', tableSlug)
      .eq('project_id', project.id)
      .single();

    if (tableErr || !table || !table.is_active) {
      return NextResponse.json(
        { error: 'الطاولة غير موجودة أو غير نشطة' },
        { status: 404 }
      );
    }

    // 3. Server-side pricing + insert (core security)
    const result = await createSecureOrder(supabase, {
      projectId: project.id,
      tableId: table.id,
      type: 'dinein',
      items,
      notes: body.notes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Phase 3: Audit log
    try {
      await supabase.from('order_audit_logs').insert({
        order_id: result.order.id,
        project_id: project.id,
        event: 'created',
        new_status: result.order.status,
        metadata: { type: 'dinein', item_count: items?.length || 0 },
      });
    } catch (auditErr) {
      console.warn('[Audit] Failed to write order audit log', auditErr);
    }

    // Push notification to all staff — MUST await: Vercel freezes the function
    // on response return, so fire-and-forget promises never complete.
    await sendPushToProject(project.id, {
      title: '🔔 طلب جديد',
      body: `طلب #${result.order.orderNumber} من القائمة — ${formatMoney(
        result.order.totalAmount,
        project.currency
      )}`,
      url: '/dashboard/kitchen',
      tag: `order-${result.order.id}`,
    }).catch(() => {});

    // Telegram alert — free, reliable (works app-closed). MUST await (Vercel).
    await sendTelegramAlert(project.id, {
      orderNumber: result.order.orderNumber,
      totalText: formatMoney(result.order.totalAmount, project.currency),
      tableNumber: table.number,
    }).catch(() => {});

    return NextResponse.json({
      order: {
        id: result.order.id,
        status: result.order.status,
        totalAmount: result.order.totalAmount,
        orderNumber: result.order.orderNumber,
      },
    });
  } catch (err) {
    console.error('Public order API error:', err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
