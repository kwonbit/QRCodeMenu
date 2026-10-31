-- Support direct-URL phone/delivery orders alongside table QR orders.
alter table public.orders
  alter column table_number drop not null,
  add column if not exists order_type text not null default 'table'
    check (order_type in ('table', 'phone')),
  add column if not exists customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists request_note text;

create or replace function public.create_phone_order(
  p_customer_phone text,
  p_delivery_address text,
  p_request_note text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_option_id uuid;
  v_menu public.menu_items%rowtype;
  v_quantity integer;
  v_options_total integer;
  v_options_snapshot jsonb;
  v_item_total integer;
  v_phone text := btrim(coalesce(p_customer_phone, ''));
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_note text := btrim(coalesce(p_request_note, ''));
begin
  if length(v_phone) < 8 or length(v_phone) > 30 then
    raise exception '전화번호를 8~30자 이내로 입력해 주세요.';
  end if;
  if length(v_address) < 5 or length(v_address) > 300 then
    raise exception '배달 주소를 5~300자 이내로 입력해 주세요.';
  end if;
  if length(v_note) > 500 then
    raise exception '요청사항은 500자 이내로 입력해 주세요.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many order lines';
  end if;

  insert into public.orders
    (table_number, order_type, customer_phone, delivery_address, request_note, payment_method, total_amount)
  values
    (null, 'phone', v_phone, v_address, nullif(v_note, ''), 'counter', 0)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 50 then
      raise exception 'Invalid item quantity';
    end if;
    select * into v_menu
    from public.menu_items
    where id = v_item->>'menu_item_id' and is_available = true;
    if not found then raise exception 'Menu item is unavailable'; end if;

    v_options_total := 0;
    v_options_snapshot := '[]'::jsonb;
    if v_item ? 'option_ids' then
      if jsonb_typeof(v_item->'option_ids') <> 'array' then
        raise exception 'Invalid menu options';
      end if;
      if exists (
        select 1 from public.menu_options mo
        where mo.menu_item_id = v_menu.id and mo.is_available = true
          and mo.id in (select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value))
        group by mo.option_group having count(*) > 1
      ) then raise exception 'Choose no more than one item from each option group'; end if;

      for v_option_id in
        select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value)
      loop
        if not exists (
          select 1 from public.menu_options mo
          where mo.id = v_option_id and mo.menu_item_id = v_menu.id and mo.is_available = true
        ) then raise exception 'Selected menu option is unavailable'; end if;
      end loop;

      select coalesce(sum(mo.additional_price), 0),
        coalesce(jsonb_agg(jsonb_build_object(
          'id', mo.id, 'name', mo.name,
          'additional_price', mo.additional_price, 'option_group', mo.option_group
        ) order by mo.option_group, mo.sort_order, mo.name), '[]'::jsonb)
      into v_options_total, v_options_snapshot
      from public.menu_options mo
      where mo.menu_item_id = v_menu.id and mo.is_available = true
        and mo.id in (select value::uuid from jsonb_array_elements_text(v_item->'option_ids') as x(value));
    end if;

    v_item_total := (v_menu.price + v_options_total) * v_quantity;
    insert into public.order_items
      (order_id, menu_item_id, item_name, unit_price, quantity, line_total, selected_options)
    values
      (v_order_id, v_menu.id, v_menu.name, v_menu.price + v_options_total,
       v_quantity, v_item_total, v_options_snapshot);
    v_total := v_total + v_item_total;
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.create_phone_order(text, text, text, jsonb) from public;
grant execute on function public.create_phone_order(text, text, text, jsonb) to anon, authenticated;
