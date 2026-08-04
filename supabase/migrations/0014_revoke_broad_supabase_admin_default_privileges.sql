-- ============================================================================
-- 0014_revoke_broad_supabase_admin_default_privileges.sql
-- F4: The baseline (0000, lines ~1969-2022) sets ALTER DEFAULT PRIVILEGES
-- granting ALL (incl. TRUNCATE/REFERENCES/TRIGGER) to anon/authenticated for
-- objects created by postgres AND by supabase_admin.
--
-- What this migration does:
--   * FOR ROLE postgres (the role migrations run as, i.e. everything WE create
--     going forward): replaces the broad ALL grants with the minimum PostgREST
--     + RLS actually need — SELECT/INSERT/UPDATE/DELETE on tables,
--     USAGE/SELECT on sequences, EXECUTE on functions. No TRUNCATE,
--     REFERENCES, TRIGGER, or DDL for anon/authenticated. New tables created
--     by migrations now need explicit grants (already the repo's practice:
--     0001/0002 hardening does exactly that).
--   * FOR ROLE supabase_admin: NOT touched. Supabase's managed Postgres runs
--     db push as `postgres`, which is not a member of supabase_admin and
--     cannot alter that role's default privileges (verified live: SET ROLE
--     supabase_admin → insufficient privilege). This repo never creates
--     schema via the dashboard (migrations only), so the supabase_admin
--     defaults are inert here. If we ever need them closed, it must be done
--     manually as supabase_admin via Supabase support/dashboard SQL.
--
-- Default privileges apply only at object-creation time: existing objects
-- (which have explicit grants from the baseline + 0001/0002) are untouched.
-- ============================================================================

-- ---------- TABLES (FOR ROLE postgres) ----------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ---------- SEQUENCES (FOR ROLE postgres) ----------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- ---------- FUNCTIONS (FOR ROLE postgres) ----------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
