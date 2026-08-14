-- ============================================================
-- PKUML 演示/联调数据清理（26-27 新赛季初始化前执行一次）
-- 用法：整段复制到 Supabase SQL Editor 执行。
-- 注意：会清空 games/rounds/announcements 以及 teams 表全部数据，
--       仅在确认不再需要旧演示数据后执行（新赛季名单/赛程由后台重新录入）。
-- ============================================================

-- 对局与轮次（rounds 依赖 games，先删 rounds 或靠级联）
delete from public.rounds;
delete from public.games;

-- 公告
delete from public.announcements;

-- 队伍名单（26-27 由 admin 在 /admin/teams 重新录入，参考 data/current_roster.json）
delete from public.teams;

-- 校验（期望全部返回 0）
select
  (select count(*) from public.rounds)        as rounds,
  (select count(*) from public.games)         as games,
  (select count(*) from public.announcements) as announcements,
  (select count(*) from public.teams)         as teams;
