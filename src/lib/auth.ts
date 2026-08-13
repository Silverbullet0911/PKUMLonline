export type Role = 'admin' | 'referee' | 'captain'

export function canAccessAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'referee'
}

export function guardByRole(current: string | null | undefined, required: Role): boolean {
  return current === required
}
