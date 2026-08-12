import { describe, it, expect } from 'vitest'
import { splitCharter } from './charter'

const sample = [
  'PKU M.LEAGUE 章程',
  '章程文字。',
  '第1条 总则',
  '1. 本章程适用于……',
  '2. 另一句。',
  '第2条 队伍构成',
  '1. 至少8支队伍。',
  '',
  '第3条 比赛条件',
].join('\n')

describe('splitCharter', () => {
  it('拆分为章程 + 各条', () => {
    const blocks = splitCharter(sample)
    expect(blocks[0].id).toBe('0')
    expect(blocks[0].heading).toBe('章程')
    expect(blocks[0].content).toContain('章程文字。')
    expect(blocks.map(b => b.id)).toEqual(['0', '1', '2', '3'])
    expect(blocks[1].heading).toBe('第1条 总则')
  })
  it('条目内容跳过空行', () => {
    const blocks = splitCharter(sample)
    expect(blocks[2].content).toContain('1. 至少8支队伍。')
    expect(blocks[3].content).toEqual([])
  })
})
