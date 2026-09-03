# PKU M.LEAGUE 官方网站

北京大学校内立直麻将团体赛官网。前端为 Astro 静态站（部署到 Cloudflare Pages），动态数据（公告、赛程、赛果、积分榜）由 Cloudflare Pages Functions + D1（SQLite）提供，认证/角色/权限也在 API 层实现，不再依赖 Supabase。

## 常用命令

```bash
npm install
npm run build        # 生成静态产物到 dist/
npm run test         # 运行单元测试（榜单/对局引擎/回放/点数表/渲染等）

# 仅看静态页面（不加载 D1 API）：npm run dev
# 完整本地联调（静态 + Pages Functions + D1）：
npm run build
npm run pages:dev
```

> 注意：沙箱/受限环境下 `npm test` 若报 forks worker 超时，可用 `npx vitest run --pool=threads`。

## 架构

```
├── src/pages/                  公开页 + 后台页（Astro，静态输出）
│   ├── index / news / schedule / standings / teams / rules / archive
│   └── admin/                  login、index、announcements、teams、schedule、
│                               match（对局录入）、match/result（查看结果/提交）
│   └── captain                 队长选人
├── src/lib/                    纯函数库 + Supabase 兼容客户端 shim
│   ├── standings.ts            榜单计算
│   ├── aggregate.ts            榜单聚合
│   ├── scoring.ts / replay.ts  对局引擎与回放
│   ├── supabase.ts             **前端 API 客户端**：保持旧 Supabase 调用形态，
│   │                           实际请求 Cloudflare Pages Functions
│   └── ...
├── functions/api/[[path]].ts   Cloudflare Pages Functions API（D1 访问/认证/权限/业务校验）
├── migrations/                  D1 SQL migration
├── data/*.json                 静态数据（回退/档案/名单真源）
├── scripts/
│   ├── create-user.mjs          创建/更新 D1 用户（替代旧 Supabase Dashboard 建号）
│   ├── export-supabase.mjs      从旧 Supabase 导出业务表 JSON
│   └── import-d1.mjs            把导出的 JSON 导入 D1
├── wrangler.toml                Pages + D1 binding 配置
└── .github/workflows/deploy.yml Cloudflare Pages 自动部署
```

## 数据与权限模型

- **认证**：D1 `profiles` 表保存邮箱、PBKDF2 密码哈希、角色；`sessions` 表保存会话 Token 哈希。
- **权限**：全部在 Pages Functions 服务端执行，严格对齐旧 Supabase RLS/RPC：
  - 匿名/公开：可读 `announcements`、`games`、`unarranged_games`；`rounds` 只可读已完结对局。
  - `admin`：公告/赛程/未安排赛程/rounds 全量管理，可退回赛果、批量填选手、提交赛果。
  - `referee`：可看赛程后台、给 upcoming 场次填选手、录/改 upcoming rounds、提交赛果；不能改赛程/公告/删除。
  - `captain`：只能对自己队伍的 upcoming 场次、从静态名单中选择出场选手。
- **队伍/选手名单**：真源仍是 `data/current_roster.json` 和 `data/teams.json`，不迁库。
- **静态 JSON fallback**：公开页仍保留，API 不可用/无数据时回退到静态内容。

## 本地开发与 D1

1. Wrangler 已写入 `package.json` devDependencies，直接安装依赖即可：
   ```bash
   npm install
   ```
2. 创建远程数据库并应用本地 migration：
   ```bash
   npx wrangler d1 create pkuml-d1          # 远程首次需要；本地可以先跳过
   npm run db:migrate:local
   ```
   远程数据库需把 `wrangler.toml` 中的 `database_id` 替换为 `wrangler d1 create` 返回的真实 ID。
   > 本地 `pages:dev` 命令里也带了一个相同的占位 `database_id`；如果你改了 `wrangler.toml`，请同步修改 `package.json` 的 `pages:dev`，保证本地 D1 和 migration 指向同一个库。
3. 本地跑 Pages（构建 + Functions + D1）：
   ```bash
   npm run build
   npm run pages:dev
   ```

## 预置演示数据

想快速看到前台/后台效果，可以写入一批本地演示数据：

```bash
npm run seed:demo
```

这会向本地 D1 写入公告、未安排赛程、3 场未来赛程、3 场已完赛赛果，以及三个演示账号：

- `admin@demo.com` / `admin123`：管理员
- `referee@demo.com` / `referee123`：裁判
- `captain@demo.com` / `captain123`：队长（樱花）

然后刷新 `http://127.0.0.1:8788/` 查看动态数据。

## 创建用户 / 角色

旧 Supabase Auth 的密码哈希无法迁移；Route B 下用脚本重建用户。该脚本会执行：
`npx wrangler d1 execute pkuml-d1 --local --file <生成的 SQL>`。

```bash
# 管理员
npm run user:create -- --email admin@example.com --password '你的密码' --role admin

# 队长（必须指定队伍，队伍名与 data/current_roster.json / data/teams.json 一致）
npm run user:create -- --email captain@example.com --password '你的密码' --role captain --team 樱花

# 裁判
npm run user:create -- --email referee@example.com --password '你的密码' --role referee
```

对已存在用户重复执行同一邮箱会更新密码/角色/队伍。

## 从 Supabase 迁移业务数据

1. 用 Service Role Key 导出旧表（不会导出 Auth/密码）：
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run db:export:supabase
   ```
2. 导入 D1：
   ```bash
   npm run db:import:d1 -- --db local       # 或 --db remote
   ```
3. 重建后台用户（见上）。

## 部署

推送到 GitHub `main` 分支 → Actions 自动构建并部署到 Cloudflare Pages。

需要配置 GitHub Secrets：

- `CLOUDFLARE_API_TOKEN`：有 `Workers Scripts:Edit` / `Pages:Edit` / `D1:Edit` 权限的 Token。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。

并先在 Cloudflare 创建 Pages 项目 `pkuml-mleague`、创建 D1 数据库 `pkuml-d1`，把 `wrangler.toml` 的 `database_id` 换成真实 ID。首次可手动执行 `npm run db:migrate:remote`。

## 测试

`npm test`（vitest）。覆盖：榜单计算、聚合、对局引擎、回放、点数表结构、客户端榜单渲染等纯函数。

另外可用 `npm run smoke:api` 在本地用 Node 内置 SQLite 对 Pages Functions API 做冒烟验证（登录、角色权限、公告/赛程/rounds/提交赛果），不依赖 Wrangler/Cloudflare 账号。
