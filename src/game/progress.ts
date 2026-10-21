import { betterMedal, medalFor, type Medal } from './medals'

export interface LevelProgress {
  bestTicks: number
  medal: Medal
}

export type ProgressMap = Record<string, LevelProgress>

const KEY = 'plunge:progress:v1'

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ProgressMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function save(map: ProgressMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* nicht kritisch */
  }
}

/** Trägt einen Lauf ein. Behalten wird die beste Zeit und die beste Medaille (unabhängig voneinander). */
export function recordResult(
  map: ProgressMap,
  key: string,
  ticks: number,
  deaths: number,
  par: number | null,
): ProgressMap {
  const medal = medalFor(ticks, deaths, par)
  const old = map[key]
  const next: ProgressMap = {
    ...map,
    [key]: {
      bestTicks: old ? Math.min(old.bestTicks, ticks) : ticks,
      medal: betterMedal(old?.medal ?? null, medal)!,
    },
  }
  save(next)
  return next
}
