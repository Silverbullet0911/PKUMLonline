import { dealerSeat, nextRound, settleRound } from './scoring'
import type { RoundResult, RoundState, Settlement } from './scoring'
import { SEAT_ORDER, seatIndexOf } from './games'

/** DB rounds 行（tsumo_points 为 jsonb 拆分数组） */
export interface StoredRound {
  order: number
  win_type: 'ron' | 'tsumo' | 'draw' | null
  riichi: boolean[]
  ron_winner: string | null
  ron_loser: string | null
  ron_points: number | null
  tsumo_winner: string | null
  tsumo_points: number[] | null
  tenpai: boolean[] | null
}

export interface RoundHistory {
  order: number
  /** 该小局结算时的局状态（局名/本场） */
  round: RoundState
  result: RoundResult
  /** 结算后四家累计分数 */
  scores: number[]
  /** 结算后供托棒数 */
  pool: number
  /** 本小局各家的增减 */
  deltas: number[]
}

export interface ReplayState {
  /** 当前待录/下一局状态 */
  round: RoundState
  /** 四家累计分数（初始 25000） */
  scores: number[]
  /** 当前供托棒数 */
  pool: number
  /** 已结算小局数 */
  settled: number
  /** 未完成的草稿局（若有，可继续补全） */
  draft?: StoredRound
}

export interface ReplayResult {
  current: ReplayState
  history: RoundHistory[]
}

function buildRoundResult(r: StoredRound, state: RoundState): RoundResult {
  const riichi = r.riichi ?? [false, false, false, false]
  if (r.win_type === 'ron') {
    return {
      winType: 'ron',
      riichi,
      winner: seatIndexOf(r.ron_winner ?? ''),
      loser: seatIndexOf(r.ron_loser ?? ''),
      ronPoints: r.ron_points ?? 0,
    }
  }
  if (r.win_type === 'tsumo') {
    const w = seatIndexOf(r.tsumo_winner ?? '')
    const split = r.tsumo_points ?? []
    const pays = [0, 0, 0, 0]
    if (split.length === 1) {
      for (let i = 0; i < 4; i++) if (i !== w) pays[i] = split[0]
    } else {
      const d = dealerSeat(state)
      for (let i = 0; i < 4; i++) {
        if (i === w) continue
        pays[i] = i === d ? (split[1] ?? split[0]) : split[0]
      }
    }
    return { winType: 'tsumo', riichi, winner: w, tsumoPayments: pays }
  }
  return { winType: 'draw', riichi, tenpai: r.tenpai ?? [false, false, false, false] }
}

/**
 * 从头回放一场半庄：按 order 逐小局结算，累积四家分数与供托池。
 * 遇到未完成（win_type 为 null）的草稿局即停，返回当前局状态供继续录入。
 */
export function replayGame(rounds: StoredRound[], startScore = 25000): ReplayResult {
  const sorted = [...rounds].sort((a, b) => a.order - b.order)
  let state: RoundState = { wind: '东', number: 1, honba: 0 }
  let scores = [startScore, startScore, startScore, startScore]
  let pool = 0
  const history: RoundHistory[] = []
  let settled = 0
  let draft: StoredRound | undefined

  for (const r of sorted) {
    if (!r.win_type) {
      draft = r
      break
    }
    const result = buildRoundResult(r, state)
    const s: Settlement = settleRound(state, result, pool)
    scores = scores.map((v, i) => v + s.deltas[i])
    pool = s.poolAfter
    history.push({ order: r.order, round: { ...state }, result, scores: [...scores], pool, deltas: s.deltas })
    settled++
    const next = nextRound(state, result)
    if (!next) break // 半庄结束（南四推进）
    state = next
  }

  return {
    current: { round: state, scores, pool, settled, draft },
    history,
  }
}

/** 局名文案：如「东1局」/「南3局」，含本场数 */
export function roundLabel(round: RoundState): string {
  return `${round.wind}${round.number}局${round.honba > 0 ? ` ${round.honba}本场` : ''}`
}

/** 座位序 → 东南西北（供 UI 显示） */
export function seatLabel(i: number): string {
  return SEAT_ORDER[i] ?? '?'
}

/** 由四家最终分数计算位次（1-4）：分数降序，同分按座位序（东→北） */
export function rankScores(scores: number[]): number[] {
  const order = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
  const ranks = [0, 0, 0, 0]
  order.forEach((o, idx) => { ranks[o.i] = idx + 1 })
  return ranks
}
