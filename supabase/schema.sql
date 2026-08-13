-- 先建表，再建函数（函数体引用表，创建时会校验表是否存在），最后建策略/触发器/授权。

-- ============ 1. profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'referee' check (role in ('admin','referee','captain')),
  team text,
  display_name text
);

alter table public.profiles enable row level security;

-- ============ 2. teams ============
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  name text not null,
  captain text,
  roster jsonb not null default '[]'::jsonb,
  unique (season, name)
);

alter table public.teams enable row level security;

-- ============ 3. games ============
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  stage text not null check (stage in ('常规赛','半决赛','决赛')),
  date date not null,
  time text,
  round text,
  status text not null default 'upcoming' check (status in ('upcoming','finished')),
  seats jsonb not null default '[]'::jsonb
);

alter table public.games enable row level security;

-- ============ 4. rounds ============
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  "order" int not null,
  win_type text check (win_type in ('ron','tsumo','draw')),
  riichi jsonb not null default '[false,false,false,false]'::jsonb,
  ron_winner text,
  ron_loser text,
  ron_points int,
  tsumo_winner text,
  tsumo_points int,
  tenpai jsonb,
  unique (game_id, "order")
);

alter table public.rounds enable row level security;

-- ============ 5. announcements ============
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  category text not null default '公告',
  body text not null default ''
);

alter table public.announcements enable row level security;

-- ============ 角色辅助函数 ============
create or replace function public.current_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role, team, display_name)
  values (new.id, 'referee', null, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create or replace function public.game_status(gid uuid)
returns text
language sql
security definer
stable
as $$
  select status from public.games where id = gid
$$;

-- ============ 策略 ============
create policy "profiles own read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles admin read all" on public.profiles
  for select using (public.current_role() = 'admin');
create policy "profiles admin write" on public.profiles
  for all using (public.current_role() = 'admin');

create policy "teams public read" on public.teams for select using (true);
create policy "teams admin write" on public.teams for all using (public.current_role() = 'admin');

create policy "games public read" on public.games for select using (true);
create policy "games admin write" on public.games for all using (public.current_role() = 'admin');

create policy "rounds public read" on public.rounds for select using (true);
create policy "rounds write upcoming" on public.rounds
  for all using (public.game_status(game_id) = 'upcoming')
  with check (public.game_status(game_id) = 'upcoming' and (public.current_role() in ('admin','referee')));
create policy "rounds admin write finished" on public.rounds
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy "announcements public read" on public.announcements for select using (true);
create policy "announcements admin write" on public.announcements for all using (public.current_role() = 'admin');

-- ============ 触发器与权限授予 ============
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

grant select on public.profiles, public.teams, public.games, public.rounds, public.announcements to anon, authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.teams, public.games to authenticated;
grant select, insert, update, delete on public.rounds to authenticated;
