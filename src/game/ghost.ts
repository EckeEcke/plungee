import { reactive, watch } from 'vue'
import { World, decodeInputs, simulate, type CompiledLevel, type InputDir } from '../sim'

/**
 * Ghosts: gespielte Läufe, die als halbtransparente Figuren parallel zum eigenen Lauf mitlaufen.
 * Ein Ghost ist nur ein Replay in einer eigenen World. Er wird im Takt des Spielers geschritten (gleiche Tickzahl)
 * und hat keinerlei Einfluss auf Simulation, Zeiten oder Replays.
 */

export interface GhostSpec {
  /** Kodierte Eingaben (siehe encodeInputs) */
  replay: string
  /** Name über der Figur (leer = ohne Schild) */
  label?: string
  /** Körperfarbe; ohne Angabe die Farbe des Spielers */
  color?: string
  /** Deckend statt blass (Rennen der Top 5) */
  solid?: boolean
}

/** Farben der Top-5-Ghosts nach Platz: kein Rot und kein Gelb (Gefahr, Ziel) */
export const GHOST_COLORS = ['#3A86FF', '#2ECC71', '#9B6BFF', '#FF8A3D', '#1FD1C5']

export class Ghost {
  world: World

  constructor(
    private level: CompiledLevel,
    readonly inputs: Int8Array,
    /** Dauer des Laufs in Ticks */
    readonly ticks: number,
    readonly spec: GhostSpec,
  ) {
    this.world = new World(level)
  }

  /** Zurück an den Start (beim Neustart des Spiels) */
  reset(): void {
    this.world = new World(this.level)
  }

  /** Einen Tick weiter; nach dem Ziel (oder Ende der Eingaben) steht der Ghost still */
  step(): void {
    const t = this.world.tick
    if (this.world.finished || t >= this.inputs.length) return
    this.world.step(this.inputs[t] as InputDir)
  }

  /** Wird gezeichnet, solange er läuft: nicht tot, nicht schon im Ziel */
  get visible(): boolean {
    return this.world.tick > 0 && !this.world.finished && !this.world.p.dead
  }

  /** Tick des Ziels, solange er noch läuft null */
  get finishTick(): number | null {
    return this.world.finished ? this.world.finishTick : null
  }

  /** 0..1, wie weit er im Level ist (für Anzeigen neben dem Bild) */
  get progress(): number {
    if (this.world.finished) return 1
    return Math.max(0, Math.min(1, (this.world.p.y + 12) / this.level.height))
  }
}

/**
 * Baut einen Ghost aus einem Replay. Gibt null zurück, wenn das Replay kaputt ist, das Level nicht abschließt
 * oder (mit `expectedTicks`) nicht genau diese Zeit ergibt, etwa weil das Level seit der Aufnahme geändert wurde.
 */
export function makeGhost(level: CompiledLevel, spec: GhostSpec, expectedTicks?: number): Ghost | null {
  let inputs: Int8Array
  try {
    inputs = decodeInputs(spec.replay)
  } catch {
    return null
  }
  if (inputs.length === 0) return null
  try {
    const r = simulate(level, inputs)
    if (!r.finished) return null
    if (expectedTicks !== undefined && r.ticks !== expectedTicks) return null
    return new Ghost(level, inputs, r.ticks, spec)
  } catch {
    return null
  }
}

// --- Eigenes Replay der Bestzeit im Browser ------------------------------------------

const localKey = (levelKey: string): string => `plungee:ghost:${levelKey}`

export function saveLocalGhost(levelKey: string, ticks: number, replay: string): void {
  try {
    localStorage.setItem(localKey(levelKey), JSON.stringify({ t: ticks, r: replay }))
  } catch {
    /* Speicher voll oder gesperrt: dann eben ohne Ghost */
  }
}

export function loadLocalGhost(levelKey: string): { ticks: number; replay: string } | null {
  try {
    const raw = localStorage.getItem(localKey(levelKey))
    if (!raw) return null
    const o = JSON.parse(raw) as { t?: unknown; r?: unknown }
    if (typeof o.t === 'number' && o.t > 0 && typeof o.r === 'string' && o.r) return { ticks: o.t, replay: o.r }
  } catch {
    /* beschädigt: ignorieren */
  }
  return null
}

// --- Einstellungen -------------------------------------------------------------------

const SETTINGS_KEY = 'plungee:ghosts'

/**
 * self: der eigene Ghost der Bestzeit (an), top: die Ghosts der Top 5 in Community-Leveln (aus, bis man sie einschaltet).
 */
export const ghostSettings = reactive({ self: true, top: false })

try {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SETTINGS_KEY)
  if (raw) {
    const o = JSON.parse(raw) as { self?: unknown; top?: unknown }
    if (typeof o.self === 'boolean') ghostSettings.self = o.self
    if (typeof o.top === 'boolean') ghostSettings.top = o.top
  }
} catch {
  /* Standardwerte */
}

watch(ghostSettings, () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ self: ghostSettings.self, top: ghostSettings.top }))
  } catch {
    /* nicht kritisch */
  }
})