import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';

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

    // Strict rate limit for waiter calls (anti-abuse)
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateKey = `${projectSlug}:${tableSlug}:${ip}`;
    const limitResult = await rateLimit(rateKey, { limit: 8, windowMs: 60 * 1000, keyPrefix: 'public-waiter' });

    if (!limitResult.allowed) {
      const res = createRateLimitResponse(limitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    const supabase = createAdminClient();

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', projectSlug)
      .eq('is_active', true)
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

    // Anti-spam: block if same table already has an open waiter call (5 min)
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('orders')
      .select('id')
      .eq('project_id', project.id)
      .eq('table_id', table.id)
      .eq('status', 'pending')
      .eq('service_type', 'waiter')
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();

    if (recent) {
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
