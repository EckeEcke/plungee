import {
  DT,
  EPS,
  GRAVITY,
  HAMMER_HEAD_R,
  SAW_HIT_R,
  HAMMER_HIT_COOLDOWN,
  HAMMER_KNOCKBACK,
  HAMMER_LIFT,
  HAMMER_MAX_KB,
  HAMMER_MIN_PUSH,
  HAMMER_STUN_TICKS,
  ACCEL_AIR,
  BELT_SPEED,
  CRUMBLE_DELAY,
  CRUMBLE_REGROW,
  ICE_ACCEL,
  SPRING_SIDE_LIFT,
  SPRING_SIDE_POWER,
  SPRING_SIDE_STUN,
  ACCEL_GROUND,
  LAND_EVENT_VY,
  MAX_STEP,
  SHOVE_MIN_OVERLAP,
  MOVE_SPEED,
  PLAYER_H,
  PLAYER_W,
  RESPAWN_TICKS,
  SPRING_POWER,
  STUN_DAMP,
  TERMINAL_VY,
  TILE,
  VOID_MARGIN,
} from './constants'
import { hammerState, laserPhase, sawPos } from './hazards'
import type { CompiledLevel } from './level'
import { blinkSolid, isBlinkKind, K_BELT_L, K_BELT_R, K_BRITTLE, K_ICE, K_ONEWAY } from './tiles'
import { approach, clamp } from './mathx'
import type { InputDir, Rect } from './types'

export type DeathCause = 'spikes' | 'laser' | 'saw' | 'void'

export type SimEvent =
  | { type: 'death'; x: number; y: number; cause: DeathCause }
  | { type: 'respawn'; x: number; y: number }
  | { type: 'spring'; index: number; power: 1 | 2 }
  | { type: 'land'; strength: number }
  | { type: 'hammer'; index: number; x: number; y: number; strength: number }
  | { type: 'checkpoint'; index: number }
  /** Eine brüchige Plattform beginnt zu zerbröckeln (einmal pro Betreten) */
  | { type: 'crumble' }
  | { type: 'finish'; ticks: number }

export interface PlayerState {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  facing: -1 | 1
  stun: number
  hitCooldown: number
  dead: boolean
  deadTimer: number
}

function overlaps(px: number, py: number, r: Rect): boolean {
  return px < r.x + r.w && px + PLAYER_W > r.x && py < r.y + r.h && py + PLAYER_H > r.y
}

export class World {
  readonly level: CompiledLevel
  tick = 0
  p: PlayerState
  /** Position vor dem letzten Schritt (für Render-Interpolation) */
  prevX: number
  prevY: number
  deaths = 0
  finished = false
  finishTick = -1
  checkpointIndex = -1
  respawnX: number
  respawnY: number
  /** Wird synchron während step() aufgerufen. Hat keinen Einfluss auf die Simulation. */
  onEvent: ((e: SimEvent) => void) | null = null
  /** Pro Zelle: Tick, an dem eine brüchige Plattform betreten wurde (-1 = unberührt) */
  crumble: Int32Array
  /** Block-Typ unter den Füßen im letzten Tick (siehe tiles.ts), 0 = normal */
  surface = 0
  /** Index der beweglichen Plattform, auf der der Spieler steht (-1 = keine) */
  riding = -1
  /** Blinkzellen, in denen der Spieler zu Beginn des Ticks steckt: bleiben durchlässig, bis er draußen ist */
  private blinkIgnore: number[] = []

  constructor(level: CompiledLevel) {
    this.level = level
    this.respawnX = level.spawn.x
    this.respawnY = level.spawn.y
    this.p = {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      stun: 0,
      hitCooldown: 0,
      dead: false,
      deadTimer: 0,
    }
    this.prevX = this.p.x
    this.prevY = this.p.y
    this.crumble = new Int32Array(level.cols * level.rows).fill(-1)
  }

  /** Unabhängige Kopie des Simulationszustands (z. B. für Suchverfahren und Tests). */
  clone(): World {
    const w = new World(this.level)
    w.tick = this.tick
    w.p = { ...this.p }
    w.prevX = this.prevX
    w.prevY = this.prevY
    w.deaths = this.deaths
    w.finished = this.finished
    w.finishTick = this.finishTick
    w.checkpointIndex = this.checkpointIndex
    w.respawnX = this.respawnX
    w.respawnY = this.respawnY
    w.crumble = this.crumble.slice()
    w.surface = this.surface
    w.riding = this.riding
    return w
  }

  private emit(e: SimEvent): void {
    if (this.onEvent) this.onEvent(e)
  }

  step(input: InputDir): void {
    if (this.finished) return
    const p = this.p
    this.prevX = p.x
    this.prevY = p.y

    if (p.dead) {
      p.deadTimer--
      if (p.deadTimer <= 0) this.respawn()
      this.tick++
      return
    }

    // Horizontale Steuerung (während Betäubung keine Eingabe)
    if (p.stun > 0) {
      p.stun--
      p.vx *= STUN_DAMP
    } else {
      const onIce = p.onGround && this.surface === K_ICE
      const acc = (p.onGround ? (onIce ? ICE_ACCEL : ACCEL_GROUND) : ACCEL_AIR) * DT
      let target = input * MOVE_SPEED
      if (p.onGround) {
        if (this.surface === K_BELT_L) target -= BELT_SPEED
        else if (this.surface === K_BELT_R) target += BELT_SPEED
      }
      p.vx = approach(p.vx, target, acc)
      if (input !== 0) p.facing = input
    }
    if (p.hitCooldown > 0) p.hitCooldown--

    this.regrow()
    this.collectBlinkIgnore()

    // Schwerkraft
    p.vy += GRAVITY * DT
    if (p.vy > TERMINAL_VY) p.vy = TERMINAL_VY

    // Bewegung mit Kollision
    const wasOnGround = p.onGround
    const impact = p.vy
    p.onGround = false
    this.carry()
    p.onGround = false
    this.moveX(p.vx * DT)
    const bottomBefore = p.y + PLAYER_H
    this.moveY(p.vy * DT)
    this.landOnMovers(bottomBefore)
    if (p.onGround && !wasOnGround && impact > LAND_EVENT_VY) {
      this.emit({ type: 'land', strength: impact })
    }
    this.touchGround()

    // Gefahren und Interaktionen werden mit der Pose zum Ende dieses Ticks geprüft.
    this.tick++
    this.interact(this.tick)
  }

  private respawn(): void {
    const p = this.p
    p.x = this.respawnX
    p.y = this.respawnY
    p.vx = 0
    p.vy = 0
    p.onGround = false
    p.stun = 0
    p.hitCooldown = 0
    p.dead = false
    p.deadTimer = 0
    this.crumble.fill(-1)
    this.surface = 0
    this.riding = -1
    this.prevX = p.x
    this.prevY = p.y
    this.emit({ type: 'respawn', x: p.x, y: p.y })
  }

  private kill(cause: DeathCause): void {
    const p = this.p
    p.dead = true
    p.deadTimer = RESPAWN_TICKS
    p.vx = 0
    p.vy = 0
    this.deaths++
    this.emit({ type: 'death', x: p.x + PLAYER_W / 2, y: p.y + PLAYER_H / 2, cause })
  }

  private interact(now: number): void {
    const p = this.p
    const lv = this.level

    // Ziel hat Vorrang vor Gefahren im selben Tick
    if (overlaps(p.x, p.y, lv.goal)) {
      this.finished = true
      this.finishTick = now
      this.emit({ type: 'finish', ticks: now })
      return
    }

    if (p.y > lv.height + VOID_MARGIN) {
      this.kill('void')
      return
    }

    for (const s of lv.spikes) {
      if (overlaps(p.x, p.y, s.rect)) {
        this.kill('spikes')
        return
      }
    }

    for (const l of lv.lasers) {
      if (l.beam && laserPhase(l, now) === 'on' && overlaps(p.x, p.y, l.beam)) {
        this.kill('laser')
        return
      }
    }

    for (const sw of lv.saws) {
      const c = sawPos(sw, now)
      const cx = clamp(c.x, p.x, p.x + PLAYER_W)
      const cy = clamp(c.y, p.y, p.y + PLAYER_H)
      const dx = cx - c.x
      const dy = cy - c.y
      if (dx * dx + dy * dy < SAW_HIT_R * SAW_HIT_R) {
        this.kill('saw')
        return
      }
    }

    for (let i = 0; i < lv.hammers.length; i++) {
      const h = lv.hammers[i]
      const s = hammerState(h, now)
      const cx = clamp(s.x, p.x, p.x + PLAYER_W)
      const cy = clamp(s.y, p.y, p.y + PLAYER_H)
      const dx = cx - s.x
      const dy = cy - s.y
      if (dx * dx + dy * dy >= HAMMER_HEAD_R * HAMMER_HEAD_R || p.hitCooldown > 0) continue

      // Stoßrichtung: weg vom Kopfmittelpunkt, plus Bewegung des Kopfs
      let nx = p.x + PLAYER_W / 2 - s.x
      let ny = p.y + PLAYER_H / 2 - s.y
      const len = Math.sqrt(nx * nx + ny * ny)
      if (len < 1e-6) {
        nx = 0
        ny = -1
      } else {
        nx /= len
        ny /= len
      }
      p.vx = clamp(s.vx * HAMMER_KNOCKBACK + nx * HAMMER_MIN_PUSH, -HAMMER_MAX_KB, HAMMER_MAX_KB)
      p.vy = clamp(
        s.vy * HAMMER_KNOCKBACK + ny * HAMMER_MIN_PUSH - HAMMER_LIFT,
        -HAMMER_MAX_KB,
        HAMMER_MAX_KB,
      )
      p.stun = HAMMER_STUN_TICKS
      p.hitCooldown = HAMMER_HIT_COOLDOWN
      p.onGround = false
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy)
      this.emit({ type: 'hammer', index: i, x: s.x, y: s.y, strength: speed })
    }

    for (let i = 0; i < lv.springs.length; i++) {
      const sp = lv.springs[i]
      if (!overlaps(p.x, p.y, sp.rect)) continue
      if (sp.dir === 'u') {
        if (p.vy < 0) continue
        p.vy = -SPRING_POWER[sp.power - 1]
      } else {
        // Seitenfeder: nur auslösen, wenn man in sie hineinläuft oder an ihr steht
        if (sp.dir === 'r' ? p.vx > 0 : p.vx < 0) continue
        p.vx = (sp.dir === 'r' ? 1 : -1) * SPRING_SIDE_POWER[sp.power - 1]
        p.vy = -SPRING_SIDE_LIFT
        p.stun = SPRING_SIDE_STUN
      }
      p.onGround = false
      this.emit({ type: 'spring', index: i, power: sp.power })
    }

    for (let i = 0; i < lv.checkpoints.length; i++) {
      const c = lv.checkpoints[i]
      if (i !== this.checkpointIndex && overlaps(p.x, p.y, c.rect)) {
        this.checkpointIndex = i
        this.respawnX = c.spawn.x
        this.respawnY = c.spawn.y
        this.emit({ type: 'checkpoint', index: i })
      }
    }
  }

  // --- Kollision gegen das Tile-Raster ---------------------------------------

  private isSolid(col: number, row: number): boolean {
    const lv = this.level
    if (col < 0 || col >= lv.cols || row < 0) return true
    if (row >= lv.rows) return false
    const i = row * lv.cols + col
    const k = lv.kind[i]
    if (isBlinkKind(k)) return blinkSolid(k, this.tick) && !this.blinkIgnore.includes(i)
    if (lv.solid[i] !== 1) return false
    return !(k === K_BRITTLE && this.isBroken(i))
  }

  private collectBlinkIgnore(): void {
    const lv = this.level
    const p = this.p
    this.blinkIgnore.length = 0
    const c0 = Math.max(0, Math.floor(p.x / TILE))
    const c1 = Math.min(lv.cols - 1, Math.floor((p.x + PLAYER_W - EPS) / TILE))
    const r0 = Math.max(0, Math.floor(p.y / TILE))
    const r1 = Math.min(lv.rows - 1, Math.floor((p.y + PLAYER_H - EPS) / TILE))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * lv.cols + c
        if (isBlinkKind(lv.kind[i])) this.blinkIgnore.push(i)
      }
    }
  }

  /** Oberkante-Position (links, oben) einer Plattform zu einem Tick */
  moverPos(index: number, tick: number): { x: number; y: number } {
    return sawPos(this.level.movers[index], tick)
  }

  /** Trägt den Spieler mit der Plattform mit, auf der er im letzten Tick stand */
  private carry(): void {
    if (this.riding < 0) return
    const a = this.moverPos(this.riding, this.tick)
    const b = this.moverPos(this.riding, this.tick + 1)
    const p = this.p
    const vy = p.vy
    const vx = p.vx
    if (b.x !== a.x) this.moveX(b.x - a.x)
    p.vx = vx
    if (b.y !== a.y) {
      const wantY = p.y + (b.y - a.y)
      this.moveY(b.y - a.y)
      // Nach oben an einer Tile-Kante hängen geblieben: nicht durch die weiterfahrende Platte fallen
      if (b.y < a.y && p.y > wantY + EPS) this.shoveOffCorner(wantY, b.x, this.level.movers[this.riding].w * TILE)
    }
    p.vy = vy
  }

  /** Passt die Figur an dieser Pose in keine feste Zelle? */
  private fitsAt(x: number, y: number): boolean {
    const c0 = Math.floor(x / TILE)
    const c1 = Math.floor((x + PLAYER_W - EPS) / TILE)
    const r0 = Math.floor(y / TILE)
    const r1 = Math.floor((y + PLAYER_H - EPS) / TILE)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.isSolid(c, r)) return false
    return true
  }

  /**
   * Fährt eine Platte nach oben (z. B. in einen Schacht) und die Figur steht am Plattenrand, stößt ihr
   * überstehendes Stück an die Unterkante eines Tiles. Dann schiebt die Kante sie seitlich auf die Platte
   * (bis zur nächsten Tile-Grenze), statt sie durch die Platte fallen zu lassen. Steckt der ganze Körper
   * unter Fels (echtes Einquetschen) oder ginge es nur von der Platte weg, bleibt alles wie es war.
   */
  private shoveOffCorner(wantY: number, plateX: number, plateW: number): void {
    const p = this.p
    const right = (Math.floor(p.x / TILE) + 1) * TILE
    const left = Math.floor((p.x + PLAYER_W - EPS) / TILE) * TILE - PLAYER_W
    const cands = [right, left].sort((u, v) => Math.abs(u - p.x) - Math.abs(v - p.x))
    for (const x of cands) {
      const overlap = Math.min(x + PLAYER_W, plateX + plateW) - Math.max(x, plateX)
      if (overlap < SHOVE_MIN_OVERLAP || !this.fitsAt(x, wantY)) continue
      p.x = x
      p.y = wantY
      return
    }
  }

  /** Einweg-Landung auf beweglichen Plattformen (Pose zum Ende dieses Ticks) */
  private landOnMovers(bottomBefore: number): void {
    const p = this.p
    const lv = this.level
    const wasRiding = this.riding
    this.riding = -1
    if (p.vy < 0) return
    for (let i = 0; i < lv.movers.length; i++) {
      const m = lv.movers[i]
      const a = this.moverPos(i, this.tick)
      const b = this.moverPos(i, this.tick + 1)
      const w = m.w * TILE
      if (p.x >= b.x + w || p.x + PLAYER_W <= b.x) continue
      const refTop = i === wasRiding ? b.y : a.y
      if (bottomBefore > refTop + EPS || p.y + PLAYER_H < b.y - EPS) continue
      // Steht der Spieler schon auf einem Tile, nimmt ihn nur eine von unten heranfahrende Platte mit
      if (p.onGround && p.y + PLAYER_H - b.y <= EPS) continue
      p.y = b.y - PLAYER_H
      p.vy = 0
      p.onGround = true
      this.riding = i
      return
    }
  }

  /** Brüchige Plattform ist zerbrochen, solange sie nicht wieder nachgewachsen ist */
  private isBroken(i: number): boolean {
    const t = this.crumble[i]
    return t >= 0 && this.tick - t >= CRUMBLE_DELAY
  }

  /** Zustand einer brüchigen Zelle für die Darstellung */
  brittleInfo(col: number, row: number): { state: 'ok' | 'crack' | 'gone'; progress: number } {
    const t = this.crumble[row * this.level.cols + col]
    if (t < 0) return { state: 'ok', progress: 0 }
    const el = this.tick - t
    if (el < CRUMBLE_DELAY) return { state: 'crack', progress: el / CRUMBLE_DELAY }
    return { state: 'gone', progress: Math.min(1, (el - CRUMBLE_DELAY) / CRUMBLE_REGROW) }
  }

  /** Zerbrochene Plattformen wachsen nach, sobald der Spieler nicht mehr in der Zelle steht */
  private regrow(): void {
    const lv = this.level
    for (const i of lv.brittle) {
      const t = this.crumble[i]
      if (t < 0 || this.tick - t < CRUMBLE_DELAY + CRUMBLE_REGROW) continue
      const x = (i % lv.cols) * TILE
      const y = Math.floor(i / lv.cols) * TILE
      if (overlaps(this.p.x, this.p.y, { x, y, w: TILE, h: TILE })) continue
      this.crumble[i] = -1
    }
  }

  /** Was trägt den Spieler? Löst brüchige Plattformen aus und merkt sich Eis und Förderbänder. */
  private touchGround(): void {
    const p = this.p
    const lv = this.level
    this.surface = 0
    if (!p.onGround || this.riding >= 0) return
    const row = Math.floor((p.y + PLAYER_H + 0.5) / TILE)
    if (row < 0 || row >= lv.rows) return
    const left = Math.max(0, Math.floor(p.x / TILE))
    const right = Math.min(lv.cols - 1, Math.floor((p.x + PLAYER_W - EPS) / TILE))
    let crumbled = false
    for (let c = left; c <= right; c++) {
      const i = row * lv.cols + c
      const k = lv.kind[i]
      if (k === K_BRITTLE && this.crumble[i] < 0) {
        this.crumble[i] = this.tick
        crumbled = true
      }
      if (k === K_ICE || k === K_BELT_L || k === K_BELT_R) {
        if (this.surface === 0) this.surface = k
      }
    }
    if (crumbled) this.emit({ type: 'crumble' })
  }

  private moveX(dx: number): void {
    const p = this.p
    let remaining = dx
    while (remaining !== 0) {
      const step = Math.abs(remaining) > MAX_STEP ? (remaining > 0 ? MAX_STEP : -MAX_STEP) : remaining
      remaining -= step
      p.x += step
      const top = Math.floor(p.y / TILE)
      const bottom = Math.floor((p.y + PLAYER_H - EPS) / TILE)
      if (step > 0) {
        const c = Math.floor((p.x + PLAYER_W - EPS) / TILE)
        if (this.solidInRows(c, top, bottom)) {
          p.x = c * TILE - PLAYER_W
          p.vx = 0
          return
        }
      } else {
        const c = Math.floor(p.x / TILE)
        if (this.solidInRows(c, top, bottom)) {
          p.x = (c + 1) * TILE
          p.vx = 0
          return
        }
      }
    }
  }

  private moveY(dy: number): void {
    const p = this.p
    let remaining = dy
    while (remaining !== 0) {
      const step = Math.abs(remaining) > MAX_STEP ? (remaining > 0 ? MAX_STEP : -MAX_STEP) : remaining
      remaining -= step
      p.y += step
      const left = Math.floor(p.x / TILE)
      const right = Math.floor((p.x + PLAYER_W - EPS) / TILE)
      if (step > 0) {
        const r = Math.floor((p.y + PLAYER_H - EPS) / TILE)
        const prevBottom = p.y - step + PLAYER_H
        if (this.solidInCols(r, left, right) || this.oneWayInCols(r, left, right, prevBottom)) {
          p.y = r * TILE - PLAYER_H
          p.vy = 0
          p.onGround = true
          return
        }
      } else {
        const r = Math.floor(p.y / TILE)
        if (this.solidInCols(r, left, right)) {
          p.y = (r + 1) * TILE
          p.vy = 0
          return
        }
      }
    }
  }

  private solidInRows(col: number, top: number, bottom: number): boolean {
    for (let r = top; r <= bottom; r++) if (this.isSolid(col, r)) return true
    return false
  }

  private oneWayInCols(row: number, left: number, right: number, prevBottom: number): boolean {
    const lv = this.level
    if (row < 0 || row >= lv.rows || prevBottom > row * TILE + EPS) return false
    for (let c = left; c <= right; c++) {
      if (c >= 0 && c < lv.cols && lv.kind[row * lv.cols + c] === K_ONEWAY) return true
    }
    return false
  }

  private solidInCols(row: number, left: number, right: number): boolean {
    for (let c = left; c <= right; c++) if (this.isSolid(c, row)) return true
    return false
  }
}