import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TELEGRAM_BOT_USERNAME } from '@/lib/telegram';
import { randomBytes } from 'crypto';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function requireMembership(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) };

  const { data: membership } = await supabase
    .from('staff_members')
    .select('project_id, role')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .maybeSingle();

  if (!membership) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 403 }) };
  return { supabase, user, role: membership.role as 'owner' | 'manager' | 'staff' };
}

/**
 * POST /api/telegram/link  { projectId }
 * Creates a one-time link code: user sends "/start <CODE>" to the bot.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: string };
    if (typeof body.projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.projectId)) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    const auth = await requireMembership(body.projectId);
    if ('error' in auth) return auth.error;
    const { supabase } = auth;

    // Clear expired codes for THIS project (audit LOW: previously unscoped —
    // relied on RLS alone), then generate a fresh one
    await supabase
      .from('telegram_link_codes')
      .delete()
      .eq('project_id', body.projectId)
      .lt('expires_at', new Date().toISOString());

    // Entropy fix (audit MEDIUM): 8 random bytes → 16 hex chars. The old
    // 4-byte (8-char) code was brute-forceable at webhook rate and would
    // let an attacker subscribe to another store's alerts.
    const code = randomBytes(8).toString('hex').toUpperCase();
    const { error } = await supabase.from('telegram_link_codes').insert({
      project_id: body.projectId,
      code,
      created_by: auth.user.id,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });

    if (error) {
      console.error('[Telegram Link]', error);
      return NextResponse.json({ error: 'فشل إنشاء الرمز' }, { status: 500 });
    }

    return NextResponse.json({
      code,
      bot_username: TELEGRAM_BOT_USERNAME,
      url: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`,
    });
  } catch (err) {
    console.error('[Telegram Link]', err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}

/**
 * DELETE /api/telegram/link  { projectId, chatId }
 * Removes a linked chat from the project.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: string; chatId?: string };
    if (
      typeof body.projectId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.projectId) ||
      typeof body.chatId !== 'string' ||
      body.chatId.length > 64
    ) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    const auth = await requireMembership(body.projectId);
    if ('error' in auth) return auth.error;
    const { supabase, role } = auth;

    // Role gate (audit LOW fix): unlinking the Telegram alerts channel is a
    // store-level decision — owner or manager only, not a cashier.
    if (role !== 'owner' && role !== 'manager') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    }

    const { error } = await supabase
      .from('telegram_links')
      .delete()
      .eq('project_id', body.projectId)
      .eq('chat_id', body.chatId);

    if (error) {
      console.error('[Telegram Unlink]', error);
      return NextResponse.json({ error: 'فشل الإزالة' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Telegram Unlink]', err);
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
