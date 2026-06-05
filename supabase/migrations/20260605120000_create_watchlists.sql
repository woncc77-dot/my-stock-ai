-- 관심종목 watchlist
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  created_at timestamptz default now(),
  unique (user_id, stock_code)
);

alter table public.watchlists enable row level security;

drop policy if exists "Users read own watchlist" on public.watchlists;
create policy "Users read own watchlist"
  on public.watchlists for select using (auth.uid() = user_id);

drop policy if exists "Users insert own watchlist" on public.watchlists;
create policy "Users insert own watchlist"
  on public.watchlists for insert with check (auth.uid() = user_id);

drop policy if exists "Users delete own watchlist" on public.watchlists;
create policy "Users delete own watchlist"
  on public.watchlists for delete using (auth.uid() = user_id);

create index if not exists watchlists_user_id_idx on public.watchlists (user_id);
