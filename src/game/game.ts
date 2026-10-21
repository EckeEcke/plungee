import {
  DT,
  MAX_REPLAY_TICKS,
  PLAYER_H,
  World,
  encodeInputs,
  type CompiledLevel,
  type InputDir,
} from '../sim'
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
  private disposed = false

  constructor(
    canvas: HTMLCanvasElement,
    private container: HTMLElement,
    theme: Theme,
    private onHud: (h: HudState) => void,
  ) {
    this.renderer = new Renderer(canvas, theme)
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

  restart(): void {
    this.world = new World(this.level)
    this.world.onEvent = (e) => this.renderer.handleEvent(e, this.world)
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
      }
      this.emitHud()
    } else if (this.status === 'running') {
      this.acc += dtMs
      while (this.acc >= STEP_MS && this.status === 'running') {
        this.acc -= STEP_MS
        const dir: InputDir = this.input.dir
        if (this.inputCount < MAX_REPLAY_TICKS) this.inputs[this.inputCount++] = dir
        this.world.step(dir)
        if (this.world.finished) this.finish()
      }
      this.emitHud()
    }

    this.renderer.update(dtMs / 1000, this.world)
    this.renderer.draw(this.world, this.status === 'running' ? this.acc / STEP_MS : 0, this.status === 'running')
  }

  private finish(): void {
    this.status = 'finished'
    this.replay = encodeInputs(this.inputs.subarray(0, this.inputCount))
    const t = this.world.finishTick
    if (this.bestTicks === null || t < this.bestTicks) {
      this.newBest = true
      this.bestTicks = t
      this.writeBest(t)
    }
    this.emitHud()
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
