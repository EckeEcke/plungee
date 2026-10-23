import { reactive, watch } from 'vue'

/**
 * Sound: kurze Effekte (Web Audio, vorab dekodiert) und Musik (gestreamt über ein Audio-Element).
 *
 * Die Dateien liegen als mp3 in src/assets/audio/:
 *   sfx/click.mp3, spring.mp3, death.mp3, finish.mp3, new-best.mp3, checkpoint.mp3, hammer.mp3, crumble.mp3, land.mp3,
 *   blink-switch.mp3 (Blinkblöcke wechseln an/aus)
 *   music/*.mp3 (beliebig viele Titel, werden nacheinander gespielt)
 * Fehlt eine Datei, bleibt der jeweilige Sound einfach stumm.
 *
 * Browser starten Audio erst nach einer Nutzeraktion: initAudio() horcht auf die erste Geste.
 */

export type SfxId =
  | 'click'
  | 'spring'
  | 'death'
  | 'finish'
  | 'newBest'
  | 'checkpoint'
  | 'hammer'
  | 'crumble'
  | 'countdown'
  | 'go'
  | 'respawn'
  | 'laserWarn'
  | 'laserOn'
  | 'place'
  | 'erase'
  | 'land'
  | 'blink'

/** Dauerhaft laufende Geräusche, solange eine Bedingung gilt (Eis, Förderband) */
export type LoopId = 'ice' | 'belt'

interface SfxConfig {
  /** Dateiname ohne .mp3 */
  file: string
  volume: number
  /** Zufällige Tonhöhen-Streuung (±), damit Wiederholungen nicht mechanisch klingen */
  spread: number
  /** Mindestabstand zwischen zwei Wiedergaben in ms */
  minGapMs: number
}

export const SFX: Record<SfxId, SfxConfig> = {
  click: { file: 'click', volume: 0.6, spread: 0.04, minGapMs: 40 },
  spring: { file: 'spring', volume: 0.8, spread: 0.06, minGapMs: 80 },
  death: { file: 'death', volume: 0.9, spread: 0, minGapMs: 150 },
  finish: { file: 'finish', volume: 0.9, spread: 0, minGapMs: 0 },
  newBest: { file: 'new-best', volume: 0.9, spread: 0, minGapMs: 0 },
  checkpoint: { file: 'checkpoint', volume: 0.7, spread: 0, minGapMs: 200 },
  hammer: { file: 'hammer', volume: 0.9, spread: 0.05, minGapMs: 150 },
  crumble: { file: 'crumble', volume: 0.8, spread: 0.05, minGapMs: 120 },
  countdown: { file: 'countdown', volume: 0.7, spread: 0, minGapMs: 100 },
  go: { file: 'go', volume: 0.8, spread: 0, minGapMs: 100 },
  respawn: { file: 'respawn', volume: 0.7, spread: 0.05, minGapMs: 200 },
  laserWarn: { file: 'laser-warn', volume: 0.5, spread: 0, minGapMs: 250 },
  laserOn: { file: 'laser-on', volume: 0.6, spread: 0, minGapMs: 250 },
  place: { file: 'click', volume: 0.25, spread: 0.08, minGapMs: 70 },
  erase: { file: 'crumble', volume: 0.5, spread: 0.08, minGapMs: 90 },
  // Dezenter Aufprall; die Lautstärke wächst mit der Fallgeschwindigkeit (siehe game.ts)
  land: { file: 'land', volume: 2, spread: 0.06, minGapMs: 120 },
  // Globaler Takt der Blinkblöcke (X/O wechseln); nur hörbar, wenn Blinkblöcke im Bild liegen
  blink: { file: 'blink-switch', volume: 1, spread: 0, minGapMs: 250 },
}

export const LOOPS: Record<LoopId, { file: string; volume: number }> = {
  ice: { file: 'ice-slide', volume: 0.5 },
  belt: { file: 'belt', volume: 0.5 },
}

/** Überblendung am Loop-Ende in Sekunden (verdeckt die Lücke, die mp3 am Dateiende lässt) */
const LOOP_XFADE = 0.12
/** So lange darf eine Loop-Bedingung kurz aussetzen (Hüpfer auf Eis), ohne dass das Geräusch abreißt */
const LOOP_GRACE_MS = 120

export const MUSIC_VOLUME = 0.35
/** Musik-Lautstärke, während ein Jingle (Ziel) läuft */
const DUCK_FACTOR = 0.3
/** Kurze Pause, in der ein Levelwechsel die Musik weiterlaufen lässt statt sie neu zu starten */
const MUSIC_STOP_DELAY_MS = 600

const STORAGE_KEY = 'plungee:audio'

/** Einstellungen, reaktiv für die Oberfläche, gespeichert im localStorage (wenn verfügbar) */
export const audioSettings = reactive({ sfx: true, music: true })

try {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
  if (raw) {
    const o = JSON.parse(raw) as { sfx?: unknown; music?: unknown }
    if (typeof o.sfx === 'boolean') audioSettings.sfx = o.sfx
    if (typeof o.music === 'boolean') audioSettings.music = o.music
  }
} catch {
  /* Speicher nicht verfügbar oder beschädigt: Standardwerte */
}

function urlsOf(mods: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, url] of Object.entries(mods)) {
    const name = path.split('/').pop()!.replace(/\.mp3$/i, '')
    out[name] = url
  }
  return out
}

const SFX_URLS = urlsOf(
  import.meta.glob('../assets/audio/sfx/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>,
)
const MUSIC_URLS = Object.entries(
  urlsOf(import.meta.glob('../assets/audio/music/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url)

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
const buffers = new Map<string, AudioBuffer>()
const lastPlayed = new Map<SfxId, number>()
let musicEl: HTMLAudioElement | null = null
let trackIdx = 0
let musicWanted = false
let stopTimer: ReturnType<typeof setTimeout> | undefined
let duckTimer: ReturnType<typeof setTimeout> | undefined
let ducked = false
let initialized = false

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sfx: audioSettings.sfx, music: audioSettings.music }))
  } catch {
    /* nicht kritisch */
  }
}

function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Ältere Safari-Versionen kennen nur die Callback-Variante
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject)
    if (p && typeof p.then === 'function') p.then(resolve, reject)
  })
}

async function loadSfx(c: AudioContext): Promise<void> {
  const files = new Set([...Object.values(SFX).map((s) => s.file), ...Object.values(LOOPS).map((l) => l.file)])
  await Promise.all(
    [...files].map(async (file) => {
      const url = SFX_URLS[file]
      if (!url) return
      try {
        const res = await fetch(url)
        if (!res.ok) return
        buffers.set(file, await decode(c, await res.arrayBuffer()))
      } catch {
        /* Datei nicht ladbar oder nicht dekodierbar: Sound bleibt stumm */
      }
    }),
  )
}

function setBus(bus: GainNode | null, value: number): void {
  if (!bus || !ctx) return
  bus.gain.setTargetAtTime(value, ctx.currentTime, 0.12)
}

function musicLevel(): number {
  return audioSettings.music ? MUSIC_VOLUME * (ducked ? DUCK_FACTOR : 1) : 0
}

function ensureMusicElement(): HTMLAudioElement | null {
  if (!ctx || !musicBus || MUSIC_URLS.length === 0) return null
  if (!musicEl) {
    const el = new Audio()
    el.preload = 'auto'
    el.loop = MUSIC_URLS.length === 1
    el.addEventListener('ended', () => {
      trackIdx = (trackIdx + 1) % MUSIC_URLS.length
      el.src = MUSIC_URLS[trackIdx]
      void el.play().catch(() => {})
    })
    el.src = MUSIC_URLS[trackIdx]
    ctx.createMediaElementSource(el).connect(musicBus)
    musicEl = el
  }
  return musicEl
}

function applyMusic(): void {
  if (!ctx) return
  if (musicWanted && audioSettings.music && ctx.state === 'running') {
    const el = ensureMusicElement()
    if (el && el.paused) void el.play().catch(() => {})
    setBus(musicBus, musicLevel())
  } else {
    setBus(musicBus, 0)
    // Nach dem Ausblenden wirklich pausieren, damit nichts im Hintergrund dekodiert wird
    setTimeout(() => {
      if (musicEl && !(musicWanted && audioSettings.music)) musicEl.pause()
    }, 500)
  }
}

function unlock(): void {
  if (typeof window === 'undefined') return
  if (!ctx) {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
    if (!Ctor) return
    try {
      ctx = new Ctor()
    } catch {
      return
    }
    sfxBus = ctx.createGain()
    sfxBus.gain.value = audioSettings.sfx ? 1 : 0
    sfxBus.connect(ctx.destination)
    musicBus = ctx.createGain()
    musicBus.gain.value = 0
    musicBus.connect(ctx.destination)
    void loadSfx(ctx)
  }
  if (ctx.state !== 'running') void ctx.resume().then(applyMusic, () => {})
  else applyMusic()
}

/** Einmal beim Start aufrufen: Entsperren per erster Geste, Klick-Sound für Buttons, Pause im Hintergrund. */
export function initAudio(): void {
  if (initialized || typeof document === 'undefined') return
  initialized = true

  const onGesture = (): void => unlock()
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    document.addEventListener(type, onGesture, { capture: true, passive: true })
  }

  document.addEventListener(
    'click',
    (e) => {
      const el = e.target as Element | null
      if (el?.closest?.('button, [role="button"], a') && !el.closest('[data-nosound]')) playSfx('click')
    },
    true,
  )

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) {
      musicEl?.pause()
      void ctx.suspend().catch(() => {})
    } else {
      void ctx.resume().then(applyMusic, () => {})
    }
  })

  watch(
    () => [audioSettings.sfx, audioSettings.music],
    () => {
      persist()
      setBus(sfxBus, audioSettings.sfx ? 1 : 0)
      applyMusic()
    },
  )
}

/** volumeScale 0..1 leiser machen, z. B. für entfernte Quellen */
export function playSfx(id: SfxId, volumeScale = 1): void {
  if (!audioSettings.sfx || !ctx || !sfxBus || ctx.state !== 'running') return
  const cfg = SFX[id]
  const buf = buffers.get(cfg.file)
  if (!buf) return
  const now = performance.now()
  if (now - (lastPlayed.get(id) ?? -Infinity) < cfg.minGapMs) return
  lastPlayed.set(id, now)

  const src = ctx.createBufferSource()
  src.buffer = buf
  if (cfg.spread > 0) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * cfg.spread
  const g = ctx.createGain()
  g.gain.value = cfg.volume * volumeScale
  src.connect(g).connect(sfxBus)
  src.start()
}

interface LoopState {
  gain: GainNode
  srcs: AudioBufferSourceNode[]
  timer?: ReturnType<typeof setTimeout>
  graceTimer?: ReturnType<typeof setTimeout>
  stopTimer?: ReturnType<typeof setTimeout>
  stopped: boolean
}
const loops = new Map<LoopId, LoopState>()

/** Hängt das nächste Stück des Loops an; die Stücke überlappen sich um LOOP_XFADE und werden aus- und eingeblendet */
function scheduleLoopSegment(st: LoopState, buf: AudioBuffer, at: number): void {
  if (!ctx || st.stopped) return
  const start = Math.max(at, ctx.currentTime)
  const x = Math.min(LOOP_XFADE, buf.duration / 4)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const seg = ctx.createGain()
  seg.gain.setValueAtTime(0, start)
  seg.gain.linearRampToValueAtTime(1, start + x)
  seg.gain.setValueAtTime(1, start + buf.duration - x)
  seg.gain.linearRampToValueAtTime(0, start + buf.duration)
  src.connect(seg).connect(st.gain)
  src.start(start)
  st.srcs.push(src)
  src.onended = () => {
    st.srcs = st.srcs.filter((s) => s !== src)
  }
  const nextAt = start + buf.duration - x
  st.timer = setTimeout(() => scheduleLoopSegment(st, buf, nextAt), Math.max(0, (nextAt - ctx.currentTime - 0.25) * 1000))
}

function endLoop(id: LoopId, st: LoopState): void {
  st.stopped = true
  clearTimeout(st.timer)
  for (const s of st.srcs) {
    try {
      s.stop()
    } catch {
      /* schon beendet */
    }
  }
  st.gain.disconnect()
  if (loops.get(id) === st) loops.delete(id)
}

/**
 * Geräusch an- oder ausschalten, solange eine Bedingung gilt (z. B. auf Eis laufen).
 * Kurze Aussetzer (Hüpfer) reißen das Geräusch nicht ab, es blendet weich ein und aus.
 */
export function setLoop(id: LoopId, active: boolean): void {
  if (!ctx || !sfxBus || ctx.state !== 'running') return
  let st = loops.get(id)
  const on = active && audioSettings.sfx
  if (on) {
    if (st) {
      clearTimeout(st.graceTimer)
      clearTimeout(st.stopTimer)
      st.graceTimer = undefined
      st.stopTimer = undefined
      st.gain.gain.setTargetAtTime(LOOPS[id].volume, ctx.currentTime, 0.08)
      return
    }
    const buf = buffers.get(LOOPS[id].file)
    if (!buf) return
    st = { gain: ctx.createGain(), srcs: [], stopped: false }
    st.gain.gain.value = 0
    st.gain.connect(sfxBus)
    loops.set(id, st)
    st.gain.gain.setTargetAtTime(LOOPS[id].volume, ctx.currentTime, 0.08)
    scheduleLoopSegment(st, buf, ctx.currentTime)
  } else if (st && st.graceTimer === undefined && st.stopTimer === undefined) {
    const cur = st
    cur.graceTimer = setTimeout(() => {
      cur.graceTimer = undefined
      if (!ctx) return
      cur.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06)
      cur.stopTimer = setTimeout(() => endLoop(id, cur), 350)
    }, LOOP_GRACE_MS)
  }
}

export function stopAllLoops(): void {
  for (const [id, st] of [...loops]) {
    clearTimeout(st.graceTimer)
    clearTimeout(st.stopTimer)
    endLoop(id, st)
  }
}

/** Musik für das laufende Level. Bei schnellem Levelwechsel läuft sie ohne Unterbrechung weiter. */
export function startMusic(): void {
  musicWanted = true
  clearTimeout(stopTimer)
  applyMusic()
}

export function stopMusic(): void {
  clearTimeout(stopTimer)
  stopTimer = setTimeout(() => {
    musicWanted = false
    applyMusic()
  }, MUSIC_STOP_DELAY_MS)
}

/** Musik für die Dauer eines Jingles leiser stellen */
export function duckMusic(ms: number): void {
  ducked = true
  setBus(musicBus, musicLevel())
  clearTimeout(duckTimer)
  duckTimer = setTimeout(() => {
    ducked = false
    setBus(musicBus, musicLevel())
  }, ms)
}

/** Schnellschalter für das Spiel: alles aus, oder (wenn schon alles aus ist) alles an */
export function toggleAllSound(): void {
  const anyOn = audioSettings.sfx || audioSettings.music
  audioSettings.sfx = !anyOn
  audioSettings.music = !anyOn
}

/** Diagnose: Zustand des Audiosystems (für Tests und die Browser-Konsole) */
export function audioState(): { context: string; sfxLoaded: string[]; loops: LoopId[]; tracks: number; musicPlaying: boolean } {
  return {
    context: ctx?.state ?? 'none',
    sfxLoaded: [...buffers.keys()],
    loops: [...loops.keys()],
    tracks: MUSIC_URLS.length,
    musicPlaying: !!musicEl && !musicEl.paused,
  }
}