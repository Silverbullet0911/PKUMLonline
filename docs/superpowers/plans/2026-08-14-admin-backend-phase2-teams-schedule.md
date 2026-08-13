# Phase 2 · 队伍名单 + 赛程管理 + 队长选人 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可在后台维护赛季队伍名单与赛程；队长登录后为自己队伍的未来半庄选派出场选手；公开赛程页从数据库拉取并显示已填出场。

**Architecture:** 在 Phase 1 的 Supabase 基础上新增：一张 security-definer RPC 函数 `assign_player` 让队长只改自己队伍座位的出场（RLS 无法对 jsonb 座位精确到单席位）；管理页 `/admin/teams`、`/admin/schedule` 用原生 JS + supabase 直连读写；队长页 `/captain` 独立守卫；公开 `/schedule` 客户端拉取 games 表重渲染。

**Tech Stack:** Astro、`@supabase/supabase-js`、vitest（沿用）。

**前置约定**
- `npm install` 由用户手动执行（本阶段无需新依赖）。
- `assign_player` 的 SQL 由用户在 Supabase SQL Editor 手动执行。

---

## File Structure（Phase 2 涉及文件）

| 文件 | 动作 | 职责 |
|---|---|---|
| `supabase/schema.sql` | 修改 | 追加 `assign_player` RPC + grant（用户重新整段执行） |
| `src/lib/games.ts` | 创建 | `buildSeats` / `parseRoster` 纯函数（可单测） |
| `src/lib/games.test.ts` | 创建 | 上述函数测试 |
| `src/components/admin/AdminShell.astro` | 修改 | 导航增加 队伍/赛程 链接 |
| `src/pages/admin/index.astro` | 修改 | 仪表盘增加 队伍/赛程 入口 |
| `src/pages/admin/teams.astro` | 创建 | 队伍名单管理（admin） |
| `src/pages/admin/schedule.astro` | 创建 | 赛程管理（admin） |
| `src/pages/captain.astro` | 创建 | 队长选人（captain） |
| `src/components/FutureGames.astro` | 修改 | 未来半庄显示已填出场选手 |
| `src/pages/schedule.astro` | 修改 | 客户端拉取 games 并重渲染（静态回退） |
| `src/lib/renderSchedule.ts` | 创建 | 客户端赛程渲染辅助（可单测纯函数部分） |

---

### Task 1: assign_player RPC（SQL）

- [ ] **Step 1: 在 supabase/schema.sql 末尾追加**

在 `supabase/schema.sql` 文件末尾追加以下内容：

```sql
-- ============ 队长/管理员指派出场选手 ============
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
  v_roster jsonb;
  v_idx int;
  v_updated boolean := false;
  v_new_seats jsonb;
  v_seat_team text;
begin
  select role, team into v_role, v_team from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('captain','admin') then
    raise exception 'forbidden';
  end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.status <> 'upcoming' then raise exception 'game already finished'; end if;

  v_new_seats := v_game.seats;
  for v_idx in 0..jsonb_array_length(v_new_seats)-1 loop
    v_seat_team := v_new_seats->v_idx->>'team';
    if v_role = 'captain' and v_seat_team <> v_team then
      continue;
    end if;
    select roster into v_roster from public.teams
      where name = v_seat_team and season = v_game.season;
    if v_roster is null then
      raise exception 'team % not found in season %', v_seat_team, v_game.season;
    end if;
    if not (v_roster @> jsonb_build_array(p_player)) then
      raise exception 'player not in roster of %', v_seat_team;
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
```

- [ ] **Step 2: 用户整段重跑 schema.sql**

用户在 Supabase **SQL Editor** 里把 `supabase/schema.sql` 全部内容重新执行一遍（RPC 用 `create or replace`，可重复执行）。Expected: Success，无报错。

- [ ] **Step 3: 验证**

```bash
curl -s -o /dev/null -w "%{http_code}" https://ilnxthovvytaylshsjel.supabase.co/rest/v1/rpc/assign_player
```
Expected: 405（REST 上无 GET，但函数存在即无 404）。

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: assign_player RPC for captain roster selection"
```

---

### Task 2: 队伍/座位辅助函数（TDD）

- [ ] **Step 1: 写失败测试 src/lib/games.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { buildSeats, parseRoster } from './games'

describe('buildSeats', () => {
  it('assigns 东南西北 to the 4 teams with empty player', () => {
    expect(buildSeats(['凤凰', '樱花', '火山', '雷电'])).toEqual([
      { seat: '东', team: '凤凰', player: null },
      { seat: '南', team: '樱花', player: null },
      { seat: '西', team: '火山', player: null },
      { seat: '北', team: '雷电', player: null },
    ])
  })
})

describe('parseRoster', () => {
  it('splits newline names, trims, drops empty lines', () => {
    expect(parseRoster('张三\n 李四 \n\n王五')).toEqual(['张三', '李四', '王五'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/lib/games.test.ts
```
Expected: FAIL（`./games` 不存在）。

- [ ] **Step 3: 实现 src/lib/games.ts**

```ts
const SEAT_ORDER = ['东', '南', '西', '北'] as const

export interface GameSeatInput {
  seat: string
  team: string
  player: null
}

export function buildSeats(teams: string[]): GameSeatInput[] {
  return SEAT_ORDER.map((seat, i) => ({ seat, team: teams[i] ?? '', player: null }))
}

export function parseRoster(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run src/lib/games.test.ts
```
Expected: PASS（2 个 describe，3 个断言）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts
git commit -m "feat: buildSeats and parseRoster helpers"
```

---

### Task 3: AdminShell 导航 + 仪表盘入口

- [ ] **Step 1: 修改 AdminShell 导航**

在 `src/components/admin/AdminShell.astro` 的 `<nav>` 中，`公告` 链接旁追加队伍与赛程管理链接：

```astro
  <nav class="admin-nav">
    <a href={`${import.meta.env.BASE_URL}admin/`}>仪表盘</a>
    {(!requireRole || requireRole === 'admin') && <a href={`${import.meta.env.BASE_URL}admin/announcements/`}>公告</a>}
    {(!requireRole || requireRole === 'admin') && <a href={`${import.meta.env.BASE_URL}admin/teams/`}>队伍</a>}
    {(!requireRole || requireRole === 'admin') && <a href={`${import.meta.env.BASE_URL}admin/schedule/`}>赛程</a>}
    <a href={`${import.meta.env.BASE_URL}schedule/`}>前台赛程</a>
    <button id="logout" class="admin-logout">退出</button>
  </nav>
```

- [ ] **Step 2: 仪表盘增加入口**

在 `src/pages/admin/index.astro` 的 `<ul class="admin-links">` 中追加两项：

```astro
    <ul class="admin-links" id="admin-links">
      <li class="admin-only"><a href={`${import.meta.env.BASE_URL}admin/announcements/`}>公告管理</a></li>
      <li class="admin-only"><a href={`${import.meta.env.BASE_URL}admin/teams/`}>队伍名单管理</a></li>
      <li class="admin-only"><a href={`${import.meta.env.BASE_URL}admin/schedule/`}>赛程管理</a></li>
    </ul>
```

- [ ] **Step 3: 构建验证**

```bash
npm run build
```
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminShell.astro src/pages/admin/index.astro
git commit -m "feat: admin nav links for teams and schedule"
```

---

### Task 4: 队伍名单管理（src/pages/admin/teams.astro）

- [ ] **Step 1: 创建页面**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import AdminShell from '../../components/admin/AdminShell.astro'
---
<BaseLayout title="队伍名单管理">
  <AdminShell requireRole="admin">
    <h1>队伍名单管理</h1>
    <form id="team-form" class="team-form">
      <input name="season" placeholder="赛季 (如 26-27)" required>
      <input name="name" placeholder="队伍名" required>
      <input name="captain" placeholder="队长选手名">
      <textarea name="roster" placeholder="选手名单，每行一个" required></textarea>
      <button type="submit" id="team-submit">新增</button>
    </form>
    <p id="team-err" class="admin-err"></p>
    <table class="ann-table">
      <thead><tr><th>赛季</th><th>队伍</th><th>队长</th><th>名单</th><th>操作</th></tr></thead>
      <tbody id="team-list"></tbody>
    </table>
  </AdminShell>
  <script>
    import { supabase } from '../../lib/supabase'
    import { parseRoster } from '../../lib/games'
    const list = document.getElementById('team-list')!
    const form = document.getElementById('team-form') as HTMLFormElement
    const submitBtn = document.getElementById('team-submit') as HTMLButtonElement
    const errEl = document.getElementById('team-err')!
    let editingId: string | null = null
    const showErr = (m: string) => { errEl.textContent = m }

    async function load() {
      const { data, error } = await supabase.from('teams').select('*').order('season', { ascending: false })
      if (error) return showErr('加载失败：' + error.message)
      errEl.textContent = ''
      list.innerHTML = ''
      for (const t of data) {
        const tr = document.createElement('tr')
        const td = (s: string) => { const x = document.createElement('td'); x.textContent = s; tr.appendChild(x) }
        td(t.season); td(t.name); td(t.captain ?? '')
        const rosterTd = document.createElement('td')
        rosterTd.textContent = (t.roster ?? []).join('、')
        tr.appendChild(rosterTd)
        const ops = document.createElement('td')
        const eb = document.createElement('button'); eb.textContent = '改'; eb.dataset.edit = t.id
        const db = document.createElement('button'); db.textContent = '删'; db.dataset.del = t.id
        ops.append(eb, db); tr.appendChild(ops)
        list.appendChild(tr)
      }
    }
    list.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement
      const id = el.dataset.del ?? el.dataset.edit ?? ''
      if (el.dataset.del) {
        const { error } = await supabase.from('teams').delete().eq('id', id)
        if (error) return showErr('删除失败：' + error.message)
        load()
      } else if (el.dataset.edit) {
        const { data, error } = await supabase.from('teams').select('*').eq('id', id).single()
        if (error) return showErr('加载失败：' + error.message)
        if (data) {
          editingId = data.id
          form.season.value = data.season
          form.name.value = data.name
          form.captain.value = data.captain ?? ''
          form.roster.value = (data.roster ?? []).join('\n')
          submitBtn.textContent = '保存'
        }
      }
    })
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const payload = {
        season: form.season.value.trim(),
        name: form.name.value.trim(),
        captain: form.captain.value.trim() || null,
        roster: parseRoster(form.roster.value),
      }
      if (editingId) {
        const { error } = await supabase.from('teams').update(payload).eq('id', editingId)
        if (error) return showErr('保存失败：' + error.message)
        editingId = null; submitBtn.textContent = '新增'
      } else {
        const { error } = await supabase.from('teams').insert([payload])
        if (error) return showErr('新增失败：' + error.message)
      }
      form.reset(); load()
    })
    load()
  </script>
</BaseLayout>
```

- [ ] **Step 2: 验证**

管理员登录 `/PKUMLonline/admin/teams/`，能新增/改/删队伍；roster 换行分隔正确存为数组。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/teams.astro
git commit -m "feat: admin teams CRUD page"
```

---

### Task 5: 赛程管理（src/pages/admin/schedule.astro）

- [ ] **Step 1: 创建页面**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import AdminShell from '../../components/admin/AdminShell.astro'
---
<BaseLayout title="赛程管理">
  <AdminShell requireRole="admin">
    <h1>赛程管理</h1>
    <form id="game-form" class="game-form">
      <input name="season" placeholder="赛季 (如 26-27)" required>
      <select name="stage">
        <option value="常规赛">常规赛</option>
        <option value="半决赛">半决赛</option>
        <option value="决赛">决赛</option>
      </select>
      <input name="date" type="date" required>
      <input name="time" placeholder="时间 (如 14:00)">
      <input name="round" placeholder="第几半庄">
      <div class="game-seat-inputs">
        <select name="seat0" data-seat="东"></select>
        <select name="seat1" data-seat="南"></select>
        <select name="seat2" data-seat="西"></select>
        <select name="seat3" data-seat="北"></select>
      </div>
      <button type="submit" id="game-submit">新增</button>
    </form>
    <p id="game-err" class="admin-err"></p>
    <table class="ann-table">
      <thead><tr><th>日期</th><th>阶段</th><th>半庄</th><th>对阵</th><th>操作</th></tr></thead>
      <tbody id="game-list"></tbody>
    </table>
  </AdminShell>
  <script>
    import { supabase } from '../../lib/supabase'
    import { buildSeats } from '../../lib/games'
    const list = document.getElementById('game-list')!
    const form = document.getElementById('game-form') as HTMLFormElement
    const submitBtn = document.getElementById('game-submit') as HTMLButtonElement
    const errEl = document.getElementById('game-err')!
    let editingId: string | null = null
    let teamsCache: string[] = []
    const showErr = (m: string) => { errEl.textContent = m }
    const seatSelects = () => [form.seat0, form.seat1, form.seat2, form.seat3]

    async function loadTeams() {
      const { data, error } = await supabase.from('teams').select('name').order('name')
      if (error) return showErr('加载队伍失败：' + error.message)
      teamsCache = (data ?? []).map((t) => t.name)
      for (const s of seatSelects()) {
        s.innerHTML = ''
        const opt = document.createElement('option')
        opt.value = ''; opt.textContent = '选择队伍'
        s.appendChild(opt)
        for (const n of teamsCache) {
          const o = document.createElement('option'); o.value = n; o.textContent = n
          s.appendChild(o)
        }
      }
    }
    async function load() {
      const { data, error } = await supabase.from('games').select('*').order('date', { ascending: true })
      if (error) return showErr('加载失败：' + error.message)
      errEl.textContent = ''
      list.innerHTML = ''
      for (const g of data) {
        const tr = document.createElement('tr')
        const td = (s: string) => { const x = document.createElement('td'); x.textContent = s; tr.appendChild(x) }
        td(g.date); td(g.stage); td(g.round ?? '')
        td((g.seats ?? []).map((s) => s.team).join(' / '))
        const ops = document.createElement('td')
        const eb = document.createElement('button'); eb.textContent = '改'; eb.dataset.edit = g.id
        const db = document.createElement('button'); db.textContent = '删'; db.dataset.del = g.id
        ops.append(eb, db); tr.appendChild(ops)
        list.appendChild(tr)
      }
    }
    list.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement
      const id = el.dataset.del ?? el.dataset.edit ?? ''
      if (el.dataset.del) {
        const { error } = await supabase.from('games').delete().eq('id', id)
        if (error) return showErr('删除失败：' + error.message)
        load()
      } else if (el.dataset.edit) {
        const { data, error } = await supabase.from('games').select('*').eq('id', id).single()
        if (error) return showErr('加载失败：' + error.message)
        if (data) {
          editingId = data.id
          form.season.value = data.season
          form.stage.value = data.stage
          form.date.value = data.date
          form.time.value = data.time ?? ''
          form.round.value = data.round ?? ''
          const seats = data.seats ?? []
          seatSelects().forEach((s, i) => { s.value = seats[i]?.team ?? '' })
          submitBtn.textContent = '保存'
        }
      }
    })
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const teams = seatSelects().map((s) => s.value)
      if (teams.some((t) => !t)) return showErr('请为每个座位选择队伍')
      const payload = {
        season: form.season.value.trim(),
        stage: form.stage.value,
        date: form.date.value,
        time: form.time.value.trim() || null,
        round: form.round.value.trim() || null,
        seats: buildSeats(teams),
      }
      if (editingId) {
        const { error } = await supabase.from('games').update(payload).eq('id', editingId)
        if (error) return showErr('保存失败：' + error.message)
        editingId = null; submitBtn.textContent = '新增'
      } else {
        const { error } = await supabase.from('games').insert([payload])
        if (error) return showErr('新增失败：' + error.message)
      }
      form.reset(); load()
    })
    loadTeams(); load()
  </script>
</BaseLayout>
```

- [ ] **Step 2: 验证**

管理员能新增/改/删半庄；4 个队伍下拉来自 teams 表。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/schedule.astro
git commit -m "feat: admin schedule CRUD page"
```

---

### Task 6: 队长选人（src/pages/captain.astro）

- [ ] **Step 1: 创建页面**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
---
<BaseLayout title="队长选人">
  <div class="captain-shell">
    <h1>队长选人</h1>
    <p id="cap-info"></p>
    <p id="cap-err" class="admin-err"></p>
    <div id="cap-games"></div>
    <button id="cap-logout">退出</button>
  </div>
  <script>
    import { supabase } from '../lib/supabase'
    const base = import.meta.env.BASE_URL
    const errEl = document.getElementById('cap-err')!
    const redirect = (p: string) => { window.location.href = base + p }

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return redirect('admin/login/')
      const { data: profile, error: pErr } = await supabase
        .from('profiles').select('role, team').eq('id', session.user.id).single()
      if (pErr || !profile || profile.role !== 'captain' || !profile.team) {
        return redirect('admin/login/')
      }
      const team = profile.team
      document.getElementById('cap-info')!.textContent = '当前队伍：' + team

      const { data: roster } = await supabase.from('teams').select('roster').eq('name', team).single()
      const rosterList = roster?.roster ?? []

      const { data: games, error: gErr } = await supabase
        .from('games').select('*').eq('status', 'upcoming').order('date', { ascending: true })
      if (gErr) { errEl.textContent = '加载赛程失败：' + gErr.message; return }

      const container = document.getElementById('cap-games')!
      const myGames = (games ?? []).filter((g) => (g.seats ?? []).some((s) => s.team === team))
      if (myGames.length === 0) {
        container.innerHTML = '<p class="empty">暂无本队的未来赛程。</p>'
      }
      for (const g of myGames) {
        const row = document.createElement('div')
        row.className = 'cap-game'
        row.innerHTML = `<div class="cap-meta">${g.date} · ${g.stage}${g.round ? ' ' + g.round : ''}</div>`
        const seats = g.seats ?? []
        const mySeat = seats.find((s) => s.team === team)
        const sel = document.createElement('select')
        sel.dataset.game = g.id
        const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '未选定'
        sel.appendChild(emptyOpt)
        for (const p of rosterList) {
          const o = document.createElement('option'); o.value = p; o.textContent = p
          if (mySeat?.player === p) o.selected = true
          sel.appendChild(o)
        }
        sel.value = mySeat?.player ?? ''
        sel.addEventListener('change', async () => {
          const { error } = await supabase.rpc('assign_player', {
            p_game_id: g.id, p_player: sel.value,
          })
          errEl.textContent = error ? '指派失败：' + error.message : ''
        })
        row.appendChild(sel)
        container.appendChild(row)
      }
      document.getElementById('cap-logout')!.addEventListener('click', async () => {
        await supabase.auth.signOut(); redirect('admin/login/')
      })
    })()
  </script>
</BaseLayout>
```

- [ ] **Step 2: 验证**

建一个 `captain` 角色账号（绑定队伍名），登录 `/PKUMLonline/captain/`，看到本队未来半庄，选择选手后 games.seats 中该队座位的 `player` 被写入；非本队座位不受影响。

- [ ] **Step 3: Commit**

```bash
git add src/pages/captain.astro
git commit -m "feat: captain roster selection page"
```

---

### Task 7: 未来赛程显示已填出场（FutureGames）

- [ ] **Step 1: 修改 src/components/FutureGames.astro**

在座位格子里，若 `s.player` 存在则追加选手名：

```astro
                <div class="future-seats">
                  {
                    g.seats.map((s) => (
                      <div class="future-seat" style={ts(s.team)}>
                        <span class="fs-seat">{s.seat}</span>
                        <span class="fs-team">{s.team}</span>
                        {s.name && <span class="fs-player">{s.name}</span>}
                      </div>
                    ))
                  }
                </div>
```

（`GameSeat` 类型已含可选 `name`，DB 的 `player` 在拉取时映射为 `name`。）

- [ ] **Step 2: 构建验证**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FutureGames.astro
git commit -m "feat: show assigned player in future games"
```

---

### Task 8: 公开赛程页客户端拉取

- [ ] **Step 1: 创建 src/lib/renderSchedule.ts**

```ts
import teamsRaw from '../../data/teams.json'
import { groupByMonth } from './schedule'
import type { Game } from './types'

const LIGHT_TEAMS = new Set(['樱花', '雷电', '赤坂', 'AB'])
export function teamStyle(name: string): string {
  const color = teamsRaw.teams.find((t) => t.name === name)?.color ?? '#9ca3af'
  const text = LIGHT_TEAMS.has(name) ? '#1f2328' : '#fff'
  return `background:${color};color:${text}`
}

export interface DbGame {
  id: string
  stage: string
  date: string
  time: string | null
  round: string | null
  status: 'upcoming' | 'finished'
  seats: { seat: string; team: string; player: string | null; rank?: number; points?: number }[]
}

export function mapDbGame(g: DbGame): Game {
  return {
    stage: g.stage,
    date: g.date,
    time: g.time ?? undefined,
    round: g.round ?? undefined,
    status: g.status,
    seats: (g.seats ?? []).map((s) => ({
      seat: s.seat,
      team: s.team,
      name: s.player ?? undefined,
      rank: s.rank,
      points: s.points,
    })),
  }
}

// 把游戏按状态分组并按月份排序，供客户端渲染
export function splitGames(games: Game[]): { upcoming: Game[]; finished: Game[] } {
  return {
    upcoming: games.filter((g) => g.status === 'upcoming'),
    finished: games.filter((g) => g.status === 'finished'),
  }
}

export function monthGroupsOf(games: Game[], order: 'asc' | 'desc'): ReturnType<typeof groupByMonth<Game>> {
  return groupByMonth(games, { order })
}

export function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
```

- [ ] **Step 2: 创建 renderSchedule 测试 src/lib/renderSchedule.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { mapDbGame, splitGames, escHtml } from './renderSchedule'

const db = {
  id: '1', stage: '常规赛', date: '2026-09-01', time: '14:00', round: '第1半庄',
  status: 'upcoming' as const,
  seats: [{ seat: '东', team: '凤凰', player: '张三' }],
}

describe('mapDbGame', () => {
  it('maps player to name and nulls to undefined', () => {
    const g = mapDbGame(db)
    expect(g.seats[0].name).toBe('张三')
    expect(g.time).toBe('14:00')
  })
})

describe('splitGames', () => {
  it('splits upcoming and finished', () => {
    const g1 = mapDbGame(db)
    const g2 = mapDbGame({ ...db, id: '2', status: 'finished' })
    const { upcoming, finished } = splitGames([g1, g2])
    expect(upcoming.map((g) => g.seats[0].team)).toEqual(['凤凰'])
    expect(finished).toHaveLength(1)
  })
})

describe('escHtml', () => {
  it('escapes html special chars', () => {
    expect(escHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run src/lib/renderSchedule.test.ts src/lib/games.test.ts
```
Expected: PASS。

- [ ] **Step 4: 修改 src/pages/schedule.astro**

保留现有静态渲染为回退，追加客户端脚本：拉取 games，若非空则重渲染两个面板。在文件末尾（现有 `<script>` 之后）追加：

```astro
  <script>
    import { supabase } from '../lib/supabase'
    import { mapDbGame, splitGames, monthGroupsOf, teamStyle, escHtml } from '../lib/renderSchedule'

    ;(async () => {
      const { data, error } = await supabase.from('games').select('*').order('date', { ascending: true })
      if (error || !data || data.length === 0) return
      const games = (data as any[]).map(mapDbGame)
      const { upcoming, finished } = splitGames(games)

      const up = document.querySelector('#stage-0')
      if (up) {
        if (upcoming.length === 0) {
          up.innerHTML = '<p class="empty">暂无赛程。</p>'
        } else {
          const groups = monthGroupsOf(upcoming, 'asc')
          up.innerHTML = groups.map((mg) => `
            <section id="sch-${mg.month}" class="month-group">
              <h2>${mg.month}</h2>
              ${mg.games.map((g) => `
                <div class="future-row">
                  <div class="future-meta">
                    <div><span class="fm-date">${g.date}</span><span class="fm-rest"> · ${g.stage}${g.round ? ' ' + g.round : ''}</span></div>
                    ${g.time ? `<div class="fm-time">${g.time}</div>` : ''}
                  </div>
                  <div class="future-seats">
                    ${g.seats.map((s) => `
                      <div class="future-seat" style="${teamStyle(s.team)}">
                        <span class="fs-seat">${s.seat}</span>
                        <span class="fs-team">${escHtml(s.team)}</span>
                        ${s.name ? `<span class="fs-player">${escHtml(s.name)}</span>` : ''}
                      </div>`).join('')}
                  </div>
                </div>`).join('')}
            </section>`).join('')
        }
      }

      const res = document.querySelector('#stage-1')
      if (res) {
        if (finished.length === 0) {
          res.innerHTML = '<p class="empty">暂无赛果。</p>'
        } else {
          const groups = monthGroupsOf(finished, 'desc')
          res.innerHTML = groups.map((mg) => `
            <section id="res-${mg.month}" class="month-group">
              <h2>${mg.month}</h2>
              ${mg.games.map((g) => `
                <section class="game-card">
                  <h2>${g.stage}${g.round ? ' ' + g.round : ''} · ${g.date}</h2>
                  <div class="game-players">
                    ${g.seats.map((s) => `
                      <div class="game-player" style="${teamStyle(s.team)}">
                        <span class="gp-team">${escHtml(s.team)}</span>
                        <span class="gp-seat">${s.seat}</span>
                        <span class="gp-name">${s.name ? escHtml(s.name) : ''}</span>
                        <span class="gp-pts">${s.points ?? 0}</span>
                        <span class="gp-rank">${s.rank ?? ''}位</span>
                      </div>`).join('')}
                  </div>
                </section>`).join('')}
            </section>`).join('')
        }
      }
    })()
  </script>
```

（注：日期/阶段来自数据库，均为受控输入；队伍名经 `esc` 转义防 XSS。客户端拉取失败或库为空时保留服务器渲染的静态回退。）

- [ ] **Step 5: 构建 + 测试**

```bash
npm run build && npx vitest run src/lib/renderSchedule.test.ts src/lib/games.test.ts
```
Expected: 构建成功，测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/renderSchedule.ts src/lib/renderSchedule.test.ts src/pages/schedule.astro
git commit -m "feat: schedule page fetches games from db with static fallback"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 准备测试账号**

用 Supabase Dashboard 建 1 个 `captain` 账号（如 `captain@pkuml.local`），并在 SQL Editor 绑定队伍并给该队建 roster：

```sql
update public.profiles set role='captain', team='凤凰' where email='captain@pkuml.local';
insert into public.teams (season, name, captain, roster)
values ('26-27', '凤凰', '玖夜', '["玖夜","立直里三","甲","乙"]')
on conflict (season, name) do nothing;
```

- [ ] **Step 2: 手工流程**

- 管理员在 `/admin/teams/` 增删改队伍
- 管理员在 `/admin/schedule/` 建一个含「凤凰」的 upcoming 半庄
- 队长登录 `/captain/`，为该半庄选人 → `/schedule/` 该半庄显示选手名
- 非本队座位不受影响；已 finished 半庄不可指派

- [ ] **Step 3: 全量测试**

```bash
npm run test
```
Expected: 全部通过。

---

## Phase 2 验收标准

- [ ] `assign_player` RPC 生效，队长只能改本队座位
- [ ] 管理员可管理队伍名单与赛程
- [ ] 队长页可选本队出场，公开赛程页显示已填选手
- [ ] 公开赛程页从数据库拉取，静态回退有效
- [ ] 构建通过、测试通过

---

## 后续阶段

- **Phase 3**：可点击点数表（数值先与用户逐项确认）、对局录入交互与自动规则、rounds 计算引擎、完结→赛果、对局详情页（总表+阶段表+折线图）。
- **Phase 4**：积分榜客户端聚合计算、演示数据交接、新赛季空表、部署。
