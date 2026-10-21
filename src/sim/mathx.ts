// Deterministische Trigonometrie.
//
// Math.sin / Math.cos sind laut Spezifikation nicht bitgenau über alle JS-Engines.
// Für identische Replays (Client im Browser vs. Validierung auf dem Server) bauen wir
// deshalb eine Sinus-Tabelle ausschließlich mit + - * / und interpolieren linear.
// Diese Operationen sind in IEEE-754 exakt festgelegt.

const PI = 3.141592653589793
const TAU = 6.283185307179586
const TABLE_SIZE = 1024

function sinTaylor(x: number): number {
  // x in [-PI, PI]; 12 Folgeglieder reichen für ca. 1e-12 Genauigkeit
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 1; n <= 12; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1))
    sum += term
  }
  return sum
}

const TABLE: Float64Array = (() => {
  const t = new Float64Array(TABLE_SIZE + 1)
  for (let i = 0; i <= TABLE_SIZE; i++) {
    let x = (i / TABLE_SIZE) * TAU
    if (x > PI) x -= TAU
    t[i] = sinTaylor(x)
  }
  return t
})()

/** Sinus, Argument in Umdrehungen (1.0 = voller Kreis). */
export function sinTurns(u: number): number {
  const f = u - Math.floor(u)
  const idx = f * TABLE_SIZE
  const i0 = Math.floor(idx)
  const frac = idx - i0
  const a = TABLE[i0]
  return a + (TABLE[i0 + 1] - a) * frac
}

/** Kosinus, Argument in Umdrehungen. */
export function cosTurns(u: number): number {
  return sinTurns(u + 0.25)
}

/** Sinus, Argument in Radiant. */
export function sinRad(a: number): number {
  return sinTurns(a / TAU)
}

/** Kosinus, Argument in Radiant. */
export function cosRad(a: number): number {
  return sinTurns(a / TAU + 0.25)
}

export const DEG_TO_RAD = PI / 180
export { PI, TAU }

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return v + maxDelta > target ? target : v + maxDelta
  if (v > target) return v - maxDelta < target ? target : v - maxDelta
  return v
}
