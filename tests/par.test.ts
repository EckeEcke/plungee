import { readFileSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { levelHash } from '../src/editor/hash'
import { LEVELS } from '../src/levels'
import { compileLevel } from '../src/sim'
import { solve } from './helpers/solver'

const FILE = new URL('../src/levels/par.json', import.meta.url)

/**
 * Hält src/levels/par.json aktuell: Für neue oder geänderte Level wird die Richtzeit mit dem Solver
 * berechnet und gespeichert (npm run par). Danach ist jedes Level mit Richtzeit versehen.
 */
describe('Richtzeiten (par.json)', () => {
  it('sind für alle Level aktuell', () => {
    const par = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, { hash: string; ticks: number | null }>
    let changed = false
    for (const l of LEVELS) {
      const hash = levelHash(l.data)
      if (par[l.key]?.hash === hash) continue
      // Der Solver ist auf fallende Level ausgelegt. Level mit Aufstiegen (Federn nach oben) findet er oft nicht:
      // dann bleibt die Richtzeit leer (Gold nur ohne Tod) und es gibt nur eine Warnung.
      const sol = solve(compileLevel(l.data), { width: 800, maxTicks: 60 * 60 })
      if (!sol) {
        console.warn(`Keine Richtzeit für ${l.key}: Solver findet keinen Weg`)
        par[l.key] = { hash, ticks: null } // gemerkt, damit der Solver das Level nicht bei jedem Lauf erneut versucht
        changed = true
        continue
      }
      par[l.key] = { hash, ticks: sol.ticks }
      changed = true
    }
    // Einträge gelöschter Level entfernen
    const keys = new Set(LEVELS.map((l) => l.key))
    for (const k of Object.keys(par)) {
      if (!keys.has(k)) {
        delete par[k]
        changed = true
      }
    }
    const sorted = Object.fromEntries(Object.entries(par).sort(([a], [b]) => a.localeCompare(b)))
    if (changed) writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n')
  }, 1800000)
})
