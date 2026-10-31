-- Allow phone orders to transition to the delivery handoff status.
-- The UI presents both served and handed_off as "제공/배달".
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status = any (
      array[
        'pending'::text,
        'accepted'::text,
        'preparing'::text,
        'served'::text,
        'handed_off'::text,
        'cancelled'::text
      ]
    )
  );
