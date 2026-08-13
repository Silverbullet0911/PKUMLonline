const PINYIN_FIRST: Record<string, string> = {
  一: 'Y', 东: 'D', 乐: 'L', 佐: 'Z', 元: 'Y', 凛: 'L',
  前: 'Q', 半: 'B', 吉: 'J', 同: 'T', 咲: 'X', 喜: 'X',
  天: 'T', 小: 'X', 岸: 'A', 川: 'C', 师: 'S', 帕: 'P',
  弦: 'X', 忆: 'Y', 才: 'C', 曰: 'Y', 树: 'S', 桃: 'T',
  椎: 'Z', 正: 'Z', 江: 'J', 没: 'M', 炸: 'Z', 玖: 'J',
  空: 'K', 立: 'L', 老: 'L', 蓝: 'L', 虹: 'H', 起: 'Q',
  过: 'G', 追: 'Z', 雪: 'X',
}

export function firstLetter(name: string): string {
  if (!name) return '#'
  const c = name[0]
  if (/[a-zA-Z]/.test(c)) return c.toUpperCase()
  return PINYIN_FIRST[c] ?? '#'
}

export interface LetterGroup<T> {
  letter: string
  players: T[]
}

export function groupByLetter<T extends { name: string }>(players: T[]): LetterGroup<T>[] {
  const sorted = [...players].sort((a, b) => {
    const la = firstLetter(a.name)
    const lb = firstLetter(b.name)
    if (la !== lb) return la === '#' ? 1 : lb === '#' ? -1 : la.localeCompare(lb)
    return a.name.localeCompare(b.name, 'zh')
  })
  const groups: LetterGroup<T>[] = []
  for (const p of sorted) {
    const l = firstLetter(p.name)
    const last = groups[groups.length - 1]
    if (last && last.letter === l) last.players.push(p)
    else groups.push({ letter: l, players: [p] })
  }
  return groups
}

export function letterAnchor(letter: string): string {
  return letter === '#' ? 'hash' : letter
}
