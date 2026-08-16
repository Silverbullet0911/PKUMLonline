export function monthOf(date: string): string {
  return date.slice(2, 7)
}

export function roundNum(g: { round?: string }): number {
  return Number(g.round?.match(/(\d+)/)?.[1] ?? 0)
}

// 阶段展示顺序（赛程从上到下：常规赛 → 半决赛 → 决赛）
export const STAGE_ORDER = ['常规赛', '半决赛', '决赛'] as const
export type StageName = (typeof STAGE_ORDER)[number]

export function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as StageName)
  return i === -1 ? STAGE_ORDER.length : i
}

/** 赛程排序：阶段正序 → 日期升序 → 半庄号升序 */
export function compareUpcoming<T extends { stage: string; date: string; round?: string }>(a: T, b: T): number {
  return (
    stageRank(a.stage) - stageRank(b.stage) ||
    a.date.localeCompare(b.date) ||
    roundNum(a) - roundNum(b)
  )
}

/** 赛果排序：与赛程相反 —— 阶段倒序 → 日期降序 → 半庄号降序 */
export function compareFinished<T extends { stage: string; date: string; round?: string }>(a: T, b: T): number {
  return (
    stageRank(b.stage) - stageRank(a.stage) ||
    b.date.localeCompare(a.date) ||
    roundNum(b) - roundNum(a)
  )
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
