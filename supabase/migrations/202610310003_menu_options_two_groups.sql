alter table public.menu_options
  add column if not exists option_group text not null default 'option1'
  check (option_group in ('option1', 'option2'));

create index if not exists menu_options_group_idx
  on public.menu_options(menu_item_id, option_group, sort_order);

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
    raise exception 'Order must contain at least one item'; end if;
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
      if exists (
        select 1 from public.menu_options mo
        where mo.menu_item_id = v_menu.id and mo.is_available = true
          and mo.id in (select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value))
        group by mo.option_group having count(*) > 1
      ) then raise exception 'Choose no more than one item from each option group'; end if;
      for v_option_id in select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value) loop
        if not exists (select 1 from public.menu_options mo where mo.id=v_option_id and mo.menu_item_id=v_menu.id and mo.is_available=true) then
          raise exception 'Selected menu option is unavailable'; end if;
      end loop;
      select coalesce(sum(mo.additional_price),0),
        coalesce(jsonb_agg(jsonb_build_object('id',mo.id,'name',mo.name,'additional_price',mo.additional_price,'option_group',mo.option_group) order by mo.option_group,mo.sort_order,mo.name),'[]'::jsonb)
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
