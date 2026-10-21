export type Medal = 'gold' | 'silver' | 'bronze'

/**
 * Medaillen relativ zur Richtzeit (par) eines Levels.
 * par ist die vom Solver gefundene Bestzeit (siehe npm run par), Menschen brauchen länger, deshalb großzügige Faktoren.
 *  Gold:   ohne Tod UND höchstens par × GOLD_FACTOR
 *  Silber: höchstens par × SILVER_FACTOR (Tode erlaubt)
 *  Bronze: Ziel erreicht
 */
export const GOLD_FACTOR = 1.6
export const SILVER_FACTOR = 2.4

const RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 }

export interface MedalTargets {
  gold: number
  silver: number
}

export function medalTargets(par: number): MedalTargets {
  return { gold: Math.ceil(par * GOLD_FACTOR), silver: Math.ceil(par * SILVER_FACTOR) }
}

export function medalFor(ticks: number, deaths: number, par: number | null): Medal {
  if (par === null) return deaths === 0 ? 'gold' : 'bronze'
  const t = medalTargets(par)
  if (deaths === 0 && ticks <= t.gold) return 'gold'
  if (ticks <= t.silver) return 'silver'
  return 'bronze'
}

export function betterMedal(a: Medal | null, b: Medal | null): Medal | null {
  if (!a) return b
  if (!b) return a
  return RANK[a] >= RANK[b] ? a : b
}
