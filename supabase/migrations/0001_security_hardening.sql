-- ============================================================================
-- 0001_security_hardening.sql
-- Deep-code audit fixes (2026-08-08) — applied on top of the 0000 baseline.
--
-- CONTENTS:
--  1. Settings: only the OWNER may UPDATE a project row (was: any member —
--     a cashier could flip is_active=false and take the store offline).
--  2. Order idempotency: orders.idempotency_key + partial unique index, and
--     create_order_transactional gains p_idempotency_key so network retries
--     can never double-create an order.
--  3. One store per user (owner): partial unique index on staff_members
--     (user_id) WHERE role='owner' — closes the onboarding double-click race.
--  4. One-time cleanup of expired rate-limit rows (new code clamps key sizes).
--  5. Drop the unused notification_type enum.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Project updates: OWNER only
-- ---------------------------------------------------------------------------
-- projects_update_member let ANY member (including a cashier) overwrite
-- name/currency/primary_color/is_active. The store-off toggle is now an
-- owner-only operation (the client also gates the form on isOwner).
DROP POLICY IF EXISTS projects_update_member ON public.projects;
CREATE POLICY projects_update_owner ON public.projects
  FOR UPDATE
  USING (public.is_project_owner(id))
  WITH CHECK (public.is_project_owner(id));

-- ---------------------------------------------------------------------------
-- 2. Order idempotency
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- One key per project (a key is unique only within its store). NULL allowed
-- for legacy/waiter/bill rows and any future non-keyed path.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON public.orders (project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Recreate the transactional order RPC with the idempotency key. DROP+CREATE
-- because CREATE OR REPLACE cannot change the argument list. Signature and
-- body mirror the FINAL 0000 definition (uuid, text, text, numeric, integer,
-- jsonb, uuid, text, uuid) + the new trailing p_idempotency_key.
DROP FUNCTION IF EXISTS public.create_order_transactional(
  uuid, text, text, numeric, integer, jsonb, uuid, text, uuid
);
CREATE FUNCTION public.create_order_transactional(
  p_project_id uuid,
  p_type text,
  p_status text,
  p_total_amount numeric,
  p_order_number integer,
  p_items jsonb,
  p_table_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_caller_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_caller uuid;
begin
  -- Tenant guard — see 0010 header comment. Anonymous public path passes
  -- NULL caller (route-level validation applies); authenticated POS passes
  -- the staff id so the RPC itself enforces membership.
  v_caller := coalesce(auth.uid(), p_caller_user_id);
  if v_caller is not null and not public.is_project_member_for(v_caller, p_project_id) then
    raise exception 'not authorized for this project' using errcode = '42501';
  end if;

  insert into public.orders (project_id, table_id, type, status, total_amount, notes, order_number, idempotency_key)
  values (p_project_id, p_table_id, p_type::order_type, p_status::order_status, p_total_amount, p_notes, p_order_number, p_idempotency_key)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, addons, notes)
    values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      coalesce(v_item->'addons', '[]'::jsonb),
      v_item->>'notes'
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'status', p_status,
    'total_amount', p_total_amount,
    'order_number', p_order_number
  );
end;
$$;

REVOKE ALL ON FUNCTION public.create_order_transactional FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_transactional TO service_role;

-- ---------------------------------------------------------------------------
-- 3. One owner-store per account (closes the onboarding double-click race)
-- ---------------------------------------------------------------------------
-- Staff of OTHER stores remain allowed (a user can be staff in many shops);
-- only the owner row is unique per user.
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_single_owner
  ON public.staff_members (user_id)
  WHERE (role = 'owner');

-- ---------------------------------------------------------------------------
-- 4. One-time cleanup of expired rate-limit buckets
-- ---------------------------------------------------------------------------
DELETE FROM public.rate_limits WHERE reset_at < now();

-- ---------------------------------------------------------------------------
-- 5. Drop the unused notification_type enum
-- ---------------------------------------------------------------------------
DROP TYPE IF EXISTS public.notification_type;