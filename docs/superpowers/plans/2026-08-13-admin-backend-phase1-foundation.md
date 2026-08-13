# Phase 1 · Admin 后台基建（Supabase + 认证 + 公告）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Supabase 后端（建表 + 认证 + RLS），实现管理员登录与公告增删改，公告页从数据库拉取并带静态回退。

**Architecture:** 静态 Astro 站继续部署在 GitHub Pages；新增 Supabase 项目承载数据库、Auth、RLS。管理页（`/admin/*`）用原生 JS + `@supabase/supabase-js` 在浏览器直接读写数据库，登录态由 Supabase Auth 管理。公开页（`/news`）加载后客户端拉取公告，失败则回退到静态 JSON。

**Tech Stack:** Astro 7、`@supabase/supabase-js`、vitest、Supabase（Postgres + Auth + RLS）。

**前置约定**
- 本项目的 `npm install` 由**用户手动执行**：计划中遇到安装步骤会停下，把命令交给用户运行，用户确认后再继续。
- 需要一个 Supabase 项目：没有的话用户需在 supabase.com 创建一个（免费额度足够）。

---

## File Structure（Phase 1 涉及文件）

| 文件 | 动作 | 职责 |
|---|---|---|
| `supabase/schema.sql` | 创建 | 全部 5 张表 + RLS + `current_role()` + 新用户触发器 + 权限授予 |
| `.env.example` / `.env` | 创建 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（.env 加入 .gitignore） |
| `.gitignore` | 修改 | 追加 `.env` |
| `src/lib/supabase.ts` | 创建 | `createClient` 单例，读环境变量 |
| `src/lib/auth.ts` | 创建 | 会话/角色辅助函数（可单测） |
| `src/components/admin/AdminShell.astro` | 创建 | 管理页外壳：导航 + 登录守卫 + 角色校验 + slot |
| `src/pages/admin/login.astro` | 创建 | 登录页 |
| `src/pages/admin/index.astro` | 创建 | 仪表盘（按角色显示入口） |
| `src/pages/admin/announcements.astro` | 创建 | 公告增删改 |
| `src/pages/news.astro` | 修改 | 公告客户端拉取 + 静态回退 |
| `src/lib/auth.test.ts` | 创建 | auth 辅助函数测试 |

---

### Task 1: 安装依赖

- [ ] **Step 1: 暂停，交给用户安装**

把以下命令交给用户运行，用户确认装好后继续：

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: 验证**

```bash
npm ls @supabase/supabase-js
```

Expected: 输出包含 `@supabase/supabase-js@<版本>`。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @supabase/supabase-js"
```

---

### Task 2: Supabase 项目与环境变量

- [ ] **Step 1: 用户创建 Supabase 项目（手动）**

用户在 supabase.com 新建项目（记下项目 URL 与两个 key：anon public key 与 service_role key，后者不放进前端）。创建完成后告诉 Claude 项目 URL 和 anon key。

- [ ] **Step 2: 写环境变量文件**

创建 `.env.example`：

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

创建 `.env`（真实值由用户填入）：

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`.gitignore` 追加一行 `.env`。

- [ ] **Step 3: 验证**

`.env` 存在且含真实 URL/key；`git check-ignore .env` 返回该文件路径（说明已被忽略）。

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add supabase env example and ignore .env"
```

---

### Task 3: 建表 + RLS（supabase/schema.sql）

- [ ] **Step 1: 编写 schema.sql**

创建 `supabase/schema.sql`，内容如下（完整包含 5 张表、RLS、角色函数、新用户触发器、权限授予）：

```sql
-- ============ 角色辅助函数 ============
create or replace function public.current_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 新用户自动创建 profile，默认角色 referee（管理员建号后可在账号页改）
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

-- ============ 1. profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'referee' check (role in ('admin','referee','captain')),
  team text,
  display_name text
);

alter table public.profiles enable row level security;

create policy "profiles own read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles admin read all" on public.profiles
  for select using (public.current_role() = 'admin');
create policy "profiles admin write" on public.profiles
  for all using (public.current_role() = 'admin');

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

create policy "teams public read" on public.teams for select using (true);
create policy "teams admin write" on public.teams for all using (public.current_role() = 'admin');

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

create policy "games public read" on public.games for select using (true);
create policy "games admin write" on public.games for all using (public.current_role() = 'admin');

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

create policy "rounds public read" on public.rounds for select using (true);
-- 裁判可写未完结半庄；RLS 无法跨表读 games.status，用 security definer 函数辅助
create or replace function public.game_status(gid uuid)
returns text
language sql
security definer
stable
as $$
  select status from public.games where id = gid
$$;

create policy "rounds write upcoming" on public.rounds
  for all using (public.game_status(game_id) = 'upcoming')
  with check (public.game_status(game_id) = 'upcoming' and (public.current_role() in ('admin','referee')));
create policy "rounds admin write finished" on public.rounds
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ============ 5. announcements ============
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  category text not null default '公告',
  body text not null default ''
);

alter table public.announcements enable row level security;

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
```

- [ ] **Step 2: 用户执行 SQL**

把上面 SQL 交给用户在 Supabase 的 **SQL Editor** 里整段执行（一次运行）。执行成功后在表中能看到 5 张表。

- [ ] **Step 3: 验证**

在 SQL Editor 运行：

```sql
select count(*) from pg_tables where schemaname='public' and tablename in ('profiles','teams','games','rounds','announcements');
```

Expected: 返回 `5`。再运行 `select public.current_role();`（未登录时应返回空）。

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: supabase schema with tables, RLS, and new-user trigger"
```

---

### Task 4: Supabase 客户端（src/lib/supabase.ts）

- [ ] **Step 1: 创建 src/lib/supabase.ts**

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anon)
```

（Astro 静态构建会把 `import.meta.env.VITE_*` 注入客户端脚本。）

- [ ] **Step 2: 验证构建通过**

```bash
npm run build
```

Expected: 构建成功，无 TypeScript/模块错误。

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: supabase client singleton"
```

---

### Task 5: 认证辅助函数（src/lib/auth.ts + 测试）

- [ ] **Step 1: 写失败测试 src/lib/auth.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { guardByRole, canAccessAdmin } from './auth'

describe('canAccessAdmin', () => {
  it('returns false when role is missing', () => {
    expect(canAccessAdmin(null)).toBe(false)
  })
  it('returns true only for admin and referee', () => {
    expect(canAccessAdmin('admin')).toBe(true)
    expect(canAccessAdmin('referee')).toBe(true)
    expect(canAccessAdmin('captain')).toBe(false)
  })
})

describe('guardByRole', () => {
  it('allows matching role', () => {
    expect(guardByRole('admin', 'admin')).toBe(true)
  })
  it('blocks non-matching role', () => {
    expect(guardByRole('captain', 'admin')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: FAIL（`./auth` 模块不存在）。

- [ ] **Step 3: 实现 src/lib/auth.ts**

```ts
export type Role = 'admin' | 'referee' | 'captain'

export function canAccessAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'referee'
}

export function guardByRole(current: string | null | undefined, required: Role): boolean {
  return current === required
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: PASS（2 个 describe，5 个断言）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: auth role guard helpers"
```

---

### Task 6: 登录页（src/pages/admin/login.astro）

- [ ] **Step 1: 创建 src/pages/admin/login.astro**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
---
<BaseLayout title="管理员登录">
  <div class="login-wrap">
    <h1>PKU M.LEAGUE 后台登录</h1>
    <form id="login-form" class="login-form">
      <label>邮箱 <input name="email" type="email" required></label>
      <label>密码 <input name="password" type="password" required></label>
      <button type="submit">登录</button>
    </form>
    <p id="err" class="login-err"></p>
  </div>
  <script>
    import { supabase } from '../../lib/supabase'
    const form = document.getElementById('login-form') as HTMLFormElement
    const err = document.getElementById('err')!
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      err.textContent = ''
      const email = (form.email as HTMLInputElement).value
      const password = (form.password as HTMLInputElement).value
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        err.textContent = '登录失败：' + error.message
        return
      }
      window.location.href = import.meta.env.BASE_URL + 'admin/'
    })
  </script>
</BaseLayout>
```

- [ ] **Step 2: 验证**

`npm run dev` 后浏览器打开 `/PKUMLonline/admin/login/`，用管理员账号登录应跳转到 `/PKUMLonline/admin/`（该页下一步实现，暂时 404 属正常）。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/login.astro
git commit -m "feat: admin login page"
```

---

### Task 7: 管理壳 AdminShell + 仪表盘（/admin）

- [ ] **Step 1: 创建 src/components/admin/AdminShell.astro**

```astro
---
interface Props {
  requireRole?: 'admin' | 'referee' | 'captain'
}
const { requireRole } = Astro.props
---
<div class="admin-shell" data-require-role={requireRole ?? ''}>
  <nav class="admin-nav">
    <a href={`${import.meta.env.BASE_URL}admin/`}>仪表盘</a>
    {(!requireRole || requireRole === 'admin') && <a href={`${import.meta.env.BASE_URL}admin/announcements/`}>公告</a>}
    <a href={`${import.meta.env.BASE_URL}schedule/`}>前台赛程</a>
    <button id="logout" class="admin-logout">退出</button>
  </nav>
  <main class="admin-main"><slot /></main>
</div>
<script>
  import { supabase } from '../../lib/supabase'
  import { canAccessAdmin, guardByRole } from '../../lib/auth'
  import type { Role } from '../../lib/auth'
  const base = import.meta.env.BASE_URL
  const redirect = (path: string) => { window.location.href = base + path }
  document.getElementById('logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    redirect('admin/login/')
  })
  ;(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return redirect('admin/login/')
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', session.user.id).single()
    const role = profile?.role ?? null
    if (!canAccessAdmin(role)) return redirect('admin/login/')
    const required = (document.querySelector('.admin-shell') as HTMLElement).dataset.requireRole as Role | ''
    if (required && !guardByRole(role, required)) return redirect('admin/')
  })()
</script>
```

（需要指定角色的页面用 `<AdminShell requireRole="admin">` 传 prop，见 Task 8。守卫只负责跳转体验，真正的数据保护由 RLS 承担。）

- [ ] **Step 2: 创建 src/pages/admin/index.astro（仪表盘）**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import AdminShell from '../../components/admin/AdminShell.astro'
---
<BaseLayout title="后台">
  <AdminShell>
    <h1>后台仪表盘</h1>
    <div id="profile"></div>
    <ul class="admin-links">
      <li><a href="/PKUMLonline/admin/announcements/">公告管理</a></li>
    </ul>
  </AdminShell>
  <script>
    import { supabase } from '../../lib/supabase'
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: profile } = await supabase
        .from('profiles').select('role, team, display_name').eq('id', session!.user.id).single()
      document.getElementById('profile')!.textContent =
        `当前角色：${profile?.role ?? '-'}${profile?.team ? '（队伍：' + profile.team + '）' : ''}`
    })()
  </script>
</BaseLayout>
```

- [ ] **Step 3: 验证**

浏览器登录后访问 `/PKUMLonline/admin/`：未登录被重定向到登录页；登录后显示仪表盘与角色信息；点「退出」回登录页。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminShell.astro src/pages/admin/index.astro
git commit -m "feat: admin shell with auth guard and dashboard"
```

---

### Task 8: 公告管理（src/pages/admin/announcements.astro）

- [ ] **Step 1: 创建 src/pages/admin/announcements.astro**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import AdminShell from '../../components/admin/AdminShell.astro'
---
<BaseLayout title="公告管理">
  <AdminShell requireRole="admin">
    <h1>公告管理</h1>
    <form id="ann-form" class="ann-form">
      <input name="date" type="date" required>
      <input name="title" placeholder="标题" required>
      <input name="category" placeholder="分类" value="公告">
      <textarea name="body" placeholder="正文" required></textarea>
      <button type="submit" id="ann-submit">新增</button>
    </form>
    <table class="ann-table">
      <thead><tr><th>日期</th><th>标题</th><th>分类</th><th>操作</th></tr></thead>
      <tbody id="ann-list"></tbody>
    </table>
  </AdminShell>
  <script>
    import { supabase } from '../../lib/supabase'
    const list = document.getElementById('ann-list')!
    const form = document.getElementById('ann-form') as HTMLFormElement
    let editingId: string | null = null

    async function load() {
      const { data, error } = await supabase
        .from('announcements').select('*').order('date', { ascending: false })
      if (error) return
      list.innerHTML = ''
      for (const a of data) {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${a.date}</td><td>${a.title}</td><td>${a.category}</td>
          <td><button data-edit="${a.id}">改</button><button data-del="${a.id}">删</button></td>`
        list.appendChild(tr)
      }
    }
    list.addEventListener('click', async (e) => {
      const t = (e.target as HTMLElement)
      const del = t.dataset.del; const edit = t.dataset.edit
      if (del) {
        await supabase.from('announcements').delete().eq('id', del)
        load()
      } else if (edit) {
        const { data } = await supabase.from('announcements').select('*').eq('id', edit).single()
        if (data) {
          editingId = data.id
          form.date.value = data.date
          form.title.value = data.title
          form.category.value = data.category
          form.body.value = data.body
          ;(document.getElementById('ann-submit') as HTMLButtonElement).textContent = '保存'
        }
      }
    })
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const payload = {
        date: form.date.value, title: form.title.value,
        category: form.category.value, body: form.body.value,
      }
      const btn = document.getElementById('ann-submit') as HTMLButtonElement
      if (editingId) {
        await supabase.from('announcements').update(payload).eq('id', editingId)
        editingId = null; btn.textContent = '新增'
      } else {
        await supabase.from('announcements').insert([payload])
      }
      form.reset(); load()
    })
    load()
  </script>
</BaseLayout>
```

- [ ] **Step 2: 验证**

管理员登录 `/PKUMLonline/admin/announcements/`：能新增、改、删公告；数据在 Supabase `announcements` 表中可见；普通裁判账号访问该页被守卫重定向。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/announcements.astro
git commit -m "feat: announcements CRUD admin page"
```

---

### Task 9: 公告页客户端拉取 + 静态回退（src/pages/news.astro）

- [ ] **Step 1: 修改 src/pages/news.astro**

把静态公告包进 `<div class="news-list">` 作为回退默认内容，并在页面末尾加 `<script>` 从数据库拉取替换该容器（用 `textContent` 防 XSS）：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import { news } from '../lib/data'
---
<BaseLayout title="公告">
  <h1>公告</h1>
  <div class="news-list">
    {
      news.items.length === 0 ? (
        <p class="empty">暂无公告。</p>
      ) : (
        news.items.map((n) => (
          <section class="charter-block">
            <h2>{n.title}</h2>
            <p class="news-meta"><time>{n.date}</time> · {n.category}</p>
            <p>{n.body}</p>
          </section>
        ))
      )
    }
  </div>
  <script>
    import { supabase } from '../lib/supabase'
    ;(async () => {
      const { data, error } = await supabase
        .from('announcements').select('*').order('date', { ascending: false })
      if (error || !data || data.length === 0) return // 回退到静态内容
      const list = document.querySelector('.news-list')
      if (!list) return
      list.innerHTML = ''
      for (const a of data) {
        const sec = document.createElement('section')
        sec.className = 'charter-block'
        const h = document.createElement('h2')
        h.textContent = a.title
        const meta = document.createElement('p')
        meta.className = 'news-meta'
        meta.textContent = `${a.date} · ${a.category}`
        const body = document.createElement('p')
        body.textContent = a.body
        sec.append(h, meta, body)
        list.appendChild(sec)
      }
    })()
  </script>
</BaseLayout>
```

- [ ] **Step 2: 验证**

`npm run dev` 打开 `/PKUMLonline/news/`：数据库有公告时显示数据库内容；清空 `announcements` 表后仍显示静态 JSON 回退。

- [ ] **Step 3: Commit**

```bash
git add src/pages/news.astro
git commit -m "feat: news page fetches announcements with static fallback"
```

---

### Task 10: 端到端验证 + 部署

- [ ] **Step 1: 全量构建**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 2: 手动端到端**

- 未登录访问 `/admin/` → 重定向登录页
- 管理员登录 → 仪表盘
- 新增/改/删公告 → `/news/` 立即显示最新公告
- 刷新 `/news/` 数据仍在（客户端拉取）
- 退出登录后访问 `/admin/` 被拒

- [ ] **Step 3: 推送触发部署**

```bash
git push origin main
```

Expected: GitHub Actions 构建部署成功，线上 `/PKUMLonline/` 可用。

---

## Phase 1 验收标准

- [ ] Supabase 项目就绪，5 张表 + RLS 生效
- [ ] 管理员可登录 `/admin/`，无权限被守卫拦截
- [ ] 公告增删改可用，`/news/` 从数据库拉取且静态回退有效
- [ ] `.env` 未进 git，`@supabase/supabase-js` 已安装

---

## 后续阶段（各自单独计划）

- **Phase 2**：队伍名单管理、赛程管理、队长选人、赛程页客户端拉取显示出场。
- **Phase 3**：可点击点数表（数值需先与用户逐项确认）、对局录入交互与自动规则、rounds 计算引擎、完结→赛果、对局详情页（总表+阶段表+折线图 Chart.js）。
- **Phase 4**：积分榜客户端聚合计算（复用 `standings.ts`）、演示数据交接、新赛季空表、部署。
