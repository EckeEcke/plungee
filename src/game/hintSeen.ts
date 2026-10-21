/**
 * Merkt sich pro Sitzung, ob die Steuerungs-Hinweise schon gezeigt wurden (nur im ersten gespielten Level).
 * sessionStorage kann in Webviews fehlen oder werfen: dann gilt der Merker nur im Speicher.
 */
const KEY = 'plungee:controls-hint-seen'
let seenInMemory = false

export function consumeControlsHint(): boolean {
  if (seenInMemory) return false
  seenInMemory = true
  try {
    if (sessionStorage.getItem(KEY)) return false
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* Speicher nicht verfügbar */
  }
  return true
}
