import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { levelHash } from '../src/editor/hash'
import { LEVELS } from '../src/levels'

describe('netlify/generated/campaign.json', () => {
  it('passt zu den Kampagnen-Leveln (sonst: npm run campaign)', () => {
    const file = JSON.parse(readFileSync(new URL('../netlify/generated/campaign.json', import.meta.url), 'utf8')) as Array<{
      key: string
      data: Parameters<typeof levelHash>[0]
    }>
    expect(file.map((l) => [l.key, levelHash(l.data)])).toEqual(LEVELS.map((l) => [l.key, levelHash(l.data)]))
  })
})
