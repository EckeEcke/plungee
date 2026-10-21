import { MAX_REPLAY_TICKS } from './constants'
import type { CompiledLevel } from './level'
import type { InputDir } from './types'
import { World } from './world'

const TO_CHAR: Record<number, string> = { [-1]: 'L', 0: 'N', 1: 'R' }
const FROM_CHAR: Record<string, InputDir> = { L: -1, N: 0, R: 1 }

/** Lauflängen-Kodierung der Eingaben, z. B. "N30R12L5" (N = keine, L = links, R = rechts). */
export function encodeInputs(inputs: ArrayLike<number>): string {
  let out = ''
  let i = 0
  while (i < inputs.length) {
    const v = sign(inputs[i])
    let j = i + 1
    while (j < inputs.length && sign(inputs[j]) === v) j++
    out += TO_CHAR[v] + (j - i)
    i = j
  }
  return out
}

export function decodeInputs(encoded: string): Int8Array {
  const re = /([LNR])(\d{1,6})/g
  const runs: Array<[InputDir, number]> = []
  let total = 0
  let consumed = 0
  for (const m of encoded.matchAll(re)) {
    if (m.index !== consumed) throw new Error('Invalid replay format')
    consumed += m[0].length
    const n = parseInt(m[2], 10)
    total += n
    if (total > MAX_REPLAY_TICKS) throw new Error('Replay is too long')
    runs.push([FROM_CHAR[m[1]], n])
  }
  if (consumed !== encoded.length) throw new Error('Invalid replay format')
  const out = new Int8Array(total)
  let pos = 0
  for (const [v, n] of runs) {
    out.fill(v, pos, pos + n)
    pos += n
  }
  return out
}

function sign(v: number): InputDir {
  return v < 0 ? -1 : v > 0 ? 1 : 0
}

export interface RunResult {
  finished: boolean
  /** Dauer in Ticks (bei finished = false: Anzahl simulierter Ticks) */
  ticks: number
  deaths: number
}

/** Spielt eine Eingabefolge deterministisch ab. Identisch auf Client und Server. */
export function simulate(level: CompiledLevel, inputs: ArrayLike<number>): RunResult {
  if (inputs.length > MAX_REPLAY_TICKS) throw new Error('Replay is too long')
  const world = new World(level)
  for (let i = 0; i < inputs.length; i++) {
    world.step(sign(inputs[i]))
    if (world.finished) break
  }
  return {
    finished: world.finished,
    ticks: world.finished ? world.finishTick : world.tick,
    deaths: world.deaths,
  }
}

/** Zeit in Sekunden für die Anzeige, aus ganzzahligen Ticks. */
export function formatTicks(ticks: number): string {
  const totalMs = Math.round((ticks * 1000) / 60)
  const s = Math.floor(totalMs / 1000)
  const cs = Math.floor((totalMs % 1000) / 10)
  const m = Math.floor(s / 60)
  const ss = s % 60
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  return m > 0 ? `${m}:${pad(ss)}.${pad(cs)}` : `${ss}.${pad(cs)}`
}
