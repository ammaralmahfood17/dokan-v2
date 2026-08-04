import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/database.types';

/**
 * Super-admin surface helpers (server-only).
 *
 * SECURITY MODEL:
 * - Every page/route in /super-admin re-checks membership via
 *   `is_super_admin()` (SECURITY DEFINER RPC reading super_admins by
 *   auth.uid()) at request time — never trusts a session that was valid
 *   when a page loaded.
 * - The audit helper writes via service_role (the table is service_role-only;
 *   anon/authenticated have no grants). Every super-admin WRITE action must
 *   call `logSuperAdminAction` — a missing audit row is treated as a bug.
 */

export type SuperAdminAction =
  | 'subscription.renew'
  | 'project.deactivate'
  | 'project.create'
  | 'project.archive'
  | 'project.hard_delete'
  | 'impersonation.start'
  | 'impersonation.end'
  | 'audit.view';

/** Returns the current user id if they are a super admin, else null. */
export async function getSuperAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isAdmin } = await supabase.rpc('is_super_admin');
  return isAdmin ? user.id : null;
}

/** Gate a server component / route handler. Redirects to /login if not admin. */
export async function requireSuperAdmin(): Promise<string> {
  const adminUserId = await getSuperAdminUserId();
  if (!adminUserId) redirect('/login');
  return adminUserId;
}

/** Write an audit entry (service_role — bypasses RLS on the log table). */
export async function logSuperAdminAction(input: {
  actorUserId: string;
  action: SuperAdminAction;
  targetProjectId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('super_admin_audit_log').insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_project_id: input.targetProjectId ?? null,
    target_user_id: input.targetUserId ?? null,
    metadata: (input.metadata ?? {}) as unknown as Json,
  });
  if (error) {
    // Logging must never silently fail — surface it loudly.
    console.error('[SuperAdmin] audit log insert failed:', error.message);
    throw new Error(`audit log failed: ${error.message}`);
  }
}
