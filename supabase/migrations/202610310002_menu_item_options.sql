create table if not exists public.menu_options (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null references public.menu_items(id) on delete cascade,
  name text not null,
  additional_price integer not null default 0 check (additional_price >= 0),
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_options_menu_item_idx on public.menu_options(menu_item_id, sort_order);
alter table public.menu_options enable row level security;

drop policy if exists "Public can read available menu options" on public.menu_options;
create policy "Public can read available menu options" on public.menu_options
for select to anon, authenticated using (
  is_available = true and exists (
    select 1 from public.menu_items m where m.id = menu_item_id and m.is_available = true
  )
);
drop policy if exists "Staff can read all menu options" on public.menu_options;
create policy "Staff can read all menu options" on public.menu_options
for select to authenticated using (public.is_counter_staff());
drop policy if exists "Staff can insert menu options" on public.menu_options;
create policy "Staff can insert menu options" on public.menu_options
for insert to authenticated with check (public.is_counter_staff());
drop policy if exists "Staff can update menu options" on public.menu_options;
create policy "Staff can update menu options" on public.menu_options
for update to authenticated using (public.is_counter_staff()) with check (public.is_counter_staff());
drop policy if exists "Staff can delete menu options" on public.menu_options;
create policy "Staff can delete menu options" on public.menu_options
for delete to authenticated using (public.is_counter_staff());
grant select on public.menu_options to anon, authenticated;
grant select, insert, update, delete on public.menu_options to authenticated;

alter table public.order_items add column if not exists selected_options jsonb not null default '[]'::jsonb;

create or replace function public.create_customer_order_by_token(p_table_token uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_table_number integer;
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_option_id uuid;
  v_menu public.menu_items%rowtype;
  v_quantity integer;
  v_base_price integer;
  v_options_total integer;
  v_options_snapshot jsonb;
  v_item_total integer;
begin
  select table_number into v_table_number from public.restaurant_tables
  where table_token = p_table_token and is_active = true;
  if v_table_number is null then raise exception 'Invalid or inactive table QR'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;
  insert into public.orders (table_number, payment_method, total_amount)
  values (v_table_number, 'counter', 0) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 50 then raise exception 'Invalid item quantity'; end if;
    select * into v_menu from public.menu_items where id = v_item->>'menu_item_id' and is_available = true;
    if not found then raise exception 'Menu item is unavailable'; end if;
    v_base_price := v_menu.price;
    v_options_total := 0;
    v_options_snapshot := '[]'::jsonb;
    if v_item ? 'option_ids' then
      if jsonb_typeof(v_item->'option_ids') <> 'array' then raise exception 'Invalid menu options'; end if;
      for v_option_id in select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value) loop
        if not exists (select 1 from public.menu_options mo where mo.id=v_option_id and mo.menu_item_id=v_menu.id and mo.is_available=true) then
          raise exception 'Selected menu option is unavailable';
        end if;
      end loop;
      select coalesce(sum(mo.additional_price),0),
        coalesce(jsonb_agg(jsonb_build_object('id',mo.id,'name',mo.name,'additional_price',mo.additional_price) order by mo.sort_order,mo.name),'[]'::jsonb)
      into v_options_total, v_options_snapshot
      from public.menu_options mo
      where mo.menu_item_id=v_menu.id and mo.is_available=true
        and mo.id in (select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value));
    end if;
    v_item_total := (v_base_price + v_options_total) * v_quantity;
    insert into public.order_items (order_id,menu_item_id,item_name,unit_price,quantity,line_total,selected_options)
    values (v_order_id,v_menu.id,v_menu.name,v_base_price+v_options_total,v_quantity,v_item_total,v_options_snapshot);
    v_total := v_total + v_item_total;
  end loop;
  update public.orders set total_amount=v_total where id=v_order_id;
  return v_order_id;
end;
$$;
revoke all on function public.create_customer_order_by_token(uuid,jsonb) from public;
grant execute on function public.create_customer_order_by_token(uuid,jsonb) to anon, authenticated;

create or replace function public.get_customer_orders_by_token(p_table_token uuid, p_order_ids uuid[])
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'table_number',o.table_number,'status',o.status,'payment_status',o.payment_status,
    'total_amount',o.total_amount,'created_at',o.created_at,
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'item_name',oi.item_name,'unit_price',oi.unit_price,'quantity',oi.quantity,
      'line_total',oi.line_total,'selected_options',oi.selected_options
    ) order by oi.id),'[]'::jsonb) from public.order_items oi where oi.order_id=o.id)
  ) order by o.created_at desc),'[]'::jsonb)
  from public.orders o join public.restaurant_tables t on t.table_number=o.table_number
  where t.table_token=p_table_token and cardinality(coalesce(p_order_ids,'{}'::uuid[]))>0 and o.id=any(p_order_ids);
$$;