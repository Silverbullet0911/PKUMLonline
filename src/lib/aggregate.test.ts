import { describe, it, expect } from 'vitest'
import {
  aggregateTeamBoard, aggregatePlayerBoard, stageTeamTotals, carryFrom,
  rawScoreOf, rankPointsForScores, competitionRanks, seatGamePoints,
} from './aggregate'
import { round1 } from './standings'
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

describe('rawScoreOf / rankPointsForScores / seatGamePoints', () => {
  it('素点 = (得分-25000)/1000', () => {
    expect(rawScoreOf(42000)).toBe(17)
    expect(rawScoreOf(21000)).toBe(-4)
    expect(rawScoreOf(-5000)).toBe(-30)
  })
  it('顺位点无同分时按 45/5/-15/-35', () => {
    expect(rankPointsForScores([42000, 21000, -5000, -28000])).toEqual([45, 5, -15, -35])
  })
  it('同分平分顺位点：26000/25000/25000/24000 → 两个 25000 各 -5', () => {
    expect(rankPointsForScores([26000, 25000, 25000, 24000])).toEqual([45, -5, -5, -35])
  })
  it('全员同分：顺位点均为 0', () => {
    expect(rankPointsForScores([25000, 25000, 25000, 25000])).toEqual([0, 0, 0, 0])
  })
  it('三人同分：平分前三位顺位点', () => {
    expect(rankPointsForScores([28000, 25000, 25000, 25000])).toEqual([45, round1((5 - 15 - 35) / 3), round1((5 - 15 - 35) / 3), round1((5 - 15 - 35) / 3)])
  })
  it('各种同分情况：1134 / 1114 / 1222', () => {
    // 1134：前两名同分
    expect(competitionRanks([26000, 26000, 25000, 24000])).toEqual([1, 1, 3, 4])
    expect(rankPointsForScores([26000, 26000, 25000, 24000])).toEqual([25, 25, -15, -35])
    // 1114：前三名同分
    expect(competitionRanks([26000, 26000, 26000, 24000])).toEqual([1, 1, 1, 4])
    expect(rankPointsForScores([26000, 26000, 26000, 24000])).toEqual([round1(35 / 3), round1(35 / 3), round1(35 / 3), -35])
    // 1222：后三名同分
    expect(competitionRanks([26000, 25000, 25000, 25000])).toEqual([1, 2, 2, 2])
    expect(rankPointsForScores([26000, 25000, 25000, 25000])).toEqual([45, -15, -15, -15])
  })
  it('单场积分 = 素点 + 顺位点（同分平分）', () => {
    expect(seatGamePoints([26000, 25000, 25000, 24000], 0)).toBe(46)
    expect(seatGamePoints([26000, 25000, 25000, 24000], 1)).toBe(-5)
    expect(seatGamePoints([26000, 25000, 25000, 24000], 2)).toBe(-5)
    expect(seatGamePoints([26000, 25000, 25000, 24000], 3)).toBe(-36)
  })
})

describe('competitionRanks', () => {
  it('无同分按分数降序', () => {
    expect(competitionRanks([26000, 30000, 24000, 25000])).toEqual([2, 1, 4, 3])
  })
  it('同分同位', () => {
    expect(competitionRanks([26000, 25000, 25000, 24000])).toEqual([1, 2, 2, 4])
    expect(competitionRanks([25000, 25000, 25000, 25000])).toEqual([1, 1, 1, 1])
  })
})

describe('aggregateTeamBoard', () => {
  it('单场按队伍聚合 stagePoints/stageRaw/wins', () => {
    const board = aggregateTeamBoard([finishedGame()])
    const by = new Map(board.map((r) => [r.team, r]))
    expect(by.get('格斗')).toMatchObject({ carry: 0, stagePoints: 62, stageRaw: 17, wins: { '1': 1, '2': 0, '3': 0, '4': 0 } })
    expect(by.get('海盗')).toMatchObject({ stagePoints: 1, stageRaw: -4, wins: { '2': 1 } })
    expect(by.get('火山')).toMatchObject({ stagePoints: -88, stageRaw: -53, wins: { '4': 1 } })
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
    // 格斗：62 + (素点-4 + 顺位点5=1) = 63；raw 17 + (-4) = 13；wins {1:1, 2:1}
    expect(by.get('格斗')).toMatchObject({ stagePoints: 63, stageRaw: 13, wins: { '1': 1, '2': 1, '3': 0, '4': 0 } })
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
  it('存储的 pt 优先于自动计算，素点仍按分数推导', () => {
    const g: Game = finishedGame({
      seats: [
        { seat: '东', team: '格斗', name: '忆水', rank: 1, points: 42000, pt: 100 },
        { seat: '南', team: '海盗', name: 'Art3mis', rank: 2, points: 21000, pt: -50 },
        { seat: '西', team: '樱花', name: '炸洋芋', rank: 3, points: -5000, pt: -30 },
        { seat: '北', team: '火山', name: '桃之11', rank: 4, points: -28000, pt: -20 },
      ],
    })
    const board = aggregateTeamBoard([g])
    const by = new Map(board.map((r) => [r.team, r]))
    expect(by.get('格斗')?.stagePoints).toBe(100)
    expect(by.get('火山')?.stagePoints).toBe(-20)
    expect(by.get('格斗')?.stageRaw).toBe(17)
    const pb = aggregatePlayerBoard([g])
    expect(pb.find((r) => r.name === '忆水')?.points).toBe(100)
    expect(pb.find((r) => r.name === '桃之11')?.points).toBe(-20)
  })
  it('判罚计入个人与队伍积分，不计入素点；位次统计用存储 rank', () => {
    const g: Game = finishedGame({
      seats: [
        { seat: '东', team: '格斗', name: '忆水', rank: 1, points: 42000, pt: 62, penalty: -20 },
        { seat: '南', team: '海盗', name: 'Art3mis', rank: 2, points: 21000, pt: 1 },
        { seat: '西', team: '樱花', name: '炸洋芋', rank: 3, points: -5000, pt: -45 },
        { seat: '北', team: '火山', name: '桃之11', rank: 4, points: -28000, pt: -88, penalty: -5 },
      ],
    })
    const board = aggregateTeamBoard([g])
    const by = new Map(board.map((r) => [r.team, r]))
    // 队伍积分含判罚：格斗 62 + (-20) = 42；素点不含判罚
    expect(by.get('格斗')?.stagePoints).toBe(42)
    expect(by.get('格斗')?.stageRaw).toBe(17)
    expect(by.get('火山')?.stagePoints).toBe(-93)
    const pb = aggregatePlayerBoard([g])
    const 忆水 = pb.find((r) => r.name === '忆水')!
    expect(忆水.points).toBe(42)
    expect(忆水.rawPoints).toBe(17)
    expect(忆水.penalty).toBe(-20)
    const 桃之11 = pb.find((r) => r.name === '桃之11')!
    expect(桃之11.points).toBe(-93)
    expect(桃之11.penalty).toBe(-5)
  })
  it('存储的 rank 用于位次统计（手动选择优先）', () => {
    const g: Game = finishedGame({
      seats: [
        { seat: '东', team: '格斗', name: '忆水', rank: 1, points: 26000 },
        { seat: '南', team: '海盗', name: 'Art3mis', rank: 2, points: 25000 },
        { seat: '西', team: '樱花', name: '炸洋芋', rank: 3, points: 25000 },
        { seat: '北', team: '火山', name: '桃之11', rank: 4, points: 24000 },
      ],
    })
    const board = aggregateTeamBoard([g])
    const by = new Map(board.map((r) => [r.team, r]))
    // 分数上 2、3 名同分（自动竞争位次 2,2），但存储 rank 为 2、3 → 按存储统计
    expect(by.get('海盗')?.wins).toEqual({ '1': 0, '2': 1, '3': 0, '4': 0 })
    expect(by.get('樱花')?.wins).toEqual({ '1': 0, '2': 0, '3': 1, '4': 0 })
  })
  it('空输入返回空数组', () => {
    expect(aggregateTeamBoard([])).toEqual([])
  })
})

describe('aggregatePlayerBoard', () => {
  it('按选手聚合 points/rawPoints/wins/maxScore', () => {
    const board = aggregatePlayerBoard([finishedGame()])
    const by = new Map(board.map((r) => [r.name, r]))
    expect(by.get('忆水')).toMatchObject({ team: '格斗', points: 62, rawPoints: 17, penalty: 0, wins: { '1': 1 }, maxScore: 42000 })
    expect(by.get('桃之11')).toMatchObject({ points: -88, rawPoints: -53, wins: { '4': 1 }, maxScore: 0 })
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
    expect(board.find((r) => r.name === '忆水')).toMatchObject({ points: 124, rawPoints: 34, wins: { '1': 2 }, maxScore: 42000 })
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
