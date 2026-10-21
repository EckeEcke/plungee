import type { Theme } from '../game/theme'
import { LEVEL_COLS, LEVEL_WIDTH, TILE, type Dir } from '../sim'
import type { Brush, ToolId } from './brush'
import type { EditorDoc, EntityKey } from './doc'

export interface Cell {
  c: number
  r: number
}

export interface OverlayState {
  doc: EditorDoc
  theme: Theme
  camY: number
  viewH: number
  hover: Cell | null
  tool: ToolId
  brush: Brush
  selected: EntityKey | null
  time: number
}

const OBJECT_TOOLS: ToolId[] = ['spawn', 'goal', 'checkpoint', 'spring', 'spikes', 'laser', 'hammer', 'saw']
/** Diese Objekte dürfen auch auf festen Wänden stehen */
const WALL_OK: ToolId[] = ['laser', 'hammer', 'saw']

/**
 * Editor-Hilfen über dem Spielbild: Raster, Hammer-Schwungbogen, Vorschau, Auswahl.
 * Der Kontext muss auf Weltkoordinaten stehen (Renderer.worldContext()).
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, s: OverlayState): void {
  const { doc } = s
  const height = doc.rows * TILE
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  drawVoid(ctx, s, height)
  drawGrid(ctx, s, height)
  drawHammerArcs(ctx, s)
  drawSawTracks(ctx, s)
  if (s.hover) drawGhost(ctx, s, s.hover)
  if (s.selected) drawSelection(ctx, s, s.selected)

  ctx.restore()
}

function drawVoid(ctx: CanvasRenderingContext2D, s: OverlayState, height: number): void {
  const th = s.theme
  if (s.camY + s.viewH < height - 4) return
  ctx.fillStyle = th.danger
  ctx.globalAlpha = 0.14
  ctx.fillRect(0, height, LEVEL_WIDTH, 400)
  ctx.globalAlpha = 0.7
  ctx.font = '700 7px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = th.dangerDark
  ctx.fillText('Pit: the level ends here', LEVEL_WIDTH / 2, height + 12)
  ctx.globalAlpha = 1
}

function drawGrid(ctx: CanvasRenderingContext2D, s: OverlayState, height: number): void {
  const th = s.theme
  const r0 = Math.max(0, Math.floor(s.camY / TILE))
  const r1 = Math.min(s.doc.rows, Math.ceil((s.camY + s.viewH) / TILE))
  const yTop = Math.max(0, s.camY)
  const yBot = Math.min(height, s.camY + s.viewH)

  ctx.strokeStyle = th.outline
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.1
  ctx.beginPath()
  for (let c = 0; c <= LEVEL_COLS; c++) {
    ctx.moveTo(c * TILE, yTop)
    ctx.lineTo(c * TILE, yBot)
  }
  for (let r = r0; r <= r1; r++) {
    ctx.moveTo(0, r * TILE)
    ctx.lineTo(LEVEL_WIDTH, r * TILE)
  }
  ctx.stroke()

  // Jede fünfte Zeile hervorheben und beschriften
  ctx.globalAlpha = 0.22
  ctx.beginPath()
  for (let r = r0; r <= r1; r++) {
    if (r % 5 !== 0) continue
    ctx.moveTo(0, r * TILE)
    ctx.lineTo(LEVEL_WIDTH, r * TILE)
  }
  ctx.stroke()
  ctx.globalAlpha = 0.55
  ctx.font = '700 6px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = th.outline
  for (let r = r0; r <= r1; r++) {
    if (r % 5 === 0 && r < s.doc.rows) ctx.fillText(String(r), 2, r * TILE + 7)
  }

  // Levelrand
  ctx.globalAlpha = 0.65
  ctx.lineWidth = 1.2
  ctx.strokeStyle = th.outline
  ctx.strokeRect(0, 0, LEVEL_WIDTH, height)
  ctx.globalAlpha = 1
}

function drawHammerArcs(ctx: CanvasRenderingContext2D, s: OverlayState): void {
  const th = s.theme
  for (const e of s.doc.entityList) {
    if (e.t !== 'hammer') continue
    const ax = e.x * TILE + TILE / 2
    const ay = e.y * TILE + TILE / 2
    if (ay - 8 > s.camY + s.viewH || ay + e.len * TILE + 12 < s.camY) continue
    const len = e.len * TILE
    const amp = (e.amp * Math.PI) / 180
    const isSel = s.selected && s.selected.t === 'hammer' && s.selected.x === e.x && s.selected.y === e.y

    ctx.strokeStyle = th.danger
    ctx.lineWidth = isSel ? 1.6 : 1
    ctx.globalAlpha = isSel ? 0.9 : 0.5
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    for (let i = 0; i <= 28; i++) {
      const a = -amp + (2 * amp * i) / 28
      const x = ax + Math.sin(a) * len
      const y = ay + Math.cos(a) * len
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Endlagen
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + Math.sin(-amp) * len, ay + Math.cos(-amp) * len)
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + Math.sin(amp) * len, ay + Math.cos(amp) * len)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
}

function trackEnd(axis: 'h' | 'v', c: number, r: number, len: number, rows: number): number {
  // Wie der Editor: Bahn wird an den Levelrand gekürzt
  return axis === 'h' ? Math.min(len, LEVEL_COLS - 1 - c) : Math.min(len, rows - 1 - r)
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  color: string,
  c: number,
  r: number,
  axis: 'h' | 'v',
  len: number,
  rows: number,
  alpha: number,
  width: number,
): void {
  const n = trackEnd(axis, c, r, len, rows)
  const x0 = c * TILE + TILE / 2
  const y0 = r * TILE + TILE / 2
  const x1 = axis === 'h' ? x0 + n * TILE : x0
  const y1 = axis === 'v' ? y0 + n * TILE : y0
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.lineWidth = width
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(x1, y1, 2.2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawSawTracks(ctx: CanvasRenderingContext2D, s: OverlayState): void {
  for (const e of s.doc.entityList) {
    if (e.t !== 'saw') continue
    const isSel = !!s.selected && s.selected.t === 'saw' && s.selected.x === e.x && s.selected.y === e.y
    drawTrack(ctx, s.theme.danger, e.x, e.y, e.axis, e.len, s.doc.rows, isSel ? 0.9 : 0.5, isSel ? 1.6 : 1)
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, s: OverlayState, h: Cell): void {
  const th = s.theme
  const x = h.c * TILE
  const y = h.r * TILE
  const tool = s.tool

  if (tool === 'select') {
    if (tool === 'select') {
      ctx.strokeStyle = th.outline
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    return
  }

  let fill = th.solidTop
  if (tool === 'tile') {
    const k = s.brush.tile
    fill = k === 'I' ? th.ice : k === 'B' ? th.brittle : k === '=' ? th.solidTop : th.solidTop
  }
  let blocked = false
  if (tool === 'erase') fill = th.danger
  else if (OBJECT_TOOLS.includes(tool)) {
    fill = tool === 'spring' || tool === 'checkpoint' ? th.help : tool === 'goal' ? th.goal : th.player
    if (tool === 'spikes' || tool === 'laser' || tool === 'hammer' || tool === 'saw') fill = th.danger
    blocked = !WALL_OK.includes(tool) && s.doc.isSolid(h.c, h.r)
  }
  if (blocked) fill = th.dangerDark

  ctx.globalAlpha = blocked ? 0.28 : 0.42
  ctx.fillStyle = fill
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = th.outline
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)

  if (tool === 'erase' || blocked) {
    ctx.beginPath()
    ctx.moveTo(x + 4, y + 4)
    ctx.lineTo(x + TILE - 4, y + TILE - 4)
    ctx.moveTo(x + TILE - 4, y + 4)
    ctx.lineTo(x + 4, y + TILE - 4)
    ctx.stroke()
  }
  if (tool === 'spikes') drawArrow(ctx, x + 8, y + 8, s.brush.spikes.dir, th.outline)
  if (tool === 'laser') drawArrow(ctx, x + 8, y + 8, s.brush.laser.dir, th.outline)
  if (tool === 'spring' && s.brush.spring.dir && s.brush.spring.dir !== 'u') {
    drawArrow(ctx, x + 8, y + 8, s.brush.spring.dir, th.outline)
  }
  if (tool === 'tile' && (s.brush.tile === '<' || s.brush.tile === '>')) {
    drawArrow(ctx, x + 8, y + 8, s.brush.tile === '<' ? 'l' : 'r', th.outline)
  }
  if (tool === 'saw' && !blocked) drawTrack(ctx, th.danger, h.c, h.r, s.brush.saw.axis, s.brush.saw.len, s.doc.rows, 0.55, 1)
  ctx.globalAlpha = 1
}

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, color: string): void {
  const a = dir === 'u' ? 0 : dir === 'r' ? Math.PI / 2 : dir === 'd' ? Math.PI : -Math.PI / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(a)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -5)
  ctx.lineTo(4, 3)
  ctx.lineTo(-4, 3)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawSelection(ctx: CanvasRenderingContext2D, s: OverlayState, sel: EntityKey): void {
  const th = s.theme
  if (!s.doc.findEntity(sel.t, sel.x, sel.y)) return
  const x = sel.x * TILE
  const y = sel.y * TILE
  ctx.lineWidth = 2.4
  ctx.strokeStyle = th.outline
  ctx.strokeRect(x - 0.5, y - 0.5, TILE + 1, TILE + 1)
  ctx.lineWidth = 1.3
  ctx.strokeStyle = th.ui.accent
  ctx.setLineDash([3, 2])
  ctx.lineDashOffset = -s.time * 8
  ctx.strokeRect(x - 0.5, y - 0.5, TILE + 1, TILE + 1)
  ctx.setLineDash([])
}
