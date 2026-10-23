import { DEG_TO_RAD } from './mathx'
import { isBlinkKind, K_BRITTLE, K_ONEWAY, K_SOLID, kindOfChar, TILE_LINE_RE } from './tiles'
import { LASER_BEAM_W, LEVEL_COLS, LEVEL_ROWS, MAX_MOVER_LEN, MAX_MOVER_W, MAX_SAW_LEN, TILE } from './constants'
import type { HammerParams, SawParams } from './hazards'
import type { Dir, EntityData, LevelData, Rect } from './types'

export const MAX_ENTITIES = 400

export interface CompiledSpring {
  col: number
  row: number
  power: 1 | 2
  dir: 'u' | 'l' | 'r'
  rect: Rect
}

export interface CompiledSpikes {
  col: number
  row: number
  dir: Dir
  rect: Rect
}

export interface CompiledLaser {
  col: number
  row: number
  dir: Dir
  period: number
  on: number
  phase: number
  /** Strahl-Rechteck; null, wenn der Strahl sofort blockiert ist */
  beam: Rect | null
}

export interface CompiledHammer extends HammerParams {
  col: number
  row: number
}

export interface CompiledSaw extends SawParams {
  col: number
  row: number
  axis: 'h' | 'v'
  len: number
}

export interface CompiledMover extends SawParams {
  col: number
  row: number
  axis: 'h' | 'v'
  len: number
  /** Breite in Tiles */
  w: number
}

export interface CompiledCheckpoint {
  col: number
  row: number
  rect: Rect
  spawn: { x: number; y: number }
}

export interface CompiledLevel {
  data: LevelData
  cols: number
  rows: number
  width: number
  height: number
  /** cols * rows, 1 = blockiert Laserstrahlen und Spieler (außer brüchig im zerbrochenen Zustand) */
  solid: Uint8Array
  /** cols * rows, Block-Typ (siehe tiles.ts) */
  kind: Uint8Array
  /** Indizes aller brüchigen Zellen */
  brittle: number[]
  spawn: { x: number; y: number }
  goal: Rect
  goalCell: { col: number; row: number }
  checkpoints: CompiledCheckpoint[]
  springs: CompiledSpring[]
  spikes: CompiledSpikes[]
  lasers: CompiledLaser[]
  hammers: CompiledHammer[]
  saws: CompiledSaw[]
  movers: CompiledMover[]
}

const DIRS: Dir[] = ['u', 'd', 'l', 'r']

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

/** Gibt eine Liste menschenlesbarer Fehler zurück (leer = gültig). */
export function validateLevel(data: LevelData): string[] {
  const errors: string[] = []
  if (!data || data.v !== 1) {
    errors.push('Unknown level version')
    return errors
  }
  const rows = LEVEL_ROWS[data.size]
  if (!rows) {
    errors.push('Invalid level size')
    return errors
  }
  if (!Array.isArray(data.tiles) || data.tiles.length !== rows) {
    errors.push(`Level needs exactly ${rows} rows`)
    return errors
  }
  for (let r = 0; r < rows; r++) {
    const line = data.tiles[r]
    if (typeof line !== 'string' || line.length !== LEVEL_COLS || TILE_LINE_RE.test(line)) {
      errors.push(`Row ${r}: expected ${LEVEL_COLS} characters from . # I < > B = X O`)
      return errors
    }
  }
  if (!Array.isArray(data.entities)) {
    errors.push('Entity list is missing')
    return errors
  }
  if (data.entities.length > MAX_ENTITIES) {
    errors.push(`Too many objects (max. ${MAX_ENTITIES})`)
    return errors
  }

  const solidAt = (c: number, r: number) => data.tiles[r][c] !== '.'
  let spawns = 0
  let goals = 0
  const occupied = new Map<string, string>()

  for (const e of data.entities) {
    if (!e || !isInt(e.x) || !isInt(e.y) || e.x < 0 || e.x >= LEVEL_COLS || e.y < 0 || e.y >= rows) {
      errors.push(`Objekt "${(e as EntityData | undefined)?.t}" is outside the level`)
      continue
    }
    const key = `${e.x},${e.y}`
    const label = `${e.t} at (${e.x}, ${e.y})`

    switch (e.t) {
      case 'spawn':
        spawns++
        if (solidAt(e.x, e.y)) errors.push(`${label}: start is inside a wall`)
        break
      case 'goal':
        goals++
        if (solidAt(e.x, e.y)) errors.push(`${label}: goal is inside a wall`)
        break
      case 'checkpoint':
        if (solidAt(e.x, e.y)) errors.push(`${label}: checkpoint is inside a wall`)
        break
      case 'spring':
        if (e.power !== 1 && e.power !== 2) errors.push(`${label}: invalid power`)
        if (e.dir !== undefined && e.dir !== 'u' && e.dir !== 'l' && e.dir !== 'r') {
          errors.push(`${label}: spring can only shoot up, left or right`)
        }
        if (solidAt(e.x, e.y)) errors.push(`${label}: spring is inside a wall`)
        break
      case 'spikes':
        if (!DIRS.includes(e.dir)) errors.push(`${label}: invalid direction`)
        if (solidAt(e.x, e.y)) errors.push(`${label}: spikes are inside a wall`)
        break
      case 'laser':
        if (!DIRS.includes(e.dir)) errors.push(`${label}: invalid direction`)
        if (!isInt(e.period) || !isInt(e.on) || !isInt(e.phase)) {
          errors.push(`${label}: times must be whole ticks`)
        } else if (e.period < 30 || e.period > 600 || e.on < 6 || e.on >= e.period || e.phase < 0) {
          errors.push(`${label}: invalid laser timing`)
        }
        break
      case 'hammer':
        if (!(e.len >= 1 && e.len <= 6)) errors.push(`${label}: arm length 1 to 6 tiles`)
        if (!(e.amp > 0 && e.amp <= 100)) errors.push(`${label}: amplitude 1 to 100 degrees`)
        if (!isInt(e.period) || e.period < 30 || e.period > 600) {
          errors.push(`${label}: period 30 to 600 ticks`)
        }
        if (!(e.phase >= 0 && e.phase < 1)) errors.push(`${label}: phase 0 to < 1`)
        break
      case 'saw':
        if (e.axis !== 'h' && e.axis !== 'v') errors.push(`${label}: invalid axis`)
        if (!isInt(e.len) || e.len < 1 || e.len > MAX_SAW_LEN) {
          errors.push(`${label}: track length 1 to ${MAX_SAW_LEN} tiles`)
        } else if (e.axis === 'h' ? e.x + e.len >= LEVEL_COLS : e.y + e.len >= rows) {
          errors.push(`${label}: track extends outside the level`)
        }
        if (!isInt(e.period) || e.period < 60 || e.period > 600) {
          errors.push(`${label}: period 60 to 600 ticks`)
        }
        if (!(e.phase >= 0 && e.phase < 1)) errors.push(`${label}: phase 0 to < 1`)
        break
      case 'mover':
        if (e.axis !== 'h' && e.axis !== 'v') errors.push(`${label}: invalid axis`)
        if (!isInt(e.w) || e.w < 1 || e.w > MAX_MOVER_W) {
          errors.push(`${label}: width 1 to ${MAX_MOVER_W} tiles`)
        }
        if (!isInt(e.len) || e.len < 1 || e.len > MAX_MOVER_LEN) {
          errors.push(`${label}: track length 1 to ${MAX_MOVER_LEN} tiles`)
        } else if (isInt(e.w) && (e.axis === 'h' ? e.x + e.len + e.w > LEVEL_COLS : e.x + e.w > LEVEL_COLS || e.y + e.len >= rows)) {
          errors.push(`${label}: track extends outside the level`)
        }
        if (!isInt(e.period) || e.period < 60 || e.period > 600) {
          errors.push(`${label}: period 60 to 600 ticks`)
        }
        if (!(e.phase >= 0 && e.phase < 1)) errors.push(`${label}: phase 0 to < 1`)
        break
      default:
        errors.push(`Unknown object "${(e as { t: string }).t}"`)
    }

    // Hammer-Aufhängungen und Sägen dürfen sich eine Zelle teilen, alles andere nicht.
    if (e.t !== 'hammer' && e.t !== 'saw' && e.t !== 'mover') {
      const prev = occupied.get(key)
      if (prev) errors.push(`${label}: cell is already occupied by "${prev}"`)
      else occupied.set(key, e.t)
    }
  }

  if (spawns !== 1) errors.push('Exactly one start point is required')
  if (goals !== 1) errors.push('Exactly one goal is required')
  return errors
}

/** Prüft und kompiliert ein Level. Wirft bei ungültigen Daten. */
export function compileLevel(data: LevelData): CompiledLevel {
  const errors = validateLevel(data)
  if (errors.length) throw new Error(`Invalid level: ${errors.join('; ')}`)
  return compileLevelUnchecked(data)
}

/**
 * Kompiliert ohne Validierung (für den Editor, wo Levels zwischenzeitlich unvollständig sind).
 * Größe und Tile-Zeilen müssen strukturell stimmen. Ohne Start oder Ziel liegen diese außerhalb des Levels.
 */
export function compileLevelUnchecked(data: LevelData): CompiledLevel {
  const cols = LEVEL_COLS
  const rows = LEVEL_ROWS[data.size]
  const solid = new Uint8Array(cols * rows)
  const kind = new Uint8Array(cols * rows)
  const brittle: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = kindOfChar(data.tiles[r][c])
      const i = r * cols + c
      kind[i] = k
      // Blinkblöcke blockieren keine Laser; ihre Festigkeit entscheidet die Welt je Tick
      solid[i] = k !== 0 && k !== K_ONEWAY && !isBlinkKind(k) ? 1 : 0
      if (k === K_BRITTLE) brittle.push(i)
    }
  }

  // Laser-Emitter sind solide, bevor Strahlen berechnet werden.
  for (const e of data.entities) {
    if (e.t === 'laser') {
      solid[e.y * cols + e.x] = 1
      kind[e.y * cols + e.x] = K_SOLID
    }
  }

  const level: CompiledLevel = {
    data,
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    solid,
    kind,
    brittle,
    spawn: { x: -1000, y: -1000 },
    goal: { x: -1000, y: -1000, w: 12, h: 12 },
    goalCell: { col: -100, row: -100 },
    checkpoints: [],
    springs: [],
    spikes: [],
    lasers: [],
    hammers: [],
    saws: [],
    movers: [],
  }

  for (const e of data.entities) {
    const px = e.x * TILE
    const py = e.y * TILE
    switch (e.t) {
      case 'spawn':
        level.spawn = { x: px + 2, y: py + 4 }
        break
      case 'goal':
        level.goal = { x: px + 2, y: py + 2, w: 12, h: 12 }
        level.goalCell = { col: e.x, row: e.y }
        break
      case 'checkpoint':
        level.checkpoints.push({
          col: e.x,
          row: e.y,
          rect: { x: px + 2, y: py, w: 12, h: TILE },
          spawn: { x: px + 2, y: py + 4 },
        })
        break
      case 'spring':
        {
          const dir = e.dir ?? 'u'
          level.springs.push({
            col: e.x,
            row: e.y,
            power: e.power,
            dir,
            rect:
              dir === 'u'
                ? { x: px + 1, y: py + 10, w: 14, h: 6 }
                : dir === 'r'
                  ? { x: px, y: py + 1, w: 6, h: 14 }
                  : { x: px + 10, y: py + 1, w: 6, h: 14 },
          })
        }
        break
      case 'spikes':
        level.spikes.push({ col: e.x, row: e.y, dir: e.dir, rect: spikeRect(px, py, e.dir) })
        break
      case 'laser':
        level.lasers.push({
          col: e.x,
          row: e.y,
          dir: e.dir,
          period: e.period,
          on: e.on,
          phase: e.phase % e.period,
          beam: beamRect(solid, cols, rows, e.x, e.y, e.dir),
        })
        break
      case 'hammer':
        level.hammers.push({
          col: e.x,
          row: e.y,
          ax: px + TILE / 2,
          ay: py + TILE / 2,
          len: e.len * TILE,
          amp: e.amp * DEG_TO_RAD,
          period: e.period,
          phase: e.phase,
        })
        break
      case 'saw': {
        const dx = e.axis === 'h' ? e.len * TILE : 0
        const dy = e.axis === 'v' ? e.len * TILE : 0
        level.saws.push({
          col: e.x,
          row: e.y,
          axis: e.axis,
          len: e.len,
          x0: px + TILE / 2,
          y0: py + TILE / 2,
          x1: px + TILE / 2 + dx,
          y1: py + TILE / 2 + dy,
          period: e.period,
          phase: e.phase,
        })
        break
      }
      case 'mover': {
        const dx = e.axis === 'h' ? e.len * TILE : 0
        const dy = e.axis === 'v' ? e.len * TILE : 0
        level.movers.push({
          col: e.x,
          row: e.y,
          axis: e.axis,
          len: e.len,
          w: e.w,
          x0: px,
          y0: py,
          x1: px + dx,
          y1: py + dy,
          period: e.period,
          phase: e.phase,
        })
        break
      }
    }
  }
  return level
}

function spikeRect(px: number, py: number, dir: Dir): Rect {
  // Hitbox ist bewusst kleiner als die Grafik (faire Kollision).
  switch (dir) {
    case 'u':
      return { x: px + 3, y: py + 8, w: 10, h: 8 }
    case 'd':
      return { x: px + 3, y: py, w: 10, h: 8 }
    case 'l':
      return { x: px + 8, y: py + 3, w: 8, h: 10 }
    case 'r':
      return { x: px, y: py + 3, w: 8, h: 10 }
  }
}

function beamRect(
  solid: Uint8Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
  dir: Dir,
): Rect | null {
  const dc = dir === 'l' ? -1 : dir === 'r' ? 1 : 0
  const dr = dir === 'u' ? -1 : dir === 'd' ? 1 : 0
  let c = col + dc
  let r = row + dr
  let n = 0
  while (c >= 0 && c < cols && r >= 0 && r < rows && !solid[r * cols + c]) {
    n++
    c += dc
    r += dr
  }
  if (n === 0) return null
  const len = n * TILE
  const off = (TILE - LASER_BEAM_W) / 2
  switch (dir) {
    case 'd':
      return { x: col * TILE + off, y: (row + 1) * TILE, w: LASER_BEAM_W, h: len }
    case 'u':
      return { x: col * TILE + off, y: row * TILE - len, w: LASER_BEAM_W, h: len }
    case 'r':
      return { x: (col + 1) * TILE, y: row * TILE + off, w: len, h: LASER_BEAM_W }
    case 'l':
      return { x: col * TILE - len, y: row * TILE + off, w: len, h: LASER_BEAM_W }
  }
}
