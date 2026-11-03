import { TILE } from './constants'

export type FallingSpikeState = {
  x: number
  y: number
  prevY: number
  vy: number
  releaseTick: number
  phase: 'hanging' | 'warning' | 'falling' | 'gone'
}

/** Lowest point of the triangle above an overlapping horizontal interval. */
export function fallingSpikeBottom(spike: { x: number; y: number }, left: number, right: number): number | null {
  if (right <= spike.x || left >= spike.x + TILE) return null
  const center = spike.x + TILE / 2
  const distance = Math.max(0, left - center, center - right)
  return spike.y + TILE * (1 - distance / (TILE / 2))
}
