export function monthOf(date: string): string {
  return date.slice(2, 7)
}

export function roundNum(g: { round?: string }): number {
  return Number(g.round?.match(/(\d+)/)?.[1] ?? 0)
}

export interface MonthGroup<T> {
  month: string
  games: T[]
}

export function groupByMonth<T extends { date: string }>(
  games: T[],
  opts: { order?: 'asc' | 'desc'; within?: (a: T, b: T) => number } = {},
): MonthGroup<T>[] {
  const { order = 'asc', within } = opts
  const sorted = [...games].sort((a, b) => {
    const ma = monthOf(a.date)
    const mb = monthOf(b.date)
    if (ma !== mb) return order === 'asc' ? ma.localeCompare(mb) : mb.localeCompare(ma)
    return within ? within(a, b) : 0
  })
  const groups: MonthGroup<T>[] = []
  for (const g of sorted) {
    const m = monthOf(g.date)
    const last = groups[groups.length - 1]
    if (last && last.month === m) last.games.push(g)
    else groups.push({ month: m, games: [g] })
  }
  return groups
}
