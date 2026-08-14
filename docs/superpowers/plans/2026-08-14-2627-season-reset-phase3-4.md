# 26-27 赛季数据初始化 + Phase 3/4（对局录入 / DB 打通）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全站数据切换到 26-27 新赛季（清空假数据、保留真数据），并完成剩余两大块：Phase 3 裁判逐小局对局录入（自动结算 → 赛果）与 Phase 4 积分/赛程/赛果全部由数据库驱动（前端保持现有静态渲染 + 客户端拉取 + 静态回退模式）。

**Architecture（延续现状，不改前端模式）:** 静态 Astro 站继续部署 GitHub Pages（`/PKUMLonline/`）；动态数据（公告、赛程+出场、对局赛果、积分榜）走 Supabase（Postgres + Auth + RLS），页面 SSR 先用静态 JSON 渲染空态/回退，浏览器加载后 fetch DB 重渲染。积分榜由浏览器从完赛半庄现算（复用/扩展 `standings.ts` 纯函数）。管理员建号与角色修改一律在 Supabase Dashboard 手动完成，**不做账号管理页面**。

**Tech Stack:** Astro 7（static output）、TypeScript、`@supabase/supabase-js`、vitest、Chart.js（对局详情页折线图，Phase 1 引入）。

---

## 0. 数据真伪分类（用户确认，2026-08-14）

| 数据 | 真/假 | 26-27 处理 |
|---|---|---|
| `data/players_history.json`（选手档案） | ✅ 真 | **保留不动，唯一保留的榜单类静态真数据** |
| `data/archive.json`（历届队伍名次/冠军） | ✅ 真 | 保留 |
| `data/current_roster.json`（26-27 指名名单） | ✅ 真 | 保留（待指名选手补齐后由赛事组更新） |
| `data/teams.json`（队伍代表色） | ✅ 真 | 保留（全站引用） |
| `data/season.json`（赛季配置） | 配置 | 改为 `"26-27"`、`hasStarted: false` |
| `data/schedule.json`（赛程+赛果） | ❌ 假 | 清空为 `games: []` |
| `data/standings.json`（队伍榜/个人榜） | ❌ 假 | 清空为三阶段空榜 |
| `data/news.json`（公告） | ❌ 假 | 清空；公告以 DB `announcements` 表为准 |

**前端显示模式保持不变**：静态渲染 + 客户端拉取 + 静态回退。清空后各页自然显示既有空态（「赛季尚未开始」「暂无赛程」「暂无赛果」「暂无公告」）；DB 有数据后由客户端脚本重渲染。

**明确不做**：
- ❌ 管理员账号管理页（`/admin/accounts`）——建号/改角色在 Supabase Dashboard 手动操作
- ❌ 修改前端渲染模式（保持 Astro 静态 SSR + 客户端 fetch 混合）

---

## 阶段 0 · 26-27 空数据初始化 + 前端空态适配（小改动）

**涉及文件**：`data/season.json`、`data/schedule.json`、`data/standings.json`、`data/news.json`、`src/pages/index.astro`、`src/lib/standings.test.ts`（如涉及首页逻辑）。

### Task 0.1: season.json 切换到 26-27

- [ ] **Step 1:** `data/season.json` 改为：
  ```json
  {
    "season": "26-27",
    "hasStarted": false,
    "stages": [
      { "name": "常规赛", "totalGames": 24, "promoteRank": 6, "advanceLabel": "常规赛积分前6名进入半决赛" },
      { "name": "半决赛", "totalGames": 4, "promoteRank": 4, "advanceLabel": "半决赛积分前4名进入决赛" },
      { "name": "决赛", "totalGames": 2, "promoteRank": 0, "advanceLabel": "决赛争夺冠军" }
    ]
  }
  ```
  （`totalGames` 为 M.LEAGUE 惯例默认值，赛季首场比赛前由赛事组公布后修改。）

- [ ] **Step 2:** `data/schedule.json` 清空为 `{ "season": "26-27", "games": [] }`；`data/news.json` 清空为 `{ "items": [] }`；`data/standings.json` 清空为：
  ```json
  {
    "season": "26-27",
    "asOf": "赛季未开始",
    "stages": [
      { "name": "常规赛", "teamBoard": [], "playerBoard": [] },
      { "name": "半决赛", "teamBoard": [], "playerBoard": [] },
      { "name": "决赛", "teamBoard": [], "playerBoard": [] }
    ]
  }
  ```

- [ ] **Step 3:** 验证全部 JSON 可解析、构建通过、各页显示正确空态（首页/赛程/榜单/公告）。

### Task 0.2: 首页榜单随赛季显示

现状 `src/pages/index.astro` 写死取「决赛」榜（25-26 结束时的临时改法）。26-27 开赛后应显示当前阶段榜。

- [ ] **Step 1:** 改为：`season.hasStarted` 时显示「常规赛」队伍榜（简版，复用 `TeamStandingsTable`）；未开始时显示空态占位。阶段选择逻辑收敛为一个可复用函数（如 `activeStageName(season, standings)`），供首页与榜单页共用。
- [ ] **Step 2:** 构建验证 + 测试通过。

### Task 0.3: 提交

- [ ] **Step 1:** `git add -A && git commit -m "chore: reset data to empty 26-27 season, homepage shows regular-season board"`

---

## 阶段 1 · Phase 3 对局录入（核心工作量）

**前置阻塞项（必须先与用户确认）**：可点击点数表的**全部数值**需赛事组确认（联赛实际规则与标准日麻表有差异，个别格子点数不同）。设计文档要求：确认后填入**独立数据文件**，不硬编码在组件里。

### Task 1.1: 点数表数据文件

- [ ] **Step 1:** 与用户逐格确认子家/亲家 × 荣和/自摸的番×符点数表（横轴符数 20/25/30/…/110，纵轴 1~3 番，4 番满贯并入高番档；满贯 4番 / 跳满 6-7番 / 倍满 8-10番 / 三倍满 11-12番 / 役满；自摸格为「子付/亲付」拆分）。
- [ ] **Step 2:** 写入独立 JSON（如 `data/points_table.json`），附结构校验（vitest 断言：满贯以上档位存在、自摸格拆分为 100 的倍数等）。

### Task 1.2: 对局计算引擎 `src/lib/scoring.ts`（纯函数 + TDD）

按设计文档 `docs/superpowers/specs/2026-08-13-admin-backend-design.md` 实现：

- [ ] **Step 1:** 写失败测试（`src/lib/scoring.test.ts`）：局名推进、本场数、亲家判定、供托/本场费/场供、荣和/自摸/荒牌流局点数增减、流局罚符（听牌 1/2/3 人拆分，总额固定 3000）、「四家增减和 + 供托池变化 = 0」不变量。
- [ ] **Step 2:** 实现：
  - 中间量：本场费 = 本场数×300；供托 = 中心累计立直棒×1000（荒牌流局保留、和了清零）；场供 = 本场费+供托
  - 荣和：赢家 +基础点+本场费；放铳者 −基础点−本场费；赢家收供托池，池清零
  - 自摸：赢家 +基础点总额（子付 base、亲付 base×2，向上取整到百）；本场费赢家 +300×本场、三家各 −100×本场；赢家收供托池清零
  - 荒牌流局：罚符（听牌 1 人：+3000/各−1000；2 人：各+1500/各−1500；3 人：各+1000/−3000）；本场+1；供托保留
  - 局推进规则：亲家和牌或亲家听牌流局 → 连庄本场+1；亲家未听牌流局 → 推进本场+1；子家和牌 → 推进本场归 0；亲家 = 局名对应初始座位（东1/南1=东起，东2/南2=南起，…）
  - 规则无途中流局，荒牌流局是唯一流局类型
- [ ] **Step 3:** 全部测试通过（含平衡不变量用例）。

### Task 1.3: `finish_game` RPC（SQL）

**原因**：裁判角色无 `games` 表写权限（RLS 仅 admin 可写 games），而提交赛果需写回 `seats` 最终分/排名并把 `status` 置为 `finished`。需要一个 security-definer 函数让裁判提交，同时做全量校验。

- [ ] **Step 1:** 在 `supabase/schema.sql` 追加：
  - `finish_game(p_game_id uuid)`：校验该半庄所有已录 rounds 点数平衡 → 计算四家最终分与排名 → 写回 `games.seats`（rank/points）→ `status='finished'`。仅 `referee`/`admin` 可调；`upcoming` 才可提交（南四锁定规则在客户端强制）。
  - 追加 `unfinish_game`（仅 admin）：将 finished 半庄退回 upcoming 以便修正后重新提交。
  - `grant execute ... to authenticated`。
- [ ] **Step 2:** 用户整段重跑 `supabase/schema.sql`（全部 `create or replace` / `drop ... create`，可重复执行）。
- [ ] **Step 3:** 验证函数存在（REST 端点非 404）+ 提交。

### Task 1.4: 对局录入页 `/admin/match/[id]`（referee/admin）

- [ ] **Step 1:** 路由：从 `/admin/schedule` 的 upcoming 半庄行进入录入页；仅 `seats` 四座位选手填齐的半庄可录入。
- [ ] **Step 2:** 交互（原生 JS + fetch，不引入框架）：
  - 从第 1 小局（东一局 0 本场，亲家=东起）开始，`scoring.ts` 推导下一局局名/本场/亲家
  - 每小局录：结果（荣和：谁荣和谁+点数；自摸：谁自摸+点数；荒牌流局：四家听牌）+ 四家是否立直
  - 点数通过**可点击点数表**选择（按赢家是否亲家自动切换子/亲视图）；表无命中时允许手动输入基础点数
  - **保存草稿**：随时可存未完成局（字段不完整也允许），刷新/重进后从断点继续
  - **倒推**：可回改之前小局，改动后由 `scoring.ts` 全量重算后续局名/本场/供托/累计点数
  - **南四锁定**：南四局结果为「亲家听牌流局」或「亲家和牌」时才可继续「下一局」；否则只能「提交」
  - **提交**：调 `finish_game` → 写回 seats 最终分/排名 → `status=finished` → 赛果即生成
  - 半庄提交后裁判不可再改；admin 可经 `unfinish_game` 退回修改，保存后全量重算并刷新赛果
- [ ] **Step 3:** 草稿数据存 `rounds` 表（字段不完整允许），完整性/平衡校验在「下一局」/「提交」时执行。

### Task 1.5: 对局详情页 `/match/[id]`（公开）

- [ ] **Step 1:** 路由 `/match/[id]`，标题 = 时间 + 半庄信息。
- [ ] **Step 2:** 总表（8 行 × 5 列）：队伍/选手/立直/荣和/自摸/放铳/积分；队伍单元格底色 = 队伍色。
- [ ] **Step 3:** 阶段表（每小局一行）：局名/本场/四家累计点数/对局结果/打点/供托。
- [ ] **Step 4:** 折线图：Chart.js（x=局序/局名，y=累计点数，4 条线按选手队伍色，悬浮提示）。
- [ ] **Step 5:** 赛程页「赛果」卡片与首页「最新赛果」链接到本页。
- [ ] **Step 6:** 引入 `chart.js` 依赖（npm install 由用户手动执行，或确认后执行）。

---

## 阶段 2 · Phase 4 DB 打通（积分/赛程/赛果全走数据库）

### Task 2.1: 榜单聚合纯函数（扩展 `standings.ts` 或新增 `src/lib/aggregate.ts`）

现状 `standings.ts` 只对预聚合行排序/派生列。新增从 DB 数据聚合 BoardRow 的纯函数（TDD）：

- [ ] **Step 1:** `aggregateTeamBoard(games, season, stage)`：从完赛半庄 seats（含 rank/points）按队伍聚合 stagePoints / stageRaw / wins；常规赛 carry=0；半决赛/决赛 carry=上阶段总分折半（章程第 0 条「分数折半持越」）。
- [ ] **Step 2:** `aggregatePlayerBoard(games)`：按选手聚合 points（含 penalty 扣分明细，判罚数据来源待定：初始由 admin 在 DB 记录或经 rounds 外字段） / rawPoints / wins / maxScore。
- [ ] **Step 3:** 测试：跨半庄聚合、持越折半、位次统计、空输入返回空数组。

### Task 2.2: `/standings` 客户端现算

- [ ] **Step 1:** 页面保留 SSR 空态回退；追加客户端脚本：拉取 `games`（finished）+ 对应 `rounds` → 按阶段调用聚合函数 → 复用 `computeTeamBoard` / `computePlayerBoard` 渲染三阶段队伍榜/个人榜（沿用现有 `TeamStandingsTable` / `PlayerStandingsTable` 组件渲染方式）。
- [ ] **Step 2:** `asOf` 标注改为客户端生成（「xx月xx日终了时点」/「全日程终了」按 DB 最后完赛日期推导）。

### Task 2.3: 数据交接与初始化

- [ ] **Step 1:** 清理 DB 中的联调测试数据（Phase 2 验证时插入的 teams/games/announcements，如「凤凰」队、测试半庄、测试公告）——提供一段清理 SQL 由用户在 Dashboard 执行。
- [ ] **Step 2:** 新赛季空表就绪：26-27 队伍名单由 admin 在 `/admin/teams` 录入（roster 来自 `current_roster.json` 待指名补齐后），赛程由 admin 在 `/admin/schedule` 建半庄，队长在 `/captain` 填出场。
- [ ] **Step 3:** 端到端验收：队长选人 → 裁判录入 → 提交 → 前台赛果/榜单/公告即时更新；刷新后数据仍在。

---

## 阶段 3 · 收尾与体验

- [ ] **Task 3.1:** 管理后台样式：`AdminShell`/登录/公告/队伍/赛程/队长选人页补充 `global.css` 样式（当前后台页无样式）。
- [ ] **Task 3.2:** 加载态/错误态：DB 拉取失败提示 + 静态回退已具备，补充 loading 提示。
- [ ] **Task 3.3:** `src/lib/pinyin.ts` 字典补全或换用拼音库（当前硬编码约 40 字，未覆盖姓名回退 `#`）。
- [ ] **Task 3.4:** README 更新：部署平台改为 GitHub Pages（现有 `.github/workflows/deploy.yml`），补充 Supabase 后台说明与 26-27 新 SOP（数据从 DB 录入，静态 JSON 仅作回退/档案）。
- [ ] **Task 3.5:** 全量测试 + 构建 + 推送部署。

---

## 验收标准

- [ ] 全站显示 26-27 赛季空态；选手档案/历届名次/队色/指名名单等真数据完好
- [ ] 裁判可逐小局录入对局，局名/本场/亲家/供托自动推进，点数表可选，草稿可续录，倒推可重算，南四锁定生效，提交后生成赛果
- [ ] `/match/[id]` 展示总表 + 阶段表 + 折线图
- [ ] 积分榜从 DB 现算（队伍榜含持越折半、个人榜含比率/最高分），与赛果一致
- [ ] 赛程/赛果/公告全部 DB 驱动，前端保持静态渲染 + 客户端拉取模式，静态回退有效
- [ ] 无账号管理页；建号/改角色均在 Supabase Dashboard 手动完成
- [ ] 测试全部通过、构建成功、线上可用

---

## 明确不做的功能（维持设计边界）

- 直播/视频（`videoUrl` 字段已预留，本期不展示）
- 队伍介绍、队徽、选手照片
- 票务、商城、会员
- 账号管理页（Dashboard 手动建号）
