export const SEAT_ORDER = ['东', '南', '西', '北'] as const

export function seatIndexOf(seat: string): number {
  return SEAT_ORDER.indexOf(seat as (typeof SEAT_ORDER)[number])
}

export interface GameSeatInput {
  seat: string
  team: string
  player: null
}

export function buildSeats(teams: string[]): GameSeatInput[] {
  return SEAT_ORDER.map((seat, i) => ({ seat, team: teams[i] ?? '', player: null }))
}

export function parseRoster(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}
