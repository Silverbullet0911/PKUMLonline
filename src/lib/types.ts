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

export interface GameSeat {
  seat: string
  team: string
  name?: string
  rank?: number
  points?: number
}

export interface Game {
  stage: string
  date: string
  round?: string
  status: 'finished' | 'upcoming'
  seats: GameSeat[]
  replayUrl?: string
  videoUrl?: string
}
