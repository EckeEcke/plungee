import { compileLevel, decodeInputs, simulate, validateLevel, type LevelData } from '../sim'

/** Beweis, dass das Level lösbar ist: die Eingaben eines erfolgreichen Laufs. */
export interface RunProof {
  ticks: number
  replay: string
}

export interface SharedLevel {
  v: 1
  level: LevelData
  run: RunProof
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

const MAX_JSON_BYTES = 200_000

/** Spielt den Lauf deterministisch nach und prüft, ob er das Ziel mit der behaupteten Zeit erreicht. */
export function verifyRun(level: LevelData, run: RunProof): VerifyResult {
  const errors = validateLevel(level)
  if (errors.length) return { ok: false, reason: `Invalid level: ${errors[0]}` }
  if (!run || typeof run.replay !== 'string' || !Number.isInteger(run.ticks) || run.ticks <= 0) {
    return { ok: false, reason: 'Run is missing or invalid' }
  }
  let inputs: Int8Array
  try {
    inputs = decodeInputs(run.replay)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Replay unreadable' }
  }
  const result = simulate(compileLevel(level), inputs)
  if (!result.finished) return { ok: false, reason: 'The run does not reach the goal' }
  if (result.ticks !== run.ticks) return { ok: false, reason: 'The time does not match the run' }
  return { ok: true }
}

export function exportLevel(level: LevelData, run: RunProof): string {
  const payload: SharedLevel = { v: 1, level, run }
  return JSON.stringify(payload)
}

/** Liest ein geteiltes Level und prüft den Lauf. Wirft Error mit verständlicher Meldung. */
export function importLevel(json: string): SharedLevel {
  if (json.length > MAX_JSON_BYTES) throw new Error('File is too large')
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('This is not valid JSON')
  }
  const obj = data as Partial<SharedLevel> | null
  if (!obj || obj.v !== 1 || !obj.level || !obj.run) throw new Error('Unknown format')
  const res = verifyRun(obj.level, obj.run)
  if (!res.ok) throw new Error(res.reason)
  return { v: 1, level: obj.level, run: obj.run }
}
