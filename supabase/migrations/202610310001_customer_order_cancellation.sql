-- Allow a customer to cancel their own order only while it is pending.
-- The table QR token is the customer's bearer credential; no direct table UPDATE access is granted.

create or replace function public.cancel_customer_order_by_token(
  p_table_token uuid,
  p_order_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status text;
begin
  select o.status
    into v_order_status
  from public.orders o
  join public.restaurant_tables t
    on t.table_number = o.table_number
  where t.table_token = p_table_token
    and o.id = p_order_id
  for update of o;

  if not found or v_order_status <> 'pending' then
    return false;
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id
    and status = 'pending';

  return found;
end;
$$;

revoke all on function public.cancel_customer_order_by_token(uuid, uuid) from public;
grant execute on function public.cancel_customer_order_by_token(uuid, uuid) to anon, authenticated;
