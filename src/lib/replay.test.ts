import { describe, it, expect } from 'vitest'
import { replayGame, roundLabel, rankScores, seatLabel } from './replay'
import type { StoredRound } from './replay'

const round = (over: Partial<StoredRound>): StoredRound => ({
  order: 1,
  win_type: null,
  riichi: [false, false, false, false],
  ron_winner: null,
  ron_loser: null,
  ron_points: null,
  tsumo_winner: null,
  tsumo_points: null,
  tenpai: null,
  ...over,
})

describe('replayGame', () => {
  it('空 rounds：初始状态 东1局 25000 起', () => {
    const { current } = replayGame([])
    expect(current.round).toEqual({ wind: '东', number: 1, honba: 0 })
    expect(current.scores).toEqual([25000, 25000, 25000, 25000])
    expect(current.pool).toBe(0)
    expect(current.settled).toBe(0)
    expect(current.draft).toBeUndefined()
  })

  it('单小局荣和：累计分正确，进入下一局（东1亲家=东，子家南和牌）', () => {
    const { current, history } = replayGame([
      round({ order: 1, win_type: 'ron', ron_winner: '南', ron_loser: '北', ron_points: 1000 }),
    ])
    expect(history).toHaveLength(1)
    expect(history[0].scores).toEqual([25000, 26000, 25000, 24000])
    expect(current.round).toEqual({ wind: '东', number: 2, honba: 0 })
    expect(current.settled).toBe(1)
  })

  it('亲家连庄：局名不变本场 +1', () => {
    const { current } = replayGame([
      round({ order: 1, win_type: 'ron', ron_winner: '东', ron_loser: '北', ron_points: 1000 }),
      round({ order: 2, win_type: 'ron', ron_winner: '东', ron_loser: '南', ron_points: 2000 }),
    ])
    expect(current.round).toEqual({ wind: '东', number: 1, honba: 2 })
  })

  it('流局立直棒保留，听牌连庄判定正确（听牌1人 +3000，立直 −1000 叠加）', () => {
    const { current, history } = replayGame([
      round({ order: 1, win_type: 'draw', riichi: [false, true, false, false], tenpai: [false, true, false, false] }),
    ])
    // 南座位立直 −1000 + 听牌罚符 +3000 = 净 +2000；亲家（东）未听牌 → 推进；供托 1 保留
    expect(history[0].scores).toEqual([24000, 27000, 24000, 24000])
    expect(current.pool).toBe(1)
    expect(current.round).toEqual({ wind: '东', number: 2, honba: 1 })
  })

  it('自摸拆分回放：子家自摸 300/500（东1亲家=东，南为子家和牌）', () => {
    const { history } = replayGame([
      round({ order: 1, win_type: 'tsumo', tsumo_winner: '南', tsumo_points: [300, 500] }),
    ])
    // 东（亲家）付 500，西/北各付 300；南 +1100
    expect(history[0].scores).toEqual([24500, 26100, 24700, 24700])
  })

  it('亲家自摸：各付', () => {
    const { history } = replayGame([
      round({ order: 2, win_type: 'tsumo', tsumo_winner: '南', tsumo_points: [1000] }),
    ])
    // 东2局亲家=南：南 +3000，其余各 −1000
    expect(history[0].scores).toEqual([24000, 28000, 24000, 24000])
  })

  it('草稿局（win_type null）停止回放并返回 draft', () => {
    const { current } = replayGame([
      round({ order: 1, win_type: 'ron', ron_winner: '东', ron_loser: '北', ron_points: 1000 }),
      round({ order: 2, win_type: null, riichi: [false, false, true, false] }),
    ])
    expect(current.settled).toBe(1)
    expect(current.draft?.order).toBe(2)
    expect(current.draft?.riichi).toEqual([false, false, true, false])
    // 草稿不结算：分数停在上一局
    expect(current.scores).toEqual([26000, 25000, 25000, 24000])
  })

  it('南4 子家和牌后半庄结束：不再有下一局', () => {
    const dealers = [0, 1, 2, 3, 0, 1, 2, 3] // 东1-4、南1-4 的亲家座位
    const winners = [1, 0, 3, 0, 2, 3, 0, 1] // 每局由子家（非亲家）和牌 → 全部推进
    const rounds: StoredRound[] = winners.map((w, i) => ({
      ...round({
        order: i + 1,
        win_type: 'ron',
        ron_winner: seatLabel(w),
        ron_loser: seatLabel((w + 1) % 4),
        ron_points: 1000,
      }),
      // 校验：w 不是该局亲家
    }))
    expect(rounds.every((r, i) => r.ron_winner !== seatLabel(dealers[i]))).toBe(true)
    const { current, history } = replayGame(rounds)
    expect(history).toHaveLength(8)
    expect(history[7].round).toEqual({ wind: '南', number: 4, honba: 0 })
    expect(current.round).toEqual({ wind: '南', number: 4, honba: 0 })
    expect(current.settled).toBe(8)
  })
})

describe('roundLabel / seatLabel / rankScores', () => {
  it('局名文案', () => {
    expect(roundLabel({ wind: '东', number: 1, honba: 0 })).toBe('东1局')
    expect(roundLabel({ wind: '南', number: 3, honba: 2 })).toBe('南3局 2本场')
  })
  it('座位文案', () => {
    expect(seatLabel(0)).toBe('东')
    expect(seatLabel(3)).toBe('北')
  })
  it('位次：分数降序，同分按座位序', () => {
    expect(rankScores([26000, 30000, 24000, 25000])).toEqual([2, 1, 4, 3])
    expect(rankScores([25000, 25000, 25000, 25000])).toEqual([1, 2, 3, 4])
  })
})
