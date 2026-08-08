import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { endImpersonation, logSuperAdminAction } from '@/lib/super-admin';
import type { Json } from '@/lib/database.types';

const IMPERSONATION_COOKIE = 'dokan-impersonation';

/**
 * POST /api/super-admin/impersonate/end
 * Body: { sessionId: string }
 *
 * Ends the impersonation: marks the row ended, restores the super admin's
 * own session (returns it for cookie swap-back), and writes an audit end
 * entry. Called from the banner's "إنهاء الجلسة" button AND from the auto-
 * expiry path (expired session detected by the layout).
 *
 * SECURITY (audit CRITICAL — fixed 2026-08-08): previously ANY caller with a
 * sessionId could end a session and receive the super admin's session
 * tokens. Now the caller must satisfy BOTH:
 *   (a) be authenticated, AND
 *   (b) hold an identity bound to this session — either the original super
 *       admin account (fresh login recovery) or the impersonated target
 *       account, AND
 *   (c) when the marker cookie is present it must match the sessionId
 *       (the cookie only exists in the browser that started the
 *       impersonation). With no marker cookie, only the real super admin
 *       account may recover.
 * endImpersonation additionally nulls the stored tokens after one use, so a
 * leaked sessionId can never be replayed to harvest tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    if (typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
      return NextResponse.json({ error: 'sessionId مطلوب' }, { status: 400 });
    }
    const sessionId = body.sessionId;

    // 1. Authenticate — an anonymous caller can never end an impersonation.
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // 2. Bind the caller to the stored row BEFORE ending it.
    const admin = createAdminClient();
    const { data: row } = await admin
      .from('impersonation_sessions')
      .select('id, super_admin_user_id, target_user_id, target_project_id, ended_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (!row || row.ended_at) {
      return NextResponse.json({ error: 'الجلسة غير موجودة أو منتهية' }, { status: 404 });
    }

    // 3. Authorization matrix (see doc comment).
    const isSuperAdminActor = user.id === (row.super_admin_user_id as string);
    const isTargetActor = user.id === (row.target_user_id as string);
    if (!isSuperAdminActor && !isTargetActor) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    }

    const markerCookie = request.cookies.get(IMPERSONATION_COOKIE)?.value;
    if (markerCookie) {
      // The browser that started the impersonation carries the marker —
      // a mismatched marker means a different browser is trying.
      if (markerCookie !== sessionId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
      }
    } else {
      // No marker cookie: only the real super admin account may recover
      // (e.g. they logged in again after the impersonated session expired).
      if (!isSuperAdminActor) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
      }
    }

    // 4. End it (stored tokens are nulled after read — one-time use).
    const result = await endImpersonation(sessionId);
    if (!result) {
      // Raced with another end request — treat as already ended.
      return NextResponse.json({ error: 'الجلسة غير موجودة أو منتهية' }, { status: 404 });
    }

    // 5. Audit with the original super admin as actor (from the stored row).
    await logSuperAdminAction({
      actorUserId: (row.super_admin_user_id as string) ?? user.id,
      action: 'impersonation.end',
      targetProjectId: (row.target_project_id as string | null) ?? null,
      targetUserId: result.targetUserId,
      metadata: { sessionId, endedBy: user.id },
    });

    // 6. Clear the marker cookie so the banner disappears after refresh,
    //    and return the admin session for the cookie swap-back.
    const response = NextResponse.json({
      ok: true,
      superAdminSession: result.superAdminSession as unknown as Json,
    });
    response.cookies.set(IMPERSONATION_COOKIE, '', {
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
