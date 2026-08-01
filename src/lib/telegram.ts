import { createAdminClient } from './supabase/admin';

/**
 * Platform-wide Telegram bot for order alerts.
 * One bot serves ALL projects — each project links chats (owner/staff/group)
 * via telegram_links; order routes call sendTelegramAlert() which posts to
 * every linked chat_id. Works app-closed on iOS + Android, zero cost.
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME || 'dokanplatformchat_bot';

export interface TelegramOrderAlert {
  orderNumber: number;
  totalText: string;
  tableNumber?: number;
  context?: string; // e.g. POS order type (مقعد/سفري)
}

async function callTelegram(method: string, body: Record<string, unknown>) {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<{ ok: boolean; description?: string }>;
  } catch {
    return null;
  }
}

/**
 * Send an order alert to every chat linked to the project.
 * Silently skips when the bot token is not configured or no chats are linked.
 * MUST be awaited (Vercel freezes the function on response return).
 */
export async function sendTelegramAlert(
  projectId: string,
  alert: TelegramOrderAlert
): Promise<{ sent: number; failed: number }> {
  if (!TOKEN) return { sent: 0, failed: 0 };

  const admin = createAdminClient() as any;
  const { data: links } = await admin
    .from('telegram_links')
    .select('chat_id')
    .eq('project_id', projectId);

  if (!links?.length) return { sent: 0, failed: 0 };

  const text = [
    '🔔 طلب جديد',
    `الطلب #${alert.orderNumber}`,
    `المبلغ: ${alert.totalText}`,
    ...(alert.tableNumber !== undefined ? [`الطاولة ${alert.tableNumber}`] : []),
    ...(alert.context ? [alert.context] : []),
  ].join('\n');

  let sent = 0;
  let failed = 0;
  for (const link of links) {
    const result = await callTelegram('sendMessage', {
      chat_id: link.chat_id,
      text,
      disable_web_page_preview: true,
    });
    if (result?.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** Reply to a chat (used by the webhook to confirm/cancel a link). */
export async function replyToChat(chatId: string, text: string) {
  return callTelegram('sendMessage', { chat_id: chatId, text });
}
