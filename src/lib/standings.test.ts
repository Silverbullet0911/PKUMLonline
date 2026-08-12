import { describe, it, expect } from 'vitest'
import { avgRank, rate, formatPct, formatScore, computeTeamBoard, computePlayerBoard } from './standings'
import type { PlayerBoardRow, TeamBoardRow } from './types'

describe('avgRank', () => {
  it('计算加权平均顺位', () => {
    const w = { '1': 1, '2': 2, '3': 1, '4': 0 }
    expect(avgRank(w, 4)).toBe(2)
  })
  it('无比赛时返回 null', () => {
    expect(avgRank({ '1': 0, '2': 0, '3': 0, '4': 0 }, 0)).toBeNull()
  })
})

describe('rate', () => {
  it('计算比率', () => {
    expect(rate(2, 4)).toBe(0.5)
  })
  it('无比赛时返回 null', () => {
    expect(rate(0, 0)).toBeNull()
  })
})

describe('formatPct', () => {
  it('比率转百分比字符串', () => {
    expect(formatPct(0.8333)).toBe('83.3%')
  })
  it('null 显示 -', () => {
    expect(formatPct(null)).toBe('-')
  })
})

describe('formatScore', () => {
  it('整数不带小数点', () => {
    expect(formatScore(42000)).toBe('42000')
  })
  it('小数保留一位', () => {
    expect(formatScore(-89.3)).toBe('-89.3')
  })
  it('null 显示 -', () => {
    expect(formatScore(null)).toBe('-')
  })
})

describe('computeTeamBoard', () => {
  const rows: TeamBoardRow[] = [
    { team: '海盗', carry: 0, stagePoints: 120, stageRaw: 1000, wins: { '1': 5, '2': 3, '3': 2, '4': 2 } },
    { team: '格斗', carry: 0, stagePoints: 90, stageRaw: 2000, wins: { '1': 4, '2': 4, '3': 3, '4': 1 } },
    { team: '樱花', carry: 0, stagePoints: 120, stageRaw: 800, wins: { '1': 5, '2': 2, '3': 3, '4': 2 } },
  ]
  it('按积分降序、素点降序排序', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board.map(r => r.team)).toEqual(['海盗', '樱花', '格斗'])
  })
  it('计算与上一名的差（第1名为 -）', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board[0].diff).toBeNull()
    expect(board[1].diff).toBe(0)
    expect(board[2].diff).toBe(30)
  })
  it('计算与晋级线名次的差', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board[0].advDiff).toBe(0)
    expect(board[1].advDiff).toBe(0)
    expect(board[2].advDiff).toBe(-30)
  })
  it('计算与第1名的差（第1名为 -）', () => {
    const board = computeTeamBoard(rows, 2)
    expect(board[0].firstDiff).toBeNull()
    expect(board[1].firstDiff).toBe(0)
    expect(board[2].firstDiff).toBe(-30)
  })
  it('积分 = 持越 + 本阶段积分', () => {
    const withCarry: TeamBoardRow[] = [
      { team: '海盗', carry: 50, stagePoints: 70, stageRaw: 100, wins: { '1': 1, '2': 0, '3': 0, '4': 0 } },
    ]
    const board = computeTeamBoard(withCarry, 0)
    expect(board[0].points).toBe(120)
  })
  it('空数组返回空数组', () => {
    expect(computeTeamBoard([], 6)).toEqual([])
  })
})

describe('computePlayerBoard', () => {
  const rows: PlayerBoardRow[] = [
    { team: '海盗', name: '甲', points: 50, rawPoints: 300, penalty: 0, wins: { '1': 2, '2': 1, '3': 0, '4': 1 }, maxScore: 40000 },
    { team: '格斗', name: '乙', points: 80, rawPoints: 200, penalty: 5, wins: { '1': 3, '2': 0, '3': 1, '4': 0 }, maxScore: 45000 },
  ]
  it('按积分降序排序', () => {
    const board = computePlayerBoard(rows)
    expect(board.map(r => r.name)).toEqual(['乙', '甲'])
  })
  it('计算平均顺位、一位率、连对率、避四率', () => {
    const board = computePlayerBoard(rows)
    const a = board[1]
    expect(a.avgRank).toBe(2)
    expect(a.winRate).toBe(0.5)
    expect(a.pairRate).toBe(0.75)
    expect(a.avoidRate).toBe(0.75)
  })
  it('比赛数由位次次数求和', () => {
    const board = computePlayerBoard(rows)
    expect(board[1].games).toBe(4)
  })
})
