-- 0058_order_item_status.sql
-- KDS item-level status: each order_item gets its own cooking state so the
-- kitchen advances items independently (start/done per item), and the order
-- status is derived automatically (first item preparing → order preparing,
-- all items ready → order ready).
--
-- Existing items default to 'pending' (new) — correct: nothing is cooked yet.

alter table public.order_items
  add column status text not null default 'pending'
  check (status in ('pending', 'preparing', 'ready'));

-- KDS columns filter by item status — keep it indexed.
create index order_items_status_idx on public.order_items (status);

-- RLS: existing "order_items_staff_all" policy already covers the new column
-- (staff can update items of their project's orders). No new policy needed.
