# RLS tests

`rls.test.sql` is a pgTAP suite that verifies tenant isolation and
owner/manager/staff role gating directly against Postgres — the same layer
where the actual security guarantee lives, not a mock.

## Running

With the Supabase CLI (recommended — spins up a local Postgres with your
migrations already applied):

```bash
supabase test db
```

Or directly with `pg_prove` against any Postgres that already has this
schema (all migrations in `supabase/migrations/`) and the `pgtap` extension
available:

```bash
pg_prove --ext .sql -d postgres supabase/tests/rls.test.sql
```

## Running against plain Postgres (not the Supabase CLI)

If you're stubbing Supabase's platform schema yourself instead of using
`supabase test db` (which already sets this up correctly), make sure your
`service_role` stand-in has `BYPASSRLS`:

```sql
alter role service_role bypassrls;
```

Without it, `service_role` is subject to RLS like any other role. Functions
that are `SECURITY DEFINER` (like `create_order_transactional`) still
succeed internally either way, since they execute as the function owner —
but any query you run yourself *as* `service_role` afterward (e.g. a test's
own verification `SELECT`) will silently see zero rows instead of erroring,
which reads exactly like the data was never written. It was — the read was
just quietly filtered.

## Adding a test

Every table with an RLS policy should have at least one test in
`rls.test.sql`, and every RPC with real logic (not a thin CRUD wrapper)
should have one in `order-functions.test.sql`. A policy or function with no
test is one nobody will notice regressing in a future migration — that's
exactly how the old build ended up with financial tables silently writable
by any staff member. When you add a table, change who can write to it, or
touch an RPC's logic, add or update a case in the matching file in the same
PR.
