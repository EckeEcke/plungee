import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, LEVELS, LEVELS_BY_DIFFICULTY } from '../src/levels'
import { compileLevel } from '../src/sim'

describe('levels/<schwierigkeit>/*.level.ts', () => {
  it('werden automatisch gefunden', () => {
    // Ungültige oder falsch einsortierte Dateien würden übersprungen: Anzahl muss der der Dateien entsprechen
    expect(LEVELS.length).toBe(Object.keys(import.meta.glob('../src/levels/*/*.level.ts')).length)
    expect(new Set(LEVELS.map((l) => l.key)).size).toBe(LEVELS.length)
  })

  it('landen im Schwierigkeitsgrad ihres Ordners', () => {
    for (const d of DIFFICULTIES) {
      for (const l of LEVELS_BY_DIFFICULTY[d.id]) {
        expect(l.difficulty).toBe(d.id)
        expect(l.key.startsWith(d.id + '/')).toBe(true)
      }
    }
  })

  // Lösbarkeit prüft der Entwickler beim Bauen (Test-Modus im Editor); der Solver schafft Aufstiegs-Level nicht
  for (const l of LEVELS) {
    it(`${l.key} lässt sich kompilieren`, () => {
      expect(() => compileLevel(l.data)).not.toThrow()
    })
  }
})
