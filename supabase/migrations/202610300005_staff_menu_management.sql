-- Staff menu/category management permissions.
-- Apply this migration in Supabase SQL Editor after 202610300004_customer_order_history_payment.sql.

drop policy if exists "Staff can read all menu categories" on public.menu_categories;
create policy "Staff can read all menu categories" on public.menu_categories
for select to authenticated
using (public.is_counter_staff());

drop policy if exists "Staff can insert menu categories" on public.menu_categories;
create policy "Staff can insert menu categories" on public.menu_categories
for insert to authenticated
with check (public.is_counter_staff());

drop policy if exists "Staff can update menu categories" on public.menu_categories;
create policy "Staff can update menu categories" on public.menu_categories
for update to authenticated
using (public.is_counter_staff())
with check (public.is_counter_staff());

drop policy if exists "Staff can read all menu items" on public.menu_items;
create policy "Staff can read all menu items" on public.menu_items
for select to authenticated
using (public.is_counter_staff());

drop policy if exists "Staff can insert menu items" on public.menu_items;
create policy "Staff can insert menu items" on public.menu_items
for insert to authenticated
with check (public.is_counter_staff());

drop policy if exists "Staff can update menu items" on public.menu_items;
create policy "Staff can update menu items" on public.menu_items
for update to authenticated
using (public.is_counter_staff())
with check (public.is_counter_staff());

grant select, insert, update on public.menu_categories to authenticated;
grant select, insert, update on public.menu_items to authenticated;
