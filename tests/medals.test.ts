import { describe, expect, it } from 'vitest'
import { betterMedal, medalFor, medalTargets } from '../src/game/medals'
import { recordResult } from '../src/game/progress'

describe('Medaillen', () => {
  const par = 600
  const t = medalTargets(par)
  it('Gold nur ohne Tod und innerhalb der Goldzeit', () => {
    expect(medalFor(t.gold, 0, par)).toBe('gold')
    expect(medalFor(t.gold, 1, par)).toBe('silver')
    expect(medalFor(t.gold + 1, 0, par)).toBe('silver')
  })
  it('Silber nach Zeit, sonst Bronze', () => {
    expect(medalFor(t.silver, 5, par)).toBe('silver')
    expect(medalFor(t.silver + 1, 0, par)).toBe('bronze')
  })
  it('ohne Richtzeit: Gold ohne Tod, sonst Bronze', () => {
    expect(medalFor(99999, 0, null)).toBe('gold')
    expect(medalFor(100, 1, null)).toBe('bronze')
  })
  it('betterMedal und Fortschritt behalten das Beste', () => {
    expect(betterMedal('silver', 'bronze')).toBe('silver')
    let m = recordResult({}, 'a', 1200, 0, par)
    expect(m.a).toEqual({ bestTicks: 1200, medal: 'silver' })
    m = recordResult(m, 'a', 1500, 3, par)
    expect(m.a).toEqual({ bestTicks: 1200, medal: 'silver' })
    m = recordResult(m, 'a', 800, 0, par)
    expect(m.a).toEqual({ bestTicks: 800, medal: 'gold' })
  })
})
