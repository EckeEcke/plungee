import type { LevelSize } from './constants'

/** Richtung: up, down, left, right */
export type Dir = 'u' | 'd' | 'l' | 'r'

export type EntityData =
  | { t: 'spawn'; x: number; y: number }
  | { t: 'goal'; x: number; y: number }
  | { t: 'checkpoint'; x: number; y: number }
  /** dir = Richtung des Abschusses (u = nach oben, Standard; l/r = seitlich, sitzt an einer Wand) */
  | { t: 'spring'; x: number; y: number; power: 1 | 2; dir?: 'u' | 'l' | 'r' }
  /** dir = Richtung, in die die Spitzen zeigen */
  | { t: 'spikes'; x: number; y: number; dir: Dir }
  /** Emitter belegt die Zelle (solide). period/on/phase in Ticks */
  | { t: 'laser'; x: number; y: number; dir: Dir; period: number; on: number; phase: number }
  /** Aufhängepunkt = Zellmitte. len in Tiles, amp in Grad, period in Ticks, phase 0..1 */
  | { t: 'hammer'; x: number; y: number; len: number; amp: number; period: number; phase: number }
  /**
   * Kreissäge auf einer geraden Bahn. Startzelle = linkes (h) bzw. oberes (v) Ende der Bahn,
   * len = Länge der Bahn in Tiles, period = Ticks für Hin- und Rückweg, phase 0..1.
   */
  | { t: 'saw'; x: number; y: number; axis: 'h' | 'v'; len: number; period: number; phase: number }
  /**
   * Bewegliche Plattform (Einwegplatte, trägt den Spieler). Startzelle = linkes (h) bzw. oberes (v)
   * Ende der Bahn, w = Breite in Tiles, len = Bahnlänge in Tiles, period/phase wie bei der Säge.
   */
  | { t: 'mover'; x: number; y: number; axis: 'h' | 'v'; len: number; w: number; period: number; phase: number }
  /**
   * Quetscher: size × size Tiles großer Block mit Gesicht. Ruhelage = Zelle (x, y) links oben. Er schlägt in
   * Richtung dir um len Tiles zu (schnell), bleibt kurz liegen und fährt langsam zurück. Er ist ein fester Block:
   * er schiebt und trägt den Spieler und zerquetscht ihn nur, wenn der nicht ausweichen kann (Wand, Boden, Decke).
   * period = Ticks eines Zyklus, phase 0..1.
   */
  | { t: 'crusher'; x: number; y: number; dir: Dir; size: 1 | 2 | 3; len: number; period: number; phase: number }

export interface LevelData {
  v: 1
  size: LevelSize
  /** Zeilen von oben nach unten; '#' = solide, '.' = leer; je 16 Zeichen breit */
  tiles: string[]
  entities: EntityData[]
  title?: string
}

export type InputDir = -1 | 0 | 1

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}