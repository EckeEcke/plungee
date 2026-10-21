import { LEVEL_COLS, LEVEL_ROWS, type LevelSize } from './constants'
import type { TileChar } from './tiles'
import type { Dir, EntityData, LevelData } from './types'

/**
 * Kleiner Helfer zum Aufbauen von Leveldaten im Code (Demo-Level, Tests).
 * Der spätere Editor erzeugt dasselbe LevelData-Format.
 * Alle Koordinaten sind Tile-Zellen: col 0..15, row 0..rows-1.
 */
export class LevelBuilder {
  private grid: string[][]
  private entities: EntityData[] = []
  readonly rows: number

  constructor(
    private size: LevelSize,
    private title?: string,
  ) {
    this.rows = LEVEL_ROWS[size]
    this.grid = Array.from({ length: this.rows }, () => Array<string>(LEVEL_COLS).fill('.'))
  }

  /**
   * Waagerechte Plattform, c0..c1 inklusive. kind: '#' Block (Standard), 'I' Eis,
   * '<' / '>' Förderband, 'B' brüchig, '=' Einweg.
   */
  plat(row: number, c0: number, c1: number, kind: TileChar = '#'): this {
    for (let c = c0; c <= c1; c++) this.grid[row][c] = kind
    return this
  }

  /** Senkrechte Wand, r0..r1 inklusive */
  wall(col: number, r0: number, r1: number, kind: TileChar = '#'): this {
    for (let r = r0; r <= r1; r++) this.grid[r][col] = kind
    return this
  }

  /** Rechteckiger Block */
  block(c0: number, r0: number, c1: number, r1: number, kind: TileChar = '#'): this {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.grid[r][c] = kind
    return this
  }

  spawn(col: number, row: number): this {
    this.entities.push({ t: 'spawn', x: col, y: row })
    return this
  }

  goal(col: number, row: number): this {
    this.entities.push({ t: 'goal', x: col, y: row })
    return this
  }

  checkpoint(col: number, row: number): this {
    this.entities.push({ t: 'checkpoint', x: col, y: row })
    return this
  }

  /** Feder in Zelle (col,row); sitzt am Zellboden, darunter sollte ein solider Tile liegen */
  spring(col: number, row: number, power: 1 | 2 = 1, dir: 'u' | 'l' | 'r' = 'u'): this {
    this.entities.push(dir === 'u' ? { t: 'spring', x: col, y: row, power } : { t: 'spring', x: col, y: row, power, dir })
    return this
  }

  spikes(col: number, row: number, dir: Dir = 'u'): this {
    this.entities.push({ t: 'spikes', x: col, y: row, dir })
    return this
  }

  spikesRow(row: number, c0: number, c1: number, dir: Dir = 'u'): this {
    for (let c = c0; c <= c1; c++) this.spikes(c, row, dir)
    return this
  }

  laser(
    col: number,
    row: number,
    dir: Dir,
    opts: { period?: number; on?: number; phase?: number } = {},
  ): this {
    this.entities.push({
      t: 'laser',
      x: col,
      y: row,
      dir,
      period: opts.period ?? 150,
      on: opts.on ?? 60,
      phase: opts.phase ?? 0,
    })
    return this
  }

  hammer(
    col: number,
    row: number,
    opts: { len?: number; amp?: number; period?: number; phase?: number } = {},
  ): this {
    this.entities.push({
      t: 'hammer',
      x: col,
      y: row,
      len: opts.len ?? 3,
      amp: opts.amp ?? 60,
      period: opts.period ?? 120,
      phase: opts.phase ?? 0,
    })
    return this
  }

  /** Säge: Bahn beginnt in (col,row) und läuft len Tiles nach rechts (h) bzw. unten (v) */
  saw(
    col: number,
    row: number,
    axis: 'h' | 'v',
    len: number,
    opts: { period?: number; phase?: number } = {},
  ): this {
    this.entities.push({
      t: 'saw',
      x: col,
      y: row,
      axis,
      len,
      period: opts.period ?? 150,
      phase: opts.phase ?? 0,
    })
    return this
  }

  build(): LevelData {
    return {
      v: 1,
      size: this.size,
      tiles: this.grid.map((row) => row.join('')),
      entities: this.entities.map((e) => ({ ...e })),
      title: this.title,
    }
  }
}
