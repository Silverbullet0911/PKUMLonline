-- 未安排赛程：表 + RLS + 授权 + 安排 RPC（可重复执行）
-- 需要先运行本文件，再运行 seed_unarranged.sql 导入 120 场常规赛。

create table if not exists public.unarranged_games (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  stage text not null default '常规赛' check (stage in ('常规赛','半决赛','决赛')),
  seq int not null,
  seats jsonb not null default '[]'::jsonb,
  unique (season, stage, seq)
);

alter table public.unarranged_games enable row level security;

drop policy if exists "unarranged public read" on public.unarranged_games;
drop policy if exists "unarranged admin write" on public.unarranged_games;
create policy "unarranged public read" on public.unarranged_games
  for select using (true);
create policy "unarranged admin write" on public.unarranged_games
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

grant select on public.unarranged_games to anon, authenticated;
grant select, insert, update, delete on public.unarranged_games to authenticated;

create or replace function public.arrange_unarranged(
  p_unarranged_id uuid,
  p_date date,
  p_time text default null,
  p_round text default null,
  p_live_status text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_template public.unarranged_games%rowtype;
  v_game_id uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then
    raise exception 'forbidden';
  end if;

  select * into v_template from public.unarranged_games where id = p_unarranged_id;
  if not found then
    raise exception 'unarranged game not found';
  end if;

  insert into public.games (season, stage, date, time, round, status, live_status, seats)
  values (
    v_template.season,
    v_template.stage,
    p_date,
    p_time,
    p_round,
    'upcoming',
    p_live_status,
    v_template.seats
  )
  returning id into v_game_id;

  delete from public.unarranged_games where id = p_unarranged_id;
  return v_game_id;
end;
$$;

grant execute on function public.arrange_unarranged to authenticated;
