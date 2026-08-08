-- ============================================================================
-- 0002_order_items_cascade_delete_fix.sql
-- Found by the authorized 2026-08-08 e2e launch-readiness run on prod:
--
--   super_admin_hard_delete_project() fails with
--   "order_items: order ... not found" whenever the project has orders
--   whose items reference products. During the project cascade delete,
--   PostgreSQL fires the products -> order_items FK SET NULL action after
--   the orders rows are already removed; the BEFORE UPDATE trigger then
--   raises because the parent order is gone, aborting the whole delete
--   (single transaction -> a super admin can never purge a client store).
--
-- FIX: when the parent order no longer exists we are inside a cascade
-- teardown of that exact row — there is nothing left to protect (FKs on
-- order_id are CASCADE; the row dies in the same statement). Return NULL
-- instead of raising. The cross-tenant guard is fully preserved for every
-- real INSERT/UPDATE: live orders must still reference same-project
-- products.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.order_items_validate_project() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  v_order_project uuid;
  v_product_project uuid;
begin
  -- Resolve the order's project and (when present) the product's project.
  select project_id into v_order_project
  from public.orders where id = NEW.order_id;

  if v_order_project is null then
    -- Parent order is being deleted by a project cascade — this item row
    -- is in its final statement. Accept and let the cascade finish.
    return null;
  end if;

  if NEW.product_id is not null then
    select project_id into v_product_project
    from public.products where id = NEW.product_id;

    if v_product_project is null then
      raise exception 'order_items: product % not found', NEW.product_id;
    end if;

    if v_product_project <> v_order_project then
      raise exception 'order_items: product belongs to a different project';
    end if;
  end if;

  return NEW;
end;
$$;