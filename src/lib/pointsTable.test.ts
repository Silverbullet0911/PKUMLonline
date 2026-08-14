import { describe, it, expect } from 'vitest'
import pointsRaw from '../../data/points_table.json'
import type { PointsTable } from './types'

const points = pointsRaw as PointsTable

describe('points_table tiers', () => {
  it('包含 6 档：满贯/跳满/倍满/三倍满/役满/双倍役满', () => {
    expect(points.tiers.map((t) => t.key)).toEqual([
      'mangan', 'haneman', 'baiman', 'sanbaiman', 'yakuman', 'doubleYakuman',
    ])
  })
  it('每档点数均为 100 的倍数且子家=亲家×2/3 关系合理', () => {
    for (const t of points.tiers) {
      for (const v of [t.childRon, t.childTsumo[0], t.childTsumo[1], t.dealerRon, t.dealerTsumo[0]]) {
        expect(v % 100).toBe(0)
      }
      // 亲家荣和 = 子家荣和 × 1.5
      expect(t.dealerRon).toBe(t.childRon * 1.5)
    }
  })
  it('最大牌为双倍役满 64000/96000', () => {
    const d = points.tiers[points.tiers.length - 1]
    expect(d.childRon).toBe(64000)
    expect(d.dealerRon).toBe(96000)
  })
})

describe('points_table grid', () => {
  const FU = ['20', '25', '30', '40', '50', '60', '70', '80', '90', '100', '110']
  const HAN = ['1', '2', '3', '4']

  it('子家/亲家 grid 覆盖 1-4番 × 11 符', () => {
    for (const side of ['child', 'dealer'] as const) {
      const g = points.grid[side]
      expect(Object.keys(g).sort()).toEqual(HAN)
      for (const h of HAN) {
        // JS 对象整数样键按数值升序迭代，与 FU 顺序一致
        expect(Object.keys(g[h])).toEqual(FU)
      }
    }
  })
  it('非空格点数与自摸拆分为 100 的倍数', () => {
    for (const side of ['child', 'dealer'] as const) {
      const g = points.grid[side]
      for (const h of HAN) {
        for (const f of FU) {
          const cell = g[h][f]
          if (!cell) continue
          expect(cell.ron % 100).toBe(0)
          for (const p of cell.tsumo) expect(p % 100).toBe(0)
          if (side === 'child') expect(cell.tsumo.length).toBe(2)
          else expect(cell.tsumo.length).toBe(1)
        }
      }
    }
  })
  it('1-4番行中的满贯格子置空（无按键），其余可点', () => {
    const g = points.grid
    // 子家：3番60/70+/4番30+ 为 null；亲家同理
    for (const side of ['child', 'dealer'] as const) {
      const grid = g[side]
      for (const h of ['3', '4']) {
        for (const f of FU) {
          const isMangan = side === 'child'
            ? (h === '3' && ['60', '70', '80', '90', '100', '110'].includes(f))
              || (h === '4' && ['30', '40', '50', '60', '70', '80', '90', '100', '110'].includes(f))
            : (h === '3' && ['60', '70', '80', '90', '100', '110'].includes(f))
              || (h === '4' && ['30', '40', '50', '60', '70', '80', '90', '100', '110'].includes(f))
          if (isMangan) expect(grid[h][f]).toBeNull()
          else expect(grid[h][f]).not.toBeNull()
        }
      }
    }
  })
  it('子家/亲家同格数值一致（亲≈子×1.5，切上容差 ±100）', () => {
    const g = points.grid
    for (const h of HAN) {
      for (const f of FU) {
        const c = g.child[h][f]
        const d = g.dealer[h][f]
        if (!c || !d) continue
        expect(Math.abs(d.ron - c.ron * 1.5)).toBeLessThanOrEqual(100)
      }
    }
  })
})
