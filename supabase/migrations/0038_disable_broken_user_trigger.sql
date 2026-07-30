-- 0038: Temporarily disable the old handle_new_user trigger
-- The old trigger (from 0013) is likely causing AuthRetryableFetchError 500
-- because the schema changed dramatically after the 0032 cutover (stores + staff instead of profiles).

-- Disable the old trigger that fires on every new auth user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- We keep the old function for inspection. Do not drop it here.