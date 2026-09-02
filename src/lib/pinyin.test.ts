import { describe, it, expect } from 'vitest'
import { firstLetter, groupByLetter, letterAnchor } from './pinyin'

describe('firstLetter', () => {
  it('英文名取首字母大写', () => {
    expect(firstLetter('Art3mis')).toBe('A')
    expect(firstLetter('abd')).toBe('A')
  })
  it('中文名取拼音首字母', () => {
    expect(firstLetter('前原Nagi')).toBe('Q')
    expect(firstLetter('炸洋芋')).toBe('Z')
    expect(firstLetter('岸谷')).toBe('A')
  })
  it('数字/符号返回井号', () => {
    expect(firstLetter('94TR')).toBe('#')
  })
})

describe('groupByLetter', () => {
  it('按首字母排序分组，井号排最后', () => {
    const groups = groupByLetter([{ name: '炸洋芋' }, { name: 'Art3mis' }, { name: '94TR' }, { name: '岸谷' }])
    expect(groups.map((g) => g.letter)).toEqual(['A', 'Z', '#'])
    expect(groups[0].players.map((p) => p.name)).toEqual(['岸谷', 'Art3mis'])
  })
})

describe('letterAnchor', () => {
  it('井号映射为 hash 以作安全锚点', () => {
    expect(letterAnchor('#')).toBe('hash')
    expect(letterAnchor('A')).toBe('A')
  })
})
