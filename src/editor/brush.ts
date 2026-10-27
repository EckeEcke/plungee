import type { TileChar } from '../sim'
import type { Dir, EntityData } from '../sim'

export type ToolId =
  | 'tile'
  | 'erase'
  | 'spawn'
  | 'goal'
  | 'checkpoint'
  | 'spring'
  | 'spikes'
  | 'laser'
  | 'hammer'
  | 'saw'
  | 'mover'
  | 'crusher'
  | 'select'

export const TOOLS: Array<{ id: ToolId; label: string }> = [
  { id: 'select', label: 'Select' },
  { id: 'tile', label: 'Block' },
  { id: 'erase', label: 'Eraser' },
  { id: 'spring', label: 'Spring' },
  { id: 'spikes', label: 'Spikes' },
  { id: 'laser', label: 'Laser' },
  { id: 'hammer', label: 'Hammer' },
  { id: 'saw', label: 'Saw' },
  { id: 'mover', label: 'Mover' },
  { id: 'crusher', label: 'Crusher' },
  { id: 'checkpoint', label: 'Checkpoint' },
  { id: 'spawn', label: 'Start' },
  { id: 'goal', label: 'Goal' },
]

/** Block-Typen, die das Werkzeug "Block" malen kann */
export const TILE_OPTIONS: Array<{ ch: TileChar; label: string }> = [
  { ch: '#', label: 'Block' },
  { ch: 'I', label: 'Ice' },
  { ch: '<', label: 'Belt ◀' },
  { ch: '>', label: 'Belt ▶' },
  { ch: 'B', label: 'Brittle' },
  { ch: '=', label: 'Gate ▲' },
  { ch: 'v', label: 'Gate ▼' },
  { ch: '{', label: 'Gate ◀' },
  { ch: '}', label: 'Gate ▶' },
  { ch: 'X', label: 'Blink ◆' },
  { ch: 'O', label: 'Blink ●' },
]

export const TILE_HINTS: Record<TileChar, string> = {
  '#': 'Normal solid block.',
  I: 'Slippery: you speed up and slow down slowly.',
  '<': 'Conveyor belt: pushes the player left.',
  '>': 'Conveyor belt: pushes the player right.',
  B: 'Crumbles shortly after you step on it and regrows after a few seconds.',
  '=': 'Gate ▲: you can pass upwards. From above it is solid, so you can stand on it.',
  v: 'Gate ▼: you can fall through it, but cannot jump up through it from below.',
  '{': 'Gate ◀: you can walk through it to the left, but not from the left side.',
  '}': 'Gate ▶: you can walk through it to the right, but not from the right side.',
  X: 'Blink block ◆: solid for 1.5 s, then gone for 1.5 s. Flickers shortly before it vanishes. Opposite of ●.',
  O: 'Blink block ●: gone while ◆ is solid, and the other way round. Lasers shine through both.',
}

export const LASER_SPEEDS = [
  { label: 'fast', period: 90, on: 36 },
  { label: 'medium', period: 150, on: 54 },
  { label: 'slow', period: 240, on: 90 },
] as const

export const HAMMER_SPEEDS = [
  { label: 'fast', period: 90 },
  { label: 'medium', period: 130 },
  { label: 'slow', period: 180 },
] as const

export const SAW_SPEEDS = [
  { label: 'fast', period: 90 },
  { label: 'medium', period: 150 },
  { label: 'slow', period: 240 },
] as const

export const SAW_LENGTHS = [2, 3, 4, 6, 8, 12] as const

export const MOVER_SPEEDS = [
  { label: 'fast', period: 120 },
  { label: 'medium', period: 180 },
  { label: 'slow', period: 280 },
] as const

export const CRUSHER_SPEEDS = [
  { label: 'fast', period: 100 },
  { label: 'medium', period: 150 },
  { label: 'slow', period: 220 },
] as const

export const CRUSHER_SIZES = [1, 2, 3] as const
export const CRUSHER_REACHES = [1, 2, 3, 4, 6, 8, 12] as const

export const MOVER_LENGTHS = [2, 3, 4, 6, 8, 12] as const
export const MOVER_WIDTHS = [1, 2, 3, 4] as const

export const HAMMER_LENGTHS = [2, 3, 4, 5] as const
export const HAMMER_AMPLITUDES = [40, 60, 80] as const
export const PHASE_QUARTERS = [0, 1, 2, 3] as const
export const DIRS: Array<{ dir: Dir; label: string }> = [
  { dir: 'u', label: 'up' },
  { dir: 'd', label: 'down' },
  { dir: 'l', label: 'left' },
  { dir: 'r', label: 'right' },
]

type Of<T extends EntityData['t']> = Extract<EntityData, { t: T }>

/** Vorlagen für Objekte mit Parametern; der Editor setzt neue Objekte aus diesen Werten. */
export interface Brush {
  spring: Of<'spring'>
  spikes: Of<'spikes'>
  laser: Of<'laser'>
  hammer: Of<'hammer'>
  saw: Of<'saw'>
  mover: Of<'mover'>
  crusher: Of<'crusher'>
  /** Block-Typ für das Werkzeug "Block" */
  tile: TileChar
}

export function defaultBrush(): Brush {
  return {
    spring: { t: 'spring', x: 0, y: 0, power: 1 },
    spikes: { t: 'spikes', x: 0, y: 0, dir: 'u' },
    laser: { t: 'laser', x: 0, y: 0, dir: 'd', period: 150, on: 54, phase: 0 },
    hammer: { t: 'hammer', x: 0, y: 0, len: 3, amp: 60, period: 130, phase: 0 },
    saw: { t: 'saw', x: 0, y: 0, axis: 'h', len: 4, period: 150, phase: 0 },
    mover: { t: 'mover', x: 0, y: 0, axis: 'h', len: 4, w: 2, period: 180, phase: 0 },
    crusher: { t: 'crusher', x: 0, y: 0, dir: 'd', size: 2, len: 3, period: 150, phase: 0 },
    tile: '#',
  }
}

/** Erzeugt das Objekt für ein Werkzeug in Zelle (c, r), oder null für Nicht-Objekt-Werkzeuge. */
export function makeEntity(tool: ToolId, c: number, r: number, brush: Brush): EntityData | null {
  switch (tool) {
    case 'spawn':
      return { t: 'spawn', x: c, y: r }
    case 'goal':
      return { t: 'goal', x: c, y: r }
    case 'checkpoint':
      return { t: 'checkpoint', x: c, y: r }
    case 'spring':
      return { ...brush.spring, x: c, y: r }
    case 'spikes':
      return { ...brush.spikes, x: c, y: r }
    case 'laser':
      return { ...brush.laser, x: c, y: r }
    case 'hammer':
      return { ...brush.hammer, x: c, y: r }
    case 'saw':
      return { ...brush.saw, x: c, y: r }
    case 'mover':
      return { ...brush.mover, x: c, y: r }
    case 'crusher':
      return { ...brush.crusher, x: c, y: r }
    default:
      return null
  }
}

/** Welche Objekttypen haben einstellbare Parameter? */
export function hasParams(t: EntityData['t']): boolean {
  return t === 'spring' || t === 'spikes' || t === 'laser' || t === 'hammer' || t === 'saw' || t === 'mover' || t === 'crusher'
}

export function laserSpeedIndex(e: { period: number; on: number }): number {
  return LASER_SPEEDS.findIndex((s) => s.period === e.period && s.on === e.on)
}

/** Phase eines Lasers in Vierteln der Periode (0..3) */
export function laserPhaseQuarter(e: { period: number; phase: number }): number {
  return Math.round((e.phase / e.period) * 4) % 4
}

export function laserSpeedPatch(e: { period: number; phase: number }, speed: number) {
  const s = LASER_SPEEDS[speed]
  const q = laserPhaseQuarter(e)
  return { period: s.period, on: s.on, phase: Math.round((s.period * q) / 4) }
}

export function laserPhasePatch(e: { period: number }, quarter: number) {
  return { phase: Math.round((e.period * quarter) / 4) }
}

export function sawSpeedIndex(e: { period: number }): number {
  return SAW_SPEEDS.findIndex((s) => s.period === e.period)
}

export function moverSpeedIndex(e: { period: number }): number {
  return MOVER_SPEEDS.findIndex((s) => s.period === e.period)
}

export function crusherSpeedIndex(e: { period: number }): number {
  return CRUSHER_SPEEDS.findIndex((s) => s.period === e.period)
}

export function hammerSpeedIndex(e: { period: number }): number {
  return HAMMER_SPEEDS.findIndex((s) => s.period === e.period)
}

export function hammerPhaseQuarter(e: { phase: number }): number {
  return Math.round(e.phase * 4) % 4
}

export function hammerPhasePatch(quarter: number) {
  return { phase: quarter / 4 }
}