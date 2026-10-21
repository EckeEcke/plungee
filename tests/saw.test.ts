import { describe, expect, it } from 'vitest'
import { EditorDoc } from '../src/editor/doc'
import { levelToTs } from '../src/editor/tscode'
import { LevelBuilder, MAX_SAW_LEN, World, compileLevel, sawPos, simulate, validateLevel } from '../src/sim'

function base(): LevelBuilder {
  return new LevelBuilder('short').plat(10, 0, 15).spawn(7, 9).goal(0, 0)
}

describe('Säge: Simulation', () => {
  it('pendelt zwischen den Bahn-Enden', () => {
    const level = compileLevel(base().saw(2, 5, 'h', 4, { period: 100 }).build())
    const sw = level.saws[0]
    const a = sawPos(sw, 0)
    const b = sawPos(sw, 50)
    const c = sawPos(sw, 100)
    expect(a.x).toBeCloseTo(sw.x0, 3)
    expect(b.x).toBeCloseTo(sw.x1, 3)
    expect(c.x).toBeCloseTo(sw.x0, 3)
    expect(a.y).toBe(sw.y0)
    expect(sw.x1 - sw.x0).toBe(4 * 16)
  })

  it('senkrechte Bahn bewegt nur y', () => {
    const level = compileLevel(base().saw(3, 2, 'v', 3).build())
    const sw = level.saws[0]
    expect(sawPos(sw, 40).x).toBe(sw.x0)
    expect(sw.y1 - sw.y0).toBe(48)
  })

  it('tötet, wenn sie den Spieler trifft', () => {
    const w = new World(compileLevel(base().saw(7, 9, 'h', 3).build()))
    for (let i = 0; i < 5; i++) w.step(0)
    expect(w.deaths).toBe(1)
  })

  it('fährt heran und tötet einen wartenden Spieler, nicht vorher', () => {
    // Bahn von Zelle 2 bis 7, Spieler steht in Zelle 7, Säge startet am linken Ende
    const w = new World(compileLevel(base().saw(2, 9, 'h', 5, { period: 150 }).build()))
    for (let i = 0; i < 20; i++) w.step(0)
    expect(w.deaths).toBe(0)
    for (let i = 0; i < 150; i++) w.step(0)
    expect(w.deaths).toBeGreaterThan(0)
  })

  it('ungefährlich, wenn die Bahn weit weg liegt', () => {
    const w = new World(compileLevel(base().saw(2, 3, 'h', 6).build()))
    for (let i = 0; i < 600; i++) w.step(0)
    expect(w.deaths).toBe(0)
  })

  it('Replay ist reproduzierbar', () => {
    const level = compileLevel(base().saw(2, 9, 'h', 5).build())
    const inputs = Array.from({ length: 300 }, (_, i) => (i % 40 < 20 ? 1 : -1) as -1 | 1)
    expect(simulate(level, inputs)).toEqual(simulate(level, inputs))
  })

  it('wird validiert', () => {
    expect(validateLevel(base().saw(2, 5, 'h', 4).build())).toEqual([])
    expect(validateLevel(base().saw(14, 5, 'h', 4).build()).join()).toContain('extends outside')
    expect(validateLevel(base().saw(2, 35, 'v', 6).build()).join()).toContain('extends outside')
    expect(validateLevel(base().saw(0, 5, 'h', MAX_SAW_LEN + 1).build()).join()).toContain('track length')
    expect(validateLevel(base().saw(2, 5, 'h', 4, { period: 10 }).build()).join()).toContain('period')
  })

  it('darf sich die Zelle mit anderen Objekten teilen', () => {
    expect(validateLevel(base().saw(4, 9, 'h', 3).spikes(4, 9).build())).toEqual([])
  })
})

describe('Säge: Editor', () => {
  const sawAt = (x: number, y: number, extra: object = {}) =>
    ({ t: 'saw', x, y, axis: 'h', len: 6, period: 150, phase: 0, ...extra }) as const

  it('kürzt die Bahn am Levelrand', () => {
    const doc = EditorDoc.createStarter('short')
    expect(doc.place({ ...sawAt(12, 5) })).toBe(true)
    expect(doc.findEntity('saw', 12, 5)).toMatchObject({ len: 3 })
  })

  it('lehnt eine Säge ohne Platz für die Bahn ab', () => {
    const doc = EditorDoc.createStarter('short')
    expect(doc.place({ ...sawAt(15, 5) })).toBe(false)
  })

  it('Achsenwechsel kürzt ebenfalls', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ ...sawAt(2, 38, { len: 1 }) })
    doc.update({ t: 'saw', x: 2, y: 38 }, { len: 8, axis: 'v' })
    expect(doc.findEntity('saw', 2, 38)).toMatchObject({ axis: 'v', len: 1 })
  })

  it('liegt neben Objekten und in Wänden, Blöcke löschen sie nicht', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ t: 'spikes', x: 3, y: 8, dir: 'u' })
    doc.place({ ...sawAt(3, 8, { len: 2 }) })
    expect(doc.entityList.filter((e) => e.x === 3 && e.y === 8)).toHaveLength(2)
    expect(doc.entityAt(3, 8)?.t).toBe('spikes')
    doc.paintTile(3, 8, true)
    expect(doc.findEntity('saw', 3, 8)).not.toBeNull()
    expect(doc.findEntity('spikes', 3, 8)).toBeNull()
  })

  it('verkleinern kürzt oder entfernt senkrechte Bahnen', () => {
    const doc = EditorDoc.createStarter('medium')
    doc.place({ ...sawAt(2, 30, { axis: 'v', len: 12 }) })
    doc.place({ ...sawAt(4, 39, { axis: 'v', len: 3 }) })
    doc.resize('short')
    expect(doc.findEntity('saw', 2, 30)).toMatchObject({ len: 9 })
    expect(doc.findEntity('saw', 4, 39)).toBeNull()
  })

  it('TypeScript-Export enthält die Säge', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ ...sawAt(2, 5, { len: 4 }) })
    expect(levelToTs(doc.toLevelData(), 'x')).toContain("b.saw(2, 5, 'h', 4, { period: 150, phase: 0 })")
  })
})
