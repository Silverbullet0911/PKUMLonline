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
  id?: string
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
  /** 单场积分（素点+顺位点，可被录入人手动编辑）；缺省时按同分平分规则计算 */
  pt?: number
  /** 判罚（计入个人与队伍积分，不计入素点/场次 pt）；缺省 0 */
  penalty?: number
}

export interface Game {
  id?: string
  stage: string
  date: string
  round?: string
  time?: string
  /** 直播状态：'直播' / '非直播'；缺省（待定）时前台不显示 */
  liveStatus?: '直播' | '非直播'
  status: 'finished' | 'upcoming'
  seats: GameSeat[]
  replayUrl?: string
  videoUrl?: string
}

// 点数表（data/points_table.json）：子家/亲家 × 荣和/自摸
export interface PointsTier {
  key: string
  label: string
  hanRange: string
  childRon: number
  childTsumo: [number, number] // [子付, 亲付]
  dealerRon: number
  dealerTsumo: [number] // 各付
}

export interface PointsCell {
  ron: number
  tsumo: number[] // 子家 [子付, 亲付]；亲家 [各付]
}

export interface PointsTable {
  note?: string
  tiers: PointsTier[]
  grid: {
    child: Record<string, Record<string, PointsCell | null>>
    dealer: Record<string, Record<string, PointsCell | null>>
  }
}
