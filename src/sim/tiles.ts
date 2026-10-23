import { BLINK_HALF, BLINK_PERIOD } from './constants'

/**
 * Block-Typen. In LevelData.tiles steht je Zelle ein Zeichen:
 *  '.' leer   '#' Block   'I' Eis   '<' Band links   '>' Band rechts   'B' brüchig   '=' Einweg
 *  'X' / 'O' Blinkblock (wechseln sich im globalen Takt ab, 'X' startet fest)
 */
export const TILE_CHARS = ['#', 'I', '<', '>', 'B', '=', 'X', 'O'] as const
export type TileChar = (typeof TILE_CHARS)[number]

/** Gültige Zeichen in einer Tile-Zeile */
export const TILE_LINE_RE = /[^.#I<>B=XO]/

// Numerische Codes im kompilierten Raster
export const K_EMPTY = 0
export const K_SOLID = 1
export const K_ICE = 2
export const K_BELT_L = 3
export const K_BELT_R = 4
export const K_BRITTLE = 5
export const K_ONEWAY = 6
export const K_BLINK_A = 7
export const K_BLINK_B = 8

export function isBlinkKind(k: number): boolean {
  return k === K_BLINK_A || k === K_BLINK_B
}

/** Ist der Blinkblock zu diesem Tick fest? Reine Funktion des Ticks. */
export function blinkSolid(k: number, tick: number): boolean {
  const first = tick % BLINK_PERIOD < BLINK_HALF
  return k === K_BLINK_A ? first : !first
}

/** Ticks bis zum nächsten Wechsel dieses Blocks (für das Warnflackern) */
export function blinkTicksLeft(tick: number): number {
  const t = tick % BLINK_PERIOD
  return t < BLINK_HALF ? BLINK_HALF - t : BLINK_PERIOD - t
}

export function kindOfChar(ch: string): number {
  switch (ch) {
    case '#':
      return K_SOLID
    case 'I':
      return K_ICE
    case '<':
      return K_BELT_L
    case '>':
      return K_BELT_R
    case 'B':
      return K_BRITTLE
    case '=':
      return K_ONEWAY
    case 'X':
      return K_BLINK_A
    case 'O':
      return K_BLINK_B
    default:
      return K_EMPTY
  }
}
