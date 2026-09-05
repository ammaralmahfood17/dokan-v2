# Backend reliability and security controls

## Migration order

Apply migrations to a staging Supabase project first, after taking a database backup and checking the preflight queries below.

```bash
npx supabase db lint
npx supabase db push --linked
npx supabase test db
```

The new migrations `0021_backend_reliability_scope.sql` and `0022_security_advisor_hardening.sql` add branch access, project-currency enforcement, atomic `event_outbox` capture, default-deny policies for internal tables, trigger-only function grants, and extension isolation. They must be applied after `0020_integrity_rbac_rls_hardening.sql`.

## Preflight checks

Run these queries before production deployment:

```sql
-- Check branch references before the new FK is applied.
SELECT count(*) AS orphaned_table_branches
FROM public.tables t
LEFT JOIN public.branches b
  ON b.project_id = t.project_id AND b.id = t.branch_id
WHERE t.branch_id IS NOT NULL AND b.id IS NULL;

-- Check journal currencies against their tenant currency.
SELECT count(*) AS mismatched_journal_currencies
FROM public.journal_entries je
JOIN public.projects p ON p.id = je.project_id
WHERE upper(je.currency_code) <> upper(p.currency);

-- Inspect old outbox backlog after deployment.
SELECT status, count(*)
FROM public.event_outbox
GROUP BY status;
```

All preflight counts should be zero before applying constraints.

## Event outbox contract

Every order insert creates one `order.created` row in `public.event_outbox` in the same database transaction. The unique constraint on `(event_type, aggregate_id)` makes the event idempotent.

A worker must claim pending or failed rows with a short lease, process accounting/audit/notifications, and then set `completed`, or set `failed`, `last_error`, `attempts`, and `next_attempt_at` for retry. The worker must use a service-role connection and must never expose the outbox to browser clients.

A safe claim pattern is:

```sql
WITH claimed AS (
  SELECT id
  FROM public.event_outbox
  WHERE status IN ('pending', 'failed')
    AND next_attempt_at <= now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 50
)
UPDATE public.event_outbox e
SET status = 'processing', attempts = attempts + 1
FROM claimed c
WHERE e.id = c.id
RETURNING e.*;
```

The existing request-path notifications remain for low latency, but the outbox is the durable recovery source for accounting, audit, push, and WhatsApp/Telegram delivery. Follow-up workers should make each operation idempotent.

## Branch access rollout

The branch policy is backward-compatible: a staff member with no rows in `staff_branch_access` retains project-level access. Once assignments exist for that staff member, branch-scoped rows are restricted to assigned branches. Owners retain access to all branches.

Use `public.can_access_project_branch(project_id, branch_id)` in any new branch-scoped RLS policy. Every new tenant table must include `project_id`, and every cross-tenant relationship should use a composite foreign key where practical.

## Required CI checks

```bash
npm ci
npm run lint
npm run test
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

For the current project, set `NEXT_PUBLIC_SUPABASE_URL` to `https://eyzjyddiyiivuxmmmlzr.supabase.co` and use the publishable/anon key from the Supabase dashboard. Production must also set `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, and the configured rate-limit backend. Never put the service-role key in a `NEXT_PUBLIC_*` variable or browser bundle.
