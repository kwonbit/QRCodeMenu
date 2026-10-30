-- Staff-only order access for QRCodeMenu.
-- Assign app_metadata.role = 'staff' only to trusted counter employees.
create or replace function public.is_counter_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff', false);
$$;

drop policy if exists "Staff can read orders" on public.orders;
create policy "Staff can read orders" on public.orders
for select to authenticated
using (public.is_counter_staff());

drop policy if exists "Staff can update orders" on public.orders;
create policy "Staff can update orders" on public.orders
for update to authenticated
using (public.is_counter_staff())
with check (public.is_counter_staff());

drop policy if exists "Staff can read order items" on public.order_items;
create policy "Staff can read order items" on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and public.is_counter_staff()
  )
);

revoke all on function public.is_counter_staff() from public, anon;
grant execute on function public.is_counter_staff() to authenticated;
