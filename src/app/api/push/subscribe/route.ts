import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';

/**
 * POST /api/push/subscribe
 * Save a push subscription for the current user + project
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = await request.json() as {
      projectId: string;
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    };

    if (
      typeof body.projectId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.projectId) ||
      typeof body.subscription?.endpoint !== 'string' ||
      body.subscription.endpoint.length > 500 ||
      !/^https:\/\//.test(body.subscription.endpoint) ||
      typeof body.subscription?.keys?.p256dh !== 'string' ||
      body.subscription.keys.p256dh.length > 200 ||
      typeof body.subscription?.keys?.auth !== 'string' ||
      body.subscription.keys.auth.length > 200
    ) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    // Verify the user is a staff member of the target project — otherwise any
    // authenticated user could subscribe to any project's notifications.
    const { data: membership } = await supabase
      .from('staff_members')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('project_id', body.projectId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    }

    // Cap the number of stored subscriptions per user+project (abuse vector:
    // an authenticated user can otherwise bulk-insert rows for their project).
    const rl = await rateLimit(`${user.id}:${body.projectId}`, {
      limit: 10,
      windowMs: 60 * 1000,
      keyPrefix: 'push-subscribe',
      projectId: body.projectId,
      callerUserId: user.id,
    });
    if (!rl.allowed) {
      const r = createRateLimitResponse(rl.resetIn);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .insert({
        project_id: body.projectId,
        user_id: user.id,
        endpoint: body.subscription.endpoint,
        p256dh: body.subscription.keys.p256dh,
        auth: body.subscription.keys.auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 200) || null,
      });

    if (error) {
      if (error.message?.includes('unique') || error.code === '23505') {
        return NextResponse.json({ success: true, message: 'مشترك بالفعل' });
      }
      console.error('[Push Subscribe]', error);
      return NextResponse.json({ error: 'فشل الحفظ' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Push Subscribe]', err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
