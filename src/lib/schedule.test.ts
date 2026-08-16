import { describe, it, expect } from 'vitest'
import { compareUpcoming, compareFinished, groupByMonth } from './schedule'

const g = (stage: string, date: string, round?: string) => ({ stage, date, round })

describe('compareUpcoming', () => {
  it('sorts by stage (常规赛→半决赛→决赛), then date asc, then round asc', () => {
    const games = [
      g('决赛', '2027-01-05', '第1半庄'),
      g('半决赛', '2026-12-20', '第1半庄'),
      g('常规赛', '2026-12-15', '第2半庄'),
      g('常规赛', '2026-12-15', '第1半庄'),
      g('常规赛', '2026-12-01', '第1半庄'),
    ]
    const sorted = [...games].sort(compareUpcoming)
    expect(sorted).toEqual([
      g('常规赛', '2026-12-01', '第1半庄'),
      g('常规赛', '2026-12-15', '第1半庄'),
      g('常规赛', '2026-12-15', '第2半庄'),
      g('半决赛', '2026-12-20', '第1半庄'),
      g('决赛', '2027-01-05', '第1半庄'),
    ])
  })
})

describe('compareFinished', () => {
  it('sorts reversed: stage desc (决赛→半决赛→常规赛), then date desc, then round desc', () => {
    const games = [
      g('常规赛', '2026-12-01', '第1半庄'),
      g('半决赛', '2026-12-20', '第1半庄'),
      g('常规赛', '2026-12-15', '第2半庄'),
      g('常规赛', '2026-12-15', '第1半庄'),
      g('决赛', '2027-01-05', '第1半庄'),
    ]
    const sorted = [...games].sort(compareFinished)
    expect(sorted).toEqual([
      g('决赛', '2027-01-05', '第1半庄'),
      g('半决赛', '2026-12-20', '第1半庄'),
      g('常规赛', '2026-12-15', '第2半庄'),
      g('常规赛', '2026-12-15', '第1半庄'),
      g('常规赛', '2026-12-01', '第1半庄'),
    ])
  })
})

describe('groupByMonth with within comparator', () => {
  it('keeps compareUpcoming order inside each month group', () => {
    const games = [
      g('常规赛', '2026-12-15', '第2半庄'),
      g('常规赛', '2026-12-15', '第1半庄'),
      g('常规赛', '2026-12-01', '第1半庄'),
    ]
    const groups = groupByMonth(games, { order: 'asc', within: compareUpcoming })
    expect(groups).toHaveLength(1)
    expect(groups[0].month).toBe('26-12')
    expect(groups[0].games.map((x) => x.round)).toEqual(['第1半庄', '第1半庄', '第2半庄'])
  })

  it('keeps compareFinished order inside each month group', () => {
    const games = [
      g('常规赛', '2026-12-15', '第1半庄'),
      g('常规赛', '2026-12-15', '第2半庄'),
      g('常规赛', '2026-12-01', '第1半庄'),
    ]
    const groups = groupByMonth(games, { order: 'desc', within: compareFinished })
    expect(groups[0].month).toBe('26-12')
    expect(groups[0].games.map((x) => x.round)).toEqual(['第2半庄', '第1半庄', '第1半庄'])
  })
})
