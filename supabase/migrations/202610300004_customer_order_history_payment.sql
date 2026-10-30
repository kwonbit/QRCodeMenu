-- Customer order history and counter payment tracking.
-- Apply after 202610300003_table_qr_tokens.sql.

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'paid'));

create or replace function public.get_customer_orders_by_token(
  p_table_token uuid,
  p_order_ids uuid[]
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'table_number', o.table_number,
      'status', o.status,
      'payment_status', o.payment_status,
      'total_amount', o.total_amount,
      'created_at', o.created_at,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'item_name', oi.item_name,
          'unit_price', oi.unit_price,
          'quantity', oi.quantity,
          'line_total', oi.line_total
        ) order by oi.id), '[]'::jsonb)
        from public.order_items oi
        where oi.order_id = o.id
      )
    ) order by o.created_at desc
  ), '[]'::jsonb)
  from public.orders o
  join public.restaurant_tables t
    on t.table_number = o.table_number
  where t.table_token = p_table_token
    and cardinality(coalesce(p_order_ids, '{}'::uuid[])) > 0
    and o.id = any(p_order_ids);
$$;

revoke all on function public.get_customer_orders_by_token(uuid, uuid[]) from public;
grant execute on function public.get_customer_orders_by_token(uuid, uuid[]) to anon, authenticated;

-- Staff can see and update payment status through the existing staff-only orders policy.
