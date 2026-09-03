-- Cloudflare D1 migration for PKU M.LEAGUE
-- Route B: fully replace Supabase with Pages Functions + D1.
-- All JSONB columns from Postgres are stored as TEXT and parsed in the API layer.

create table if not exists profiles (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('user','admin','referee','captain')),
  team text,
  display_name text,
  created_at text not null default (datetime('now'))
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references profiles(id) on delete cascade,
  expires_at text not null
);
create index if not exists sessions_user_id_idx on sessions(user_id);

-- Kept for parity with the old schema. Roster/team data is still sourced from
-- static JSON (data/current_roster.json, data/teams.json) in the frontend.
create table if not exists teams (
  id text primary key,
  season text not null,
  name text not null,
  captain text,
  roster text not null default '[]',
  unique (season, name)
);

create table if not exists games (
  id text primary key,
  season text not null,
  stage text not null check (stage in ('常规赛','半决赛','决赛')),
  date text not null,
  time text,
  round text,
  status text not null default 'upcoming' check (status in ('upcoming','finished')),
  live_status text check (live_status in ('直播','非直播')),
  seats text not null default '[]'
);
create index if not exists games_season_status_idx on games(season, status);

create table if not exists rounds (
  id text primary key,
  game_id text not null references games(id) on delete cascade,
  "order" integer not null,
  win_type text check (win_type in ('ron','tsumo','draw')),
  riichi text not null default '[false,false,false,false]',
  ron_winner text,
  ron_loser text,
  ron_points integer,
  tsumo_winner text,
  tsumo_points text,
  tenpai text,
  override text,
  unique (game_id, "order")
);
create index if not exists rounds_game_id_order_idx on rounds(game_id, "order");

create table if not exists announcements (
  id text primary key,
  date text not null,
  title text not null,
  category text not null default '公告',
  body text not null default ''
);

create table if not exists unarranged_games (
  id text primary key,
  season text not null,
  stage text not null default '常规赛' check (stage in ('常规赛','半决赛','决赛')),
  seq integer not null,
  seats text not null default '[]',
  unique (season, stage, seq)
);
