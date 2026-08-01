-- 0043: Make order_number NOT NULL
-- Required after 0042_daily_order_numbers.sql
alter table public.orders alter column order_number set not null;
alter table public.orders alter column order_number set default 0;
