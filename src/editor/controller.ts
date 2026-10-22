import { playSfx } from '../audio/audio'
import { Renderer } from '../game/renderer'
import type { Theme } from '../game/theme'
import { LEVEL_COLS, LEVEL_WIDTH, TILE, World, compileLevelUnchecked, type EntityData } from '../sim'
import { defaultBrush, makeEntity, type Brush, type ToolId } from './brush'
import type { EditorDoc, EntityKey } from './doc'
import { drawOverlay, type Cell } from './overlay'

type Mode = 'none' | 'paint' | 'pan' | 'drag'

/** Zellen auf der Linie zwischen a und b (ohne a), damit schnelle Striche keine Lücken lassen. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = []
  let x = a.c
  let y = a.r
  const dx = Math.abs(b.c - a.c)
  const dy = Math.abs(b.r - a.r)
  const sx = a.c < b.c ? 1 : -1
  const sy = a.r < b.r ? 1 : -1
  let err = dx - dy
  while (x !== b.c || y !== b.r) {
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
    out.push({ c: x, r: y })
  }
  return out
}

/**
 * Verbindet Dokument, Renderer und Zeigereingabe des Editors.
 * Vue steuert nur Werkzeug, Pinsel und Menüs; das Zeichnen und Ziehen passiert hier.
 */
export class EditorController {
  tool: ToolId = 'tile'
  brush: Brush = defaultBrush()
  selected: EntityKey | null = null
  hover: Cell | null = null
  paused = false

  private renderer: Renderer
  private world!: World
  private compiledVersion = -1
  private raf = 0
  private lastTs = 0
  private time = 0

  private pointers = new Map<number, { x: number; y: number }>()
  private mode: Mode = 'none'
  private paintErase = false
  private lastCell: Cell | null = null
  private panY = 0

  private resizeObs: ResizeObserver
  private cleanups: Array<() => void> = []
  private minimap: HTMLCanvasElement | null = null
  private minimapKey = ''
  private minimapDragging = false
  private disposed = false

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
    theme: Theme,
    readonly doc: EditorDoc,
    private onUi: () => void,
  ) {
    this.renderer = new Renderer(canvas, theme)
    this.renderer.freeCamera = true
    this.rebuild()

    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.cleanups.push(() => el.removeEventListener(type, fn as EventListener))
    }
    on(canvas, 'pointerdown', (e) => this.onDown(e))
    on(canvas, 'pointermove', (e) => this.onMove(e))
    on(canvas, 'pointerup', (e) => this.onUp(e))
    on(canvas, 'pointercancel', (e) => this.onUp(e))
    on(canvas, 'pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hover = null
    })
    on(canvas, 'wheel', (e) => this.onWheel(e), { passive: false })
    on(canvas, 'contextmenu', (e) => e.preventDefault())

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()

    this.lastTs = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  // --- Öffentliche Steuerung -------------------------------------------------

  get camY(): number {
    return this.renderer.camY
  }

  get viewHeight(): number {
    return this.renderer.viewH
  }

  setTheme(theme: Theme): void {
    this.renderer.setTheme(theme)
    this.minimapKey = ''
  }

  setTool(tool: ToolId): void {
    this.tool = tool
    if (tool !== 'select') this.selected = null
    this.onUi()
  }

  setCamY(y: number): void {
    this.renderer.camY = Math.min(Math.max(0, y), this.renderer.maxCamY())
  }

  scrollToRow(row: number): void {
    this.setCamY(row * TILE - this.renderer.viewH * 0.4)
  }

  get selectedEntity(): EntityData | null {
    if (!this.selected) return null
    return this.doc.findEntity(this.selected.t, this.selected.x, this.selected.y)
  }

  select(key: EntityKey | null): void {
    this.selected = key
    this.onUi()
  }

  deleteSelected(): void {
    const e = this.selectedEntity
    if (!e) return
    if (this.doc.remove(e)) playSfx('erase')
    this.selected = null
    this.onUi()
  }

  updateSelected(patch: Record<string, unknown>): void {
    const e = this.selectedEntity
    if (e) this.doc.update(e, patch)
  }

  attachMinimap(canvas: HTMLCanvasElement): void {
    this.minimap = canvas
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const frac = (e.clientY - rect.top) / rect.height
      this.setCamY(frac * this.doc.rows * TILE - this.renderer.viewH / 2)
    }
    const down = (e: PointerEvent) => {
      this.minimapDragging = true
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* nicht kritisch */
      }
      move(e)
      e.preventDefault()
    }
    const mv = (e: PointerEvent) => {
      if (this.minimapDragging) move(e)
    }
    const up = () => {
      this.minimapDragging = false
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', mv)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    this.cleanups.push(() => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', mv)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    })
    this.minimapKey = ''
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    for (const c of this.cleanups) c()
    this.cleanups = []
  }

  // --- Zeigereingabe ---------------------------------------------------------

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private cellAt(p: { x: number; y: number }): Cell | null {
    const w = this.renderer.toWorld(p.x, p.y)
    const c = Math.floor(w.x / TILE)
    const r = Math.floor(w.y / TILE)
    return this.doc.inBounds(c, r) ? { c, r } : null
  }

  private avgY(): number {
    let sum = 0
    for (const p of this.pointers.values()) sum += p.y
    return sum / Math.max(1, this.pointers.size)
  }

  private onDown(e: PointerEvent): void {
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* nicht kritisch */
    }
    e.preventDefault()
    const p = this.pos(e)
    this.pointers.set(e.pointerId, p)

    if (this.pointers.size >= 2) {
      this.endAction()
      this.mode = 'pan'
      this.panY = this.avgY()
      return
    }

    const cell = this.cellAt(p)
    this.hover = cell
    if (!cell) return

    if (this.tool === 'select') {
      const ent = this.doc.entityAt(cell.c, cell.r)
      if (ent) {
        this.selected = { t: ent.t, x: ent.x, y: ent.y }
        this.mode = 'drag'
        this.doc.beginStroke()
      } else {
        this.selected = null
      }
      this.onUi()
      return
    }

    this.mode = 'paint'
    this.doc.beginStroke()
    if (this.tool === 'tile') this.paintErase = this.doc.isSolidVisible(cell.c, cell.r) && (this.doc.tileAt(cell.c, cell.r) ?? this.brush.tile) === this.brush.tile
    this.applyPaint(cell, true)
    this.lastCell = cell
  }

  private onMove(e: PointerEvent): void {
    const p = this.pos(e)
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p)
    const cell = this.cellAt(p)
    if (e.pointerType === 'mouse' || this.mode === 'paint') this.hover = cell

    if (this.mode === 'pan') {
      const y = this.avgY()
      this.setCamY(this.renderer.camY - (y - this.panY) / this.renderer.pixelsPerUnit)
      this.panY = y
    } else if (this.mode === 'paint') {
      if (cell && this.lastCell && (cell.c !== this.lastCell.c || cell.r !== this.lastCell.r)) {
        for (const c of lineCells(this.lastCell, cell)) this.applyPaint(c, false)
        this.lastCell = cell
      } else if (cell && !this.lastCell) {
        this.applyPaint(cell, false)
        this.lastCell = cell
      }
    } else if (this.mode === 'drag' && this.selected && cell) {
      if (cell.c !== this.selected.x || cell.r !== this.selected.y) {
        if (this.doc.move(this.selected, cell.c, cell.r)) {
          this.selected = { t: this.selected.t, x: cell.c, y: cell.r }
          this.onUi()
        }
      }
    }
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId)
    if (e.pointerType !== 'mouse') this.hover = null
    if (this.pointers.size === 0) this.endAction()
    else if (this.mode === 'pan' && this.pointers.size === 1) this.mode = 'none'
  }

  private endAction(): void {
    if (this.mode === 'paint' || this.mode === 'drag') this.doc.endStroke()
    this.mode = 'none'
    this.lastCell = null
    this.onUi()
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    this.setCamY(this.renderer.camY + e.deltaY / this.renderer.pixelsPerUnit)
  }

  private applyPaint(cell: Cell, first: boolean): void {
    const { c, r } = cell
    switch (this.tool) {
      case 'tile':
        if (this.doc.paintTile(c, r, this.paintErase ? false : this.brush.tile)) {
          playSfx(this.paintErase ? 'erase' : 'place')
        }
        return
      case 'erase':
        if (this.doc.eraseCell(c, r)) playSfx('erase')
        return
      default: {
        const ent = makeEntity(this.tool, c, r, this.brush)
        if (!ent) return
        if (first) {
          // Zweites Antippen mit gleichen Werten entfernt das Objekt wieder
          const existing = this.doc.findEntity(ent.t, c, r)
          if (existing && JSON.stringify(existing) === JSON.stringify(ent)) {
            if (this.doc.remove(existing)) playSfx('erase')
            return
          }
        }
        if (this.doc.place(ent)) playSfx('place')
      }
    }
  }

  // --- Zeichnen --------------------------------------------------------------

  private rebuild(): void {
    const level = compileLevelUnchecked(this.doc.toLevelData())
    this.renderer.setLevel(level)
    this.world = new World(level)
    this.compiledVersion = this.doc.version
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w <= 0 || h <= 0) return
    this.renderer.resize(Math.min(w, 520), h, Math.min(window.devicePixelRatio || 1, 3))
  }

  private frame = (ts: number): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const dt = Math.min((ts - this.lastTs) / 1000, 0.1)
    this.lastTs = ts
    if (this.paused) return

    this.time += dt
    if (this.doc.version !== this.compiledVersion) this.rebuild()

    const ticks = this.time * 60
    this.world.tick = Math.floor(ticks)
    this.renderer.update(dt, this.world)
    this.renderer.draw(this.world, ticks - Math.floor(ticks), true)

    const ctx = this.renderer.worldContext()
    drawOverlay(ctx, {
      doc: this.doc,
      theme: this.renderer.theme,
      camY: this.renderer.camY,
      viewH: this.renderer.viewH,
      hover: this.hover,
      tool: this.tool,
      brush: this.brush,
      selected: this.selected,
      time: this.time,
    })
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    this.drawMinimap()
  }

  private drawMinimap(): void {
    const cv = this.minimap
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const th = this.renderer.theme
    const key = `${this.doc.version}|${this.renderer.camY.toFixed(1)}|${this.renderer.viewH.toFixed(0)}|${rect.width}x${rect.height}|${th.id}`
    if (key === this.minimapKey) return
    this.minimapKey = key

    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const sx = rect.width / LEVEL_WIDTH
    const sy = rect.height / (this.doc.rows * TILE)
    ctx.fillStyle = th.ui.panel
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.fillStyle = th.solidTop
    for (let r = 0; r < this.doc.rows; r++) {
      let c = 0
      while (c < LEVEL_COLS) {
        if (!this.doc.isSolidVisible(c, r)) {
          c++
          continue
        }
        let end = c
        while (end + 1 < LEVEL_COLS && this.doc.isSolidVisible(end + 1, r)) end++
        ctx.fillRect(c * TILE * sx, r * TILE * sy, (end - c + 1) * TILE * sx, Math.max(1, TILE * sy))
        c = end + 1
      }
    }
    for (const e of this.doc.entityList) {
      ctx.fillStyle =
        e.t === 'spawn'
          ? th.player
          : e.t === 'goal'
            ? th.goal
            : e.t === 'spring' || e.t === 'checkpoint'
              ? th.help
              : th.danger
      const size = e.t === 'spawn' || e.t === 'goal' ? 4 : 2.5
      ctx.fillRect(e.x * TILE * sx + (TILE * sx - size) / 2, e.y * TILE * sy + (TILE * sy - size) / 2, size, size)
    }

    const vy = this.renderer.camY * sy
    const vh = Math.min(this.renderer.viewH * sy, rect.height - vy)
    ctx.lineWidth = 2
    ctx.strokeStyle = th.outline
    ctx.strokeRect(1, vy + 1, rect.width - 2, Math.max(4, vh - 2))
    ctx.lineWidth = 1
    ctx.strokeStyle = th.ui.accent
    ctx.strokeRect(1, vy + 1, rect.width - 2, Math.max(4, vh - 2))
  }
}
