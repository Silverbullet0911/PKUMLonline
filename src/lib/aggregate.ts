import type { Game, PlayerBoardRow, TeamBoardRow, Wins } from './types'
import { round1 } from './standings'

/**
 * 榜单聚合：从完赛半庄（seats 含 rank/points）聚合出队伍榜/个人榜的原始行，
 * 供浏览器端 DB 现算（前端显示模式不变：页面渲染仍走 computeTeamBoard / computePlayerBoard）。
 *
 * 计分约定（⚠️ 待赛事组确认，2026-08-14）：
 * - 单场素点 raw = (最终得分 − 30000) / 1000，保留 1 位小数
 * - 单场队伍/个人积分 = 素点 + 顺位加棒（uma）
 * - 顺位加棒暂按 M.LEAGUE 惯例 +50/+10/−10/−30；章程未规定，如赛事组采用其他数值改 UMA 即可
 * - 持越 = 上一阶段队伍总积分折半（章程第 0 条「分数折半持越」）
 * - 判罚：个人积分中扣除（penalty 为负值时相加），数据来源待定，先用 penaltyOf 回调注入
 */

export const UMA: Record<'1' | '2' | '3' | '4', number> = {
  '1': 50,
  '2': 10,
  '3': -10,
  '4': -30,
}

/** 单场素点：(最终得分 − 30000) / 1000 */
export function rawScoreOf(points: number): number {
  return round1((points - 30000) / 1000)
}

/** 单场积分 = 素点 + 顺位加棒；rank 缺失或非法时加棒按 0 计 */
export function gamePointsOf(rank: number | undefined, points: number | undefined): number {
  if (points == null) return 0
  const uma = rank != null ? (UMA[String(rank) as keyof typeof UMA] ?? 0) : 0
  return round1(rawScoreOf(points) + uma)
}

/** 聚合队伍榜：传入某阶段全部完赛对局；carryOf 给出各队持越（默认 0） */
export function aggregateTeamBoard(
  games: Game[],
  carryOf: (team: string) => number = () => 0,
): TeamBoardRow[] {
  const map = new Map<string, TeamBoardRow>()
  for (const g of games) {
    if (g.status !== 'finished') continue
    for (const s of g.seats) {
      if (!s.team || s.points == null) continue
      const row = map.get(s.team) ?? {
        team: s.team,
        carry: 0,
        stagePoints: 0,
        stageRaw: 0,
        wins: { '1': 0, '2': 0, '3': 0, '4': 0 },
      }
      row.stagePoints = round1(row.stagePoints + gamePointsOf(s.rank, s.points))
      row.stageRaw = round1(row.stageRaw + rawScoreOf(s.points))
      const r = String(s.rank) as keyof Wins
      if (r in row.wins) row.wins[r]++
      map.set(s.team, row)
    }
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
    if (g.status !== 'finished') continue
    for (const s of g.seats) {
      if (!s.name || s.points == null) continue
      const row = map.get(s.name) ?? {
        team: s.team,
        name: s.name,
        points: 0,
        rawPoints: 0,
        penalty: 0,
        wins: { '1': 0, '2': 0, '3': 0, '4': 0 },
        maxScore: 0,
      }
      row.rawPoints = round1(row.rawPoints + rawScoreOf(s.points))
      row.points = round1(row.points + gamePointsOf(s.rank, s.points))
      const r = String(s.rank) as keyof Wins
      if (r in row.wins) row.wins[r]++
      if (s.points > row.maxScore) row.maxScore = s.points
      map.set(s.name, row)
    }
  }
  return [...map.values()].map((r) => {
    const penalty = penaltyOf(r.name)
    return { ...r, penalty, points: round1(r.points + penalty) }
  })
}

/** 某阶段各队总积分（供下一阶段算持越） */
export function stageTeamTotals(games: Game[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const g of games) {
    if (g.status !== 'finished') continue
    for (const s of g.seats) {
      if (!s.team || s.points == null) continue
      totals.set(s.team, round1((totals.get(s.team) ?? 0) + gamePointsOf(s.rank, s.points)))
    }
  }
  return totals
}

/** 由上一阶段总积分生成持越回调：carry = 上阶段总分 / 2 */
export function carryFrom(totals: Map<string, number>): (team: string) => number {
  return (team) => round1((totals.get(team) ?? 0) / 2)
}
