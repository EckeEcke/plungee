import { LEVEL_COLS, LEVEL_ROWS, type LevelData } from '../sim'
import type { RunProof } from './share'

const KEY = 'plunge:draft:v1'

export interface Draft {
  level: LevelData
  /** Lauf-Beweis samt Hash des Levels, für das er gilt */
  proof: { hash: string; run: RunProof } | null
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nicht kritisch */
  }
}

/** Lädt den Entwurf und prüft nur die Struktur; inhaltliche Fehler zeigt der Editor selbst an. */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    const lv = d?.level
    if (!lv || lv.v !== 1 || !(lv.size in LEVEL_ROWS) || !Array.isArray(lv.tiles) || !Array.isArray(lv.entities)) {
      return null
    }
    if (lv.tiles.length !== LEVEL_ROWS[lv.size]) return null
    if (lv.tiles.some((row) => typeof row !== 'string' || row.length !== LEVEL_COLS)) return null
    return { level: lv, proof: d.proof ?? null }
  } catch {
    return null
  }
}
