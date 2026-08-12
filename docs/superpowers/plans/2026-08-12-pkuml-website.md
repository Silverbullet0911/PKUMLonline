# PKUML 官网搭建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Astro 静态站搭建 PKU M.LEAGUE 官方网站（6 个页面 + 数据驱动榜单/选手资料/章程展示），数据从项目根目录 `data/*.json` 读取，构建产物可部署到 Vercel。

**Architecture:** 静态站点生成器 Astro，页面只做「读 JSON → 渲染」。数据文件全部位于项目根 `data/`（未来接可视化后台时后台向同一 schema 写数据、站点重新构建，前端不改）。榜单计算、章程分块解析等纯函数放 `src/lib/` 并配 vitest 单元测试。三个榜单表格组件按阶段配置表头。

**Tech Stack:** Astro 5（static output）、TypeScript、vitest（纯函数测试）、JSON 数据文件、Vercel 托管。

---

## 文件结构总览

```
PKUML_online/
├── package.json / astro.config.mjs / tsconfig.json / .gitignore   (新建)
├── README.md                                                       (新建，含录入 SOP + 部署说明)
├── data/
│   ├── teams.json            已有（10 队代表色）
│   ├── current_roster.json   已有（26-27 赛季 10 队名单）
│   ├── players_history.json  已有（67 名选手往届成绩）
│   ├── season.json           新建（当前赛季 + 阶段配置：总场数/晋级线）
│   ├── archive.json          新建（历届三届队伍最终名次 + 冠军）
│   ├── standings.json        新建（当前赛季三阶段队伍榜/个人榜，初始为空）
│   ├── schedule.json         新建（当前赛季对局，初始为空）
│   └── news.json             新建（公告）
├── public/favicon.svg        新建
└── src/
    ├── env.d.ts              新建
    ├── styles/global.css     新建
    ├── lib/
    │   ├── types.ts          新建（JSON schema 的 TS 类型）
    │   ├── standings.ts      新建（榜单计算纯函数）
    │   ├── standings.test.ts 新建
    │   ├── charter.ts        新建（章程按「第N条」分块）
    │   ├── charter.test.ts   新建
    │   └── data.ts           新建（集中加载并类型化全部 data/*.json）
    ├── layouts/BaseLayout.astro  新建（页头导航 + 页脚）
    ├── components/
    │   ├── PlayerHonors.astro         新建（个人赏/队伍赏，纯文字展示）
    │   ├── TeamStandingsTable.astro   新建（三阶段队伍榜，表头随阶段变化）
    │   ├── PlayerStandingsTable.astro 新建（个人榜，三阶段表头一致）
    │   ├── PlayerHistoryTable.astro   新建（选手历史成绩表）
    │   ├── StageTabs.astro            新建（常规赛|半决赛|决赛 页签）
    │   └── CharterNav.astro           新建（章程侧边栏锚点索引）
    └── pages/
        ├── index.astro      首页
        ├── schedule.astro   赛程与结果
        ├── standings.astro  积分排名（页签切换）
        ├── teams.astro      队伍与选手
        ├── rules.astro      规则与章程（原文 + 锚点索引）
        └── archive.astro    赛季档案
```

**已确认的决策**（来自设计定稿 `docs/superpowers/specs/2026-08-12-pkuml-website-design.md` 与用户选择）：
- 部署平台：**Vercel**
- 规则页实现：**章程原文 + 侧边栏锚点索引**（不手动改写内容，用 `?raw` 导入 + 正则分块）
- 队伍列表格「队伍」列、个人榜「所属」列、历史成绩「隶属队伍」列的单元格背景色 = 队伍代表色（`data/teams.json`）
- 阶段名统一「半决赛」；决赛队伍榜表头把「晋级线差」改为「一位差」
- 常规赛前 6 进半决赛、半决赛前 4 进决赛（章程固定）；各阶段**总场数为赛季配置项**（赛季首场比赛前由赛事组公布，`season.json` 默认 24/4/2，可改）
- 当前赛季（26-27）未开始 → 榜单/赛程初始为空，页面显示「赛季尚未开始」占位
- 时间标注 `standings.asOf`：进行中为「xx月xx日终了时点」，结束为「全日程终了」
- 荣誉展示：队伍赏（如「23-24赛季冠军」）与个人赏（如「25-26赛季MVP」）分开，纯文字展示不做徽章样式，紧邻选手姓名
- 选手历史成绩表放**赛季档案**页；**队伍与选手**页的往届选手区列出选手名 + 荣誉文字，链接到档案页对应选手锚点

**执行说明**：本计划执行中遇到 `npm install` 等联网安装步骤时，暂停并把命令行交给用户手动运行；用户确认安装完成后再继续。

---

## Task 1: 项目脚手架与依赖

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/pages/index.astro`（临时占位页，Task 6 替换为真实首页）

- [ ] **Step 1: git init**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && git init -b main
```
Expected: `Initialized empty Git repository in .../.git/`

- [ ] **Step 2: 写 package.json**

Create `package.json`:

```json
{
  "name": "pkuml-website",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: 写 .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
.astro/
.venv/
.claude/
```

说明：`data/`、`scripts/`、`往届成绩excel/`、`PKUML章程.txt` 均提交（重跑 `build_history.py` 需原始 Excel）。`PL指名.xlsx` 含当季指名信息，按用户此前提示不对外，一并加入忽略：

追加到 `.gitignore`：

```
PL指名.xlsx
```

- [ ] **Step 4: 写 astro.config.mjs**

Create `astro.config.mjs`:

```js
// @ts-check
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
})
```

- [ ] **Step 5: 写 tsconfig.json**

Create `tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 6: 写临时占位首页**

Create `src/pages/index.astro`:

```astro
---
---
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PKU M.LEAGUE</title>
  </head>
  <body>
    <h1>建设中…</h1>
  </body>
</html>
```

- [ ] **Step 7: 暂停——交给用户执行安装依赖**

**不要自己执行 npm install**。把以下命令复制给用户，在终端手动运行：

```bash
cd "c:/Users/Liucw/Desktop/PKUML_online"
npm install astro
npm install -D vitest
```
用户回复「安装好了」后继续 Step 8。

- [ ] **Step 8: 验证构建**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: Astro 构建成功，`dist/index.html` 生成，无报错。

- [ ] **Step 9: 首次提交**

```bash
git add -A && git commit -m "chore: scaffold Astro static site"
```
Expected: 提交成功，`git status` 干净。

---

## Task 2: 数据文件补齐（season / archive / standings / schedule / news）

**Files:**
- Create: `data/season.json`
- Create: `data/archive.json`
- Create: `data/standings.json`
- Create: `data/schedule.json`
- Create: `data/news.json`

- [ ] **Step 1: 写 season.json（当前赛季 + 阶段配置）**

Create `data/season.json`：

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

说明：`totalGames` 为 M.LEAGUE 惯例默认值，赛季首场比赛前由赛事组公布后修改；`promoteRank` 来自章程（前6进半决赛、前4进决赛），决赛为 0（不设晋级线）。

- [ ] **Step 2: 写 archive.json（历届赛季队伍名次）**

Create `data/archive.json`（最终名次与冠军来自 `scripts/build_history.py` 中的 TEAM_RANK / CHAMPION）：

```json
{
  "seasons": [
    { "year": "23-24", "finalRank": ["格斗", "樱花", "海盗", "凤凰", "AB", "赤坂", "雷电", "火山"], "champion": "格斗" },
    { "year": "24-25", "finalRank": ["野兽", "樱花", "格斗", "凤凰", "雷电", "AB", "海盗", "赤坂", "火山"], "champion": "野兽" },
    { "year": "25-26", "finalRank": ["海盗", "格斗", "樱花", "火山", "野兽", "地球", "凤凰", "雷电", "赤坂", "AB"], "champion": "海盗" }
  ]
}
```

- [ ] **Step 3: 写 standings.json（当前赛季榜单骨架）**

Create `data/standings.json`（赛季未开始，榜单为空数组）：

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

**榜单行 schema**（记录在 `types.ts` 中，未来录入数据时按此结构）：
- 队伍榜行：`{ "team": "海盗", "carry": 0, "stagePoints": 0, "stageRaw": 0, "wins": { "1": 0, "2": 0, "3": 0, "4": 0 } }`
  - `carry`：持越（常规赛为 0；半决赛/决赛 = 上阶段总积分折半）；页面「积分」列 = `carry + stagePoints`
- 个人榜行：`{ "team": "海盗", "name": "Art3mis", "points": 0, "rawPoints": 0, "penalty": 0, "wins": { "1": 0, "2": 0, "3": 0, "4": 0 }, "maxScore": 0 }`
  - `penalty` 为 0 或空时页面留空；`maxScore` 为 0 时显示 `-`

- [ ] **Step 4: 写 schedule.json（赛程骨架）**

Create `data/schedule.json`：

```json
{
  "season": "26-27",
  "games": []
}
```

**对局 schema**：
```json
{
  "stage": "常规赛",
  "date": "2026-09-05",
  "players": [
    { "team": "海盗", "name": "Art3mis", "rank": 1, "points": 42000 },
    { "team": "格斗", "name": "忆水", "rank": 2, "points": 18000 },
    { "team": "樱花", "name": "炸洋芋", "rank": 3, "points": -12000 },
    { "team": "火山", "name": "桃之11", "rank": 4, "points": -48000 }
  ],
  "replayUrl": "https://...",
  "videoUrl": null
}
```
（`videoUrl` 预留 bilibili 录像链接，当前不展示。示例仅作注释，勿写入文件——当前 `games` 保持空数组。）

- [ ] **Step 5: 写 news.json（公告）**

Create `data/news.json`：

```json
{
  "items": [
    {
      "date": "2026-08-12",
      "title": "PKU M.LEAGUE 官方网站上线",
      "category": "公告",
      "body": "本站用于沉淀赛程、积分、排名与规则，供选手内部查阅。当前赛季（26-27）尚未开始，相关数据将在开赛后更新。"
    }
  ]
}
```

- [ ] **Step 6: 验证全部 JSON 可解析**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && node -e "['season','archive','standings','schedule','news'].forEach(f=>JSON.parse(require('fs').readFileSync('data/'+f+'.json','utf8'))); console.log('all JSON OK')"
```
Expected: `all JSON OK`

- [ ] **Step 7: 提交**

```bash
git add -A && git commit -m "data: add season/archive/standings/schedule/news"
```

---

## Task 3: 数据层（types + standings 计算 TDD + charter 分块 + data 加载）

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/standings.ts`
- Create: `src/lib/standings.test.ts`
- Create: `src/lib/charter.ts`
- Create: `src/lib/charter.test.ts`
- Create: `src/lib/data.ts`

- [ ] **Step 1: 写类型定义 types.ts**

Create `src/lib/types.ts`：

```ts
export interface TeamInfo {
  name: string
  color: string
}

export interface RosterTeam {
  name: string
  captain: string
  roster: string[]
}

export interface Wins {
  '1': number
  '2': number
  '3': number
  '4': number
}

export interface TeamBoardRow {
  team: string
  carry: number
  stagePoints: number
  stageRaw: number
  wins: Wins
}

export interface PlayerBoardRow {
  team: string
  name: string
  points: number
  rawPoints: number
  penalty: number
  wins: Wins
  maxScore: number
}

export interface StageStandings {
  name: string
  teamBoard: TeamBoardRow[]
  playerBoard: PlayerBoardRow[]
}

export interface StageConfig {
  name: '常规赛' | '半决赛' | '决赛'
  totalGames: number
  promoteRank: number
  advanceLabel: string
}

export interface PlayerSeasonRecord {
  year: string
  team: string | null
  regularPoints: number | null
  semifinalPoints: number | null
  finalPoints: number | null
  regularMaxScore: number | null
  regularAvoidRate: number | null
  teamRank: number | null
}

export interface PlayerRecord {
  name: string
  personalHonors: string[]
  teamHonors: string[]
  history: PlayerSeasonRecord[]
}

export interface NewsItem {
  date: string
  title: string
  category: string
  body: string
}

export interface Game {
  stage: string
  date: string
  players: { team: string; name: string; rank: number; points: number }[]
  replayUrl?: string
  videoUrl?: string
}
```

- [ ] **Step 2: 写失败的榜单计算测试**

Create `src/lib/standings.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  avgRank, rate, formatPct, formatScore, computeTeamBoard, computePlayerBoard,
} from './standings'
import type { PlayerBoardRow, TeamBoardRow } from './types'

describe('avgRank', () => {
  it('计算加权平均顺位', () => {
    const w = { '1': 1, '2': 2, '3': 1, '4': 0 }
    expect(avgRank(w, 4)).toBe(2)
  })
  it('无比赛时返回 null', () => {
    expect(avgRank({ '1': 0, '2': 0, '3': 0, '4': 0 }, 0)).toBeNull()
  })
})

describe('rate', () => {
  it('计算比率', () => {
    expect(rate(2, 4)).toBe(0.5)
  })
  it('无比赛时返回 null', () => {
    expect(rate(0, 0)).toBeNull()
  })
})

describe('formatPct', () => {
  it('比率转百分比字符串', () => {
    expect(formatPct(0.8333)).toBe('83.3%')
  })
  it('null 显示 -', () => {
    expect(formatPct(null)).toBe('-')
  })
})

describe('formatScore', () => {
  it('整数不带小数点', () => {
    expect(formatScore(42000)).toBe('42000')
  })
  it('小数保留一位', () => {
    expect(formatScore(-89.3)).toBe('-89.3')
  })
  it('null 显示 -', () => {
    expect(formatScore(null)).toBe('-')
  })
})

describe('computeTeamBoard', () => {
  const rows: TeamBoardRow[] = [
    { team: '海盗', carry: 0, stagePoints: 120, stageRaw: 1000, wins: { '1': 5, '2': 3, '3': 2, '4': 2 } },
    { team: '格斗', carry: 0, stagePoints: 90, stageRaw: 2000, wins: { '1': 4, '2': 4, '3': 3, '4': 1 } },
    { team: '樱花', carry: 0, stagePoints: 120, stageRaw: 800, wins: { '1': 5, '2': 2, '3': 3, '4': 2 } },
  ]
  it('按积分降序、素点降序排序', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board.map(r => r.team)).toEqual(['海盗', '樱花', '格斗'])
  })
  it('计算与上一名的差（第1名为 -）', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board[0].diff).toBeNull()
    expect(board[1].diff).toBe(0)
    expect(board[2].diff).toBe(30)
  })
  it('计算与晋级线名次的差', () => {
    const board = computeTeamBoard(rows, 2)
    // 晋级线 = 第2名（樱花 120）：海盗 0，樱花 0，格斗 90-120=-30
    expect(board[0].advDiff).toBe(0)
    expect(board[1].advDiff).toBe(0)
    expect(board[2].advDiff).toBe(-30)
  })
  it('计算与第1名的差（第1名为 -）', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board[0].firstDiff).toBeNull()
    expect(board[1].firstDiff).toBe(0)
    expect(board[2].firstDiff).toBe(-30)
  })
  it('积分 = 持越 + 本阶段积分', () => {
    const withCarry: TeamBoardRow[] = [
      { team: '海盗', carry: 50, stagePoints: 70, stageRaw: 100, wins: { '1': 1, '2': 0, '3': 0, '4': 0 } },
    ]
    const board = computeTeamBoard(withCarry, 0)
    expect(board[0].points).toBe(120)
  })
  it('空数组返回空数组', () => {
    expect(computeTeamBoard([], 6)).toEqual([])
  })
})

describe('computePlayerBoard', () => {
  const rows: PlayerBoardRow[] = [
    { team: '海盗', name: '甲', points: 50, rawPoints: 300, penalty: 0, wins: { '1': 2, '2': 1, '3': 0, '4': 1 }, maxScore: 40000 },
    { team: '格斗', name: '乙', points: 80, rawPoints: 200, penalty: 5, wins: { '1': 3, '2': 0, '3': 1, '4': 0 }, maxScore: 45000 },
  ]
  it('按积分降序排序', () => {
    const board = computePlayerBoard(rows)
    expect(board.map(r => r.name)).toEqual(['乙', '甲'])
  })
  it('计算平均顺位、一位率、连对率、避四率', () => {
    const board = computePlayerBoard(rows)
    const a = board[1] // 甲：4 局，1位2次 → 平均 (2*1+1*2+0*3+1*4)/4=2；一位率0.5；连对率0.75；避四率0.75
    expect(a.avgRank).toBe(2)
    expect(a.winRate).toBe(0.5)
    expect(a.pairRate).toBe(0.75)
    expect(a.avoidRate).toBe(0.75)
  })
  it('比赛数由位次次数求和', () => {
    const board = computePlayerBoard(rows)
    expect(board[1].games).toBe(4)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm test
```
Expected: 失败（`Cannot find module './standings'` 或函数未导出）。

- [ ] **Step 4: 实现 standings.ts**

Create `src/lib/standings.ts`：

```ts
import type { PlayerBoardRow, TeamBoardRow, Wins } from './types'

export function gamesPlayed(w: Wins): number {
  return w['1'] + w['2'] + w['3'] + w['4']
}

export function avgRank(w: Wins, games: number): number | null {
  if (games === 0) return null
  return (w['1'] * 1 + w['2'] * 2 + w['3'] * 3 + w['4'] * 4) / games
}

export function rate(num: number, games: number): number | null {
  if (games === 0) return null
  return num / games
}

export function formatPct(x: number | null): string {
  if (x == null) return '-'
  return `${(x * 100).toFixed(1)}%`
}

export function formatScore(n: number | null): string {
  if (n == null) return '-'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10
}

export interface ComputedTeamRow {
  rank: number
  team: string
  points: number
  carry: number
  stagePoints: number
  stageRaw: number
  games: number
  wins: Wins
  diff: number | null
  advDiff: number | null
  firstDiff: number | null
}

export function computeTeamBoard(rows: TeamBoardRow[], promoteRank: number): ComputedTeamRow[] {
  const sorted = [...rows]
    .map(r => ({ ...r, points: r.carry + r.stagePoints }))
    .sort(
      (a, b) => b.points - a.points || b.stageRaw - a.stageRaw || a.team.localeCompare(b.team, 'zh'),
    )
  const line = promoteRank > 0 && sorted.length >= promoteRank ? sorted[promoteRank - 1].points : null
  const leader = sorted.length > 0 ? sorted[0].points : null
  return sorted.map((r, i) => {
    const prev = i > 0 ? sorted[i - 1].points : null
    return {
      rank: i + 1,
      team: r.team,
      points: r.points,
      carry: r.carry,
      stagePoints: r.stagePoints,
      stageRaw: r.stageRaw,
      games: gamesPlayed(r.wins),
      wins: r.wins,
      diff: prev == null ? null : round1(prev - r.points),
      advDiff: line == null ? null : round1(r.points - line),
      firstDiff: leader == null || i === 0 ? null : round1(r.points - leader),
    }
  })
}

export interface ComputedPlayerRow extends PlayerBoardRow {
  rank: number
  games: number
  avgRank: number | null
  winRate: number | null
  pairRate: number | null
  avoidRate: number | null
}

export function computePlayerBoard(rows: PlayerBoardRow[]): ComputedPlayerRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.points - a.points || b.rawPoints - a.rawPoints || a.name.localeCompare(b.name, 'zh'),
  )
  return sorted.map((r, i) => {
    const games = gamesPlayed(r.wins)
    return {
      ...r,
      rank: i + 1,
      games,
      avgRank: avgRank(r.wins, games),
      winRate: rate(r.wins['1'], games),
      pairRate: rate(r.wins['1'] + r.wins['2'], games),
      avoidRate: rate(r.wins['1'] + r.wins['2'] + r.wins['3'], games),
    }
  })
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm test
```
Expected: `Test Files 1 passed`，`Tests 13 passed`。

- [ ] **Step 6: 写章程分块解析（TDD）**

Create `src/lib/charter.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { splitCharter } from './charter'

const sample = [
  'PKU M.LEAGUE 章程',
  '引言文字。',
  '第1条 总则',
  '1. 本章程适用于……',
  '2. 另一句。',
  '第2条 队伍构成',
  '1. 至少8支队伍。',
  '',
  '第3条 比赛条件',
].join('\n')

describe('splitCharter', () => {
  it('拆分为引言 + 各条', () => {
    const blocks = splitCharter(sample)
    expect(blocks[0].id).toBe('0')
    expect(blocks[0].heading).toBe('引言')
    expect(blocks[0].content).toContain('引言文字。')
    expect(blocks.map(b => b.id)).toEqual(['0', '1', '2', '3'])
    expect(blocks[1].heading).toBe('第1条 总则')
  })
  it('条目内容跳过空行', () => {
    const blocks = splitCharter(sample)
    expect(blocks[2].content).toContain('1. 至少8支队伍。')
    expect(blocks[3].content).toEqual([])
  })
})
```

先跑一次确认失败，再实现 `src/lib/charter.ts`：

```ts
export interface CharterBlock {
  id: string
  heading: string
  content: string[]
}

export function splitCharter(raw: string): CharterBlock[] {
  const lines = raw.split(/\r?\n/).map(l => l.replace(/^﻿/, '').trimEnd())
  const blocks: CharterBlock[] = []
  let cur: CharterBlock | null = null
  for (const line of lines) {
    const m = line.match(/^第(\d+)条/)
    if (m) {
      cur = { id: m[1], heading: line, content: [] }
      blocks.push(cur)
    } else if (cur) {
      if (line.trim()) cur.content.push(line)
    } else if (line.trim()) {
      if (!blocks.length) blocks.push({ id: '0', heading: '引言', content: [] })
      blocks[0].content.push(line)
    }
  }
  return blocks
}
```

Run `npm test`，Expected: `Tests 17 passed`（新增 2 条测试）。

- [ ] **Step 7: 写 data.ts（集中加载并类型化全部 JSON）**

Create `src/lib/data.ts`：

```ts
import teamsRaw from '../../data/teams.json'
import rosterRaw from '../../data/current_roster.json'
import playersRaw from '../../data/players_history.json'
import seasonRaw from '../../data/season.json'
import standingsRaw from '../../data/standings.json'
import scheduleRaw from '../../data/schedule.json'
import newsRaw from '../../data/news.json'
import archiveRaw from '../../data/archive.json'

import type {
  Game, NewsItem, PlayerRecord, RosterTeam, StageConfig, StageStandings, TeamInfo,
} from './types'

export const teams = teamsRaw as { teams: TeamInfo[] }
export const roster = rosterRaw as { season: string; status: string; teams: RosterTeam[]; pendingNominations: string[] }
export const players = playersRaw as { players: PlayerRecord[] }
export const season = seasonRaw as { season: string; hasStarted: boolean; stages: StageConfig[] }
export const standings = standingsRaw as { season: string; asOf: string; stages: StageStandings[] }
export const schedule = scheduleRaw as { season: string; games: Game[] }
export const news = newsRaw as { items: NewsItem[] }
export const archive = archiveRaw as { seasons: { year: string; finalRank: string[]; champion: string }[] }
```

- [ ] **Step 8: 运行测试 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm test
```
Expected: `Tests 17 passed`。

```bash
git add -A && git commit -m "feat: add data layer with standings/charter computation"
```

---

## Task 4: 全局样式与基础布局

**Files:**
- Create: `src/env.d.ts`
- Create: `src/styles/global.css`
- Create: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: 写 env.d.ts**

Create `src/env.d.ts`：

```ts
/// <reference types="astro/client" />
```

- [ ] **Step 2: 写全局样式 global.css**

Create `src/styles/global.css`：

```css
:root {
  --bg: #f7f7f8;
  --card: #ffffff;
  --text: #1f2328;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #072f79;
  --accent-soft: #e8eef9;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, .08);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 24px;
  background: var(--accent);
  color: #fff;
}
.site-title { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: 1px; }
.site-title:hover { text-decoration: none; }
.site-nav { display: flex; gap: 4px; flex-wrap: wrap; }
.nav-link {
  padding: 6px 12px;
  border-radius: 6px;
  color: rgba(255, 255, 255, .85);
  font-size: 14px;
}
.nav-link:hover { background: rgba(255, 255, 255, .12); text-decoration: none; }
.nav-link.active { background: rgba(255, 255, 255, .22); color: #fff; }

.site-main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 48px; }
.site-footer {
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  border-top: 1px solid var(--line);
}
h1 { font-size: 26px; margin: 8px 0 16px; }
h2 { font-size: 20px; margin: 28px 0 12px; border-left: 4px solid var(--accent); padding-left: 10px; }
h3 { font-size: 16px; margin: 20px 0 8px; }
.empty {
  color: var(--muted);
  background: var(--card);
  border: 1px dashed var(--line);
  padding: 16px;
  border-radius: var(--radius);
}

.table-wrap {
  overflow-x: auto;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  margin-bottom: 16px;
}
table { border-collapse: collapse; width: 100%; font-size: 14px; white-space: nowrap; }
th, td { padding: 8px 12px; text-align: center; border-bottom: 1px solid var(--line); }
thead th { background: var(--accent-soft); font-weight: 700; }
tbody tr:hover { background: #fafbfc; }
td.rank { font-weight: 700; }
td.team-col { color: #fff; font-weight: 700; text-shadow: 0 0 2px rgba(0, 0, 0, .4); }
td.num { font-variant-numeric: tabular-nums; }
.as-of { text-align: right; color: var(--muted); font-size: 12px; margin-top: -8px; }
.advance-note { color: var(--muted); font-size: 13px; margin-top: -6px; }

.honors { color: var(--muted); font-size: 12px; margin-left: 8px; }

.stage-tabs { display: flex; gap: 8px; margin: 16px 0; }
.stage-tab {
  padding: 8px 20px;
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}
.stage-tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.stage-panel { display: none; }
.stage-panel.active { display: block; }

.team-card, .game-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}
.team-card h2 { border: none; padding: 0; margin: 0 0 8px; display: flex; align-items: center; gap: 10px; }
.team-dot { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
.player-chip {
  display: inline-block;
  margin: 4px 8px 4px 0;
  padding: 4px 10px;
  background: var(--accent-soft);
  border-radius: 999px;
  font-size: 13px;
}
.captain-tag { font-size: 11px; color: var(--muted); margin-left: 6px; }

.news-list { list-style: none; padding: 0; }
.news-list li { padding: 10px 0; border-bottom: 1px solid var(--line); }
.news-list time { color: var(--muted); margin-right: 12px; font-size: 13px; }

.charter-layout { display: grid; grid-template-columns: 220px 1fr; gap: 24px; }
.charter-nav {
  position: sticky;
  top: 72px;
  align-self: start;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
}
.charter-nav a { display: block; padding: 4px 8px; font-size: 13px; color: var(--text); border-radius: 4px; }
.charter-nav a:hover { background: var(--accent-soft); text-decoration: none; }
.charter-block {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 20px;
  margin-bottom: 16px;
}
.charter-block h2 { border: none; margin-top: 0; padding-left: 0; }
.charter-block p { margin: 8px 0; }
@media (max-width: 720px) {
  .charter-layout { grid-template-columns: 1fr; }
  .charter-nav { position: static; }
}

.player-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-bottom: 16px;
}
.player-card h3 { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.final-rank { padding-left: 20px; margin: 8px 0; }
```

- [ ] **Step 3: 写 BaseLayout.astro**

Create `src/layouts/BaseLayout.astro`：

```astro
---
import '../styles/global.css'

interface Props {
  title: string
}

const { title } = Astro.props

const nav = [
  { href: '/', label: '首页' },
  { href: '/schedule', label: '赛程与结果' },
  { href: '/standings', label: '积分排名' },
  { href: '/teams', label: '队伍与选手' },
  { href: '/rules', label: '规则与章程' },
  { href: '/archive', label: '赛季档案' },
]
const path = Astro.url.pathname
---
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} | PKU M.LEAGUE</title>
  </head>
  <body>
    <header class="site-header">
      <a class="site-title" href="/">PKU M.LEAGUE</a>
      <nav class="site-nav">
        {
          nav.map((item) => {
            const active = item.href === '/' ? path === '/' : path.startsWith(item.href)
            return (
              <a class:list={['nav-link', { active }]} href={item.href}>
                {item.label}
              </a>
            )
          })
        }
      </nav>
    </header>
    <main class="site-main">
      <slot />
    </main>
    <footer class="site-footer">PKU M.LEAGUE 官方网站 · 数据仅供选手内部参考</footer>
  </body>
</html>
```

- [ ] **Step 4: 更新占位首页使用布局 + 构建验证**

Replace `src/pages/index.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
---
<BaseLayout title="首页">
  <h1>建设中…</h1>
</BaseLayout>
```

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/index.html` 含导航与页脚。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "style: add global css and base layout with nav"
```

---

## Task 5: 表格与徽章组件

**Files:**
- Create: `src/components/PlayerHonors.astro`
- Create: `src/components/TeamStandingsTable.astro`
- Create: `src/components/PlayerStandingsTable.astro`
- Create: `src/components/PlayerHistoryTable.astro`
- Create: `src/components/StageTabs.astro`

- [ ] **Step 1: 写 PlayerHonors.astro（纯文字荣誉展示）**

Create `src/components/PlayerHonors.astro`：

```astro
---
interface Props {
  personalHonors?: string[]
  teamHonors?: string[]
}

const { personalHonors = [], teamHonors = [] } = Astro.props
---
{teamHonors.length > 0 && <span class="honors">队伍赏：{teamHonors.join('、')}</span>}
{personalHonors.length > 0 && <span class="honors">个人赏：{personalHonors.join('、')}</span>}
```

- [ ] **Step 2: 写 TeamStandingsTable.astro（三阶段表头不同）**

Create `src/components/TeamStandingsTable.astro`：

```astro
---
import { formatScore } from '../lib/standings'
import type { ComputedTeamRow } from '../lib/standings'
import type { TeamInfo, Wins } from '../lib/types'

interface Props {
  stage: string
  rows: ComputedTeamRow[]
  teams: TeamInfo[]
  totalGames: number
}

const { stage, rows, teams, totalGames } = Astro.props
const colorOf = (name: string) => teams.find((t) => t.name === name)?.color ?? '#9ca3af'
const fmt = (n: number | null) => (n == null ? '-' : String(n))
const fmtSigned = (n: number | null) =>
  n == null ? '-' : n > 0 ? `+${n}` : String(n)
const sum = (w: Wins) => w['1'] + w['2'] + w['3'] + w['4']

const HEADERS: Record<string, string[]> = {
  常规赛: ['顺位', '队伍', '积分', '素点', '差', '晋级线差', '比赛数', '1位', '2位', '3位', '4位'],
  半决赛: ['顺位', '队伍', '积分', '半决赛积分', '持越', '半决赛素点', '差', '晋级线差', '比赛数', '1位', '2位', '3位', '4位'],
  决赛: ['顺位', '队伍', '积分', '决赛积分', '持越', '决赛素点', '差', '一位差', '比赛数', '1位', '2位', '3位', '4位'],
}
const header = HEADERS[stage] ?? HEADERS['常规赛']
---
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        {header.map((h) => <th>{h}</th>)}
      </tr>
    </thead>
    <tbody>
      {
        rows.map((r) => (
          <tr>
            <td class="rank">{r.rank}</td>
            <td class="team-col" style={`background:${colorOf(r.team)}`}>{r.team}</td>
            <td class="num">{formatScore(r.points)}</td>
            {stage !== '常规赛' && <td class="num">{formatScore(r.stagePoints)}</td>}
            {stage !== '常规赛' && <td class="num">{formatScore(r.carry)}</td>}
            <td class="num">{formatScore(r.stageRaw)}</td>
            <td class="num">{fmt(r.diff)}</td>
            {stage === '决赛' ? <td class="num">{fmtSigned(r.firstDiff)}</td> : <td class="num">{fmtSigned(r.advDiff)}</td>}
            <td class="num">{sum(r.wins)}/{totalGames}</td>
            <td class="num">{r.wins['1']}</td>
            <td class="num">{r.wins['2']}</td>
            <td class="num">{r.wins['3']}</td>
            <td class="num">{r.wins['4']}</td>
          </tr>
        ))
      }
    </tbody>
  </table>
</div>
```

- [ ] **Step 3: 写 PlayerStandingsTable.astro（个人榜，表头三阶段一致）**

Create `src/components/PlayerStandingsTable.astro`：

```astro
---
import { formatPct, formatScore } from '../lib/standings'
import type { ComputedPlayerRow } from '../lib/standings'
import type { TeamInfo } from '../lib/types'

interface Props {
  rows: ComputedPlayerRow[]
  teams: TeamInfo[]
}

const { rows, teams } = Astro.props
const colorOf = (name: string) => teams.find((t) => t.name === name)?.color ?? '#9ca3af'
---
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>顺位</th><th>所属</th><th>选手名</th><th>积分</th><th>素点</th><th>判罚</th>
        <th>比赛数</th><th>平均顺位</th><th>1位</th><th>2位</th><th>3位</th><th>4位</th>
        <th>一位率</th><th>连对率</th><th>避四率</th><th>最高分</th>
      </tr>
    </thead>
    <tbody>
      {
        rows.map((r) => (
          <tr>
            <td class="rank">{r.rank}</td>
            <td class="team-col" style={`background:${colorOf(r.team)}`}>{r.team}</td>
            <td>{r.name}</td>
            <td class="num">{formatScore(r.points)}</td>
            <td class="num">{formatScore(r.rawPoints)}</td>
            <td class="num">{r.penalty ? r.penalty : ''}</td>
            <td class="num">{r.games}</td>
            <td class="num">{r.avgRank == null ? '-' : r.avgRank.toFixed(2)}</td>
            <td class="num">{r.wins['1']}</td>
            <td class="num">{r.wins['2']}</td>
            <td class="num">{r.wins['3']}</td>
            <td class="num">{r.wins['4']}</td>
            <td class="num">{formatPct(r.winRate)}</td>
            <td class="num">{formatPct(r.pairRate)}</td>
            <td class="num">{formatPct(r.avoidRate)}</td>
            <td class="num">{r.maxScore ? formatScore(r.maxScore) : '-'}</td>
          </tr>
        ))
      }
    </tbody>
  </table>
</div>
```

- [ ] **Step 4: 写 PlayerHistoryTable.astro（选手历史成绩表）**

Create `src/components/PlayerHistoryTable.astro`：

```astro
---
import { formatScore } from '../lib/standings'
import type { PlayerRecord, TeamInfo } from '../lib/types'

interface Props {
  player: PlayerRecord
  teams: TeamInfo[]
}

const { player, teams } = Astro.props
const colorOf = (name: string) => teams.find((t) => t.name === name)?.color ?? '#9ca3af'
const fmtPct = (n: number | null) => (n == null ? '-' : `${n.toFixed(2)}%`)
---
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>年份</th><th>隶属队伍</th><th>常规赛积分</th><th>半决赛积分</th><th>决赛积分</th>
        <th>常规赛最高分</th><th>常规赛避四率</th><th>队伍名次</th>
      </tr>
    </thead>
    <tbody>
      {
        player.history.map((h) => (
          <tr>
            <td class="num">{h.year}</td>
            <td class="team-col" style={h.team ? `background:${colorOf(h.team)}` : ''}>{h.team ?? '-'}</td>
            <td class="num">{formatScore(h.regularPoints)}</td>
            <td class="num">{formatScore(h.semifinalPoints)}</td>
            <td class="num">{formatScore(h.finalPoints)}</td>
            <td class="num">{formatScore(h.regularMaxScore)}</td>
            <td class="num">{fmtPct(h.regularAvoidRate)}</td>
            <td class="num">{h.teamRank ?? '-'}</td>
          </tr>
        ))
      }
    </tbody>
  </table>
</div>
```

- [ ] **Step 5: 写 StageTabs.astro（页签）**

Create `src/components/StageTabs.astro`：

```astro
---
interface Props {
  stages: { name: string }[]
}

const { stages } = Astro.props
---
<div class="stage-tabs" role="tablist">
  {
    stages.map((s, i) => (
      <button class:list={['stage-tab', { active: i === 0 }]} data-target={`stage-${i}`}>{s.name}</button>
    ))
  }
</div>
```

- [ ] **Step 6: 构建验证 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功（组件尚未被页面引用，仅编译校验）。

```bash
git add -A && git commit -m "feat: add standings/history table and honor text components"
```

---

## Task 6: 首页

**Files:**
- Replace: `src/pages/index.astro`

- [ ] **Step 1: 写首页**

Replace `src/pages/index.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import TeamStandingsTable from '../components/TeamStandingsTable.astro'
import { season, standings, news, schedule, teams } from '../lib/data'
import { computeTeamBoard } from '../lib/standings'

const regularStage = season.stages.find((s) => s.name === '常规赛')
const regular = standings.stages.find((s) => s.name === '常规赛')
const teamRows = computeTeamBoard(regular?.teamBoard ?? [], regularStage?.promoteRank ?? 6)
const latestNews = news.items.slice(0, 5)
---
<BaseLayout title="首页">
  <section class="intro">
    <h1>PKU M.LEAGUE</h1>
    <p>北京大学校内立直麻将团体赛官方网站 —— 赛程、积分、排名、规则与赛季档案一览。</p>
  </section>

  <h2>当前赛季（{season.season}）队伍榜</h2>
  {
    season.hasStarted && teamRows.length > 0 ? (
      <TeamStandingsTable
        stage="常规赛"
        rows={teamRows}
        teams={teams.teams}
        totalGames={regularStage?.totalGames ?? 24}
      />
    ) : (
      <p class="empty">本赛季尚未开始，排名将在第一场比赛后更新。</p>
    )
  }

  <h2>最近赛程</h2>
  {
    schedule.games.length > 0 ? (
      <ul class="news-list">
        {schedule.games.map((g) => <li><time>{g.date}</time>{g.stage} · {g.players.length} 名选手</li>)}
      </ul>
    ) : (
      <p class="empty">赛程尚未公布。</p>
    )
  }

  <h2>最新公告</h2>
  {
    latestNews.length > 0 ? (
      <ul class="news-list">
        {latestNews.map((n) => <li><time>{n.date}</time>{n.title}</li>)}
      </ul>
    ) : (
      <p class="empty">暂无公告。</p>
    )
  }
</BaseLayout>
```

- [ ] **Step 2: 构建验证**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/index.html` 显示「本赛季尚未开始」「赛程尚未公布」占位与公告。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: add homepage"
```

---

## Task 7: 积分排名页（页签切换）

**Files:**
- Create: `src/pages/standings.astro`

- [ ] **Step 1: 写积分排名页**

Create `src/pages/standings.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import StageTabs from '../components/StageTabs.astro'
import TeamStandingsTable from '../components/TeamStandingsTable.astro'
import PlayerStandingsTable from '../components/PlayerStandingsTable.astro'
import { season, standings, teams } from '../lib/data'
import { computeTeamBoard, computePlayerBoard } from '../lib/standings'
---
<BaseLayout title="积分排名">
  <h1>积分排名</h1>
  {!season.hasStarted && <p class="empty">本赛季尚未开始，排名数据将在第一场比赛后公布。</p>}

  <StageTabs stages={season.stages} />

  {
    season.stages.map((stage, i) => {
      const data = standings.stages.find((s) => s.name === stage.name)
      const teamRows = computeTeamBoard(data?.teamBoard ?? [], stage.promoteRank)
      const playerRows = computePlayerBoard(data?.playerBoard ?? [])
      return (
        <section id={`stage-${i}`} class:list={['stage-panel', { active: i === 0 }]}>
          <h2>{stage.name}</h2>
          {stage.advanceLabel && <p class="advance-note">{stage.advanceLabel}</p>}
          <h3>队伍榜</h3>
          <TeamStandingsTable
            stage={stage.name}
            rows={teamRows}
            teams={teams.teams}
            totalGames={stage.totalGames}
          />
          <h3>个人榜</h3>
          <PlayerStandingsTable rows={playerRows} teams={teams.teams} />
          <p class="as-of">{standings.asOf}</p>
        </section>
      )
    })
  }

  <script>
    document.querySelectorAll('.stage-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.stage-tab').forEach((t) => t.classList.remove('active'))
        document.querySelectorAll('.stage-panel').forEach((p) => p.classList.remove('active'))
        tab.classList.add('active')
        document.getElementById(tab.dataset.target ?? '')?.classList.add('active')
      })
    })
  </script>
</BaseLayout>
```

- [ ] **Step 2: 构建验证 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/standings.html` 含三个页签与三阶段空榜单表头。

```bash
git add -A && git commit -m "feat: add standings page with stage tabs"
```

---

## Task 8: 队伍与选手页

**Files:**
- Create: `src/pages/teams.astro`

- [ ] **Step 1: 写队伍与选手页**

Create `src/pages/teams.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import PlayerHonors from '../components/PlayerHonors.astro'
import { teams, roster, players } from '../lib/data'

const playersByName = new Map(players.players.map((p) => [p.name, p]))
const current = new Set(roster.teams.flatMap((t) => t.roster))
const alumni = players.players.filter((p) => !current.has(p.name))
---
<BaseLayout title="队伍与选手">
  <h1>队伍与选手</h1>

  <h2>当前赛季（{roster.season}）队伍</h2>
  {
    teams.teams.map((t) => {
      const r = roster.teams.find((rt) => rt.name === t.name)
      return (
        <section class="team-card">
          <h2><span class="team-dot" style={`background:${t.color}`}></span>{t.name}</h2>
          <p>
            {
              r?.roster.map((name) => {
                const p = playersByName.get(name)
                return (
                  <span class="player-chip">
                    {name}
                    {name === r.captain && <span class="captain-tag">队长</span>}
                    {p && <PlayerHonors personalHonors={p.personalHonors} teamHonors={p.teamHonors} />}
                  </span>
                )
              })
            }
          </p>
        </section>
      )
    })
  }

  <h2>往届选手</h2>
  {
    alumni.length === 0 ? (
      <p class="empty">暂无往届选手数据。</p>
    ) : (
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>选手名</th><th>荣誉</th></tr>
          </thead>
          <tbody>
            {
              alumni.map((p) => (
                <tr>
                  <td><a href={`/archive#player-${encodeURIComponent(p.name)}`}>{p.name}</a></td>
                  <td><PlayerHonors personalHonors={p.personalHonors} teamHonors={p.teamHonors} /></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    )
  }
</BaseLayout>
```

- [ ] **Step 2: 构建验证 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/teams.html` 显示 10 支队伍（含队色圆点、队长标记、荣誉徽章）与往届选手表。

```bash
git add -A && git commit -m "feat: add teams and players page"
```

---

## Task 9: 规则与章程页（原文 + 锚点索引）

**Files:**
- Create: `src/components/CharterNav.astro`
- Create: `src/pages/rules.astro`

- [ ] **Step 1: 写 CharterNav.astro（侧边栏索引）**

Create `src/components/CharterNav.astro`：

```astro
---
import type { CharterBlock } from '../lib/charter'

interface Props {
  blocks: CharterBlock[]
}

const { blocks } = Astro.props
---
<nav class="charter-nav">
  {
    blocks.map((b) => (
      <a href={b.id === '0' ? '#preamble' : `#article-${b.id}`}>{b.heading}</a>
    ))
  }
</nav>
```

- [ ] **Step 2: 写规则与章程页**

Create `src/pages/rules.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import CharterNav from '../components/CharterNav.astro'
import charterRaw from '../../PKUML章程.txt?raw'
import { splitCharter } from '../lib/charter'

const blocks = splitCharter(charterRaw)
---
<BaseLayout title="规则与章程">
  <h1>规则与章程</h1>
  <div class="charter-layout">
    <CharterNav blocks={blocks} />
    <div>
      {
        blocks.map((b) => (
          <section class="charter-block" id={b.id === '0' ? 'preamble' : `article-${b.id}`}>
            <h2>{b.heading}</h2>
            {b.content.map((line) => <p>{line}</p>)}
          </section>
        ))
      }
    </div>
  </div>
</BaseLayout>
```

- [ ] **Step 3: 构建验证 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/rules.html` 展示章程引言 + 第1-10条分块，侧边栏可跳转。

```bash
git add -A && git commit -m "feat: add rules page with charter anchors"
```

---

## Task 10: 赛程与结果页

**Files:**
- Create: `src/pages/schedule.astro`

- [ ] **Step 1: 写赛程与结果页**

Create `src/pages/schedule.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import { schedule, teams } from '../lib/data'
import { formatScore } from '../lib/standings'

const colorOf = (name: string) => teams.teams.find((t) => t.name === name)?.color ?? '#9ca3af'
---
<BaseLayout title="赛程与结果">
  <h1>赛程与结果</h1>
  {
    schedule.games.length === 0 ? (
      <p class="empty">本赛季赛程尚未公布。赛程与比赛数将在第一场比赛开始前由赛事组公布。</p>
    ) : (
      schedule.games.map((g) => (
        <section class="game-card">
          <h2>{g.stage} · {g.date}</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>顺位</th><th>队伍</th><th>选手</th><th>得分</th></tr>
              </thead>
              <tbody>
                {
                  g.players.map((p) => (
                    <tr>
                      <td class="num">{p.rank}</td>
                      <td class="team-col" style={`background:${colorOf(p.team)}`}>{p.team}</td>
                      <td>{p.name}</td>
                      <td class="num">{formatScore(p.points)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          <p>
            {g.replayUrl && <a href={g.replayUrl} target="_blank" rel="noopener">牌谱</a>}
            {g.videoUrl && <a href={g.videoUrl} target="_blank" rel="noopener">录像</a>}
          </p>
        </section>
      ))
    )
  }
</BaseLayout>
```

- [ ] **Step 2: 构建验证 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/schedule.html` 显示「赛程尚未公布」占位。

```bash
git add -A && git commit -m "feat: add schedule page"
```

---

## Task 11: 赛季档案页

**Files:**
- Create: `src/pages/archive.astro`

- [ ] **Step 1: 写赛季档案页**

Create `src/pages/archive.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro'
import PlayerHonors from '../components/PlayerHonors.astro'
import PlayerHistoryTable from '../components/PlayerHistoryTable.astro'
import { archive, players, teams } from '../lib/data'

const colorOf = (name: string) => teams.teams.find((t) => t.name === name)?.color ?? '#9ca3af'
---
<BaseLayout title="赛季档案">
  <h1>赛季档案</h1>

  {
    archive.seasons.map((s) => (
      <section class="team-card">
        <h2>{s.year}赛季</h2>
        <p>冠军队伍：<strong>{s.champion}</strong>（共 {s.finalRank.length} 队）</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>最终名次</th><th>队伍</th></tr>
            </thead>
            <tbody>
              {
                s.finalRank.map((t, i) => (
                  <tr>
                    <td class="rank">{i + 1}</td>
                    <td class="team-col" style={`background:${colorOf(t)}`}>{t}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </section>
    ))
  }

  <h2>历届选手成绩</h2>
  {
    players.players.map((p) => (
      <article class="player-card" id={`player-${p.name}`}>
        <h3>
          {p.name}
          <PlayerHonors personalHonors={p.personalHonors} teamHonors={p.teamHonors} />
        </h3>
        <PlayerHistoryTable player={p} teams={teams.teams} />
      </article>
    ))
  }
</BaseLayout>
```

- [ ] **Step 2: 构建验证 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 构建成功，`dist/archive.html` 显示三届冠军/名次表与全部选手历史成绩表。

```bash
git add -A && git commit -m "feat: add archive page with player history"
```

---

## Task 12: 完整构建与本地预览验证

**Files:** 无（验证任务）

- [ ] **Step 1: 全量构建**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build
```
Expected: 无错误，`dist/` 下生成 `index.html`、`schedule.html`、`standings.html`、`teams.html`、`rules.html`、`archive.html`。

- [ ] **Step 2: 本地预览**

Run（后台）:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run preview
```
然后浏览器打开 `http://localhost:4321`，逐页确认：
- 首页：占位文案 + 公告
- 积分排名：页签切换正常，三阶段表头正确（决赛为「一位差」）
- 队伍与选手：10 队 + 队色 + 往届选手表
- 规则与章程：侧边栏锚点跳转正常，10 条 + 引言分块
- 赛季档案：三届名次 + 选手历史表

- [ ] **Step 3: 回归测试**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm test
```
Expected: `Tests 17 passed`。

- [ ] **Step 4: 提交（如有改动）**

```bash
git add -A && git status
```
若 `git status` 干净则无需提交。

---

## Task 13: README（录入 SOP）与 Vercel 部署说明

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README.md**

Create `README.md`：

```markdown
# PKU M.LEAGUE 官方网站

北京大学校内立直麻将团体赛官网。静态站（Astro），数据全部在 `data/*.json`，部署到 Vercel。

## 常用命令

```bash
npm run dev      # 本地开发 http://localhost:4321
npm run build    # 生成静态产物到 dist/
npm run preview  # 本地预览构建产物
npm test         # 运行单元测试（榜单计算、章程分块）
```

## 数据更新 SOP

> 所有页面只读数据、渲染。改数据 → 重新 build → 部署即可，前端代码无需改动。

### 1. 录入对局（赛程与结果）
在 `data/schedule.json` 的 `games` 数组追加一条：

```json
{
  "stage": "常规赛",
  "date": "2026-09-05",
  "players": [
    { "team": "海盗", "name": "Art3mis", "rank": 1, "points": 42000 },
    { "team": "格斗", "name": "忆水", "rank": 2, "points": 18000 },
    { "team": "樱花", "name": "炸洋芋", "rank": 3, "points": -12000 },
    { "team": "火山", "name": "桃之11", "rank": 4, "points": -48000 }
  ],
  "replayUrl": "牌谱链接",
  "videoUrl": null
}
```

### 2. 更新榜单（积分排名）
在 `data/standings.json` 对应阶段的 `teamBoard` / `playerBoard` 数组维护行：

- 队伍榜行：`{ "team": "海盗", "carry": 0, "stagePoints": 0, "stageRaw": 0, "wins": { "1": 0, "2": 0, "3": 0, "4": 0 } }`
  - `carry` = 持越（常规赛填 0；半决赛/决赛 = 上阶段总积分折半）。页面「积分」列 = `carry + stagePoints`。
- 个人榜行：`{ "team": "海盗", "name": "Art3mis", "points": 0, "rawPoints": 0, "penalty": 0, "wins": { "1": 0, "2": 0, "3": 0, "4": 0 }, "maxScore": 0 }`
  - `penalty` 无则填 0（页面留空）；`maxScore` 无则填 0（页面显示 `-`）。
- 榜单行数达到赛季进度后，把 `standings.asOf` 改为「xx月xx日终了时点」；赛季结束改为「全日程终了」。

页面会自动：按积分排序、算「差 / 晋级线差 / 一位差」、平均顺位、一位率/连对率/避四率、比赛数 `x/总场数`。

### 3. 阶段配置
`data/season.json` 的 `stages[].totalGames` 为各阶段总场数（默认 24/4/2，赛季首场比赛前按赛事组公布修改）。

### 4. 往届选手数据（一般不再动）
由 `scripts/build_history.py` 从 `往届成绩excel/` 生成 `data/players_history.json`：

```bash
.venv/Scripts/python.exe scripts/build_history.py
```

### 5. 公告
在 `data/news.json` 的 `items` 数组追加 `{ "date": "2026-08-12", "title": "标题", "category": "公告", "body": "正文" }`。

## 部署（Vercel）

1. 把项目推到 GitHub 仓库（`data/`、`src/`、`docs/`、`scripts/`、`PKUML章程.txt` 一并提交；`.venv`、`node_modules`、`.astro`、`dist` 已被 .gitignore 忽略）。
2. 在 Vercel 导入该仓库：Framework Preset 选 **Astro**，Build Command `npm run build`，Output Directory `dist`。
3. 之后每次推送，Vercel 自动重新构建部署。

本地手动部署（可选）：
```bash
npm i -g vercel && vercel --prod
```
```

- [ ] **Step 2: 构建 + 测试全绿 + 提交**

Run:
```bash
cd "c:/Users/Liucw/Desktop/PKUML_online" && npm run build && npm test
```
Expected: build 成功、`Tests 17 passed`。

```bash
git add -A && git commit -m "docs: add README with data SOP and Vercel deploy"
```

---

## 自检记录

**Spec 覆盖**：6 个页面 ✓；三阶段队伍榜表头（含决赛「一位差」）✓；个人榜三阶段一致 ✓；时间标注 `asOf` ✓；选手历史成绩表 ✓；荣誉徽章（个人/队伍分开）✓；队伍列背景色 ✓；章程原文 + 锚点索引 ✓；方案A + 升级预留（JSON schema 固定）✓。

**Placeholder 检查**：无 TBD/TODO；每个文件含完整代码；数据文件内容完整（仅 `schedule.json` 对局示例以注释形式给出，文件本体为空数组，属当前赛季真实状态）。

**类型一致性**：`TeamBoardRow` 用 `carry/stagePoints/stageRaw` 统一三阶段；`ComputedTeamRow` 含 `diff/advDiff/firstDiff`；组件引用与 lib 导出名一致（`computeTeamBoard/computePlayerBoard/formatScore/formatPct/splitCharter`）。
