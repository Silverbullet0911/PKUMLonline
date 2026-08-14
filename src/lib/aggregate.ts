import type { Game, PlayerBoardRow, TeamBoardRow, Wins } from './types'
import { round1 } from './standings'

/**
 * 榜单聚合：从完赛半庄（seats 含 rank/points）聚合出队伍榜/个人榜的原始行，
 * 供浏览器端 DB 现算（前端显示模式不变：页面渲染仍走 computeTeamBoard / computePlayerBoard）。
 *
 * 计分约定（已由赛事组确认，2026-08-14）：
 * - 起手 25000 点；单场素点 raw = (最终得分 − 25000) / 1000，保留 1 位小数
 * - 单场队伍/个人积分 = 素点 + 顺位点
 * - 顺位点：1位 +45 / 2位 +5 / 3位 −15 / 4位 −35（和为 0，每场总分严格归零）
 * - 持越 = 上一阶段队伍总积分折半（章程第 0 条「分数折半持越」）
 * - 判罚：个人积分中扣除（penalty 为负值时相加），数据来源待定，先用 penaltyOf 回调注入
 */

export const RANK_POINTS: Record<'1' | '2' | '3' | '4', number> = {
  '1': 45,
  '2': 5,
  '3': -15,
  '4': -35,
}

/** 单场素点：(最终得分 − 25000) / 1000 */
export function rawScoreOf(points: number): number {
  return round1((points - 25000) / 1000)
}

/**
 * 顺位点（同分平分）：同分者平分所占位次的顺位点。
 * 例：26000/25000/25000/24000 → [45, -5, -5, -35]；全员同分 → [0,0,0,0]
 */
export function rankPointsForScores(scores: number[]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s)
  const pts = new Array<number>(scores.length).fill(0)
  let i = 0
  while (i < scores.length) {
    let j = i
    while (j + 1 < scores.length && order[j + 1].s === order[i].s) j++
    let sum = 0
    for (let k = i; k <= j; k++) sum += RANK_POINTS[String(k + 1) as keyof typeof RANK_POINTS]
    const avg = round1(sum / (j - i + 1))
    for (let k = i; k <= j; k++) pts[order[k].i] = avg
    i = j + 1
  }
  return pts
}

/**
 * 竞争位次（同分同位）：26000/25000/25000/24000 → [1,2,2,4]；全员同分 → [1,1,1,1]
 */
export function competitionRanks(scores: number[]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s)
  const ranks = new Array<number>(scores.length).fill(0)
  let i = 0
  while (i < scores.length) {
    let j = i
    while (j + 1 < scores.length && order[j + 1].s === order[i].s) j++
    const r = i + 1
    for (let k = i; k <= j; k++) ranks[order[k].i] = r
    i = j + 1
  }
  return ranks
}

/** 单场某家积分 = 素点 + 顺位点（同分平分） */
export function seatGamePoints(scores: number[], seat: number): number {
  return round1(rawScoreOf(scores[seat]) + rankPointsForScores(scores)[seat])
}

/** 聚合队伍榜：传入某阶段全部完赛对局；carryOf 给出各队持越（默认 0） */
export function aggregateTeamBoard(
  games: Game[],
  carryOf: (team: string) => number = () => 0,
): TeamBoardRow[] {
  const map = new Map<string, TeamBoardRow>()
  for (const g of games) {
    if (g.status !== 'finished' || g.seats.length !== 4) continue
    const scores = g.seats.map((s) => s.points)
    if (scores.some((p) => p == null)) continue
    const rp = rankPointsForScores(scores as number[])
    const ranks = competitionRanks(scores as number[])
    g.seats.forEach((s, i) => {
      if (!s.team) return
      const row = map.get(s.team) ?? {
        team: s.team,
        carry: 0,
        stagePoints: 0,
        stageRaw: 0,
        wins: { '1': 0, '2': 0, '3': 0, '4': 0 },
      }
      // 积分：优先用录入人确认的 pt，否则按同分平分规则现算；判罚并入队伍积分
      const pts = s.pt != null ? s.pt : round1(rawScoreOf(scores[i]!) + rp[i])
      const pen = s.penalty ?? 0
      row.stagePoints = round1(row.stagePoints + pts + pen)
      row.stageRaw = round1(row.stageRaw + rawScoreOf(scores[i]!))
      // 位次统计：优先用存储的 rank（录入人可手动选），否则按分数推导
      const r = String(s.rank ?? ranks[i]) as keyof Wins
      if (r in row.wins) row.wins[r]++
      map.set(s.team, row)
    })
  }
  return [...map.values()].map((r) => ({ ...r, carry: round1(carryOf(r.team)) }))
}

/** 聚合个人榜：传入某阶段全部完赛对局；penaltyOf 给出各选手判罚（默认 0，负值表示扣分） */
export function aggregatePlayerBoard(
  games: Game[],
  penaltyOf: (name: string) => number = () => 0,
): PlayerBoardRow[] {
  const map = new Map<string, PlayerBoardRow>()
  for (const g of games) {
    if (g.status !== 'finished' || g.seats.length !== 4) continue
    const scores = g.seats.map((s) => s.points)
    if (scores.some((p) => p == null)) continue
    const rp = rankPointsForScores(scores as number[])
    const ranks = competitionRanks(scores as number[])
    g.seats.forEach((s, i) => {
      if (!s.name) return
      const row = map.get(s.name) ?? {
        team: s.team,
        name: s.name,
        points: 0,
        rawPoints: 0,
        penalty: 0,
        wins: { '1': 0, '2': 0, '3': 0, '4': 0 },
        maxScore: 0,
      }
      row.rawPoints = round1(row.rawPoints + rawScoreOf(scores[i]!))
      const pts = s.pt != null ? s.pt : round1(rawScoreOf(scores[i]!) + rp[i])
      const pen = s.penalty ?? 0
      row.penalty = round1(row.penalty + pen)
      row.points = round1(row.points + pts + pen)
      const r = String(s.rank ?? ranks[i]) as keyof Wins
      if (r in row.wins) row.wins[r]++
      if (scores[i]! > row.maxScore) row.maxScore = scores[i]!
      map.set(s.name, row)
    })
  }
  return [...map.values()].map((r) => {
    // 座位级判罚（每场每选手）已累加进 r.penalty；penaltyOf 为额外的全局判罚（如赛季级）
    const penalty = round1(r.penalty + penaltyOf(r.name))
    return { ...r, penalty, points: round1(r.points + penaltyOf(r.name)) }
  })
}

/** 某阶段各队总积分（供下一阶段算持越） */
export function stageTeamTotals(games: Game[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const g of games) {
    if (g.status !== 'finished' || g.seats.length !== 4) continue
    const scores = g.seats.map((s) => s.points)
    if (scores.some((p) => p == null)) continue
    const rp = rankPointsForScores(scores as number[])
    g.seats.forEach((s, i) => {
      if (!s.team) return
      const pts = s.pt != null ? s.pt : round1(rawScoreOf(scores[i]!) + rp[i])
      const pen = s.penalty ?? 0
      totals.set(s.team, round1((totals.get(s.team) ?? 0) + pts + pen))
    })
  }
  return totals
}

/** 由上一阶段总积分生成持越回调：carry = 上阶段总分 / 2 */
export function carryFrom(totals: Map<string, number>): (team: string) => number {
  return (team) => round1((totals.get(team) ?? 0) / 2)
}
