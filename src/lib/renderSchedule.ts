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
