import { describe, it, expect } from 'vitest'
import { mapDbGame, splitGames, escHtml } from './renderSchedule'

const db = {
  id: '1', stage: '常规赛', date: '2026-09-01', time: '14:00', round: '第1半庄',
  status: 'upcoming' as const,
  seats: [{ seat: '东', team: '凤凰', player: '张三' }],
}

describe('mapDbGame', () => {
  it('maps player to name and nulls to undefined', () => {
    const g = mapDbGame(db)
    expect(g.seats[0].name).toBe('张三')
    expect(g.time).toBe('14:00')
  })
})

describe('splitGames', () => {
  it('splits upcoming and finished', () => {
    const g1 = mapDbGame(db)
    const g2 = mapDbGame({ ...db, id: '2', status: 'finished' })
    const { upcoming, finished } = splitGames([g1, g2])
    expect(upcoming.map((g) => g.seats[0].team)).toEqual(['凤凰'])
    expect(finished).toHaveLength(1)
  })
})

describe('escHtml', () => {
  it('escapes html special chars', () => {
    expect(escHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })
})
