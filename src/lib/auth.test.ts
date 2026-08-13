import { describe, it, expect } from 'vitest'
import { guardByRole, canAccessAdmin } from './auth'

describe('canAccessAdmin', () => {
  it('returns false when role is missing', () => {
    expect(canAccessAdmin(null)).toBe(false)
  })
  it('returns true only for admin and referee', () => {
    expect(canAccessAdmin('admin')).toBe(true)
    expect(canAccessAdmin('referee')).toBe(true)
    expect(canAccessAdmin('captain')).toBe(false)
  })
})

describe('guardByRole', () => {
  it('allows matching role', () => {
    expect(guardByRole('admin', 'admin')).toBe(true)
  })
  it('blocks non-matching role', () => {
    expect(guardByRole('captain', 'admin')).toBe(false)
  })
})
