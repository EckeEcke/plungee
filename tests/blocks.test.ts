import { describe, expect, it } from 'vitest'
import { EditorDoc } from '../src/editor/doc'
import { levelToTs } from '../src/editor/tscode'
import {
  CRUMBLE_DELAY,
  CRUMBLE_REGROW,
  LevelBuilder,
  PLAYER_H,
  TILE,
  World,
  compileLevel,
  validateLevel,
  type InputDir,
  type LevelData,
  type TileChar,
} from '../src/sim'

/** Boden in Zeile 10 aus dem gewünschten Block-Typ, Start steht darauf */
function floorLevel(kind: TileChar, extra?: (b: LevelBuilder) => void): LevelData {
  const b = new LevelBuilder('short').plat(10, 0, 15, kind).spawn(7, 9).goal(0, 0)
  extra?.(b)
  return b.build()
}

function run(w: World, input: InputDir, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step(input)
}

describe('Block-Typen: Format', () => {
  it('alle Zeichen sind gültig, unbekannte nicht', () => {
    for (const k of ['#', 'I', '<', '>', 'B', '=', 'X', 'O'] as const) expect(validateLevel(floorLevel(k))).toEqual([])
    const bad = floorLevel('#')
    bad.tiles[3] = '?' + bad.tiles[3].slice(1)
    expect(validateLevel(bad).join()).toContain('Row 3')
  })

  it('Objekte können in keinem Block-Typ stehen', () => {
    expect(validateLevel(floorLevel('#', (b) => b.spikes(3, 10)))).not.toEqual([])
    expect(validateLevel(floorLevel('=', (b) => b.spikes(3, 10)))).not.toEqual([])
  })
})

describe('Eis', () => {
  it('rutscht deutlich weiter als normaler Boden', () => {
    const slide = (kind: TileChar): number => {
      const w = new World(compileLevel(floorLevel(kind)))
      run(w, 0, 5)
      run(w, 1, 40)
      const x = w.p.x
      run(w, 0, 40)
      return w.p.x - x
    }
    expect(slide('I')).toBeGreaterThan(slide('#') + 15)
  })
})

describe('Förderband', () => {
  it('schiebt einen stehenden Spieler', () => {
    const at = (kind: TileChar): number => {
      const w = new World(compileLevel(floorLevel(kind)))
      const x0 = w.p.x
      run(w, 0, 60)
      return w.p.x - x0
    }
    expect(at('>')).toBeGreaterThan(20)
    expect(at('<')).toBeLessThan(-20)
    expect(Math.abs(at('#'))).toBeLessThan(0.01)
  })
})

describe('Brüchige Plattform', () => {
  it('trägt zuerst, bricht nach dem Betreten und wächst nach', () => {
    const level = compileLevel(floorLevel('B'))
    const w = new World(level)
    run(w, 0, 5)
    expect(w.p.onGround).toBe(true)
    const row = 10
    expect(w.brittleInfo(7, row).state).toBe('crack')
    run(w, 0, CRUMBLE_DELAY)
    expect(w.brittleInfo(7, row).state).toBe('gone')
    expect(w.p.y).toBeGreaterThan(row * TILE - PLAYER_H + 1) // Spieler fällt
    // Spieler stirbt im Abgrund, Respawn setzt die Plattformen zurück
    run(w, 0, 400)
    expect(w.deaths).toBeGreaterThan(0)
  })

  it('wächst nach der Wartezeit wieder, wenn niemand darin steht', () => {
    // Spieler berührt die Plattform und läuft sofort weg auf festen Boden
    const b = new LevelBuilder('short').plat(10, 0, 15).plat(10, 7, 7, 'B').spawn(7, 9).goal(0, 0)
    const w = new World(compileLevel(b.build()))
    run(w, 0, 3)
    expect(w.brittleInfo(7, 10).state).toBe('crack')
    run(w, 1, 20)
    run(w, 0, CRUMBLE_DELAY + CRUMBLE_REGROW + 10)
    expect(w.brittleInfo(7, 10).state).toBe('ok')
  })

  it('Klon behält den Zustand', () => {
    const w = new World(compileLevel(floorLevel('B')))
    run(w, 0, 5)
    const c = w.clone()
    run(c, 0, CRUMBLE_DELAY)
    expect(w.brittleInfo(7, 10).state).toBe('crack')
    expect(c.brittleInfo(7, 10).state).toBe('gone')
  })
})

describe('Einwegplattform', () => {
  const level = () => compileLevel(new LevelBuilder('short').plat(10, 0, 15).plat(6, 4, 10, '=').spawn(7, 3).goal(0, 0).build())

  it('trägt von oben', () => {
    const w = new World(level())
    run(w, 0, 90)
    expect(w.p.onGround).toBe(true)
    expect(w.p.y).toBeCloseTo(6 * TILE - PLAYER_H, 3)
  })

  it('lässt den Spieler von unten durch und trägt ihn danach', () => {
    const w = new World(level())
    w.p.y = 9 * TILE // unter der Platte
    w.p.vy = -420
    let minY = w.p.y
    for (let i = 0; i < 25; i++) {
      w.step(0)
      minY = Math.min(minY, w.p.y)
    }
    expect(minY).toBeLessThan(6 * TILE - 4) // ist durch die Platte nach oben geflogen
    run(w, 0, 120)
    expect(w.p.y).toBeCloseTo(6 * TILE - PLAYER_H, 3) // steht oben
  })

  it('blockiert nicht von der Seite', () => {
    const w = new World(compileLevel(new LevelBuilder('short').plat(10, 0, 15).plat(9, 9, 9, '=').spawn(7, 9).goal(0, 0).build()))
    run(w, 1, 60)
    expect(w.p.x).toBeGreaterThan(9 * TILE + 4)
  })
})

describe('Seitenfeder', () => {
  const level = (dir: 'l' | 'r') =>
    dir === 'r'
      ? new LevelBuilder('short').plat(10, 0, 15).wall(4, 8, 9).spring(5, 9, 1, 'r').spawn(9, 9).goal(0, 0).build()
      : new LevelBuilder('short').plat(10, 0, 15).wall(11, 8, 9).spring(10, 9, 1, 'l').spawn(6, 9).goal(0, 0).build()

  it('schleudert nach rechts, wenn man von rechts hineinläuft', () => {
    const w = new World(compileLevel(level('r')))
    let maxX = 0
    for (let i = 0; i < 120; i++) {
      w.step(-1)
      maxX = Math.max(maxX, w.p.x)
    }
    expect(w.p.x).toBeGreaterThan(5 * TILE) // landet wieder rechts der Feder
    // wurde nach rechts beschleunigt
    const w2 = new World(compileLevel(level('r')))
    let sawFast = false
    for (let i = 0; i < 120; i++) {
      w2.step(-1)
      if (w2.p.vx > 200) sawFast = true
    }
    expect(sawFast).toBe(true)
  })

  it('schleudert nach links', () => {
    const w = new World(compileLevel(level('l')))
    let sawFast = false
    for (let i = 0; i < 120; i++) {
      w.step(1)
      if (w.p.vx < -200) sawFast = true
    }
    expect(sawFast).toBe(true)
  })

  it('ungültige Richtung wird abgelehnt', () => {
    const d = level('r')
    ;(d.entities.find((e) => e.t === 'spring') as { dir?: string }).dir = 'd'
    expect(validateLevel(d).join()).toContain('spring can only')
  })
})

describe('Block-Typen im Editor', () => {
  it('ersetzt Typen beim Malen und löscht', () => {
    const doc = EditorDoc.createStarter('short')
    expect(doc.paintTile(3, 10, 'I')).toBe(true)
    expect(doc.tileAt(3, 10)).toBe('I')
    expect(doc.paintTile(3, 10, 'I')).toBe(false)
    expect(doc.paintTile(3, 10, '>')).toBe(true)
    expect(doc.tileAt(3, 10)).toBe('>')
    expect(doc.paintTile(3, 10, false)).toBe(true)
    expect(doc.tileAt(3, 10)).toBeNull()
    expect(doc.isSolid(3, 10)).toBe(false)
  })

  it('Undo stellt den alten Typ wieder her', () => {
    const doc = EditorDoc.createStarter('short')
    doc.paintTile(3, 10, 'B')
    doc.paintTile(3, 10, '=')
    doc.undo()
    expect(doc.tileAt(3, 10)).toBe('B')
  })

  it('Einwegplattform verdrängt Objekte wie jeder Block', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ t: 'spikes', x: 3, y: 10, dir: 'u' })
    doc.paintTile(3, 10, '=')
    expect(doc.findEntity('spikes', 3, 10)).toBeNull()
  })

  it('Feder-Richtung u wird nicht gespeichert', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ t: 'spring', x: 3, y: 9, power: 1, dir: 'u' })
    expect(doc.findEntity('spring', 3, 9)).not.toHaveProperty('dir')
    doc.update({ t: 'spring', x: 3, y: 9 }, { dir: 'r' })
    expect(doc.findEntity('spring', 3, 9)).toMatchObject({ dir: 'r' })
    doc.update({ t: 'spring', x: 3, y: 9 }, { dir: 'u' })
    expect(doc.findEntity('spring', 3, 9)).not.toHaveProperty('dir')
  })

  it('Export/Import und TypeScript-Export behalten Typen und Federrichtung', () => {
    const doc = EditorDoc.createStarter('short')
    doc.paintTile(2, 12, 'I')
    doc.paintTile(3, 12, 'I')
    doc.paintTile(5, 12, '<')
    doc.paintTile(8, 12, 'B')
    doc.paintTile(9, 12, '=')
    doc.place({ t: 'spring', x: 4, y: 9, power: 2, dir: 'l' })
    const data = doc.toLevelData()
    expect(data.tiles[12]).toBe('..II.<..B=......')
    expect(validateLevel(data)).toEqual([])
    const code = levelToTs(data, 'create')
      .replace(/^import .*$/gm, '')
      .replace('export function', 'function')
      .replace('(): LevelData', '()')
    const rebuilt = new Function('LevelBuilder', `${code}\nreturn create()`)(LevelBuilder) as LevelData
    expect(rebuilt.tiles).toEqual(data.tiles)
    expect(rebuilt.entities.find((e) => e.t === 'spring')).toMatchObject({ power: 2, dir: 'l' })
    expect(new EditorDoc(data).toLevelData().tiles).toEqual(data.tiles)
  })
})