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

页面会自动计算：积分排序、差 / 晋级线差 / 一位差、平均顺位、一位率/连对率/避四率、比赛数 `x/总场数`。

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

1. 把项目推到 GitHub 仓库（注意 `.venv`、`node_modules`、`.astro`、`dist` 已被 .gitignore 忽略）。
2. 在 Vercel 导入该仓库：Framework Preset 选 **Astro**，Build Command `npm run build`，Output Directory `dist`。
3. 之后每次推送，Vercel 自动重新构建部署。

本地手动部署（可选）：
```bash
npm i -g vercel && vercel --prod
```
