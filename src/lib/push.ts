import { createAdminClient } from './supabase/admin';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push notification to all staff of a project
 * Returns { sent, failed } counts
 */
export async function sendPushToProject(
  projectId: string,
  payload: PushPayload
) {
  if (typeof window !== 'undefined') {
    // Called accidentally from client — silently skip.
    // NOTE: must check `window`, NOT `navigator` — Node 21+ (Vercel uses 24.x)
    // ships a global `navigator`, so that guard always fired server-side and
    // silently skipped every push in production.
    return { sent: 0, failed: 0 };
  }

  const webpush = await import('web-push');
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const privateKey = process.env.VAPID_PRIVATE_KEY!;
  const contact = process.env.VAPID_CONTACT || 'mailto:admin@dokanstore.xyz';

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys not configured — skipping');
    return { sent: 0, failed: 0, cleaned: 0, configured: false };
  }

  console.log('[Push] keys OK — public key prefix:', publicKey.slice(0, 16), '… (len ' + publicKey.length + ')');

  webpush.setVapidDetails(contact, publicKey, privateKey);

  const admin = createAdminClient() as any;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('project_id', projectId);

  if (!subs?.length) return { sent: 0, failed: 0, cleaned: 0, configured: true };

  console.log('[Push] sending to', subs.length, 'subscription(s)');

  const results = await Promise.allSettled(
    subs.map((sub: any) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { urgency: 'high' }
      )
    )
  );

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      sent++;
    } else {
      failed++;
      const reason = r.reason as any;
      console.log('[Push] sub', i, 'FAILED —', reason?.statusCode, reason?.body || reason?.message);
      if (reason?.statusCode === 410 || reason?.statusCode === 404) {
        expiredEndpoints.push(subs[i].endpoint);
      }
    }
  }

  console.log('[Push] result — sent:', sent, 'failed:', failed, 'cleaned:', expiredEndpoints.length);

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints);
  }

  return { sent, failed, cleaned: expiredEndpoints.length };
}
