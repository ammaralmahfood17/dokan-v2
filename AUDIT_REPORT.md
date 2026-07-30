# تدقيق شامل لـ دكان v2 — Comprehensive Audit Report

**التاريخ:** 2026-07-30  
**النطاق:** 46 مایگریشن، API، حساب مالي، PWA، RTL  
**المراجع:** [dokan-custom skill](/root/.hermes/skills/dokan-custom/SKILL.md)

---

## Executive Summary / ملخص تنفيذي

تم إجراء تدقيق شامل على مشروع دكان v2 (Next.js 16 + Supabase + PWA).  
**إجمالي النتائج:** 1 🔴 حرج | 5 🟡 عالية | 8 🟢 منخفضة

| النطاق | 🔴 حرج | 🟡 عالي | 🟢 منخفض |
|--------|---------|---------|----------|
| RLS & القواعد | 1 | 2 | 2 |
| نقاط API | 0 | 2 | 2 |
| حسابات مالية | 0 | 0 | 1 |
| كود مهمل/مكرر | 0 | 1 | 1 |
| RTL + PWA | 0 | 0 | 2 |

---

## 1. Supabase RLS Audit — تدقيق صلاحيات الصفوف

### 🔴 Critical: `categories_select` Policy Uses `USING (true)`

**File:** `supabase/migrations/0032_dokan_mvp_cutover.sql`, lines 333–335

```sql
create policy "categories_select"
  on public.categories for select
  using (true);
```

**Risk:** Any authenticated user (or anon via granted SELECT on `categories`) can read ALL categories across ALL projects — there is zero tenant isolation. While categories only contain `name` and `name_en`, this violates the tenant isolation principle the dokan-custom skill mandates.

**Fix:**
```sql
drop policy if exists "categories_select" on public.categories;
create policy "categories_select"
  on public.categories for select
  using (public.is_project_member(project_id) or exists (
    select 1 from public.products p
    where p.category_id = categories.id and p.is_available = true
  ));
```

**Migration:** Add `0047_fix_categories_select_rls.sql`

---

### 🟡 High: `order_audit_logs` RLS Added Late (Migration 0045)

**File:** `supabase/migrations/0045_order_audit_rls.sql` (lines 1–14)

The `order_audit_logs` table was created in `0036_order_audit_logs.sql` WITHOUT RLS. Only in migration 0045 (the very last one) was RLS enabled and policies added. Between 0036 and 0045, any authenticated user could read audit logs.

**Status:** Fixed in 0045.  
**Recommendation:** Verify all new tables include `enable row level security` in the same migration that creates them.

---

### 🟡 High: Legacy RLS Helper Functions Still Exist in DB

The following SECURITY DEFINER functions from the V1 schema remain as database objects, despite being unused by the new code:

- `has_branch_access(uuid)` — references `branches` table that was dropped in 0044
- `staff_business_ids()` — returns `setof uuid` from legacy `staff_members`
- `staff_role_for_business(uuid)` — returns legacy `app_role` enum
- `is_super_admin()` — references `super_admins` table (also legacy)
- `super_admins` table — orphaned after 0032 migration
- `handle_new_user()` function — remains in DB (disabled trigger, function kept)
- `profiles` table — created in 0013, not used in MVP schema

**Risk:** Orphaned functions increase attack surface. While they have no policies granting anon access, they remain callable by authenticated users who could discover them.

**Fix:** Drop all legacy helper functions and tables in a cleanup migration:
```sql
drop function if exists public.has_branch_access(uuid) cascade;
drop function if exists public.staff_business_ids() cascade;
drop function if exists public.staff_role_for_business(uuid) cascade;
drop function if exists public.handle_new_user() cascade;
drop table if exists public.super_admins cascade;
drop table if exists public.profiles cascade;
```

---

### 🟢 Low: GRANT `select` on All Tables to `authenticated` (Migration 0034)

**File:** `supabase/migrations/0034_rls_grants_cleanup.sql` (lines 17–48)

Migration 0034 grants `SELECT` on projects, branches, tables, categories, products, and product_addons to `authenticated`. While RLS filters by `is_project_member`, the combination with `categories_select using (true)` creates a real data leak.

**Status:** Mitigated by RLS for most tables. Only `categories` is affected (see 🔴 above).

---

### 🟢 Low: `branches` RLS Policies Referenced After Table Dropped

**File:** `supabase/migrations/0044_remove_branches_feature.sql` (lines 12–13)

Drops `branches` table and its policies — but the RLS helper `has_branch_access()` still references it. If that function is ever called, it will fail.

**Status:** Only relevant if legacy helper functions are used (which they aren't).

---

## 2. API Endpoints Audit — تدقيق نقاط API

### 🟡 High: `invite-staff` Edge Function Has Syntax Error

**File:** `supabase/functions/invite-staff/index.ts`, line 50

```typescript
global: { headers: { Authorization: authHeader *** } },
```

The `***` is literal TypeScript — an assignment is missing:
```typescript
global: { headers: { Authorization: authHeader } },
```

**Risk:** The function will never deploy or run. This blocks the "invite staff" feature entirely.

---

### 🟡 High: `public/bill` and `public/waiter` APIs Use Orders Table as Notification System

**Files:**
- `src/app/api/public/waiter/route.ts` (lines 82–98)
- `src/app/api/public/bill/route.ts` (lines 81–97)

Both APIs insert into `orders` with `total_amount: 0` and `service_type: 'waiter'` / `'bill'`. This mixes two concerns (real orders vs. service requests) in the same table. The `service_type` column was added in migration 0046 to differentiate them, but the design still uses the main order pipeline for what is essentially a notification.

**Concerns:**
- Consumes order numbers (via `daily_order_counters`) — though migration 0046 excludes `service_type IS NOT NULL` from the unique index
- `place_order` anti-spam (5 orders / 60s) doesn't apply here — this API has its own anti-spam
- Service requests inflate the order count visible to staff

**Recommendation:** Consider a dedicated `service_requests` table, or ensure the anti-pattern is clearly documented and monitored.

---

### 🟢 Low: `console.log` Statements in Production Code

**Total:** 38 `console.log/warn/error` calls across `src/`

**Highest concentration:**
- `src/app/api/auth/signup/route.ts` — 8 calls (debugging detail, logs user email)
- `src/app/register/page.tsx` — 6 calls
- `src/app/api/pos/cancel/route.ts` — 3 calls
- `src/app/api/pos/order/route.ts` — 3 calls
- `src/app/api/public/order/route.ts` — 3 calls
- `src/lib/order-pricing.ts` — 3 calls

**Concern:** The signup route logs `email` (PII) and internal debug data. Some `console.error` is appropriate for error tracking, but `console.log` with PII should be removed or redacted.

---

### 🟢 Low: `reset-password` API Always Returns Success (Security by Obscurity)

**File:** `src/app/api/auth/reset-password/route.ts`, lines 37–39

```typescript
if (error) {
  console.error('[Reset Password]', error);
  return NextResponse.json({ success: true });
}
```

This is intentional — not revealing if an email exists or not. However, the API also logs the full error to console, which in a serverless environment (Vercel) is visible in logs.

**Recommendation:** Document this security posture explicitly in the code. Consider sanitizing the log output.

---

## 3. Financial Calculations Audit — تدقيق الحسابات المالية

### 🟢 Low: Decimal Precision Mismatch Between `money()` and DB Schema

**Files:**
- `src/lib/utils.ts`, line 68–71: `money()` rounds to **3 decimal places** (1000 = 10^-3)
- `src/lib/order-pricing.ts`, line 115: Uses `money()` for all calculations
- DB `products.price`: `numeric(10,3)` ✓
- DB `orders.total_amount`: `numeric(10,3)` ✓
- DB `businesses.tax_rate`: `numeric(5,2)` — **2 decimal places**

**Analysis:**
- The 3-decimal precision is correct for BHD (دينار بحريني) which is divided into 1000 fils
- KWD also uses 3 decimals
- SAR and QAR use 2 decimals (halalas/qirsh)
- Tax rate uses 2 decimals, which is standard for percentages (e.g., 15.00%)

**Finding:** No actual bug, but `formatMoney()` always displays 3 decimals even for SAR/KWD/AED/QAR. This could confuse users in Saudi Arabia or Qatar who expect 2 decimal places.

**Fix suggestion in `formatMoney()`:**
```typescript
export function formatMoney(value: number, currency = 'BHD'): string {
  const n = Number.isFinite(value) ? money(value) : 0;
  const decimals = ['BHD', 'KWD', 'OMR'].includes(currency) ? 3 : 2;
  return `${n.toFixed(decimals)} ${currency}`;
}
```

---

### ✅ Server-Side Pricing (Good)

All price calculations happen server-side in `createSecureOrder()` (`src/lib/order-pricing.ts`) or the `place_order()` SECURITY DEFINER RPC. Client-provided prices are NEVER trusted:
- Products are re-fetched from DB by `product_id` + `project_id`
- Addons are re-fetched and validated against the product
- Line totals are recalculated on the server
- Quantity is validated (positive integer, ≤ 99)
- Max 50 items per order
- Notes length capped at 200 chars

### ✅ Money Helper (`src/lib/utils.ts`)

- `money()` handles NaN/Infinity/negative gracefully
- `isValidMoney()` provides type guard
- `formatMoney()` returns string with currency code

---

## 4. Stale Logic & Dead Code — الكود المهمل والمكرر

### 🟡 High: Legacy Migrations Directory (`supabase/migrations_legacy/`)

27 SQL files in `supabase/migrations_legacy/` are completely stale — they contain the V1 schema (businesses/branches/stores model) that was replaced by the V2 MVP schema (projects/tables model) in migration 0032.

**Contain problems already fixed in V2:**
- RLS recursion bugs (0011)
- Order status leakage (0017)
- Missing subscription validation (0017)
- Anti-spam gaps (0028)

**Risk:** A developer could accidentally apply a legacy migration thinking it's needed, re-introducing known bugs.

**Recommendation:** Archive or remove the directory.

---

### 🟢 Low: `get_business_storefront_by_slug` RPC Defined But Unused

**File:** `supabase/migrations/0021_storefront_rpc.sql`

This RPC returns business data by slug but is never called from any application code. It references the legacy `businesses`/`branches` schema and doesn't work with the new MVP `projects`/`tables` schema.

**Status:** Dead code — the `/api/public/order` route handles the storefront flow instead.

---

### 🟢 Low: `error-categories.ts` Limited Usage

**File:** `src/lib/error-categories.ts` (130 lines)

Only imported by one file: `src/app/dashboard/error.tsx`. The `persistErrorLog` function writes to `sessionStorage` but no UI reads those logs. Good pattern but underutilized.

---

### ✅ `daily_order_counters` + `next_order_number` (Clean)

Migration 0042 implements a robust, atomic daily order numbering system using `INSERT ... ON CONFLICT DO UPDATE`. The `service_type` partial index in 0046 correctly excludes service requests. Good design.

---

## 5. PWA + Arabic RTL Validation — تدقيق التطبيق التقدمي واللغة العربية

### PWA Audit

| Check | Status | Notes |
|-------|--------|-------|
| `manifest.json` with `dir: "rtl"` & `lang: "ar"` | ✅ | Dynamic via `manifest.ts` |
| Service worker caches app shell | ✅ | `/`, `/offline.html`, icons |
| Service worker caches menu for offline | ❌ | Not implemented — API calls bypass cache |
| Installable on Android (Chrome) | ✅ | Manifest + SW present |
| Installable on iOS (Safari) | ⚠️ | Missing `apple-touch-icon` 180×180, no splash screen |
| Splash screen with brand colors | ❌ | Not configured |
| Offline fallback in Arabic | ✅ | `/offline.html` and inline fallback in SW |
| Background sync for pending orders | ❌ | Not implemented |
| Push notifications | ⚠️ | `push_subscriptions` table exists in legacy but no SW push handler |
| `manifest.webmanifest` (static) vs `manifest.ts` (dynamic) | ⚠️ | Both exist — static lacks `dir`/`lang`/`purpose` fields |

### RTL & Arabic UX Audit

| Check | Status | Notes |
|-------|--------|-------|
| `dir="rtl"` on `<html>` | ✅ | `layout.tsx` line 47 |
| `lang="ar"` on `<html>` | ✅ | `layout.tsx` line 47 |
| Arabic font stack | ✅ | Cairo (Noto Naskh Arabic fallback in body style) |
| Logical properties (`margin-inline-start`) | ⚠️ | CSS not audited for hardcoded LTR values |
| Directional icons mirrored | ⚠️ | Not verified — need visual check on SVG icons |
| Text alignment | ✅ | `top-center` Toaster with `dir="rtl"` |
| Line height ≥ 1.8 | ⚠️ | Not explicitly set for Arabic text |
| Font size ≥ 16px | ⚠️ | Not enforced globally |
| No `letter-spacing` on Arabic | ⚠️ | Not verified globally |
| Externalized i18n | ❌ | All strings hardcoded in Arabic; no i18n framework |
| Date format DD/MM/YYYY | ⚠️ | Relies on browser locale — not explicitly set |
| Currency format | ⚠️ | `formatMoney()` always shows 3 decimals |
| Arabic-Indic numerals | ❌ | Not implemented |
| 12-hour time with ص/م | ❌ | Not implemented |

### PWA Fixes Needed

1. **Remove `public/manifest.webmanifest`** — it's superseded by the dynamic `manifest.ts` and lacks `dir`/`lang` fields. The static file may take priority in some browsers.

2. **Add Safari splash screen + 180×180 icon:**
```typescript
// manifest.ts
icons: [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' }, // apple
]
```

3. **Add Splash screen images** — generate and serve via the manifest's `screenshots` array or Apple-specific `<meta>` tags in `layout.tsx`.

4. **Background sync for pending orders** — register a `sync` event in the SW when connectivity returns.

---

## First-Priority Fixes (ترتيب الأولويات)

### 🔴 فوري — Critical (Fix Tonight)

1. **`categories_select USING (true)`** — Migration 0047: Scope category reads to project members.
2. **`invite-staff/index.ts:50` syntax error** — Remove `***`, use proper header assignment.

### 🟡 ضروري — High Priority (This Sprint)

3. **Drop legacy helper functions** — Clean up `has_branch_access`, `staff_business_ids`, `staff_role_for_business`, `super_admins`, `profiles` table.
4. **Remove legacy migrations directory** — Delete `supabase/migrations_legacy/`.
5. **Sanitize console.log PII** — Redact email addresses from public logs in signup route.
6. **Currency-aware decimal formatting** — Fix `formatMoney()` to use 2 or 3 decimals based on currency.

### 🟢 تحسين — Improvements (Backlog)

7. **Add Safari PWA meta tags** — apple-touch-icon, splash screen.
8. **Verify directional icon mirroring** — Ensure arrow/chevron icons are mirrored in RTL.
9. **Consider `order_audit_logs` RLS completeness** — INSERT policy references `is_project_member` but `authenticated` doesn't have INSERT grant on `order_audit_logs` in the final state.
10. **Add i18n framework consideration** — All user-facing strings are currently hardcoded Arabic; English support would require full extraction.
11. **Add explicit Arabic typography rules** — Line height ≥ 1.8, font-size ≥ 16px, no letter-spacing on Arabic text in global CSS.

---

## Detailed File Reference

| Issue | File | Lines | Severity |
|-------|------|-------|----------|
| `categories_select USING (true)` | `supabase/migrations/0032_dokan_mvp_cutover.sql` | 333–335 | 🔴 Critical |
| `invite-staff` syntax error | `supabase/functions/invite-staff/index.ts` | 50 | 🔴 Critical |
| `order_audit_logs` late RLS | `supabase/migrations/0036_order_audit_logs.sql` | 1–25 | 🟡 High |
| Legacy helpers still in DB | Various legacy migrations | — | 🟡 High |
| waiter/bill use orders table | `src/app/api/public/waiter/route.ts` | 82–98 | 🟡 High |
| waiter/bill use orders table | `src/app/api/public/bill/route.ts` | 81–97 | 🟡 High |
| `console.log` PII signup | `src/app/api/auth/signup/route.ts` | 29–33, 62–64 | 🟢 Low |
| Money decimal per-currency | `src/lib/utils.ts` | 80–83 | 🟢 Low |
| Legacy migrations directory | `supabase/migrations_legacy/` | All files | 🟡 High |
| `get_business_storefront_by_slug` unused | `supabase/migrations/0021_storefront_rpc.sql` | 1–45 | 🟢 Low |
| `error-categories.ts` limited use | `src/lib/error-categories.ts` | — | 🟢 Low |
| `manifest.webmanifest` stale | `public/manifest.webmanifest` | — | 🟢 Low |
| Missing Safari PWA icons | `src/app/manifest.ts` | 15–34 | 🟢 Low |
| Missing RTL icon mirroring | All components with icons | — | 🟢 Low |
| GRANT select to authenticated wide | `supabase/migrations/0034_rls_grants_cleanup.sql` | 17–48 | 🟢 Low |

---

*التقرير من إعداد: Hermes Agent Audit — Dokan v2 | 2026-07-30*
*للأسئلة أو الاستفسارات: مراجعة سيد عمار أو فريق دكان*
