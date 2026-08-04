import { test, expect } from '@playwright/test';
import {
  createTestUser,
  cleanupTestUser,
  getAuthCookies,
  makeEmail,
  TEST_PASSWORD,
  admin,
  url,
  anonKey,
} from './helpers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Super Admin — Phase A verification.
 *   1. Non-super-admin user is rejected at every route (page + API).
 *   2. A super-admin can list subscriptions, renew, and deactivate.
 *   3. Every write action produces a correct audit log row (checked in DB).
 */
test.describe.configure({ mode: 'serial' });

const normalEmail = makeEmail();
const adminEmail = makeEmail();
const runId = Date.now() % 1_000_000;

let normalUserId: string;
let adminUserId: string;
let testProjectId: string;
let authedAdmin: SupabaseClient;

test.beforeAll(async () => {
  // Clean any leftovers from interrupted runs.
  await cleanupTestUser(normalEmail);
  await cleanupTestUser(adminEmail);

  const normal = await createTestUser(normalEmail);
  normalUserId = normal.id;
  const sadmin = await createTestUser(adminEmail);
  adminUserId = sadmin.id;

  // Promote the admin user to super_admin (direct seed for the test).
  await admin.from('super_admins').insert({ user_id: adminUserId });

  // A victim project owned by the normal user.
  const { data: proj } = await admin
    .from('projects')
    .insert({ name: 'SA Victim', slug: `e2e-sa-${runId}`, currency: 'BHD', primary_color: '#4338CA', is_active: true })
    .select('id')
    .single();
  testProjectId = proj!.id;
  await admin.from('staff_members').insert({ project_id: testProjectId, user_id: normalUserId, role: 'owner' });

  authedAdmin = createClient(url, anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: se } = await authedAdmin.auth.signInWithPassword({ email: adminEmail, password: TEST_PASSWORD });
  if (se) throw new Error(`signIn failed: ${se.message}`);
});

test.afterAll(async () => {
  // Clean audit rows referencing the test project, then users/project.
  await admin.from('super_admin_audit_log').delete().eq('target_project_id', testProjectId);
  await admin.from('super_admins').delete().eq('user_id', adminUserId);
  await cleanupTestUser(normalEmail);
  await cleanupTestUser(adminEmail);
});

async function authCookieHeader(): Promise<string> {
  const { data } = await authedAdmin.auth.getSession();
  const ref = new URL(url).hostname.split('.')[0];
  return `sb-${ref}-auth-token=${JSON.stringify(data.session)}`;
}

test('non-super-admin is rejected at every super-admin route', async ({ page, context }) => {
  // Page routes → redirect to /login (server-side guard).
  const normalCookies = await getAuthCookies(normalEmail, TEST_PASSWORD);
  await context.addCookies(normalCookies);
  await page.goto('/super-admin/subscriptions');
  await page.waitForURL('**/login**', { timeout: 15_000 });

  await page.goto('/super-admin/audit');
  await page.waitForURL('**/login**', { timeout: 15_000 });

  await page.goto('/super-admin');
  await page.waitForURL('**/login**', { timeout: 15_000 });
});

test('non-super-admin is rejected at every super-admin API action', async () => {
  const cookie = await authCookieHeader(); // admin's cookie — but we send as normal user below
  const { data: normalSess } = await (async () => {
    const c = createClient(url, anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await c.auth.signInWithPassword({ email: normalEmail, password: TEST_PASSWORD });
    if (error) throw new Error(error.message);
    return { data };
  })();
  const ref = new URL(url).hostname.split('.')[0];
  const normalCookie = `sb-${ref}-auth-token=${JSON.stringify(normalSess.session)}`;
  void cookie;

  const renewRes = await fetch(`https://dokanstore.xyz/api/super-admin/renew?projectId=${testProjectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
  });
  expect(renewRes.status).toBe(403);

  const deactRes = await fetch(`https://dokanstore.xyz/api/super-admin/deactivate?projectId=${testProjectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
  });
  expect(deactRes.status).toBe(403);

  // No audit rows may have been written by the rejected attempts.
  const { count } = await admin
    .from('super_admin_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('target_project_id', testProjectId);
  expect(count).toBe(0);
});

test('super-admin renew + deactivate work and write audit rows', async () => {
  const cookie = await authCookieHeader();

  // --- Renew ---
  const renewRes = await fetch(`https://dokanstore.xyz/api/super-admin/renew?projectId=${testProjectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  });
  expect(renewRes.status).toBe(200);
  const { data: projAfterRenew } = await admin
    .from('projects')
    .select('subscription_expires_at')
    .eq('id', testProjectId)
    .single();
  expect(new Date(projAfterRenew?.subscription_expires_at as string).getTime()).toBeGreaterThan(Date.now());

  // --- Deactivate ---
  const deactRes = await fetch(`https://dokanstore.xyz/api/super-admin/deactivate?projectId=${testProjectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  });
  expect(deactRes.status).toBe(200);
  const { data: projAfterDeact } = await admin.from('projects').select('is_active').eq('id', testProjectId).single();
  expect(projAfterDeact?.is_active).toBe(false);

  // --- Audit rows exist with correct shape ---
  const { data: logs } = await admin
    .from('super_admin_audit_log')
    .select('action, actor_user_id, target_project_id, metadata')
    .eq('target_project_id', testProjectId)
    .order('created_at', { ascending: true });
  const actions = (logs ?? []).map((l) => l.action as string);
  expect(actions).toContain('subscription.renew');
  expect(actions).toContain('project.deactivate');

  const renewLog = (logs ?? []).find((l) => l.action === 'subscription.renew');
  expect(renewLog?.actor_user_id).toBe(adminUserId);
  expect((renewLog?.metadata as { projectName?: string })?.projectName).toBe('SA Victim');

  const deactLog = (logs ?? []).find((l) => l.action === 'project.deactivate');
  expect(deactLog?.actor_user_id).toBe(adminUserId);
  expect((deactLog?.metadata as { slug?: string })?.slug).toBe(`e2e-sa-${runId}`);
});
