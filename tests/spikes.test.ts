import { describe, expect, it } from 'vitest'
import { createTestLevel } from './helpers/fixtures'
import { compileLevel, simulate, validateLevel } from '../src/sim'
import { solve } from './helpers/solver'

describe('Level "Mind the Spikes"', () => {
  it('ist gültig', () => {
    expect(validateLevel(createTestLevel())).toEqual([])
  })
  it('ist lösbar', () => {
    const level = compileLevel(createTestLevel())
    const sol = solve(level)
    expect(sol).not.toBeNull()
    expect(simulate(level, sol!.inputs).finished).toBe(true)
  }, 300000)
})
