import teamsRaw from '../../data/teams.json'
import rosterRaw from '../../data/current_roster.json'
import playersRaw from '../../data/players_history.json'
import seasonRaw from '../../data/season.json'
import standingsRaw from '../../data/standings.json'
import scheduleRaw from '../../data/schedule.json'
import newsRaw from '../../data/news.json'
import archiveRaw from '../../data/archive.json'

import type { Game, NewsItem, PlayerRecord, RosterTeam, StageConfig, StageStandings, TeamInfo } from './types'

export const teams = teamsRaw as { teams: TeamInfo[] }
export const roster = rosterRaw as { season: string; status: string; teams: RosterTeam[]; pendingNominations: string[] }
export const players = playersRaw as { players: PlayerRecord[] }
export const season = seasonRaw as { season: string; hasStarted: boolean; stages: StageConfig[] }
export const standings = standingsRaw as { season: string; asOf: string; stages: StageStandings[] }
export const schedule = scheduleRaw as { season: string; games: Game[] }
export const news = newsRaw as { items: NewsItem[] }
export const archive = archiveRaw as { seasons: { year: string; finalRank: string[]; champion: string }[] }

const LIGHT_TEAMS = new Set(['樱花', '雷电', '赤坂'])
export function teamText(name: string): string {
  return LIGHT_TEAMS.has(name) ? '#1f2328' : '#fff'
}
