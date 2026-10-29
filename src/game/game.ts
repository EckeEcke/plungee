import {
  BLINK_HALF,
  DT,
  MAX_REPLAY_TICKS,
  PLAYER_H,
  TERMINAL_VY,
  TILE,
  K_BELT_L,
  K_BELT_R,
  K_ICE,
  World,
  encodeInputs,
  isBlinkKind,
  laserPhase,
  type CompiledLevel,
  type InputDir,
  type LaserPhase,
} from '../sim'
import { duckMusic, playSfx, setLoop, stopAllLoops } from '../audio/audio'
import { Ghost, ghostSettings, loadLocalGhost, makeGhost, saveLocalGhost, type GhostSpec } from './ghost'
import { InputController } from './input'
import { Renderer } from './renderer'
import type { Theme } from './theme'

export type GameStatus = 'ready' | 'running' | 'finished'

export interface HudState {
  status: GameStatus
  /** Vergangene Ticks im Lauf (Zeit = ticks / 60) */
  ticks: number
  deaths: number
  /** 0..1, wie weit der Spieler im Level gekommen ist */
  progress: number
  /** 3, 2, 1, 0 (= los) während des Countdowns */
  countdown: number
  /** Bestzeit in Ticks für dieses Level auf diesem Gerät */
  bestTicks: number | null
  /** Nur nach dem Ziel: neue Bestzeit? */
  newBest: boolean
  /** Nur nach dem Ziel: kodierte Eingaben des Laufs */
  replay: string
}

const STEP_MS = DT * 1000
/** Aufprallgeschwindigkeit, ab der die Landung zu hören ist (volle Fallgeschwindigkeit = TERMINAL_VY) */
const LAND_SOUND_VY = 200
const COUNTDOWN_STEP_MS = 650

/**
 * Verbindet Simulation, Eingabe und Renderer.
 * Die Simulation läuft mit festem Takt, gezeichnet wird mit Interpolation.
 */
export class Game {
  private renderer: Renderer
  private input: InputController
  private world!: World
  private level!: CompiledLevel
  private levelKey = ''
  private status: GameStatus = 'ready'
  private countdownMs = 0
  private inputs: Int8Array = new Int8Array(MAX_REPLAY_TICKS)
  private inputCount = 0
  private acc = 0
  private lastTs = 0
  private raf = 0
  private bestTicks: number | null = null
  private newBest = false
  private replay = ''
  private resizeObs: ResizeObserver | null = null
  private bestTimer = 0
  private lastCountdown = 0
  private laserPrev: LaserPhase[] = []
  /** Letzte Halbperiode des Blinktakts (wechselt alle BLINK_HALF Ticks) */
  private blinkPrev = 0
  private disposed = false
  /** Eigener Ghost der Bestzeit (nur wenn eingeschaltet und vorhanden) */
  private selfGhost: Ghost | null = null
  private otherGhosts: Ghost[] = []

  constructor(
    canvas: HTMLCanvasElement,
    private container: HTMLElement,
    theme: Theme,
    private onHud: (h: HudState) => void,
  ) {
    this.renderer = new Renderer(canvas, theme)
    // Große Quetscher klingen lauter; nur im Bild (die Prüfung macht der Renderer)
    this.renderer.onCrusherImpact = (size) => playSfx('crusher', 0.55 + 0.15 * size)
    this.input = new InputController(container)
    this.input.onRestart = () => this.restart()

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  load(level: CompiledLevel, key: string): void {
    this.level = level
    this.levelKey = key
    this.bestTicks = this.readBest()
    this.renderer.setLevel(level)
    this.loadSelfGhost()
    this.resize()
    this.restart()
    if (!this.raf) {
      this.lastTs = performance.now()
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  setTheme(theme: Theme): void {
    this.renderer.setTheme(theme)
  }

  /** Höhe der Bedienleiste in CSS-Pixeln: darunter beginnt das Level, damit die Figur oben nicht verdeckt wird */
  setTopInset(px: number): void {
    this.renderer.setTopInset(px)
  }

  /** Weitere Ghosts (z. B. die Top 5 eines Community-Levels). Ungültige Replays werden still übergangen. */
  setGhosts(specs: GhostSpec[]): void {
    this.otherGhosts = specs.flatMap((s) => makeGhost(this.level, s) ?? [])
    for (const g of this.otherGhosts) g.reset()
  }

  /** Alle Ghosts, die gerade laufen sollen */
  private activeGhosts(): Ghost[] {
    return [...(ghostSettings.self && this.selfGhost ? [this.selfGhost] : []), ...this.otherGhosts]
  }

  private loadSelfGhost(): void {
    const saved = loadLocalGhost(this.levelKey)
    this.selfGhost = saved ? makeGhost(this.level, { replay: saved.replay }, saved.ticks) : null
  }

  restart(): void {
    this.world = new World(this.level)
    for (const g of [this.selfGhost, ...this.otherGhosts]) g?.reset()
    window.clearTimeout(this.bestTimer)
    stopAllLoops()
    this.lastCountdown = 0
    this.laserPrev = this.level.lasers.map((l) => laserPhase(l, 0))
    this.blinkPrev = 0
    this.world.onEvent = (e) => {
      this.renderer.handleEvent(e, this.world)
      if (e.type === 'spring') playSfx('spring')
      else if (e.type === 'death') playSfx('death')
      else if (e.type === 'checkpoint') playSfx('checkpoint')
      else if (e.type === 'hammer') playSfx('hammer')
      else if (e.type === 'crumble') playSfx('crumble')
      else if (e.type === 'respawn') playSfx('respawn')
      else if (e.type === 'land' && e.strength > LAND_SOUND_VY) {
        // Nur nach schnellem Fall hörbar, dezent und mit der Geschwindigkeit lauter
        const k = Math.min(1, (e.strength - LAND_SOUND_VY) / (TERMINAL_VY - LAND_SOUND_VY))
        playSfx('land', 0.35 + 0.65 * k)
      }
    }
    this.renderer.reset()
    this.inputCount = 0
    this.acc = 0
    this.status = 'ready'
    this.countdownMs = COUNTDOWN_STEP_MS * 3
    this.newBest = false
    this.replay = ''
    this.emitHud()
  }

  dispose(): void {
    this.disposed = true
    window.clearTimeout(this.bestTimer)
    stopAllLoops()
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.input.dispose()
    this.resizeObs?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private onVisibility = (): void => {
    // Nach dem Tab-Wechsel keine aufgestaute Zeit nachholen
    this.lastTs = performance.now()
    this.acc = 0
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w <= 0 || h <= 0) return
    const cssW = Math.min(w, 520)
    this.renderer.resize(cssW, h, Math.min(window.devicePixelRatio || 1, 3))
  }

  private frame = (ts: number): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const dtMs = Math.min(ts - this.lastTs, 100)
    this.lastTs = ts

    if (this.status === 'ready') {
      this.countdownMs -= dtMs
      if (this.countdownMs <= 0) {
        this.status = 'running'
        this.acc = 0
        playSfx('go')
      } else {
        const cd = Math.ceil(this.countdownMs / COUNTDOWN_STEP_MS)
        if (cd !== this.lastCountdown) {
          this.lastCountdown = cd
          playSfx('countdown')
        }
      }
      this.emitHud()
    } else if (this.status === 'running') {
      const ghosts = this.activeGhosts()
      this.acc += dtMs
      while (this.acc >= STEP_MS && this.status === 'running') {
        this.acc -= STEP_MS
        const dir: InputDir = this.input.dir
        if (this.inputCount < MAX_REPLAY_TICKS) this.inputs[this.inputCount++] = dir
        this.world.step(dir)
        for (const g of ghosts) g.step()
        if (this.world.finished) this.finish()
      }
      if (this.status === 'running') this.ambientSounds()
      this.emitHud()
    }

    this.renderer.update(dtMs / 1000, this.world)
    this.renderer.draw(this.world, this.status === 'running' ? this.acc / STEP_MS : 0, this.status === 'running', this.activeGhosts())
  }

  private finish(): void {
    this.status = 'finished'
    this.replay = encodeInputs(this.inputs.subarray(0, this.inputCount))
    const t = this.world.finishTick
    if (this.bestTicks === null || t < this.bestTicks) {
      this.newBest = true
      this.bestTicks = t
      this.writeBest(t)
      // Neue Bestzeit: Replay merken, der Ghost beim nächsten Versuch ist dieser Lauf
      saveLocalGhost(this.levelKey, t, this.replay)
      this.selfGhost = makeGhost(this.level, { replay: this.replay }, t)
    }
    stopAllLoops()
    playSfx('finish')
    duckMusic(2200)
    if (this.newBest) this.bestTimer = window.setTimeout(() => playSfx('newBest'), 700)
    this.emitHud()
  }

  /** Laser-Takt und Geräusche der Untergründe; Laser nur, wenn sie im Bild liegen */
  private ambientSounds(): void {
    const w = this.world
    const lasers = this.level.lasers
    for (let i = 0; i < lasers.length; i++) {
      const ph = laserPhase(lasers[i], w.tick)
      if (ph === this.laserPrev[i]) continue
      this.laserPrev[i] = ph
      if (!lasers[i].beam || ph === 'off') continue
      const y = (lasers[i].row + 0.5) * TILE
      if (y < this.renderer.camY - TILE || y > this.renderer.camY + this.renderer.viewH + TILE) continue
      playSfx(ph === 'warn' ? 'laserWarn' : 'laserOn')
    }

    // Blinkblöcke: ein Ton bei jedem Wechsel, aber nur wenn welche im Bild liegen
    const half = Math.floor(w.tick / BLINK_HALF)
    if (half !== this.blinkPrev) {
      this.blinkPrev = half
      if (this.blinkVisible()) playSfx('blink')
    }

    const p = w.p
    const grounded = p.onGround && !p.dead
    setLoop('ice', grounded && w.surface === K_ICE && Math.abs(p.vx) > 12)
    setLoop('belt', grounded && (w.surface === K_BELT_L || w.surface === K_BELT_R))
  }

  /** Liegt mindestens ein Blinkblock im sichtbaren Bereich (mit einer Kachel Rand)? Wird nur beim Taktwechsel geprüft. */
  private blinkVisible(): boolean {
    const lv = this.level
    const r0 = Math.max(0, Math.floor(this.renderer.camY / TILE) - 1)
    const r1 = Math.min(lv.rows - 1, Math.ceil((this.renderer.camY + this.renderer.viewH) / TILE) + 1)
    for (let i = r0 * lv.cols; i < (r1 + 1) * lv.cols; i++) {
      if (isBlinkKind(lv.kind[i])) return true
    }
    return false
  }

  private emitHud(): void {
    const lv = this.level
    const p = this.world.p
    const progress = Math.max(0, Math.min(1, (p.y + PLAYER_H) / lv.height))
    this.onHud({
      status: this.status,
      ticks: this.world.finished ? this.world.finishTick : this.world.tick,
      deaths: this.world.deaths,
      progress: this.status === 'finished' ? 1 : progress,
      countdown: this.status === 'ready' ? Math.max(1, Math.ceil(this.countdownMs / COUNTDOWN_STEP_MS)) : 0,
      bestTicks: this.bestTicks,
      newBest: this.newBest,
      replay: this.replay,
    })
  }

  private storageKey(): string {
    return `plunge:best:${this.levelKey}`
  }

  private readBest(): number | null {
    try {
      const raw = localStorage.getItem(this.storageKey())
      const n = raw === null ? NaN : parseInt(raw, 10)
      return Number.isFinite(n) && n > 0 ? n : null
    } catch {
      return null
    }
  }

  private writeBest(ticks: number): void {
    try {
      localStorage.setItem(this.storageKey(), String(ticks))
    } catch {
      /* Speicher nicht verfügbar, kein Problem */
    }
  }
}