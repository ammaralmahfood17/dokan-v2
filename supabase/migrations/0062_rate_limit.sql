-- ============================================================================
-- 0062: Distributed rate limiting via Supabase (backend audit 2026-08-01)
-- ============================================================================
-- Vercel serverless has no shared memory: the previous in-memory Map fallback
-- was per-instance and reset on cold starts, making every rate limit bypassable.
-- Replace with an atomic Postgres-backed counter (SECURITY DEFINER RPC).
-- The table itself is fully locked down — no RLS policies at all.
-- ============================================================================

create table if not exists public.rate_limits (
  key      text primary key,
  count    integer not null default 1,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;
-- no policies: table is write-only via service_role RPC

create or replace function public.rate_limit_check(
  p_key text,
  p_limit int,
  p_window_ms int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
  v_remaining int;
  v_reset_in numeric;
begin
  select count, reset_at into v_count, v_reset_at
  from public.rate_limits
  where key = p_key;

  if v_reset_at is null or v_now > v_reset_at then
    insert into public.rate_limits (key, count, reset_at)
    values (p_key, 1, v_now + (p_window_ms || ' milliseconds')::interval)
    on conflict (key) do update
      set count = 1, reset_at = excluded.reset_at;
    return json_build_object('allowed', true, 'remaining', p_limit - 1, 'reset_in', p_window_ms);
  end if;

  if v_count >= p_limit then
    v_reset_in := extract(epoch from (v_reset_at - v_now)) * 1000;
    return json_build_object('allowed', false, 'remaining', 0, 'reset_in', v_reset_in);
  end if;

  update public.rate_limits set count = count + 1 where key = p_key;
  v_remaining := p_limit - v_count - 1;
  v_reset_in := extract(epoch from (v_reset_at - v_now)) * 1000;
  return json_build_object('allowed', true, 'remaining', v_remaining, 'reset_in', v_reset_in);
end;
$$;

revoke execute on function public.rate_limit_check(text, int, int) from anon, authenticated;
grant execute on function public.rate_limit_check(text, int, int) to service_role;
