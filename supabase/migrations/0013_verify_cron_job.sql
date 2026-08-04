-- Temporary verification: confirm the cron job is actually registered.
-- Raises an exception (failing the push) if it is missing.
DO $$
declare
  r record;
  v_found boolean := false;
begin
  for r in
    select jobid, schedule, command, active
    from cron.job
    where jobname = 'dokan-expire-subscriptions'
  loop
    v_found := true;
    raise notice 'CRON JOB VERIFIED: jobid=% schedule=% active=% command=%',
      r.jobid, r.schedule, r.active, r.command;
  end loop;
  if not v_found then
    raise exception 'CRON JOB MISSING: dokan-expire-subscriptions was not registered';
  end if;
end;
$$;
