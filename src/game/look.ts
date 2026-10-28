import { reactive, watch } from 'vue'
import type { Theme } from './theme'

/**
 * Aussehen der Figur. Rein optisch: Physik, Replays und Bestzeiten bleiben unberührt.
 * Die Farbe wird über das Theme angewendet (applyLook), alles andere zeichnet character.ts.
 */

export interface Option<T extends string> {
  id: T
  label: string
}

export interface ColorOption extends Option<string> {
  /** null = Farbe des jeweiligen Themes (hell und dunkel haben ein eigenes Pink) */
  body: string | null
  shade: string | null
}

// Kein Rot (Gefahr), kein Gelb (Ziel, Hervorhebungen) und kein Weiß (verschwindet mit den Augen)
export const COLORS: readonly ColorOption[] = [
  { id: 'pink', label: 'Pink', body: null, shade: null },
  { id: 'orange', label: 'Orange', body: '#FF8A3D', shade: '#D9601A' },
  { id: 'lime', label: 'Lime', body: '#A6E22E', shade: '#78AE12' },
  { id: 'green', label: 'Green', body: '#2ECC71', shade: '#1E9E54' },
  { id: 'blue', label: 'Blue', body: '#3A86FF', shade: '#2563D6' },
  { id: 'purple', label: 'Purple', body: '#9B6BFF', shade: '#7447D6' },
]

export const EYES = [
  { id: 'round', label: 'Round' },
  { id: 'big', label: 'Big' },
  { id: 'small', label: 'Small' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'lashes', label: 'Lashes' },
] as const

export type EyeId = (typeof EYES)[number]['id']

export const PATTERNS = [
  { id: 'none', label: 'None' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'dots', label: 'Dots' },
  { id: 'checks', label: 'Checks' },
  { id: 'stars', label: 'Stars' },
  { id: 'hearts', label: 'Hearts' },
] as const

export type PatternId = (typeof PATTERNS)[number]['id']

export interface PatternColor extends Option<string> {
  /** null = Konturfarbe des jeweiligen Themes (dunkel auf hellem Körper) */
  hex: string | null
}

// Kein Rot (Gefahr); Gelb ist hier erlaubt, weil das Muster nur auf dem Körper sitzt
export const PATTERN_COLORS: readonly PatternColor[] = [
  { id: 'white', label: 'White', hex: '#FFFFFF' },
  { id: 'ink', label: 'Dark', hex: null },
  { id: 'yellow', label: 'Yellow', hex: '#FFD23F' },
  { id: 'rose', label: 'Rose', hex: '#FF8FC2' },
  { id: 'mint', label: 'Mint', hex: '#7BE0C3' },
  { id: 'sky', label: 'Sky', hex: '#8EC5FF' },
  { id: 'orange', label: 'Orange', hex: '#FF8A3D' },
]

export interface Look {
  color: string
  eyes: EyeId
  pattern: PatternId
  patternColor: string
}

export const DEFAULT_LOOK: Readonly<Look> = { color: 'pink', eyes: 'round', pattern: 'none', patternColor: 'white' }

const pick = <T extends string>(list: ReadonlyArray<{ id: T }>, v: unknown, fallback: T): T =>
  list.some((o) => o.id === v) ? (v as T) : fallback

/** Unbekannte oder kaputte Werte (alte Version, von Hand geändert) werden durch den Standard ersetzt */
export function sanitizeLook(raw: unknown): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    color: pick(COLORS, r.color, DEFAULT_LOOK.color),
    eyes: pick(EYES, r.eyes, DEFAULT_LOOK.eyes),
    pattern: pick(PATTERNS, r.pattern, DEFAULT_LOOK.pattern),
    patternColor: pick(PATTERN_COLORS, r.patternColor, DEFAULT_LOOK.patternColor),
  }
}

/** Das Theme mit der gewählten Körperfarbe. Alles, was th.player nutzt (Partikel, Marker, Menü), folgt damit automatisch. */
export function applyLook(theme: Theme, l: Pick<Look, 'color'>): Theme {
  const c = COLORS.find((o) => o.id === l.color)
  if (!c || !c.body || !c.shade) return theme
  return { ...theme, player: c.body, playerShade: c.shade }
}

/** Zufällige Kombination aus allen Optionen; `not` ist das aktuelle Aussehen, das nicht noch einmal herauskommt */
export function randomLook(rand: () => number = Math.random, not?: Look): Look {
  const one = <T>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
  for (let i = 0; i < 20; i++) {
    const l: Look = {
      color: one(COLORS).id,
      eyes: one(EYES).id,
      pattern: one(PATTERNS).id,
      patternColor: one(PATTERN_COLORS).id,
    }
    // Ohne Muster zählt die Musterfarbe nicht: sie bleibt wie sie war
    if (l.pattern === 'none') l.patternColor = not?.patternColor ?? DEFAULT_LOOK.patternColor
    const same = not && l.color === not.color && l.eyes === not.eyes && l.pattern === not.pattern && l.patternColor === not.patternColor
    if (!same) return l
  }
  // Nur bei einem kaputten Zufall: wenigstens eine andere Körperfarbe als jetzt
  const base = not ?? DEFAULT_LOOK
  const i = COLORS.findIndex((c) => c.id === base.color)
  return { ...base, color: COLORS[(i + 1) % COLORS.length].id }
}

const KEY = 'plungee:look'

export function loadLook(): Look {
  try {
    const raw = localStorage.getItem(KEY)
    return sanitizeLook(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_LOOK }
  }
}

function saveLook(l: Look): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ color: l.color, eyes: l.eyes, pattern: l.pattern, patternColor: l.patternColor }))
  } catch {
    /* nicht kritisch */
  }
}

/** Aktuelles Aussehen, wird bei jeder Änderung gespeichert */
export const look = reactive<Look>(loadLook())
watch(look, saveLook, { deep: true })