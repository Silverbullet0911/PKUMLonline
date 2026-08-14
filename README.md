# PKU M.LEAGUE 官方网站

北京大学校内立直麻将团体赛官网。前端为 Astro 静态站（部署到 GitHub Pages，`/PKUMLonline/`），动态数据（公告、赛程、赛果、积分榜）由 Supabase（Postgres + Auth + RLS）驱动，页面加载后客户端拉取渲染，失败/无数据时回退到静态 JSON。

## 常用命令

```bash
npm run dev      # 本地开发 http://localhost:4321/PKUMLonline/
npm run build    # 生成静态产物到 dist/
npm run preview  # 本地预览构建产物
npm test         # 运行单元测试（榜单/对局引擎/回放/点数表/渲染等）
```

> 注意：沙箱/受限环境下 `npm test` 若报 forks worker 超时，可用 `npx vitest run --pool=threads`。

## 架构

```
├── src/pages/                  公开页 + 后台页（Astro）
│   ├── index / news / schedule / standings / teams / rules / archive
│   └── admin/                  login、index、announcements、teams、schedule、
│                               match（对局录入）、match/result（查看结果/提交）
│   └── captain                 队长选人
├── src/lib/                    纯函数库（均有 vitest 测试）
│   ├── standings.ts            榜单计算（排序/差/晋级线差/比率）
│   ├── aggregate.ts            榜单聚合（同分平分顺位点、竞争位次、持越折半、判罚）
│   ├── scoring.ts              对局引擎（局推进/本场/亲家/供托/流局罚符/平衡校验）
│   ├── replay.ts               半庄回放（rounds → 局状态/累计分/供托，支持手动覆盖）
│   ├── renderStandings.ts      客户端榜单渲染（HTML 生成，复用 global.css）
│   └── ...
├── data/*.json                 静态数据（回退/档案）
│   ├── teams.json              队伍代表色（真）
│   ├── current_roster.json     26-27 指名名单（真）
│   ├── players_history.json    往届选手档案（真，唯一保留的榜单类静态数据）
│   ├── archive.json            历届名次/冠军（真）
│   ├── season.json             赛季配置
│   ├── schedule / standings / news   空骨架（假数据已清空，以 DB 为准）
│   └── points_table.json       点数表（赛事组确认）
├── supabase/schema.sql         全部表 + RLS + RPC（整段可重复执行）
├── supabase/cleanup_demo_data.sql  演示数据清理（新赛季初始化前执行）
└── .github/workflows/deploy.yml    GitHub Pages 自动构建部署
```

## 数据流（26-27 起）

- **公告 / 赛程 / 赛果 / 积分榜**：全部由 Supabase 提供。管理员在后台录入，页面客户端拉取渲染；静态 JSON 仅作空态/回退。
- **积分榜**：浏览器拉完赛对局 → `aggregate.ts` 现算（素点 = (分数−25000)/1000；顺位点 45/5/−15/−35，**同分平分**）→ `standings.ts` 排序渲染；持越 = 上阶段总积分折半。
- **选手档案 / 历届名次 / 队色 / 指名名单**：静态 JSON，保留不迁库。

## 后台使用

1. **首次**：在 Supabase SQL Editor 整段执行 `supabase/schema.sql`（建表 + RLS + finish_game/unfinish_game/assign_player RPC；可重复执行）。
2. **建账号**：Supabase Dashboard 手动建号（Auth → Users），并在 SQL Editor 设置角色：
   ```sql
   update public.profiles set role='admin' where email='你的账号邮箱';  -- admin / referee / captain
   update public.profiles set team='队伍名' where email='队长账号邮箱';  -- captain 时
   ```
3. **新赛季初始化**：执行 `supabase/cleanup_demo_data.sql` 清空演示数据（可选）。
4. **赛季流程**：
   - `/admin/teams` 录入 26-27 队伍名单（roster 参照 `data/current_roster.json`）
   - `/admin/schedule` 建半庄（4 座位选队）→「填选手」/ 队长 `/captain` 选人
   - `/admin/match/?id=` 逐小局录入（荣和/自摸/流局 + 立直 + 点数表；草稿可续录、倒推可改、南四锁定）
   - `/admin/match/result/?id=` 查看结果：总表（最终分数/pt/顺位点/位次/判罚每格可改）+ 阶段对局表（每格可改、任意位置插入行、局名可改）→「提交为赛果」/「修改并重新提交」
   - 前台 `/schedule` 赛果 → `/match/?id=` 详情（总表 + 阶段表）；`/standings` 与首页自动现算积分榜

## 部署

推送到 GitHub `main` 分支 → Actions 自动 `npm run build` → 发布到 GitHub Pages（`https://<user>.github.io/PKUMLonline/`）。

## 测试

`npm test`（vitest）。覆盖：榜单计算、聚合（同分平分/持越/判罚）、对局引擎（局推进/结算/罚符/平衡不变量）、回放（手动覆盖/供托）、点数表结构、客户端榜单渲染。
