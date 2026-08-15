-- 先建表，再建函数（函数体引用表，创建时会校验表是否存在），最后建策略/触发器/授权。

-- ============ 1. profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin','referee','captain')),
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
  -- 自摸支付拆分：子家自摸 [子付, 亲付]，亲家自摸 [各付]（回放需要精确拆分，故用 jsonb）
  tsumo_points jsonb,
  tenpai jsonb,
  -- 手动覆盖：录入人对该局自动生成行的修改（四家增减/对局情况/打点）
  override jsonb,
  unique (game_id, "order")
);

-- 旧安装迁移：tsumo_points 原为 int，改为 jsonb。
-- 仅在仍为整数类型时执行，并把旧值保留为 jsonb 数组 [旧值]，避免重复执行 schema.sql 清空数据。
do $$
declare
  v_data_type text;
begin
  select data_type into v_data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'rounds' and column_name = 'tsumo_points';

  if v_data_type in ('smallint','integer','bigint','numeric') then
    execute 'alter table public.rounds alter column tsumo_points type jsonb using jsonb_build_array(tsumo_points)';
  end if;
end $$;
-- 旧安装迁移：新增 override 列（可重复执行）
alter table public.rounds add column if not exists override jsonb;

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
  values (new.id, 'user', null, coalesce(new.raw_user_meta_data->>'display_name', new.email));
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

-- ============ 策略（先 drop 再 create，保证可重复执行） ============
drop policy if exists "profiles own read" on public.profiles;
drop policy if exists "profiles admin read all" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles own read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles admin read all" on public.profiles
  for select using (public.current_role() = 'admin');
create policy "profiles admin write" on public.profiles
  for all using (public.current_role() = 'admin');

drop policy if exists "teams public read" on public.teams;
drop policy if exists "teams admin write" on public.teams;
create policy "teams public read" on public.teams for select using (true);
create policy "teams admin write" on public.teams for all using (public.current_role() = 'admin');

drop policy if exists "games public read" on public.games;
drop policy if exists "games admin write" on public.games;
create policy "games public read" on public.games for select using (true);
create policy "games admin write" on public.games for all using (public.current_role() = 'admin');

drop policy if exists "rounds public read" on public.rounds;
drop policy if exists "rounds write upcoming" on public.rounds;
drop policy if exists "rounds admin write finished" on public.rounds;
create policy "rounds public read" on public.rounds
  for select using (public.game_status(game_id) = 'finished');
create policy "rounds write upcoming" on public.rounds
  for all using (public.game_status(game_id) = 'upcoming' and public.current_role() in ('admin','referee'))
  with check (public.game_status(game_id) = 'upcoming' and public.current_role() in ('admin','referee'));
create policy "rounds admin write finished" on public.rounds
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "announcements public read" on public.announcements;
drop policy if exists "announcements admin write" on public.announcements;
create policy "announcements public read" on public.announcements for select using (true);
create policy "announcements admin write" on public.announcements for all using (public.current_role() = 'admin');

-- ============ 触发器与权限授予 ============
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

grant select on public.profiles, public.teams, public.games, public.rounds, public.announcements to anon, authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.teams, public.games to authenticated;
grant select, insert, update, delete on public.rounds to authenticated;

-- ============ 队长/管理员指派出场选手 ============
-- 名单真源在 data/current_roster.json（静态），本函数不在 DB 内校验 roster；
-- 名单把关由客户端静态名单承担。服务端校验：角色、座位归属（队长限本队）、upcoming、选手非空、座位数。
create or replace function public.assign_player(p_game_id uuid, p_player text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_team text;
  v_game record;
  v_new_seats jsonb;
  v_idx int;
  v_updated boolean := false;
  v_seat_team text;
begin
  select role, team into v_role, v_team from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('captain','admin') then
    raise exception 'forbidden';
  end if;
  if p_player is null or p_player = '' then
    raise exception 'player required';
  end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.status <> 'upcoming' then raise exception 'game already finished'; end if;
  if v_game.seats is null or jsonb_array_length(v_game.seats) <> 4 then
    raise exception 'game seats must be 4';
  end if;

  v_new_seats := v_game.seats;
  for v_idx in 0..jsonb_array_length(v_new_seats)-1 loop
    v_seat_team := v_new_seats->v_idx->>'team';
    if v_role = 'captain' and v_seat_team <> v_team then
      continue;
    end if;
    v_new_seats := jsonb_set(
      v_new_seats,
      array[v_idx::text],
      v_new_seats->v_idx || jsonb_build_object('player', p_player)
    );
    v_updated := true;
    exit;
  end loop;
  if not v_updated then raise exception 'no assignable seat'; end if;
  update public.games set seats = v_new_seats where id = p_game_id;
  return v_new_seats;
end;
$$;

grant execute on function public.assign_player to authenticated;

-- ============ 提交赛果 / 退回修改 ============
-- 裁判角色无 games 写权限（RLS 仅 admin 可写 games），提交赛果经此 security-definer 函数。
-- 赛果由录入页客户端用 scoring.ts 现算后传入；SQL 侧校验 4 座位、座位/队伍/选手不得被篡改、
-- 总分 100000、位次为 1-4 排列。
create or replace function public.finish_game(p_game_id uuid, p_seats jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_game record;
  v_sum int;
  v_ranks int[];
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('referee','admin') then
    raise exception 'forbidden';
  end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.status <> 'upcoming' then raise exception 'game already finished'; end if;
  if not exists (select 1 from public.rounds where game_id = p_game_id) then
    raise exception 'no rounds recorded';
  end if;
  if v_game.seats is null or jsonb_array_length(v_game.seats) <> 4 then
    raise exception 'game seats must be 4';
  end if;
  if jsonb_array_length(p_seats) <> 4 then raise exception 'seats must be 4'; end if;

  v_sum := 0;
  v_ranks := '{}'::int[];
  for i in 0..3 loop
    if p_seats->i->>'seat' is null or p_seats->i->>'team' is null
       or p_seats->i->>'player' is null or p_seats->i->>'rank' is null
       or p_seats->i->>'points' is null then
      raise exception 'seat % incomplete', i;
    end if;
    if coalesce(v_game.seats->i->>'seat', '') <> coalesce(p_seats->i->>'seat', '')
       or coalesce(v_game.seats->i->>'team', '') <> coalesce(p_seats->i->>'team', '')
       or coalesce(v_game.seats->i->>'player', '') <> coalesce(p_seats->i->>'player', '') then
      raise exception 'seat % does not match original game seats', i;
    end if;
    v_sum := v_sum + (p_seats->i->>'points')::int;
    v_ranks := v_ranks || (p_seats->i->>'rank')::int;
  end loop;
  if v_sum <> 100000 then raise exception 'points total must be 100000, got %', v_sum; end if;
  -- 位次可被录入人手动选择（含同分同位等任意组合），仅校验取值 1-4
  for i in 1..coalesce(array_length(v_ranks, 1), 0) loop
    if v_ranks[i] < 1 or v_ranks[i] > 4 then
      raise exception 'rank out of range';
    end if;
  end loop;

  update public.games set seats = p_seats, status = 'finished' where id = p_game_id;
  return p_seats;
end;
$$;

-- 管理员将已完结半庄退回 upcoming，以便修正 rounds 后重新提交
create or replace function public.unfinish_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then raise exception 'forbidden'; end if;
  update public.games set status = 'upcoming' where id = p_game_id;
end;
$$;

grant execute on function public.finish_game, public.unfinish_game to authenticated;
