create or replace function public.cancel_phone_order_by_phone(
  p_order_id uuid,
  p_customer_phone text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_updated_id uuid;
begin
  if length(v_phone) < 8 or length(v_phone) > 15 then
    raise exception '전화번호를 정확히 입력해 주세요.';
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id
    and order_type = 'phone'
    and status = 'pending'
    and coalesce(payment_status, 'unpaid') <> 'paid'
    and regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_phone
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke all on function public.cancel_phone_order_by_phone(uuid, text) from public;
grant execute on function public.cancel_phone_order_by_phone(uuid, text) to anon, authenticated;
