import {
  LEVEL_COLS,
  LEVEL_ROWS,
  MAX_ENTITIES,
  TILE_CHARS,
  MAX_SAW_LEN,
  validateLevel,
  type EntityData,
  type TileChar,
  type LevelData,
  type LevelSize,
} from '../sim'
import { levelHash } from './hash'

export type EntityKey = { t: EntityData['t']; x: number; y: number }

interface Snapshot {
  size: LevelSize
  tiles: string[]
  entities: EntityData[]
}

const MAX_HISTORY = 120

/**
 * Bearbeitbares Level mit Regeln und Undo/Redo. Unabhängig von Vue und Canvas.
 *
 * Regeln:
 * - Genau ein Start und ein Ziel; ein neues ersetzt das alte.
 * - Pro Zelle höchstens ein Objekt, außer Hammer-Aufhängungen (die dürfen in jeder Zelle sitzen).
 * - Feder, Stacheln, Checkpoint, Start und Ziel können nicht in einer festen Wand stehen.
 * - Der Laser-Emitter ersetzt die Wand in seiner Zelle.
 */
export class EditorDoc {
  size: LevelSize
  title: string
  /** Wird bei jeder Änderung erhöht (auch bei Undo/Redo) */
  version = 0
  onChange: (() => void) | null = null

  private tiles: string[][]
  private entities: EntityData[]
  private undoStack: string[] = []
  private redoStack: string[] = []
  private depth = 0
  private startSnap = ''

  constructor(data?: LevelData) {
    if (data) {
      this.size = data.size
      this.title = data.title ?? ''
      const rows = LEVEL_ROWS[data.size]
      this.tiles = parseTiles(data.tiles, rows)
      this.entities = sanitizeEntities(data.entities, rows)
    } else {
      this.size = 'short'
      this.title = ''
      this.tiles = emptyTiles(LEVEL_ROWS.short)
      this.entities = []
    }
  }

  /** Neues Level mit Boden, Startplattform und Ziel. */
  static createStarter(size: LevelSize, title = 'New level'): EditorDoc {
    const rows = LEVEL_ROWS[size]
    const doc = new EditorDoc()
    doc.size = size
    doc.title = title
    doc.tiles = emptyTiles(rows)
    for (let c = 0; c < LEVEL_COLS; c++) doc.tiles[rows - 1][c] = '#'
    for (let c = 5; c <= 10; c++) doc.tiles[4][c] = '#'
    doc.entities = [
      { t: 'spawn', x: 7, y: 3 },
      { t: 'goal', x: 8, y: rows - 2 },
    ]
    return doc
  }

  get rows(): number {
    return LEVEL_ROWS[this.size]
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // --- Abfragen --------------------------------------------------------------

  inBounds(c: number, r: number): boolean {
    return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < LEVEL_COLS && r >= 0 && r < this.rows
  }

  /** Nur das Tile-Raster */
  isSolid(c: number, r: number): boolean {
    return this.inBounds(c, r) && this.tiles[r][c] !== '.'
  }

  /** Block-Typ in einer Zelle, null wenn leer */
  tileAt(c: number, r: number): TileChar | null {
    if (!this.inBounds(c, r)) return null
    const ch = this.tiles[r][c]
    return ch === '.' ? null : (ch as TileChar)
  }

  /** Raster oder Laser-Emitter (so sieht der Spieler die Zelle) */
  isSolidVisible(c: number, r: number): boolean {
    return this.isSolid(c, r) || this.findEntity('laser', c, r) !== null
  }

  get entityList(): readonly EntityData[] {
    return this.entities
  }

  findEntity(t: EntityData['t'], x: number, y: number): EntityData | null {
    return this.entities.find((e) => e.t === t && e.x === x && e.y === y) ?? null
  }

  /** Objekt in der Zelle; normale Objekte haben Vorrang vor Hammer-Aufhängungen und Sägen. */
  entityAt(c: number, r: number): EntityData | null {
    let overlay: EntityData | null = null
    for (const e of this.entities) {
      if (e.x !== c || e.y !== r) continue
      if (!isOverlay(e.t)) return e
      overlay = e
    }
    return overlay
  }

  // --- Änderungen ------------------------------------------------------------

  /** Mehrere Änderungen als einen Undo-Schritt zusammenfassen (z. B. Ziehen mit dem Finger). */
  beginStroke(): void {
    if (this.depth === 0) this.startSnap = this.serialize()
    this.depth++
  }

  endStroke(): void {
    if (this.depth === 0) return
    this.depth--
    if (this.depth === 0) this.finish()
  }

  /**
   * Malt einen Block-Typ in eine Zelle (true = normaler Block) oder löscht ihn (false).
   * Ein anderer Typ ersetzt den vorhandenen.
   */
  paintTile(c: number, r: number, kind: boolean | TileChar): boolean {
    if (!this.inBounds(c, r)) return false
    const ch: TileChar | null = kind === true ? '#' : kind === false ? null : kind
    if (ch !== null && !TILE_CHARS.includes(ch)) return false
    return this.mutate(() => {
      let changed = false
      if (ch !== null) {
        if (this.findEntity('laser', c, r)) return false // Emitter ist schon eine Wand
        if (this.tiles[r][c] !== ch) {
          this.tiles[r][c] = ch
          changed = true
        }
        const before = this.entities.length
        this.entities = this.entities.filter((e) => !(e.x === c && e.y === r && !isOverlay(e.t)))
        if (this.entities.length !== before) changed = true
      } else {
        if (this.tiles[r][c] !== '.') {
          this.tiles[r][c] = '.'
          changed = true
        }
        const before = this.entities.length
        this.entities = this.entities.filter((e) => !(e.t === 'laser' && e.x === c && e.y === r))
        if (this.entities.length !== before) changed = true
      }
      return changed
    })
  }

  /** Entfernt Wand und alle Objekte der Zelle (inklusive Hammer-Aufhängung). */
  eraseCell(c: number, r: number): boolean {
    if (!this.inBounds(c, r)) return false
    return this.mutate(() => {
      const before = this.entities.length
      this.entities = this.entities.filter((e) => !(e.x === c && e.y === r))
      let changed = this.entities.length !== before
      if (this.tiles[r][c] !== '.') {
        this.tiles[r][c] = '.'
        changed = true
      }
      return changed
    })
  }

  /** Setzt ein Objekt. Gibt false zurück, wenn die Regeln es nicht erlauben. */
  place(e: EntityData): boolean {
    if (!this.inBounds(e.x, e.y)) return false
    return this.mutate(() => this.placeInternal(e))
  }

  remove(key: EntityKey): boolean {
    return this.mutate(() => {
      const before = this.entities.length
      this.entities = this.entities.filter((e) => !(e.t === key.t && e.x === key.x && e.y === key.y))
      return this.entities.length !== before
    })
  }

  /** Ändert Parameter eines Objekts (Richtung, Takt, Länge ...). Position und Typ bleiben. */
  update(key: EntityKey, patch: Record<string, unknown>): boolean {
    return this.mutate(() => {
      const e = this.findEntity(key.t, key.x, key.y)
      if (!e) return false
      let changed = false
      for (const [k, v] of Object.entries(patch)) {
        if (k === 't' || k === 'x' || k === 'y') continue
        const rec = e as unknown as Record<string, unknown>
        if (rec[k] !== v) {
          rec[k] = v
          changed = true
        }
      }
      if (e.t === 'spring' && e.dir === 'u') delete e.dir
      if (e.t === 'saw') {
        // Bahn an den Levelrand kürzen (z. B. nach Achsenwechsel)
        const before = e.len
        fitSaw(e, this.rows)
        if (e.len !== before) changed = true
      }
      return changed
    })
  }

  /** Verschiebt ein Objekt. Bei Regelverstoß bleibt alles wie vorher. */
  move(key: EntityKey, c: number, r: number): boolean {
    if (!this.inBounds(c, r)) return false
    if (key.x === c && key.y === r) return false
    return this.mutate(() => {
      const old = this.findEntity(key.t, key.x, key.y)
      if (!old) return false
      const backup = { ...old }
      this.entities = this.entities.filter((e) => e !== old)
      const moved = { ...backup, x: c, y: r } as EntityData
      if (this.placeInternal(moved)) return true
      this.entities.push(backup)
      return false
    })
  }

  /** Größe ändern. Inhalt bleibt oben verankert, überstehende Zeilen und Objekte gehen verloren. */
  resize(size: LevelSize): boolean {
    if (size === this.size) return false
    return this.mutate(() => {
      const rows = LEVEL_ROWS[size]
      const next = emptyTiles(rows)
      for (let r = 0; r < Math.min(rows, this.rows); r++) next[r] = [...this.tiles[r]]
      this.tiles = next
      this.entities = this.entities.filter((e) => e.y < rows && (e.t !== 'saw' || fitSaw(e, rows)))
      this.size = size
      return true
    })
  }

  /** Prüft, ob beim Wechsel auf diese Größe Inhalt verloren ginge. */
  wouldLoseContent(size: LevelSize): boolean {
    const rows = LEVEL_ROWS[size]
    if (rows >= this.rows) return false
    for (let r = rows; r < this.rows; r++) if (this.tiles[r].some((ch) => ch !== '.')) return true
    return this.entities.some((e) => e.y >= rows)
  }

  // --- Verlauf ---------------------------------------------------------------

  undo(): boolean {
    if (this.depth > 0) return false
    const snap = this.undoStack.pop()
    if (snap === undefined) return false
    this.redoStack.push(this.serialize())
    this.load(snap)
    this.bump()
    return true
  }

  redo(): boolean {
    if (this.depth > 0) return false
    const snap = this.redoStack.pop()
    if (snap === undefined) return false
    this.undoStack.push(this.serialize())
    this.load(snap)
    this.bump()
    return true
  }

  // --- Ein- und Ausgabe ------------------------------------------------------

  toLevelData(): LevelData {
    return {
      v: 1,
      size: this.size,
      tiles: this.tiles.map((row) => row.join('')),
      entities: this.entities.map((e) => ({ ...e })),
      title: this.title || undefined,
    }
  }

  /** Ersetzt den gesamten Inhalt (Import, Neu). Löscht den Verlauf. */
  replaceWith(data: LevelData): void {
    this.size = data.size
    this.title = data.title ?? ''
    const rows = LEVEL_ROWS[data.size]
    this.tiles = parseTiles(data.tiles, rows)
    this.entities = sanitizeEntities(data.entities, rows)
    this.undoStack = []
    this.redoStack = []
    this.depth = 0
    this.bump()
  }

  validate(): string[] {
    return validateLevel(this.toLevelData())
  }

  hash(): string {
    return levelHash(this.toLevelData())
  }

  // --- intern ----------------------------------------------------------------

  private placeInternal(e: EntityData): boolean {
    const free = e.t === 'hammer' || e.t === 'laser' || e.t === 'saw'
    if (!free && this.tiles[e.y][e.x] !== '.') return false
    if (e.t === 'saw' && !fitSaw(e, this.rows)) return false

    let next = this.entities
    if (e.t === 'spawn' || e.t === 'goal') next = next.filter((x) => x.t !== e.t)
    if (isOverlay(e.t)) {
      next = next.filter((x) => !(x.t === e.t && x.x === e.x && x.y === e.y))
    } else {
      next = next.filter((x) => !(!isOverlay(x.t) && x.x === e.x && x.y === e.y))
    }
    if (next.length >= MAX_ENTITIES) return false

    const stored = { ...e }
    if (stored.t === 'spring' && stored.dir === 'u') delete stored.dir
    this.entities = [...next, stored]
    if (e.t === 'laser') this.tiles[e.y][e.x] = '.'
    return true
  }

  private mutate(fn: () => boolean): boolean {
    const outer = this.depth > 0
    if (!outer) this.startSnap = this.serialize()
    this.depth++
    let changed = false
    try {
      changed = fn()
    } finally {
      this.depth--
    }
    if (changed) this.bump()
    if (!outer) this.finish()
    return changed
  }

  private finish(): void {
    if (this.serialize() === this.startSnap) return
    this.undoStack.push(this.startSnap)
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack.length = 0
    this.bump()
  }

  private bump(): void {
    this.version++
    this.onChange?.()
  }

  private serialize(): string {
    const snap: Snapshot = {
      size: this.size,
      tiles: this.tiles.map((row) => row.join('')),
      entities: this.entities,
    }
    return JSON.stringify(snap)
  }

  private load(json: string): void {
    const snap = JSON.parse(json) as Snapshot
    this.size = snap.size
    this.tiles = parseTiles(snap.tiles, LEVEL_ROWS[snap.size])
    this.entities = snap.entities.map((e) => ({ ...e }))
  }
}

function emptyTiles(rows: number): string[][] {
  return Array.from({ length: rows }, () => Array<string>(LEVEL_COLS).fill('.'))
}

function parseTiles(lines: string[], rows: number): string[][] {
  const out = emptyTiles(rows)
  for (let r = 0; r < Math.min(rows, lines.length); r++) {
    const line = lines[r]
    for (let c = 0; c < Math.min(LEVEL_COLS, line.length); c++) out[r][c] = line[c] !== '.' && TILE_CHARS.includes(line[c] as TileChar) ? line[c] : '.'
  }
  return out
}

/** Objekte, die in einer Zelle neben einem normalen Objekt liegen dürfen */
function isOverlay(t: EntityData['t']): boolean {
  return t === 'hammer' || t === 'saw'
}

/** Kürzt die Bahn einer Säge, bis sie ins Level passt. false, wenn nicht einmal ein Tile Platz hat. */
function fitSaw(e: Extract<EntityData, { t: 'saw' }>, rows: number): boolean {
  const room = e.axis === 'h' ? LEVEL_COLS - 1 - e.x : rows - 1 - e.y
  e.len = Math.min(e.len, room, MAX_SAW_LEN)
  return e.len >= 1
}

function sanitizeEntities(list: EntityData[], rows: number): EntityData[] {
  return list
    .filter(
      (e) =>
        e &&
        Number.isInteger(e.x) &&
        Number.isInteger(e.y) &&
        e.x >= 0 &&
        e.x < LEVEL_COLS &&
        e.y >= 0 &&
        e.y < rows,
    )
    .map((e) => ({ ...e }))
}
