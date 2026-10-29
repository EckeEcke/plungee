import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ghost, ghostSettings, loadLocalGhost, makeGhost, saveLocalGhost } from '../src/game/ghost'
import { LevelBuilder, World, compileLevel, decodeInputs } from '../src/sim'

const level = compileLevel(new LevelBuilder('short').plat(5, 0, 15).spawn(7, 2).goal(12, 4).build())
const FAST = 'N30R100'
const SLOW = 'N30R20N60R100'

class MemStorage {
  private m = new Map<string, string>()
  getItem = (k: string) => this.m.get(k) ?? null
  setItem = (k: string, v: string) => void this.m.set(k, v)
}

afterEach(() => vi.unstubAllGlobals())

describe('Ghost', () => {
  it('baut aus einem gültigen Replay einen Ghost mit der richtigen Zeit', () => {
    const g = makeGhost(level, { replay: FAST })
    expect(g).not.toBeNull()
    expect(g!.ticks).toBeGreaterThan(0)
  })

  it('lehnt kaputte, unfertige und zu alte Replays ab', () => {
    expect(makeGhost(level, { replay: '' })).toBeNull()
    expect(makeGhost(level, { replay: 'quatsch' })).toBeNull()
    expect(makeGhost(level, { replay: 'N5' })).toBeNull() // beendet das Level nicht
    const t = makeGhost(level, { replay: FAST })!.ticks
    expect(makeGhost(level, { replay: FAST }, t)).not.toBeNull()
    // Level seit der Aufnahme geändert: andere Zeit als gemerkt
    expect(makeGhost(level, { replay: FAST }, t + 7)).toBeNull()
  })

  it('läuft im Takt des Spielers: nach n Schritten steht er dort, wo eine World mit denselben Eingaben steht', () => {
    const g = makeGhost(level, { replay: SLOW })!
    const w = new World(level)
    const inputs = decodeInputs(SLOW)
    for (let i = 0; i < 40; i++) {
      g.step()
      w.step(inputs[i] as -1 | 0 | 1)
      expect(g.world.p.x).toBe(w.p.x)
      expect(g.world.p.y).toBe(w.p.y)
      expect(g.world.tick).toBe(w.tick)
    }
  })

  it('bleibt nach dem Ziel stehen, ist dann unsichtbar und kann zurückgesetzt werden', () => {
    const g = makeGhost(level, { replay: FAST })!
    expect(g.visible).toBe(true)
    expect(g.progress).toBeLessThan(1)
    for (let i = 0; i < g.ticks + 50; i++) g.step()
    expect(g.world.finished).toBe(true)
    expect(g.world.tick).toBe(g.ticks)
    expect(g.visible).toBe(false)
    expect(g.progress).toBe(1)
    g.reset()
    expect(g.world.tick).toBe(0)
    expect(g.visible).toBe(true)
  })

  it('der langsame Ghost braucht länger als der schnelle', () => {
    expect(makeGhost(level, { replay: SLOW })!.ticks).toBeGreaterThan(makeGhost(level, { replay: FAST })!.ticks)
  })

  it('gehört zu einem Ghost-Objekt auch ohne Name und Farbe', () => {
    const g = makeGhost(level, { replay: FAST })!
    expect(g).toBeInstanceOf(Ghost)
    expect(g.spec.label).toBeUndefined()
  })
})

describe('Ghost im Browser speichern', () => {
  it('Replay und Zeit überstehen Speichern und Laden, getrennt je Level', () => {
    vi.stubGlobal('localStorage', new MemStorage())
    expect(loadLocalGhost('a')).toBeNull()
    saveLocalGhost('a', 123, FAST)
    saveLocalGhost('b', 456, SLOW)
    expect(loadLocalGhost('a')).toEqual({ ticks: 123, replay: FAST })
    expect(loadLocalGhost('b')).toEqual({ ticks: 456, replay: SLOW })
  })

  it('beschädigte Einträge und fehlender Speicher stören nicht', () => {
    const st = new MemStorage()
    vi.stubGlobal('localStorage', st)
    st.setItem('plungee:ghost:x', '{kaputt')
    expect(loadLocalGhost('x')).toBeNull()
    st.setItem('plungee:ghost:y', JSON.stringify({ t: 'viel', r: 5 }))
    expect(loadLocalGhost('y')).toBeNull()
    vi.stubGlobal('localStorage', undefined)
    expect(() => saveLocalGhost('z', 1, FAST)).not.toThrow()
    expect(loadLocalGhost('z')).toBeNull()
  })

  it('Einstellungen: eigener Ghost an, Top-Ghosts aus', () => {
    expect(ghostSettings.self).toBe(true)
    expect(ghostSettings.top).toBe(false)
  })
})