import { describe, it, expect } from 'vitest'
import { buildSeats, parseRoster } from './games'

describe('buildSeats', () => {
  it('assigns 东南西北 to the 4 teams with empty player', () => {
    expect(buildSeats(['凤凰', '樱花', '火山', '雷电'])).toEqual([
      { seat: '东', team: '凤凰', player: null },
      { seat: '南', team: '樱花', player: null },
      { seat: '西', team: '火山', player: null },
      { seat: '北', team: '雷电', player: null },
    ])
  })
})

describe('parseRoster', () => {
  it('splits newline names, trims, drops empty lines', () => {
    expect(parseRoster('张三\n 李四 \n\n王五')).toEqual(['张三', '李四', '王五'])
  })
})
