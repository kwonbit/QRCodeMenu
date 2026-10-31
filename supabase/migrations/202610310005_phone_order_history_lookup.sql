create or replace function public.get_phone_orders_by_phone(
  p_customer_phone text
)
returns table (
  id uuid,
  status text,
  payment_status text,
  total_amount integer,
  created_at timestamptz,
  items jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
begin
  if length(v_phone) < 8 or length(v_phone) > 15 then
    raise exception '전화번호를 정확히 입력해 주세요.';
  end if;

  return query
  select
    o.id,
    o.status,
    o.payment_status,
    o.total_amount,
    o.created_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_name', oi.item_name,
          'unit_price', oi.unit_price,
          'quantity', oi.quantity,
          'line_total', oi.line_total,
          'selected_options', oi.selected_options
        ) order by oi.id
      ) filter (where oi.id is not null),
      '[]'::jsonb
    ) as items
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  where o.order_type = 'phone'
    and regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g') = v_phone
  group by o.id
  order by o.created_at desc
  limit 50;
end;
$$;

revoke all on function public.get_phone_orders_by_phone(text) from public;
grant execute on function public.get_phone_orders_by_phone(text) to anon, authenticated;