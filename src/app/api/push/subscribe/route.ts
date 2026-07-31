import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Temporary: push_subscriptions not yet in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function db() {
  return (await createClient()) as any;
}

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

    if (!body.projectId || !body.subscription?.endpoint) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    const { error } = await (await db())
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
