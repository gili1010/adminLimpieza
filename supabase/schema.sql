-- Ejecutar este archivo en Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cost_price numeric(12,2) not null check (cost_price >= 0),
  sale_price numeric(12,2) not null check (sale_price >= 0),
  stock numeric(12,3) not null default 0,
  stock_min numeric(12,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  sold_at timestamptz not null default now(),
  note text,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  total_profit numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_sale_price numeric(12,2) not null check (unit_sale_price >= 0),
  unit_cost_price numeric(12,2) not null check (unit_cost_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  line_cost numeric(12,2) not null check (line_cost >= 0),
  line_profit numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sale_price numeric(12,2) not null check (sale_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

-- Ensure client_id exists before creating the index that depends on it
alter table if exists public.sales
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_products_owner on public.products(owner_id);
create index if not exists idx_clients_owner on public.clients(owner_id);
create index if not exists idx_sales_owner_sold_at on public.sales(owner_id, sold_at desc);
create index if not exists idx_sales_client on public.sales(client_id);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_items_product on public.sale_items(product_id);
create index if not exists idx_combos_owner on public.combos(owner_id);
create index if not exists idx_combo_items_combo on public.combo_items(combo_id);
create index if not exists idx_combo_items_product on public.combo_items(product_id);

alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.combos enable row level security;
alter table public.combo_items enable row level security;

drop policy if exists "products_select_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
drop policy if exists "products_delete_own" on public.products;

drop policy if exists "clients_select_own" on public.clients;
drop policy if exists "clients_insert_own" on public.clients;
drop policy if exists "clients_update_own" on public.clients;
drop policy if exists "clients_delete_own" on public.clients;

drop policy if exists "sales_select_own" on public.sales;
drop policy if exists "sales_insert_own" on public.sales;
drop policy if exists "sales_update_own" on public.sales;
drop policy if exists "sales_delete_own" on public.sales;

drop policy if exists "sale_items_select_own" on public.sale_items;
drop policy if exists "sale_items_insert_own" on public.sale_items;
drop policy if exists "sale_items_update_own" on public.sale_items;
drop policy if exists "sale_items_delete_own" on public.sale_items;

drop policy if exists "combos_select_own" on public.combos;
drop policy if exists "combos_insert_own" on public.combos;
drop policy if exists "combos_update_own" on public.combos;
drop policy if exists "combos_delete_own" on public.combos;

drop policy if exists "combo_items_select_own" on public.combo_items;
drop policy if exists "combo_items_insert_own" on public.combo_items;
drop policy if exists "combo_items_update_own" on public.combo_items;
drop policy if exists "combo_items_delete_own" on public.combo_items;

create policy "products_select_own" on public.products
for select using (auth.uid() = owner_id);

create policy "products_insert_own" on public.products
for insert with check (auth.uid() = owner_id);

create policy "products_update_own" on public.products
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "products_delete_own" on public.products
for delete using (auth.uid() = owner_id);

create policy "clients_select_own" on public.clients
for select using (auth.uid() = owner_id);

create policy "clients_insert_own" on public.clients
for insert with check (auth.uid() = owner_id);

create policy "clients_update_own" on public.clients
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "clients_delete_own" on public.clients
for delete using (auth.uid() = owner_id);

create policy "sales_select_own" on public.sales
for select using (auth.uid() = owner_id);

create policy "sales_insert_own" on public.sales
for insert with check (auth.uid() = owner_id);

create policy "sales_update_own" on public.sales
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "sales_delete_own" on public.sales
for delete using (auth.uid() = owner_id);

create policy "sale_items_select_own" on public.sale_items
for select using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.owner_id = auth.uid()
  )
);

create policy "sale_items_insert_own" on public.sale_items
for insert with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.owner_id = auth.uid()
  )
);

create policy "sale_items_update_own" on public.sale_items
for update using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.owner_id = auth.uid()
  )
);

create policy "sale_items_delete_own" on public.sale_items
for delete using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.owner_id = auth.uid()
  )
);

create policy "combos_select_own" on public.combos
for select using (auth.uid() = owner_id);

create policy "combos_insert_own" on public.combos
for insert with check (auth.uid() = owner_id);

create policy "combos_update_own" on public.combos
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "combos_delete_own" on public.combos
for delete using (auth.uid() = owner_id);

create policy "combo_items_select_own" on public.combo_items
for select using (
  exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and c.owner_id = auth.uid()
  )
);

create policy "combo_items_insert_own" on public.combo_items
for insert with check (
  exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and c.owner_id = auth.uid()
  )
);

create policy "combo_items_update_own" on public.combo_items
for update using (
  exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and c.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and c.owner_id = auth.uid()
  )
);

create policy "combo_items_delete_own" on public.combo_items
for delete using (
  exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and c.owner_id = auth.uid()
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.sales to authenticated;
grant select, insert, update, delete on table public.sale_items to authenticated;
grant select, insert, update, delete on table public.combos to authenticated;
grant select, insert, update, delete on table public.combo_items to authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter table if exists public.products
alter column stock type numeric(12,3) using stock::numeric;

alter table if exists public.products
add column if not exists stock_min numeric(12,3) not null default 0;

alter table if exists public.products
alter column stock_min type numeric(12,3) using stock_min::numeric;

alter table if exists public.sale_items
alter column quantity type numeric(12,3) using quantity::numeric;

alter table if exists public.combo_items
alter column quantity type numeric(12,3) using quantity::numeric;

select pg_notify('pgrst', 'reload schema');
