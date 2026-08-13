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
  const linePoints = promoteRank > 0 && sorted.length >= promoteRank ? sorted[promoteRank - 1].points : null
  const firstOutPoints = promoteRank > 0 && sorted.length > promoteRank ? sorted[promoteRank].points : null
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
      advDiff: linePoints == null || firstOutPoints == null
        ? null
        : round1(i < promoteRank ? r.points - firstOutPoints : r.points - linePoints),
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
