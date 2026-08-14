import { describe, it, expect } from 'vitest'
import {
  aggregateTeamBoard, aggregatePlayerBoard, stageTeamTotals, carryFrom,
  rawScoreOf, gamePointsOf,
} from './aggregate'
import type { Game } from './types'

const finishedGame = (overrides: Partial<Game> = {}): Game => ({
  stage: '常规赛',
  date: '2026-09-01',
  round: '第1半庄',
  status: 'finished',
  seats: [
    { seat: '东', team: '格斗', name: '忆水', rank: 1, points: 42000 },
    { seat: '南', team: '海盗', name: 'Art3mis', rank: 2, points: 21000 },
    { seat: '西', team: '樱花', name: '炸洋芋', rank: 3, points: -5000 },
    { seat: '北', team: '火山', name: '桃之11', rank: 4, points: -28000 },
  ],
  ...overrides,
})

describe('rawScoreOf / gamePointsOf', () => {
  it('素点 = (得分-30000)/1000', () => {
    expect(rawScoreOf(42000)).toBe(12)
    expect(rawScoreOf(21000)).toBe(-9)
    expect(rawScoreOf(-5000)).toBe(-35)
  })
  it('积分 = 素点 + uma(50/10/-10/-30)', () => {
    expect(gamePointsOf(1, 42000)).toBe(62)
    expect(gamePointsOf(2, 21000)).toBe(1)
    expect(gamePointsOf(3, -5000)).toBe(-45)
    expect(gamePointsOf(4, -28000)).toBe(-88)
  })
  it('points 缺失时积分为 0', () => {
    expect(gamePointsOf(1, undefined)).toBe(0)
  })
})

describe('aggregateTeamBoard', () => {
  it('单场按队伍聚合 stagePoints/stageRaw/wins', () => {
    const board = aggregateTeamBoard([finishedGame()])
    const by = new Map(board.map((r) => [r.team, r]))
    expect(by.get('格斗')).toMatchObject({ carry: 0, stagePoints: 62, stageRaw: 12, wins: { '1': 1, '2': 0, '3': 0, '4': 0 } })
    expect(by.get('海盗')).toMatchObject({ stagePoints: 1, stageRaw: -9, wins: { '2': 1 } })
    expect(by.get('火山')).toMatchObject({ stagePoints: -88, stageRaw: -58, wins: { '4': 1 } })
  })
  it('跨多场累加积分与位次', () => {
    const g2: Game = finishedGame({
      round: '第2半庄',
      seats: [
        { seat: '东', team: '格斗', name: '忆水', rank: 2, points: 21000 },
        { seat: '南', team: '海盗', name: 'Art3mis', rank: 1, points: 46000 },
        { seat: '西', team: '樱花', name: '炸洋芋', rank: 4, points: -20000 },
        { seat: '北', team: '火山', name: '桃之11', rank: 3, points: 3000 },
      ],
    })
    const board = aggregateTeamBoard([finishedGame(), g2])
    const by = new Map(board.map((r) => [r.team, r]))
    // 格斗：62 + (素点-9 + uma10=1) = 63；raw 12 + (-9) = 3；wins {1:1, 2:1}
    expect(by.get('格斗')).toMatchObject({ stagePoints: 63, stageRaw: 3, wins: { '1': 1, '2': 1, '3': 0, '4': 0 } })
    // 海盗：1 + (素点16 + uma50=66) = 67；wins {1:1, 2:1}
    expect(by.get('海盗')).toMatchObject({ stagePoints: 67, wins: { '1': 1, '2': 1 } })
  })
  it('carryOf 注入持越', () => {
    const board = aggregateTeamBoard([finishedGame()], () => 31)
    expect(board.find((r) => r.team === '格斗')?.carry).toBe(31)
  })
  it('未完赛对局被忽略', () => {
    const board = aggregateTeamBoard([{ ...finishedGame(), status: 'upcoming' }])
    expect(board).toEqual([])
  })
  it('空输入返回空数组', () => {
    expect(aggregateTeamBoard([])).toEqual([])
  })
})

describe('aggregatePlayerBoard', () => {
  it('按选手聚合 points/rawPoints/wins/maxScore', () => {
    const board = aggregatePlayerBoard([finishedGame()])
    const by = new Map(board.map((r) => [r.name, r]))
    expect(by.get('忆水')).toMatchObject({ team: '格斗', points: 62, rawPoints: 12, penalty: 0, wins: { '1': 1 }, maxScore: 42000 })
    expect(by.get('桃之11')).toMatchObject({ points: -88, rawPoints: -58, wins: { '4': 1 }, maxScore: 0 })
  })
  it('跨多场累加', () => {
    const g2: Game = finishedGame({
      round: '第2半庄',
      seats: [
        { seat: '东', team: '格斗', name: '忆水', rank: 1, points: 42000 },
        { seat: '南', team: '海盗', name: 'Art3mis', rank: 2, points: 21000 },
        { seat: '西', team: '樱花', name: '炸洋芋', rank: 3, points: -5000 },
        { seat: '北', team: '火山', name: '桃之11', rank: 4, points: -28000 },
      ],
    })
    const board = aggregatePlayerBoard([finishedGame(), g2])
    expect(board.find((r) => r.name === '忆水')).toMatchObject({ points: 124, rawPoints: 24, wins: { '1': 2 }, maxScore: 42000 })
  })
  it('penalty 计入个人积分（负值扣分）', () => {
    const board = aggregatePlayerBoard([finishedGame()], (name) => (name === '忆水' ? -20 : 0))
    expect(board.find((r) => r.name === '忆水')?.points).toBe(42)
    expect(board.find((r) => r.name === '忆水')?.penalty).toBe(-20)
  })
  it('空输入返回空数组', () => {
    expect(aggregatePlayerBoard([])).toEqual([])
  })
})

describe('stageTeamTotals / carryFrom', () => {
  it('阶段总积分按队伍汇总', () => {
    const totals = stageTeamTotals([finishedGame()])
    expect(totals.get('格斗')).toBe(62)
    expect(totals.get('海盗')).toBe(1)
  })
  it('持越 = 上阶段总分折半', () => {
    const totals = stageTeamTotals([finishedGame()])
    const carry = carryFrom(totals)
    expect(carry('格斗')).toBe(31)
    expect(carry('海盗')).toBe(0.5)
    expect(carry('未参赛队伍')).toBe(0)
  })
})
