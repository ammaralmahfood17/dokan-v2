-- 0039: Disable the broken on_auth_user_created trigger (v2)
-- The previous 0038 failed on COMMENT ON auth.users (not allowed).
-- This version only drops the trigger safely.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Optional: drop the old function if you want to recreate it later
-- DROP FUNCTION IF EXISTS public.handle_new_user();
