import { describe, expect, it } from 'vitest'
import { legalPlaceholders, privacyFromUrl } from '../src/legal'

describe('legal', () => {
  it('erkennt die Datenschutzseite an Adresse und Parameter', () => {
    const none = new URLSearchParams()
    expect(privacyFromUrl('/privacy', none)).toBe(true)
    expect(privacyFromUrl('/Datenschutz/', none)).toBe(true)
    expect(privacyFromUrl('/', new URLSearchParams('privacy'))).toBe(true)
    expect(privacyFromUrl('/', none)).toBe(false)
  })

  it('meldet Platzhalter', () => {
    expect(legalPlaceholders({ a: '[x]', b: 'ok', c: '' })).toEqual(['a'])
  })
})