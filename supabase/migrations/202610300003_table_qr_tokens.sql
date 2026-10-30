-- Per-table QR token resolution and order creation.
-- The random table_token is a bearer URL identifier; never expose the full table list to anonymous users.

create or replace function public.resolve_table_token(p_table_token uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select table_number
  from public.restaurant_tables
  where table_token = p_table_token and is_active = true
  limit 1;
$$;

create or replace function public.create_customer_order_by_token(
  p_table_token uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_number integer;
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_quantity integer;
begin
  select table_number into v_table_number
  from public.restaurant_tables
  where table_token = p_table_token and is_active = true;
  if v_table_number is null then
    raise exception 'Invalid or inactive table QR';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders (table_number, payment_method, total_amount)
  values (v_table_number, 'counter', 0)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 50 then
      raise exception 'Invalid item quantity';
    end if;
    select * into v_menu from public.menu_items
    where id = v_item->>'menu_item_id' and is_available = true;
    if not found then raise exception 'Menu item is unavailable'; end if;

    insert into public.order_items
      (order_id, menu_item_id, item_name, unit_price, quantity, line_total)
    values
      (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_quantity, v_menu.price * v_quantity);
    v_total := v_total + v_menu.price * v_quantity;
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.resolve_table_token(uuid) from public;
revoke all on function public.create_customer_order_by_token(uuid, jsonb) from public;
grant execute on function public.resolve_table_token(uuid) to anon, authenticated;
grant execute on function public.create_customer_order_by_token(uuid, jsonb) to anon, authenticated;

drop policy if exists "Staff can read restaurant tables" on public.restaurant_tables;
create policy "Staff can read restaurant tables" on public.restaurant_tables
for select to authenticated using (public.is_counter_staff());

drop policy if exists "Staff can insert restaurant tables" on public.restaurant_tables;
create policy "Staff can insert restaurant tables" on public.restaurant_tables
for insert to authenticated with check (public.is_counter_staff());

drop policy if exists "Staff can update restaurant tables" on public.restaurant_tables;
create policy "Staff can update restaurant tables" on public.restaurant_tables
for update to authenticated using (public.is_counter_staff())
with check (public.is_counter_staff());

grant select, insert, update on public.restaurant_tables to authenticated;

-- Keep table QR administration synchronized across counter browsers.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'restaurant_tables'
  ) then
    alter publication supabase_realtime add table public.restaurant_tables;
  end if;
end
$$;
