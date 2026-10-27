import {
  HAMMER_HEAD_R,
  K_BELT_L,
  K_BELT_R,
  BLINK_WARN,
  K_BLINK_A,
  K_BRITTLE,
  K_EMPTY,
  K_GATE_D,
  K_GATE_L,
  K_GATE_R,
  K_ICE,
  K_ONEWAY,
  LEVEL_WIDTH,
  MOVER_H,
  SAW_R,
  blinkSolid,
  blinkTicksLeft,
  isBlinkKind,
  PLAYER_H,
  PLAYER_W,
  TERMINAL_VY,
  TILE,
  clamp,
  crusherState,
  hammerState,
  laserPhase,
  sawPos,
  type CompiledCrusher,
  type CompiledHammer,
  type CompiledSaw,
  type CompiledLaser,
  type CompiledLevel,
  type CompiledMover,
  type CompiledSpikes,
  type CompiledSpring,
  type Dir,
  type SimEvent,
  type World,
} from '../sim'
import { drawCharacter } from './character'
import { look } from './look'
import { Particles } from './particles'
import type { Theme } from './theme'

const WRAP = 1000
const TAU = Math.PI * 2

interface DecorItem {
  x: number
  y: number
  size: number
  kind: number
  color: number
  f: number
  rot: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function frac(v: number): number {
  return v - Math.floor(v)
}

/** Pfad eines Rechtecks mit einzeln einstellbaren Eckradien. */
function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}

const DIR_ANGLE_UP: Record<Dir, number> = { u: 0, r: Math.PI / 2, d: Math.PI, l: -Math.PI / 2 }
// Emitter-Düse zeigt im lokalen System nach unten
const DIR_ANGLE_DOWN: Record<Dir, number> = { d: 0, l: Math.PI / 2, u: Math.PI, r: -Math.PI / 2 }

/**
 * Zeichnet das Spiel komplett per Canvas 2D (keine Bilddateien).
 * Alle Koordinaten sind logische Einheiten, die Skalierung passiert über die Canvas-Transformation.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D
  private level!: CompiledLevel
  private decor: DecorItem[] = []
  private scale = 1
  private dpr = 1
  viewH = 400
  camY = 0
  /** true = Kamera folgt nicht dem Spieler (Editor), camY wird von außen gesetzt */
  freeCamera = false
  /** Platz (CSS-Pixel) für die Bedienleiste oben: die Kamera darf so weit über das Levelende hinaus nach oben, damit die obersten Reihen nicht unter ihr liegen */
  private topInsetPx = 0
  private snap = true
  private squash = 0
  private shake = 0
  private time = 0
  private springAnim: number[] = []
  /** Letzter Tick, für den Quetscher-Aufschläge schon verarbeitet wurden */
  private crusherTick = -1
  /** Wird aufgerufen, wenn ein Quetscher im Bild aufschlägt (size = Kantenlänge in Tiles); der Ton hängt daran */
  onCrusherImpact: ((size: number) => void) | null = null
  private checkpointAnim: number[] = []
  readonly particles = new Particles()

  constructor(
    private canvas: HTMLCanvasElement,
    public theme: Theme,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not supported')
    this.ctx = ctx
    this.buildDecor()
  }

  setLevel(level: CompiledLevel): void {
    this.level = level
    this.springAnim = level.springs.map(() => 0)
    this.crusherTick = -1
    this.checkpointAnim = level.checkpoints.map(() => 0)
    this.reset()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /** Visuellen Zustand zurücksetzen (z. B. nach Neustart). */
  reset(): void {
    this.snap = true
    this.squash = 0
    this.shake = 0
    this.particles.clear()
    this.springAnim.fill(0)
    this.checkpointAnim.fill(0)
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr
    this.scale = cssW / LEVEL_WIDTH
    this.viewH = cssH / this.scale
    this.canvas.width = Math.max(1, Math.round(cssW * dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * dpr))
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.snap = true
  }

  setTopInset(px: number): void {
    this.topInsetPx = Math.max(0, px)
  }

  /** Kleinste erlaubte Kameraposition: 0 bzw. so weit darüber, dass die Leiste über dem Level liegt */
  private minCamY(): number {
    return this.freeCamera ? 0 : -this.topInsetPx / this.scale
  }

  /** Größte erlaubte Kameraposition (oberer Rand der Ansicht) */
  maxCamY(): number {
    return Math.max(0, this.level.height - this.viewH)
  }

  /** Pixel in logischen Einheiten pro CSS-Pixel-Kehrwert: Weltgröße eines CSS-Pixels */
  get pixelsPerUnit(): number {
    return this.scale
  }

  /** CSS-Pixel relativ zur Canvas-Ecke in Weltkoordinaten umrechnen */
  toWorld(px: number, py: number): { x: number; y: number } {
    return { x: px / this.scale, y: py / this.scale + this.camY }
  }

  /** Setzt die Transformation auf Weltkoordinaten (ohne Wackeln) und gibt den Kontext zurück. */
  worldContext(): CanvasRenderingContext2D {
    const k = this.dpr * this.scale
    this.ctx.setTransform(k, 0, 0, k, 0, -this.camY * k)
    return this.ctx
  }

  private buildDecor(): void {
    const rnd = mulberry32(0x9e3779b9)
    this.decor = []
    for (let i = 0; i < 26; i++) {
      this.decor.push({
        x: rnd() * LEVEL_WIDTH,
        y: rnd() * WRAP,
        size: 7 + rnd() * 15,
        kind: Math.floor(rnd() * 7),
        color: Math.floor(rnd() * 4),
        f: 0.18 + rnd() * 0.32,
        rot: rnd() * TAU,
      })
    }
  }

  // --- Ereignisse aus der Simulation -----------------------------------------

  handleEvent(e: SimEvent, world: World): void {
    const th = this.theme
    const lv = this.level
    switch (e.type) {
      case 'death':
        this.particles.burst(e.x, e.y, 16, {
          colors: [th.player, th.playerShade, '#ffffff'],
          speed: 150,
          life: 0.65,
          size: 2.2,
          gravity: 280,
          shape: 'square',
        })
        this.shake = Math.max(this.shake, 5)
        break
      case 'respawn':
        this.particles.burst(e.x + PLAYER_W / 2, e.y + PLAYER_H / 2, 8, {
          colors: th.decor,
          speed: 60,
          life: 0.4,
          size: 1.6,
          gravity: 0,
          shape: 'star',
        })
        this.snap = true
        break
      case 'spring': {
        this.springAnim[e.index] = 1
        this.squash = -1
        const s = lv.springs[e.index]
        this.particles.burst(s.col * TILE + 8, s.row * TILE + 8, e.power === 2 ? 9 : 6, {
          colors: [th.help, th.help2, '#ffffff'],
          speed: 90,
          life: 0.45,
          size: 1.4,
          gravity: 120,
          shape: 'star',
          angle: -Math.PI / 2,
          spread: Math.PI * 0.8,
        })
        break
      }
      case 'land':
        this.squash = Math.min(0.9, e.strength / TERMINAL_VY)
        this.particles.burst(world.p.x + PLAYER_W / 2, world.p.y + PLAYER_H, 5, {
          colors: [th.solidTop, '#ffffff'],
          speed: 45,
          life: 0.35,
          size: 1.6,
          gravity: 80,
          angle: -Math.PI / 2,
          spread: Math.PI * 0.9,
        })
        break
      case 'hammer':
        this.particles.burst(e.x, e.y, 10, {
          colors: [th.danger, '#ffffff', th.help2],
          speed: 130,
          life: 0.4,
          size: 1.6,
          gravity: 160,
          shape: 'star',
        })
        this.shake = Math.max(this.shake, Math.min(6, 2 + e.strength / 60))
        break
      case 'checkpoint': {
        this.checkpointAnim[e.index] = 1
        const c = lv.checkpoints[e.index]
        this.particles.burst(c.col * TILE + 8, c.row * TILE + 6, 8, {
          colors: [th.help, th.help2],
          speed: 70,
          life: 0.5,
          size: 1.4,
          gravity: 60,
          shape: 'star',
        })
        break
      }
      case 'finish':
        this.particles.burst(lv.goalCell.col * TILE + 8, lv.goalCell.row * TILE + 8, 44, {
          colors: [...th.decor, th.goal, '#ffffff'],
          speed: 170,
          life: 1.1,
          size: 2.2,
          gravity: 200,
          shape: 'square',
        })
        break
    }
  }

  // --- Takt der Optik --------------------------------------------------------

  update(dt: number, world: World): void {
    this.time += dt
    this.squash *= Math.exp(-dt * 11)
    this.shake *= Math.exp(-dt * 9)
    for (let i = 0; i < this.springAnim.length; i++) {
      this.springAnim[i] = Math.max(0, this.springAnim[i] - dt * 3.2)
    }
    for (let i = 0; i < this.checkpointAnim.length; i++) {
      this.checkpointAnim[i] = Math.max(0, this.checkpointAnim[i] - dt * 2)
    }
    this.particles.update(dt)
    this.crusherImpacts(world)

    const maxCam = this.maxCamY()
    if (this.freeCamera) {
      this.camY = clamp(this.camY, 0, maxCam)
      return
    }
    const p = world.p
    const fall = clamp(p.vy / TERMINAL_VY, 0, 1)
    const target = p.y - this.viewH * (0.42 - 0.14 * fall)
    const t = clamp(target, this.minCamY(), maxCam)
    if (this.snap) {
      this.camY = t
      this.snap = false
    } else {
      this.camY += (t - this.camY) * (1 - Math.exp(-dt * 9))
    }
  }

  /** Staub und Wackeln, wenn ein Quetscher im Bild aufschlägt (nur Darstellung, die Sim kennt keine Kamera) */
  private crusherImpacts(world: World): void {
    const lv = this.level
    const prev = this.crusherTick
    this.crusherTick = world.tick
    if (prev < 0 || world.tick <= prev || world.tick - prev > 4) return
    const th = this.theme
    for (let i = 0; i < lv.crushers.length; i++) {
      const c = lv.crushers[i]
      if (crusherState(c, world.tick).f < 1 || crusherState(c, prev).f >= 1) continue
      const s = c.size * TILE
      const cx = c.x0 + c.dx + s / 2
      const cy = c.y0 + c.dy + s / 2
      if (cy < this.camY - 48 || cy > this.camY + this.viewH + 48) continue
      const vx = c.dir === 'l' ? -1 : c.dir === 'r' ? 1 : 0
      const vy = c.dir === 'u' ? -1 : c.dir === 'd' ? 1 : 0
      this.particles.burst(cx + vx * s * 0.5, cy + vy * s * 0.5, 8 + c.size * 2, {
        colors: [th.solidTop, th.solidShade, '#ffffff'],
        speed: 90,
        life: 0.45,
        size: 1.7,
        gravity: 120,
        angle: Math.atan2(-vy, -vx),
        spread: Math.PI * 0.9,
      })
      this.shake = Math.max(this.shake, 2.5 + c.size)
      this.onCrusherImpact?.(c.size)
    }
  }

  // --- Zeichnen --------------------------------------------------------------

  draw(world: World, alpha: number, running: boolean): void {
    const ctx = this.ctx
    const th = this.theme
    const w = this.canvas.width
    const h = this.canvas.height

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, th.bgTop)
    g.addColorStop(1, th.bgBottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    const k = this.dpr * this.scale
    ctx.setTransform(k, 0, 0, k, 0, 0)
    this.drawDecor(ctx)

    const sx = this.shake > 0.05 ? (Math.random() - 0.5) * 2 * this.shake : 0
    const sy = this.shake > 0.05 ? (Math.random() - 0.5) * 2 * this.shake : 0
    ctx.translate(sx, -this.camY + sy)

    const lv = this.level
    const t = world.tick + (running ? alpha : 0)

    this.drawCeiling(ctx)
    this.drawTiles(ctx, world, t)
    for (const l of lv.lasers) this.drawLaser(ctx, l, world.tick)
    for (let i = 0; i < lv.checkpoints.length; i++) {
      const c = lv.checkpoints[i]
      this.drawCheckpoint(ctx, c.col, c.row, world.checkpointIndex === i, this.checkpointAnim[i])
    }
    this.drawGoal(ctx)
    for (const s of lv.spikes) this.drawSpikes(ctx, s)
    for (let i = 0; i < lv.springs.length; i++) this.drawSpring(ctx, lv.springs[i], this.springAnim[i])
    for (const sw of lv.saws) this.drawSaw(ctx, sw, t)
    for (const m of lv.movers) this.drawMover(ctx, m, running ? world.tick - 1 + alpha : world.tick)
    for (const hm of lv.hammers) this.drawHammer(ctx, hm, t)
    const ct = running ? world.tick - 1 + alpha : world.tick
    for (const c of lv.crushers) this.drawCrusher(ctx, c, ct, world)
    this.drawSpeedlines(ctx, world)
    this.drawPlayer(ctx, world, alpha)
    this.particles.draw(ctx)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  private drawDecor(ctx: CanvasRenderingContext2D): void {
    const th = this.theme
    ctx.save()
    ctx.globalAlpha = th.decorAlpha
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const d of this.decor) {
      const y = ((((d.y - this.camY * d.f) % WRAP) + WRAP) % WRAP) - 60
      if (y < -40 || y > this.viewH + 40) continue
      const col = th.decor[d.color % th.decor.length]
      ctx.save()
      ctx.translate(d.x, y)
      ctx.rotate(d.rot)
      ctx.fillStyle = col
      ctx.strokeStyle = col
      ctx.lineWidth = 2.4
      const s = d.size
      switch (d.kind) {
        case 0: // Dreieck
          ctx.beginPath()
          ctx.moveTo(0, -s * 0.6)
          ctx.lineTo(s * 0.6, s * 0.5)
          ctx.lineTo(-s * 0.6, s * 0.5)
          ctx.closePath()
          ctx.fill()
          break
        case 1: // Ring
          ctx.beginPath()
          ctx.arc(0, 0, s * 0.5, 0, TAU)
          ctx.stroke()
          break
        case 2: // Wellenlinie
          ctx.beginPath()
          for (let i = 0; i <= 12; i++) {
            const px = (i / 12 - 0.5) * s * 1.6
            const py = Math.sin(i * 1.1) * s * 0.18
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.stroke()
          break
        case 3: // Zickzack
          ctx.beginPath()
          for (let i = 0; i <= 5; i++) {
            const px = (i / 5 - 0.5) * s * 1.6
            const py = (i % 2 === 0 ? -1 : 1) * s * 0.22
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.stroke()
          break
        case 4: // Punkte
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              ctx.beginPath()
              ctx.arc((i - 1) * s * 0.35, (j - 1) * s * 0.35, s * 0.08, 0, TAU)
              ctx.fill()
            }
          }
          break
        case 5: // Plus
          ctx.fillRect(-s * 0.1, -s * 0.45, s * 0.2, s * 0.9)
          ctx.fillRect(-s * 0.45, -s * 0.1, s * 0.9, s * 0.2)
          break
        default: // Halbkreis
          ctx.beginPath()
          ctx.arc(0, 0, s * 0.5, Math.PI, 0)
          ctx.closePath()
          ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()
  }

  private drawTiles(ctx: CanvasRenderingContext2D, world: World, t: number): void {
    const lv = this.level
    const th = this.theme
    const R = 5
    const r0 = Math.max(0, Math.floor(this.camY / TILE) - 1)
    const r1 = Math.min(lv.rows - 1, Math.ceil((this.camY + this.viewH) / TILE) + 1)
    // Nachbarn gleichen Typs verschmelzen; an den Rändern (außer unten) gilt "gleich"
    const same = (c: number, r: number, k: number): boolean => {
      if (c < 0 || c >= lv.cols || r < 0) return true
      if (r >= lv.rows) return false
      return lv.kind[r * lv.cols + c] === k
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < lv.cols; c++) {
        const k = lv.kind[r * lv.cols + c]
        if (k === K_EMPTY) continue
        if (k === K_ONEWAY) {
          this.drawOneWay(ctx, c, r)
          continue
        }
        if (k === K_GATE_D || k === K_GATE_L || k === K_GATE_R) {
          this.drawGate(ctx, c, r, k)
          continue
        }
        if (k === K_BRITTLE) {
          this.drawBrittle(ctx, world, c, r)
          continue
        }
        if (isBlinkKind(k)) {
          this.drawBlink(ctx, world, c, r, k)
          continue
        }
        const up = same(c, r - 1, k)
        const down = same(c, r + 1, k)
        const left = same(c - 1, r, k)
        const right = same(c + 1, r, k)
        // Kleine Überlappung zu Nachbarn gegen Nähte bei gebrochener Skalierung
        const x = c * TILE - (left ? 0.5 : 0)
        const y = r * TILE - (up ? 0.5 : 0)
        const w = TILE + (left ? 0.5 : 0) + (right ? 0.5 : 0)
        const h = TILE + (up ? 0.5 : 0) + (down ? 0.5 : 0)
        const tl = !up && !left ? R : 0
        const tr = !up && !right ? R : 0
        const br = !down && !right ? R : 0
        const bl = !down && !left ? R : 0

        const ice = k === K_ICE
        ctx.fillStyle = ice ? th.ice : th.solid
        rr(ctx, x, y, w, h, tl, tr, br, bl)
        ctx.fill()
        if (!up) {
          ctx.fillStyle = ice ? th.iceTop : th.solidTop
          rr(ctx, x, y, w, 5, tl, tr, 0, 0)
          ctx.fill()
        }
        if (!down) {
          ctx.fillStyle = ice ? th.iceShade : th.solidShade
          rr(ctx, x, y + h - 4, w, 4, 0, 0, br ? 4 : 0, bl ? 4 : 0)
          ctx.fill()
        }
        if (ice) {
          // Glanzstreifen
          ctx.strokeStyle = th.iceTop
          ctx.lineWidth = 1.2
          ctx.lineCap = 'round'
          ctx.globalAlpha = 0.8
          ctx.beginPath()
          ctx.moveTo(c * TILE + 4, r * TILE + 10)
          ctx.lineTo(c * TILE + 8, r * TILE + 7)
          ctx.stroke()
          ctx.globalAlpha = 1
        } else if (k === K_BELT_L || k === K_BELT_R) {
          this.drawBeltMarks(ctx, c, r, k === K_BELT_L ? -1 : 1, t, up)
        }
      }
    }
  }

  /** Förderband: laufende Pfeile auf dem Block */
  private drawBeltMarks(ctx: CanvasRenderingContext2D, c: number, r: number, dir: number, t: number, up: boolean): void {
    const th = this.theme
    const x0 = c * TILE
    const y0 = r * TILE
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, TILE, TILE)
    ctx.clip()
    ctx.strokeStyle = th.help2
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const off = (((t * 0.35 * dir) % 8) + 8) % 8
    const cy = y0 + (up ? 8 : 9)
    for (let i = -1; i < 3; i++) {
      const cx = x0 + i * 8 + off
      ctx.beginPath()
      ctx.moveTo(cx - 2 * dir, cy - 3)
      ctx.lineTo(cx + 2 * dir, cy)
      ctx.lineTo(cx - 2 * dir, cy + 3)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Einwegplattform: dünne Platte oben in der Zelle */
  private drawOneWay(ctx: CanvasRenderingContext2D, c: number, r: number): void {
    const th = this.theme
    const x = c * TILE
    const y = r * TILE
    ctx.save()
    ctx.fillStyle = th.solidTop
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.4
    rr(ctx, x, y + 1, TILE, 5, 2.5, 2.5, 2.5, 2.5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = th.solidShade
    for (const dx of [3, 8, 13]) {
      ctx.beginPath()
      ctx.arc(x + dx, y + 3.5, 0.9, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  /**
   * Torblock nach unten, links oder rechts offen: dünne Platte auf der geschlossenen Seite (dort kommt man nicht
   * durch), dazu Pfeile in Durchgangsrichtung. Gleicher Stil wie die Einwegplatte (nach oben offen).
   */
  private drawGate(ctx: CanvasRenderingContext2D, c: number, r: number, k: number): void {
    const th = this.theme
    const x = c * TILE
    const y = r * TILE
    // Richtung, in die man hindurch darf, als Einheitsvektor
    const dx = k === K_GATE_L ? -1 : k === K_GATE_R ? 1 : 0
    const dy = k === K_GATE_D ? 1 : 0
    ctx.save()
    ctx.fillStyle = th.solidTop
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.4
    const plate = (px: number, py: number, w: number, h: number): void => {
      rr(ctx, px, py, w, h, 2.5, 2.5, 2.5, 2.5)
      ctx.fill()
      ctx.stroke()
    }
    // Platte sitzt auf der Seite, von der man NICHT hineinkommt (gegen die Durchgangsrichtung versetzt: dort ist es zu)
    if (dy === 1) plate(x, y + TILE - 6, TILE, 5)
    else if (dx === -1) plate(x + 1, y, 5, TILE)
    else plate(x + TILE - 6, y, 5, TILE)
    ctx.fillStyle = th.solidShade
    for (const o of [3, 8, 13]) {
      ctx.beginPath()
      if (dy === 1) ctx.arc(x + o, y + TILE - 3.5, 0.9, 0, TAU)
      else ctx.arc(dx === -1 ? x + 3.5 : x + TILE - 3.5, y + o, 0.9, 0, TAU)
      ctx.fill()
    }
    // Pfeile in Durchgangsrichtung
    ctx.strokeStyle = th.help2
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const mx = dy === 1 ? x + TILE / 2 : x + TILE / 2 + (dx === -1 ? 1.5 : -1.5)
    const my = dy === 1 ? y + 6.5 : y + TILE / 2
    for (const off of [0, 3.6]) {
      const cx = mx + dx * off
      const cy = my + dy * off
      // Spitze zeigt in (dx, dy); die Schenkel gehen senkrecht dazu zurück
      ctx.moveTo(cx - dx * 2 - dy * 3, cy - dy * 2 - dx * 3)
      ctx.lineTo(cx + dx * 1, cy + dy * 1)
      ctx.lineTo(cx - dx * 2 + dy * 3, cy - dy * 2 + dx * 3)
    }
    ctx.stroke()
    ctx.restore()
  }

  /** Blinkblock: fest = gefüllt mit Marke, weg = gestrichelter Umriss, kurz vor dem Wechsel flackert er */
  private drawBlink(ctx: CanvasRenderingContext2D, world: World, c: number, r: number, k: number): void {
    const th = this.theme
    const x = c * TILE
    const y = r * TILE
    const solid = blinkSolid(k, world.tick)
    const left = blinkTicksLeft(world.tick)
    const base = k === K_BLINK_A ? th.help : th.help2
    ctx.save()
    if (!solid) {
      // Vor dem Erscheinen zeichnet sich der Umriss stärker ab
      ctx.strokeStyle = base
      ctx.globalAlpha = left <= BLINK_WARN ? 0.85 : 0.4
      ctx.lineWidth = 1.2
      ctx.setLineDash([2, 2])
      ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3)
      ctx.restore()
      return
    }
    if (left <= BLINK_WARN && Math.floor(world.tick / 3) % 2 === 0) ctx.globalAlpha = 0.35
    ctx.fillStyle = base
    rr(ctx, x, y, TILE, TILE, 3, 3, 3, 3)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    rr(ctx, x, y, TILE, 5, 3, 3, 0, 0)
    ctx.fill()
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.4
    rr(ctx, x + 0.7, y + 0.7, TILE - 1.4, TILE - 1.4, 3, 3, 3, 3)
    ctx.stroke()
    // Marke: Raute (X) oder Kreis (O), damit beide Typen ohne Farbe unterscheidbar sind
    ctx.fillStyle = th.outline
    ctx.beginPath()
    if (k === K_BLINK_A) {
      ctx.moveTo(x + 8, y + 5)
      ctx.lineTo(x + 11, y + 9)
      ctx.lineTo(x + 8, y + 13)
      ctx.lineTo(x + 5, y + 9)
      ctx.closePath()
    } else {
      ctx.arc(x + 8, y + 9, 3, 0, TAU)
    }
    ctx.fill()
    ctx.restore()
  }

  /** Decke über dem Level (oberste Zeile ist fest): füllt den Platz, den die Kamera für die Bedienleiste freigibt */
  private drawCeiling(ctx: CanvasRenderingContext2D): void {
    if (this.camY >= 0) return
    const th = this.theme
    const top = this.camY - 12 // Puffer für das Wackeln
    ctx.fillStyle = th.solid
    ctx.fillRect(0, top, LEVEL_WIDTH, -top)
    ctx.fillStyle = th.solidShade
    ctx.fillRect(0, -4, LEVEL_WIDTH, 4)
    ctx.fillStyle = th.outline
    ctx.fillRect(0, -1.4, LEVEL_WIDTH, 1.4)
  }

  /** Bewegliche Plattform: Schiene, Platte mit Pfeil-Nieten */
  private drawMover(ctx: CanvasRenderingContext2D, m: CompiledMover, t: number): void {
    const th = this.theme
    const w = m.w * TILE
    ctx.save()
    ctx.lineCap = 'round'
    // Schiene (Mittellinie der Platte)
    ctx.strokeStyle = th.outline
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 2
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(m.x0 + w / 2, m.y0 + MOVER_H / 2)
    ctx.lineTo(m.x1 + w / 2, m.y1 + MOVER_H / 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    const p = sawPos(m, t)
    ctx.fillStyle = th.help
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.4
    rr(ctx, p.x, p.y, w, MOVER_H, 3, 3, 3, 3)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    rr(ctx, p.x + 1, p.y + 1, w - 2, 2.5, 1.5, 1.5, 0, 0)
    ctx.fill()
    ctx.fillStyle = th.outline
    for (let i = 0; i < m.w; i++) {
      ctx.beginPath()
      ctx.arc(p.x + i * TILE + TILE / 2, p.y + MOVER_H / 2 + 1, 1, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  /** Brüchige Plattform: bekommt Risse, wackelt, verschwindet und zeigt als Umriss, wann sie zurückkommt */
  private drawBrittle(ctx: CanvasRenderingContext2D, world: World, c: number, r: number): void {
    const th = this.theme
    const info = world.brittleInfo(c, r)
    const x = c * TILE
    const y = r * TILE
    ctx.save()
    if (info.state === 'gone') {
      ctx.strokeStyle = th.brittleTop
      ctx.globalAlpha = 0.3 + 0.5 * info.progress
      ctx.lineWidth = 1.2
      ctx.setLineDash([2, 2])
      ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3)
      ctx.restore()
      return
    }
    let dx = 0
    let dy = 0
    if (info.state === 'crack') {
      const a = world.tick * 2.3
      dx = Math.sin(a) * 0.9 * info.progress
      dy = Math.cos(a * 1.3) * 0.6 * info.progress
    }
    ctx.translate(dx, dy)
    ctx.fillStyle = th.brittle
    rr(ctx, x, y, TILE, TILE, 3, 3, 3, 3)
    ctx.fill()
    ctx.fillStyle = th.brittleTop
    rr(ctx, x, y, TILE, 5, 3, 3, 0, 0)
    ctx.fill()
    ctx.fillStyle = th.brittleShade
    rr(ctx, x, y + TILE - 4, TILE, 4, 0, 0, 3, 3)
    ctx.fill()
    // Risse, bei Belastung mehr
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x + 5, y + 6)
    ctx.lineTo(x + 7.5, y + 10)
    ctx.lineTo(x + 6, y + 14)
    if (info.state === 'crack') {
      ctx.moveTo(x + 11, y + 5)
      ctx.lineTo(x + 9.5, y + 9)
      ctx.lineTo(x + 12.5, y + 12)
      ctx.moveTo(x + 2, y + 11)
      ctx.lineTo(x + 5, y + 11.5)
    }
    ctx.stroke()
    ctx.restore()
  }

  private drawSpring(ctx: CanvasRenderingContext2D, s: CompiledSpring, ext: number): void {
    const th = this.theme
    const x = s.col * TILE
    const baseY = s.row * TILE + TILE
    const strong = s.power === 2
    const ph = 7 + ext * 5
    const segs = strong ? 4 : 3
    const bottom = baseY - 2.5
    const plateY = baseY - ph - 3

    ctx.save()
    if (s.dir !== 'u') {
      // Seitenfeder: gleiche Zeichnung, um die Zellmitte gedreht (Basis an der Wand)
      const cx = x + TILE / 2
      const cy = s.row * TILE + TILE / 2
      ctx.translate(cx, cy)
      ctx.rotate(s.dir === 'r' ? Math.PI / 2 : -Math.PI / 2)
      ctx.translate(-cx, -cy)
    }
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.fillStyle = th.outline
    rr(ctx, x + 3, baseY - 2.6, 10, 2.6, 1, 1, 0, 0)
    ctx.fill()

    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.9
    ctx.beginPath()
    ctx.moveTo(x + 4.8, bottom)
    const top = plateY + 3
    for (let j = 1; j <= segs; j++) {
      const yy = bottom + ((top - bottom) * j) / segs
      ctx.lineTo(x + (j % 2 === 1 ? 11.2 : 4.8), yy)
    }
    ctx.stroke()

    ctx.fillStyle = strong ? th.help2 : th.help
    rr(ctx, x + 2, plateY, 12, 3.4, 1.7, 1.7, 1.7, 1.7)
    ctx.fill()
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.restore()
  }

  private drawSpikes(ctx: CanvasRenderingContext2D, s: CompiledSpikes): void {
    const th = this.theme
    ctx.save()
    ctx.translate(s.col * TILE + 8, s.row * TILE + 8)
    ctx.rotate(DIR_ANGLE_UP[s.dir])
    ctx.lineJoin = 'round'
    ctx.lineWidth = 1.3
    ctx.strokeStyle = th.outline
    ctx.fillStyle = th.dangerDark
    ctx.fillRect(-7.5, 6, 15, 2)
    ctx.fillStyle = th.danger
    for (let i = 0; i < 2; i++) {
      const cx = i === 0 ? -4 : 4
      ctx.beginPath()
      ctx.moveTo(cx - 3.4, 6.4)
      ctx.lineTo(cx, -1.6)
      ctx.lineTo(cx + 3.4, 6.4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawLaser(ctx: CanvasRenderingContext2D, l: CompiledLaser, tick: number): void {
    const th = this.theme
    const phase = laserPhase(l, tick)
    const blink = Math.floor(tick / 4) % 2 === 0

    if (l.beam) {
      const b = l.beam
      const vertical = l.dir === 'u' || l.dir === 'd'
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      ctx.save()
      ctx.lineCap = 'round'
      if (phase === 'on') {
        ctx.globalAlpha = 0.3
        ctx.fillStyle = th.danger
        ctx.fillRect(b.x - 3, b.y - (vertical ? 0 : 3), b.w + 6, b.h + (vertical ? 0 : 6))
        ctx.globalAlpha = 1
        ctx.fillStyle = th.danger
        ctx.fillRect(b.x, b.y, b.w, b.h)
        ctx.fillStyle = '#ffffff'
        if (vertical) ctx.fillRect(cx - 0.6, b.y, 1.2, b.h)
        else ctx.fillRect(b.x, cy - 0.6, b.w, 1.2)
      } else {
        ctx.strokeStyle = th.danger
        ctx.lineWidth = 1.2
        if (phase === 'warn') {
          ctx.globalAlpha = blink ? 0.85 : 0.25
          ctx.setLineDash([])
        } else {
          ctx.globalAlpha = 0.22
          ctx.setLineDash([2, 4])
        }
        ctx.beginPath()
        if (vertical) {
          ctx.moveTo(cx, b.y)
          ctx.lineTo(cx, b.y + b.h)
        } else {
          ctx.moveTo(b.x, cy)
          ctx.lineTo(b.x + b.w, cy)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    // Emitter
    ctx.save()
    ctx.translate(l.col * TILE + 8, l.row * TILE + 8)
    ctx.rotate(DIR_ANGLE_DOWN[l.dir])
    ctx.fillStyle = th.dangerDark
    rr(ctx, -7, -7, 14, 14, 4, 4, 4, 4)
    ctx.fill()
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.3
    ctx.stroke()
    ctx.fillStyle = th.danger
    ctx.fillRect(-3, 3, 6, 5)
    ctx.fillStyle = phase === 'on' ? '#ffffff' : phase === 'warn' && blink ? th.danger : th.outline
    ctx.beginPath()
    ctx.arc(0, -1, 2.4, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  private drawSaw(ctx: CanvasRenderingContext2D, sw: CompiledSaw, t: number): void {
    const th = this.theme
    const c = sawPos(sw, t)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Führungsschiene
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(sw.x0, sw.y0)
    ctx.lineTo(sw.x1, sw.y1)
    ctx.stroke()
    ctx.strokeStyle = th.solidShade
    ctx.lineWidth = 2.6
    ctx.stroke()
    ctx.fillStyle = th.solidTop
    for (const [x, y] of [
      [sw.x0, sw.y0],
      [sw.x1, sw.y1],
    ]) {
      ctx.beginPath()
      ctx.arc(x, y, 2.4, 0, TAU)
      ctx.fill()
    }

    // Sägeblatt: Zähne drehen sich mit der Zeit
    ctx.translate(c.x, c.y)
    ctx.rotate(t * 0.32)
    const teeth = 8
    const ro = SAW_R + 1.5
    const ri = SAW_R - 2.6
    ctx.beginPath()
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU
      const rad = i % 2 === 0 ? ro : ri
      const x = Math.cos(a) * rad
      const y = Math.sin(a) * rad
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = th.danger
    ctx.fill()
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.6
    ctx.stroke()

    ctx.fillStyle = th.dangerDark
    ctx.beginPath()
    ctx.arc(0, 0, 4.4, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = th.eyeWhite
    ctx.beginPath()
    ctx.arc(0, 0, 1.5, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  private drawHammer(ctx: CanvasRenderingContext2D, h: CompiledHammer, t: number): void {
    const th = this.theme
    const s = hammerState(h, t)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.strokeStyle = th.outline
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(h.ax, h.ay)
    ctx.lineTo(s.x, s.y)
    ctx.stroke()
    ctx.strokeStyle = th.solidTop
    ctx.lineWidth = 2.6
    ctx.stroke()

    ctx.fillStyle = th.solidShade
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(h.ax, h.ay, 4.6, 0, TAU)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = th.danger
    ctx.beginPath()
    ctx.arc(s.x, s.y, HAMMER_HEAD_R, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.8
    ctx.stroke()
    ctx.fillStyle = th.dangerDark
    ctx.beginPath()
    ctx.arc(s.x, s.y, HAMMER_HEAD_R - 1, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.arc(s.x, s.y, HAMMER_HEAD_R - 4, 0.85 * Math.PI, 0.15 * Math.PI, true)
    ctx.closePath()
    ctx.fill()

    // Grimmiges Gesicht, schaut in Schwungrichtung
    const look = clamp(s.vx / 120, -1, 1) * 0.9
    for (const ex of [-3.5, 3.5]) {
      ctx.fillStyle = th.eyeWhite
      ctx.beginPath()
      ctx.arc(s.x + ex, s.y - 1.4, 2.6, 0, TAU)
      ctx.fill()
      ctx.fillStyle = th.pupil
      ctx.beginPath()
      ctx.arc(s.x + ex + look, s.y - 1.2, 1.2, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(s.x - 6.4, s.y - 6)
    ctx.lineTo(s.x - 1.4, s.y - 3.8)
    ctx.moveTo(s.x + 6.4, s.y - 6)
    ctx.lineTo(s.x + 1.4, s.y - 3.8)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * Quetscher: Block mit Gesicht wie beim Hammer. Die Bahn ist als blasse Gefahrenzone markiert. Vor dem
   * Schlag wackelt er und reißt die Augen auf; beim Schlag schaut er nach vorn, sonst dem Spieler nach.
   */
  private drawCrusher(ctx: CanvasRenderingContext2D, c: CompiledCrusher, t: number, world: World): void {
    const th = this.theme
    const st = crusherState(c, t)
    const s = c.size * TILE
    const vx = c.dir === 'l' ? -1 : c.dir === 'r' ? 1 : 0
    const vy = c.dir === 'u' ? -1 : c.dir === 'd' ? 1 : 0

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Gefahrenzone: Fläche, die der Block überstreicht
    const zx = Math.min(c.x0, c.x0 + c.dx)
    const zy = Math.min(c.y0, c.y0 + c.dy)
    const zw = s + Math.abs(c.dx)
    const zh = s + Math.abs(c.dy)
    ctx.fillStyle = th.danger
    ctx.globalAlpha = 0.07
    rr(ctx, zx, zy, zw, zh, 4, 4, 4, 4)
    ctx.fill()
    ctx.globalAlpha = 0.28
    ctx.strokeStyle = th.danger
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    rr(ctx, zx + 0.5, zy + 0.5, zw - 1, zh - 1, 4, 4, 4, 4)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // Wackeln kurz vor dem Schlag, quer zur Schlagrichtung
    const shake = st.warn ? Math.sin(t * 2.2) * 0.9 : 0
    const x = c.x0 + c.dx * st.f + (vy !== 0 ? shake : 0)
    const y = c.y0 + c.dy * st.f + (vx !== 0 ? shake : 0)
    const R = Math.min(6, s * 0.28)

    ctx.fillStyle = th.danger
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.8
    rr(ctx, x + 0.9, y + 0.9, s - 1.8, s - 1.8, R, R, R, R)
    ctx.fill()
    // Schattenband unten, wie beim Spieler
    ctx.save()
    rr(ctx, x + 0.9, y + 0.9, s - 1.8, s - 1.8, R, R, R, R)
    ctx.clip()
    ctx.fillStyle = th.dangerDark
    ctx.fillRect(x, y + s - s * 0.22, s, s * 0.22)
    ctx.restore()
    rr(ctx, x + 0.9, y + 0.9, s - 1.8, s - 1.8, R, R, R, R)
    ctx.stroke()

    // Gesicht (Maße vom Hammerkopf, mit der Blockgröße skaliert)
    const k = s / 24
    const cx = x + s / 2
    const cy = y + s / 2
    let lx = 0
    let ly = 0
    if (st.slamming || st.f >= 1) {
      lx = vx
      ly = vy
    } else {
      const p = world.p
      const dxp = p.x + PLAYER_W / 2 - cx
      const dyp = p.y + PLAYER_H / 2 - cy
      const d = Math.hypot(dxp, dyp)
      if (d > 1) {
        lx = dxp / d
        ly = dyp / d
      }
    }
    const eyeR = (st.warn ? 3.1 : 2.6) * k
    const pupR = (st.slamming ? 0.9 : st.warn ? 0.9 : 1.2) * k
    for (const ex of [-3.5, 3.5]) {
      ctx.fillStyle = th.eyeWhite
      ctx.beginPath()
      ctx.arc(cx + ex * k, cy - 1.4 * k, eyeR, 0, TAU)
      ctx.fill()
      ctx.fillStyle = th.pupil
      ctx.beginPath()
      ctx.arc(cx + ex * k + lx * 0.9 * k, cy - 1.4 * k + ly * 0.9 * k, pupR, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = th.outline
    ctx.lineWidth = Math.max(1.1, 1.4 * k)
    ctx.beginPath()
    ctx.moveTo(cx - 6.4 * k, cy - 6 * k)
    ctx.lineTo(cx - 1.4 * k, cy - 3.8 * k)
    ctx.moveTo(cx + 6.4 * k, cy - 6 * k)
    ctx.lineTo(cx + 1.4 * k, cy - 3.8 * k)
    ctx.stroke()
    ctx.restore()
  }

  private drawCheckpoint(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    active: boolean,
    anim: number,
  ): void {
    const th = this.theme
    const x = col * TILE
    const y = row * TILE
    const wave = Math.sin(this.time * 5) * 1.2
    const pop = 1 + anim * 0.25
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(x + 5, y + 15.4)
    ctx.lineTo(x + 5, y + 1.5)
    ctx.stroke()
    ctx.translate(x + 5, y + 2)
    ctx.scale(pop, pop)
    ctx.fillStyle = active ? th.help2 : th.solidTop
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(8.5, 2.2 + wave * 0.5)
    ctx.lineTo(0, 5.4)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.restore()
  }

  private drawGoal(ctx: CanvasRenderingContext2D): void {
    const th = this.theme
    const { col, row } = this.level.goalCell
    const cx = col * TILE + 8
    const cy = row * TILE + 8
    const t = this.time
    ctx.save()
    ctx.translate(cx, cy)
    ctx.lineCap = 'round'

    ctx.strokeStyle = th.goal
    ctx.lineWidth = 1.4
    ctx.globalAlpha = 0.85
    ctx.setLineDash([3, 3])
    ctx.lineDashOffset = -t * 9
    ctx.beginPath()
    ctx.arc(0, 0, 9.2 + Math.sin(t * 3) * 0.7, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    ctx.fillStyle = th.goal
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.arc(0, 0, 5.4, 0, TAU)
    ctx.fill()
    ctx.stroke()

    ctx.rotate(t * 1.6)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 3.6 : 1.2
      const a = (i / 8) * TAU
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawSpeedlines(ctx: CanvasRenderingContext2D, world: World): void {
    const p = world.p
    if (p.dead || p.vy < 230) return
    const k = clamp((p.vy - 230) / (TERMINAL_VY - 230), 0, 1)
    const step = Math.floor(this.time * 30)
    ctx.save()
    ctx.strokeStyle = this.theme.solidTop
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    for (let i = 0; i < 7; i++) {
      const seed = step * 13.37 + i * 7.77
      const x = frac(Math.sin(seed) * 43758.5453) * LEVEL_WIDTH
      const len = 12 + frac(Math.sin(seed * 1.7) * 12345.678) * 22
      const y0 = this.camY + frac(Math.sin(seed * 2.3) * 9876.543) * this.viewH
      ctx.globalAlpha = 0.4 * k
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x, y0 + len)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, world: World, alpha: number): void {
    const th = this.theme
    const p = world.p
    if (p.dead) return
    const x = world.prevX + (p.x - world.prevX) * alpha
    const y = world.prevY + (p.y - world.prevY) * alpha

    const vyN = clamp(p.vy / TERMINAL_VY, -1, 1)
    const fall = Math.max(0, vyN)
    const stretch = fall * 0.16 + Math.max(0, -vyN) * 0.12
    const sx = 1 + this.squash * 0.32 - stretch * 0.6
    const sy = 1 - this.squash * 0.32 + stretch

    ctx.save()
    ctx.translate(x + PLAYER_W / 2, y + PLAYER_H)
    ctx.scale(sx, sy)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    drawCharacter(ctx, th, look, {
      face: p.facing * 0.7,
      ox: clamp(p.vx / 110, -1, 1) * 1.1,
      oy: vyN * 1.0,
      fall,
      stun: p.stun > 0,
      blink: Math.floor(this.time * 60) % 210 < 6,
    })
    ctx.restore()
  }
}