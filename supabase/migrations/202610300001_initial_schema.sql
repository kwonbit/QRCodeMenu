-- QRCodeMenu initial schema
-- Apply this migration in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.menu_items (
  id text primary key,
  category_id uuid references public.menu_categories(id),
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null unique check (table_number > 0),
  table_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null,
  status text not null default 'pending' check (status in ('pending','accepted','preparing','served','cancelled')),
  payment_method text not null default 'counter' check (payment_method = 'counter'),
  total_amount integer not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id text,
  item_name text not null,
  unit_price integer not null,
  quantity integer not null check (quantity > 0),
  line_total integer not null
);

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Public can read active categories" on public.menu_categories;
create policy "Public can read active categories" on public.menu_categories
for select to anon, authenticated using (is_active = true);

drop policy if exists "Public can read available menu items" on public.menu_items;
create policy "Public can read available menu items" on public.menu_items
for select to anon, authenticated using (is_available = true);

-- Seed table 1 and categories. Menu items can be managed from the Supabase dashboard for now.
insert into public.restaurant_tables (table_number) values (1)
on conflict (table_number) do nothing;

insert into public.menu_categories (name, sort_order) values
  ('식사', 1), ('사이드', 2), ('음료', 3)
on conflict (name) do nothing;

-- Prices and item names are read from the database, never trusted from the browser.
create or replace function public.create_customer_order(
  p_table_number integer,
  p_items jsonb,
  p_payment_method text default 'counter'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_quantity integer;
begin
  if p_payment_method <> 'counter' then
    raise exception 'Only counter payment is supported';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;
  if not exists (
    select 1 from public.restaurant_tables
    where table_number = p_table_number and is_active = true
  ) then
    raise exception 'Invalid or inactive table';
  end if;

  insert into public.orders (table_number, payment_method, total_amount)
  values (p_table_number, 'counter', 0)
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
    if not found then
      raise exception 'Menu item is unavailable';
    end if;

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

revoke all on function public.create_customer_order(integer, jsonb, text) from public;
grant execute on function public.create_customer_order(integer, jsonb, text) to anon, authenticated;

-- IMPORTANT:
-- Do not expose orders/order_items to anon. Before production, add staff authentication,
-- staff-only SELECT/UPDATE RLS policies, and enable orders in the Supabase Realtime publication.


-- Initial sample menu data used by the starter React screen.
insert into public.menu_items (id, category_id, name, description, price, sort_order)
select seed.id, c.id, seed.name, seed.description, seed.price, seed.sort_order
from (values
  ('hamburg', '식사', '수제 함박스테이크', '촉촉한 함박과 데미글라스 소스', 13500, 1),
  ('pasta', '식사', '새우 크림 파스타', '통통한 새우와 고소한 크림', 14500, 2),
  ('rice', '식사', '불고기 덮밥', '달콤 짭조름한 한 끼', 11000, 3),
  ('chicken', '사이드', '치킨 가라아게', '바삭하게 튀긴 한입 치킨', 9000, 1),
  ('lemon', '음료', '레몬에이드', '상큼하고 시원한 에이드', 4500, 1),
  ('coffee', '음료', '아메리카노', '깔끔한 향의 커피', 3500, 2)
) as seed(id, category_name, name, description, price, sort_order)
join public.menu_categories c on c.name = seed.category_name
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  sort_order = excluded.sort_order;

-- Add orders to Supabase Realtime if not already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end
$$;
