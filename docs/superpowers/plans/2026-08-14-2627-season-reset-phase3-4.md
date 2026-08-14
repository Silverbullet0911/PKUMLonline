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

- [x] **Step 1:** `data/season.json` 改为：
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

- [x] **Step 2:** `data/schedule.json` 清空为 `{ "season": "26-27", "games": [] }`；`data/news.json` 清空为 `{ "items": [] }`；`data/standings.json` 清空为：
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

- [x] **Step 3:** 验证全部 JSON 可解析、构建通过、各页显示正确空态（首页/赛程/榜单/公告）。

### Task 0.2: 首页榜单随赛季显示

现状 `src/pages/index.astro` 写死取「决赛」榜（25-26 结束时的临时改法）。26-27 开赛后应显示当前阶段榜。

- [x] **Step 1:** 改为：`season.hasStarted` 时显示「常规赛」队伍榜（简版，复用 `TeamStandingsTable`）；未开始时显示空态占位。阶段选择逻辑收敛为一个可复用函数（如 `activeStageName(season, standings)`），供首页与榜单页共用。
- [x] **Step 2:** 构建验证 + 测试通过。

### Task 0.3: 提交

- [x] **Step 1:** `git add -A && git commit -m "chore: reset data to empty 26-27 season, homepage shows regular-season board"`

---

## 阶段 1 · Phase 3 对局录入（核心工作量）

**前置阻塞项（必须先与用户确认）**：可点击点数表的**全部数值**需赛事组确认（联赛实际规则与标准日麻表有差异，个别格子点数不同）。设计文档要求：确认后填入**独立数据文件**，不硬编码在组件里。

### Task 1.1: 点数表数据文件

- [x] **Step 1:** 与用户逐格确认子家/亲家 × 荣和/自摸的番×符点数表（横轴符数 20/25/30/…/110，纵轴 1~3 番，4 番满贯并入高番档；满贯 4番 / 跳满 6-7番 / 倍满 8-10番 / 三倍满 11-12番 / 役满；自摸格为「子付/亲付」拆分）。
- [x] **Step 2:** 写入独立 JSON（如 `data/points_table.json`），附结构校验（vitest 断言：满贯以上档位存在、自摸格拆分为 100 的倍数等）。

> 确认结果（2026-08-14）：表格公式 基本点=符×2^(番+2)、切上到百。联赛差异：**切上满贯**（3番60符、4番30符直接按满贯，1-4番行中满贯格不设按键）；**13番不累计役满，11番及以上一律三倍满**；**最大牌=双倍役满（封顶）**。修正：亲家 3番40符 = 7700（非 7800）；另发现同算式 7680 切上的亲家 2番80符、4番20符亦为 7700，已一并修正（待用户复核）。数据文件 `data/points_table.json`，结构校验测试 `src/lib/pointsTable.test.ts`（7 用例）。

### Task 1.2: 对局计算引擎 `src/lib/scoring.ts`（纯函数 + TDD）

按设计文档 `docs/superpowers/specs/2026-08-13-admin-backend-design.md` 实现：

- [x] **Step 1:** 写失败测试（`src/lib/scoring.test.ts`）：局名推进、本场数、亲家判定、供托/本场费/场供、荣和/自摸/荒牌流局点数增减、流局罚符（听牌 1/2/3 人拆分，总额固定 3000）、「四家增减和 + 供托池变化 = 0」不变量。
- [x] **Step 2:** 实现：
  - 中间量：本场费 = 本场数×300；供托 = 中心累计立直棒×1000（荒牌流局保留、和了清零）；场供 = 本场费+供托
  - 荣和：赢家 +基础点+本场费；放铳者 −基础点−本场费；赢家收供托池，池清零
  - 自摸：赢家 +基础点总额（子付 base、亲付 base×2，向上取整到百）；本场费赢家 +300×本场、三家各 −100×本场；赢家收供托池清零
  - 荒牌流局：罚符（听牌 1 人：+3000/各−1000；2 人：各+1500/各−1500；3 人：各+1000/−3000）；本场+1；供托保留
  - 局推进规则：亲家和牌或亲家听牌流局 → 连庄本场+1；亲家未听牌流局 → 推进本场+1；子家和牌 → 推进本场归 0；亲家 = 局名对应初始座位（东1/南1=东起，东2/南2=南起，…）
  - 规则无途中流局，荒牌流局是唯一流局类型
- [x] **Step 3:** 全部测试通过（含平衡不变量用例）。

> 实现说明：`src/lib/scoring.ts` 导出 `dealerSeat` / `isRenchan` / `nextRound` / `honbaFeeOf` / `settleRound(round, result, poolBefore)`（返回四家 deltas + 结算后供托棒数）。南四锁定 = `nextRound(南4, result) !== null`。测试 `src/lib/scoring.test.ts` 25 用例（含不变量断言）。

### Task 1.3: `finish_game` RPC（SQL）

**原因**：裁判角色无 `games` 表写权限（RLS 仅 admin 可写 games），而提交赛果需写回 `seats` 最终分/排名并把 `status` 置为 `finished`。需要一个 security-definer 函数让裁判提交，同时做全量校验。

- [x] **Step 1:** 在 `supabase/schema.sql` 追加：
  - `finish_game(p_game_id uuid, p_seats jsonb)`：赛果由录入页客户端用 `scoring.ts` 现算后传入；SQL 侧校验 4 座位完整、总分 = 100000、位次为 1-4 排列、至少 1 小局、`upcoming` 才可提交。仅 `referee`/`admin` 可调。
  - 追加 `unfinish_game`（仅 admin）：将 finished 半庄退回 upcoming 以便修正后重新提交。
  - `grant execute ... to authenticated`。
- [ ] **Step 2:** 用户整段重跑 `supabase/schema.sql`（全部 `create or replace` / `drop ... create`，可重复执行）。
- [ ] **Step 3:** 验证函数存在（REST 端点非 404）+ 提交。

> 实现说明：`finish_game`/`unfinish_game` 已写入 `supabase/schema.sql` 末尾（等待用户在 Supabase SQL Editor 整段执行）。同时将 `rounds.tsumo_points` 由 int 改为 jsonb（存自摸支付拆分 [子付,亲付]/[各付]，回放需要精确拆分），含旧库 ALTER 迁移。位次由录入人手动选择，SQL 仅校验取值 1-4（不再限制为竞争位次序列）。**评审点**：SQL 信任客户端算好的 seats（总分校验兜底），如希望 SQL 全量重算需另行实现。**待用户执行**：Step 2 重跑 schema.sql。

### Task 1.4: 对局录入页（referee/admin）

- [x] **Step 1:** 路由：从 `/admin/schedule` 的 upcoming 半庄行「录入」入口进入；仅 `seats` 四座位选手填齐的半庄可录入（录入页校验）。
- [x] **Step 2:** 交互（原生 JS + fetch，不引入框架）：
  - 从第 1 小局（东一局 0 本场，亲家=东起）开始，`scoring.ts` 推导下一局局名/本场/亲家
  - 每小局录：结果（荣和：谁荣和谁+点数；自摸：谁自摸+点数；荒牌流局：四家听牌）+ 四家是否立直
  - 点数通过**可点击点数表**选择（按赢家是否亲家自动切换子/亲视图）；表无命中时允许手动输入基础点数
  - **保存草稿**：随时可存未完成局（字段不完整也允许），刷新/重进后从断点继续
  - **倒推**：点击已录小局行回改，改动后由 `scoring.ts` 全量重算后续局名/本场/供托/累计点数（删除其后小局）
  - **南四锁定**：南四局结果为「亲家听牌流局」或「亲家和牌」时才可继续「下一局」；否则只能「提交」
  - **提交**：调 `finish_game` → 写回 seats 最终分/排名 → `status=finished` → 赛果即生成
  - 半庄提交后裁判只读；admin 可经「退回修改」调 `unfinish_game` 后修改并重新提交
- [x] **Step 3:** 草稿数据存 `rounds` 表（字段不完整允许），完整性/平衡校验在「下一局」/「提交」时执行。

> 实现说明：静态托管无法构建动态路由，录入页路由为 **`/admin/match/?id=<uuid>`**（`src/pages/admin/match/index.astro`）。**录入流程（赛事组确认 2026-08-14）**：每小局自动生成阶段表行 → 可「改」手动修改该局四家增减/对局情况/打点（存 `rounds.override`）→ 录入页无提交键，录完点「查看结果」→ 结果页（`/admin/match/result/?id=`）总表**直接编辑各家 pt 得分、位次（下拉）、判罚（默认 0）**（素点/顺位点/最终分数只读实时联动，pt 合计提示），提交时把 pt/rank/penalty 写入 `games.seats`；榜单聚合优先使用存储的 pt 与 rank，判罚计入个人与队伍积分、不计入素点/场次 pt。**UI 修订（2026-08-14 反馈）**：点数选择改为按键式并按 1/2/3/4 番分组导引；流局四家全不听牌可直接下一局；供托按点数显示（棒数×1000 点）；勾选/按键放大至约 3 倍、填写框约 2 倍；去掉顶部队伍色选手卡；折线图 x 轴按小局数。回放逻辑 `src/lib/replay.ts`（`replayGame`/`roundLabel`，支持 override，12 用例测试）。

### Task 1.5: 对局详情页（公开）

- [x] **Step 1:** 路由 **`/match/?id=<uuid>`**（静态托管替代 `/match/[id]`），标题 = 时间 + 半庄信息。
- [x] **Step 2:** 总表（8 行 × 5 列）：队伍/选手/立直/荣和/自摸/放铳/积分/顺位；队伍单元格底色 = 队伍色。
- [x] **Step 3:** 阶段表（每小局一行）：局名/本场/四家累计点数/对局结果/打点/供托。
- [x] **Step 4:** 折线图：**自绘 SVG**（免依赖，替代 Chart.js；x=局序，y=累计点数，4 条线按队伍色 + 图例）。
- [x] **Step 5:** 赛程页「赛果」卡片链接到本页（`/schedule` 客户端渲染 + `/admin/schedule` 赛果入口）。
- [x] **Step 6:** ~~引入 `chart.js` 依赖~~ → 改为自绘 SVG，无新依赖。

> 实现说明：`src/pages/match/index.astro`。**评审点**：如仍想用 Chart.js（悬浮提示更丰富），后续可替换。

---

## 阶段 2 · Phase 4 DB 打通（积分/赛程/赛果全走数据库）

### Task 2.1: 榜单聚合纯函数（扩展 `standings.ts` 或新增 `src/lib/aggregate.ts`）

现状 `standings.ts` 只对预聚合行排序/派生列。新增从 DB 数据聚合 BoardRow 的纯函数（TDD）：

- [x] **Step 1:** `aggregateTeamBoard`：从完赛半庄 seats（含 rank/points）按队伍聚合 stagePoints / stageRaw / wins；常规赛 carry=0；半决赛/决赛 carry=上阶段总分折半（章程第 0 条「分数折半持越」）。
- [x] **Step 2:** `aggregatePlayerBoard`：按选手聚合 points（含 penalty 扣分明细，判罚数据来源待定：初始由 admin 在 DB 记录或经 rounds 外字段） / rawPoints / wins / maxScore。
- [x] **Step 3:** 测试：跨半庄聚合、持越折半、位次统计、空输入返回空数组。

> 实现说明（`src/lib/aggregate.ts`，2026-08-14）：API 为 `aggregateTeamBoard(games, carryOf?)` / `aggregatePlayerBoard(games, penaltyOf?)` / `stageTeamTotals(games)` / `carryFrom(totals)`——阶段过滤由调用方完成（传该阶段全部完赛对局），持越/判罚经回调注入，便于浏览器端 DB 现算复用。**计分约定（赛事组已确认）**：起手 25000 点，单场素点 = (最终得分−25000)/1000；单场积分 = 素点 + 顺位点；顺位点 1位 +45 / 2位 +5 / 3位 −15 / 4位 −35（和为 0，每场总分归零）；**顺位点同分平分**（同分者平分所占位次的顺位点，全员同分则全 0）；位次统计用竞争位次（同分同位，如 1,2,2,4）；持越 = 上阶段总积分折半。

### Task 2.2: `/standings` 客户端现算

- [x] **Step 1:** 页面保留 SSR 空态回退；追加客户端脚本：拉取 `games`（finished）+ 对应 `rounds` → 按阶段调用聚合函数 → 复用 `computeTeamBoard` / `computePlayerBoard` 渲染三阶段队伍榜/个人榜（沿用现有 `TeamStandingsTable` / `PlayerStandingsTable` 组件渲染方式）。
- [x] **Step 2:** `asOf` 标注改为客户端生成（「xx月xx日终了时点」/「全日程终了」按 DB 最后完赛日期推导）。

> 实现说明（2026-08-14）：新增 `src/lib/renderStandings.ts`（`renderTeamTable`/`renderPlayerTable` 客户端 HTML 渲染 + `standingsAsOf`/`activeStageFromGames`，10 用例测试）；`/standings` 与首页均加客户端脚本从 DB 现算（含持越链、同分平分顺位点、判罚），`mapDbGame` 扩展透传 pt/penalty。

### Task 2.3: 数据交接与初始化

- [x] **Step 1:** 清理 DB 中的联调测试数据（Phase 2 验证时插入的 teams/games/announcements，如「凤凰」队、测试半庄、测试公告）——提供一段清理 SQL 由用户在 Dashboard 执行。
- [x] **Step 2:** 新赛季空表就绪：**队伍名单真源为 `data/current_roster.json`（静态，2026-08-14 方案 B 决策）**——后台填选手/队长选人改读静态名单，`assign_player` RPC 去掉 DB roster 校验（名单把关由客户端静态名单承担），`/admin/teams` 停用；赛程由 admin 在 `/admin/schedule` 建半庄，队长在 `/captain` 填出场。
- [ ] **Step 3:** 端到端验收：队长选人 → 裁判录入 → 提交 → 前台赛果/榜单/公告即时更新；刷新后数据仍在。

> 实现说明：清理 SQL 已写入 `supabase/cleanup_demo_data.sql`（清空 rounds/games/announcements/teams，附校验查询），由用户在确认后于 Dashboard 执行。端到端验收待用户执行清理后走查。

---

## 阶段 3 · 收尾与体验

- [x] **Task 3.1:** 管理后台样式：`AdminShell`/登录/公告/队伍/赛程/队长选人页补充 `global.css` 样式（当前后台页无样式）。
- [ ] **Task 3.2:** 加载态/错误态：DB 拉取失败提示 + 静态回退已具备，补充 loading 提示。
- [ ] **Task 3.3:** `src/lib/pinyin.ts` 字典补全或换用拼音库（当前硬编码约 40 字，未覆盖姓名回退 `#`）。
- [x] **Task 3.4:** README 更新：部署平台改为 GitHub Pages（现有 `.github/workflows/deploy.yml`），补充 Supabase 后台说明与 26-27 新 SOP（数据从 DB 录入，静态 JSON 仅作回退/档案）。
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
