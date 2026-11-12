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
    for (const k of ['#', 'I', '<', '>', 'B', '=', 'X', 'O', 'v', '{', '}'] as const) expect(validateLevel(floorLevel(k))).toEqual([])
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

describe('Spring brittle breakthrough', () => {
  const make = (power: 1 | 2, kind: TileChar = 'B') => new World(compileLevel(
    new LevelBuilder('short').plat(12, 0, 15).plat(9, 7, 7, kind)
      .spring(7, 11, power).spawn(7, 10).goal(0, 0).build(),
  ))

  it.each([1, 2] as const)('shatters immediately and preserves ascent with spring power %i', power => {
    const w = make(power)
    let events = 0
    w.onEvent = e => { if (e.type === 'crumble') events++ }
    for (let i = 0; i < 60 && w.brittleInfo(7, 9).state !== 'gone'; i++) w.step(0)
    expect(w.brittleInfo(7, 9).state).toBe('gone')
    expect(w.tick).toBeLessThan(CRUMBLE_DELAY)
    expect(w.p.vy).toBeLessThan(0)
    expect(w.p.y).toBeLessThan(10 * TILE)
    expect(events).toBe(1)
    const clone = w.clone()
    expect(clone.brittleInfo(7, 9)).toEqual(w.brittleInfo(7, 9))
    w.p.x = 2 * TILE
    w.p.y = 12 * TILE - PLAYER_H
    w.p.vy = 0
    run(w, 0, CRUMBLE_REGROW + 1)
    expect(w.brittleInfo(7, 9).state).toBe('ok')
  })

  it('keeps solid ceilings intact', () => {
    const w = make(2, '#')
    run(w, 0, 20)
    expect(w.p.y).toBeGreaterThanOrEqual(10 * TILE)
  })

  it('does not shatter brittle blocks without a spring launch', () => {
    const w = make(1)
    w.p.y = 10 * TILE + 1
    w.p.vy = -380
    w.step(0)
    expect(w.brittleInfo(7, 9).state).toBe('ok')
    expect(w.p.vy).toBe(0)
  })
})


describe('Side spring brittle breakthrough', () => {
  const make = (dir: 'l' | 'r', power: 1 | 2, kind: TileChar = 'B') => {
    const col = dir === 'r' ? 9 : 5
    const w = new World(compileLevel(new LevelBuilder('short').plat(11, 0, 15)
      .wall(col, 6, 10, kind).spring(7, 10, power, dir).spawn(7, 9).goal(0, 0).build()))
    return { w, col, sign: dir === 'r' ? 1 : -1 }
  }

  for (const dir of ['l', 'r'] as const) {
    it.each([1, 2] as const)(dir + ' spring breaks walls with power %i and preserves momentum', power => {
      const { w, col, sign } = make(dir, power)
      let breaks = 0
      w.onEvent = e => { if (e.type === 'brittleBreak' && e.side === sign) breaks++ }
      for (let i = 0; i < 50 && breaks === 0; i++) w.step(0)
      expect(breaks).toBeGreaterThan(0)
      expect(w.p.vx * sign).toBeGreaterThan(110)
      const clone = w.clone()
      for (let i = 0; i < 4; i++) { w.step(0); clone.step(0) }
      expect(clone.p).toEqual(w.p)
      expect([...clone.shattered]).toEqual([...w.shattered])
      expect(Array.from({ length: 5 }, (_, i) => w.brittleInfo(col, i + 6).state)).toContain('gone')
    })

    it(dir + ' spring cannot break a solid wall', () => {
      const { w } = make(dir, 2, '#')
      run(w, 0, 40)
      expect([...w.shattered].some(Boolean)).toBe(false)
    })
  }

  it('running into brittle walls does not break them', () => {
    const w = new World(compileLevel(new LevelBuilder('short').plat(11, 0, 15)
      .wall(9, 6, 10, 'B').spawn(7, 10).goal(0, 0).build()))
    run(w, 1, 60)
    expect([...w.shattered].some(Boolean)).toBe(false)
  })
})


describe('Side spring momentum on ice', () => {
  function landed(kind: TileChar = 'I'): World {
    const w = new World(compileLevel(new LevelBuilder('short').plat(12, 0, 15, kind)
      .spring(2, 11, 2, 'r').spawn(2, 10).goal(0, 0).build()))
    let launched = false
    w.onEvent = e => { if (e.type === 'spring') launched = true }
    for (let i = 0; i < 60; i++) {
      w.step(0)
      if (launched && w.p.onGround && w.p.stun === 0) return w
    }
    throw new Error('Spring launch did not land')
  }

  it('coasts much longer than on normal ground', () => {
    const ice = landed(), solid = landed('#')
    const before = ice.p.vx
    run(ice, 0, 5)
    run(solid, 0, 5)
    expect(ice.p.vx).toBeGreaterThan(before - 5)
    expect(ice.p.vx).toBeGreaterThan(solid.p.vx + 80)
  })

  it('preserves speed with matching input without accelerating', () => {
    const w = landed()
    const before = w.p.vx
    run(w, 1, 5)
    expect(w.p.vx).toBeCloseTo(before)
  })

  it('countersteering brakes more strongly than coasting', () => {
    const w = landed(), coast = w.clone()
    run(w, -1, 5)
    run(coast, 0, 5)
    expect(w.p.vx).toBeLessThan(coast.p.vx - 10)
    expect(w.p.vx).toBeGreaterThan(0)
  })

  it('keeps momentum in the air after leaving ice', () => {
    const w = landed()
    const before = w.p.vx
    w.p.onGround = false
    w.p.y -= TILE * 2
    run(w, 0, 5)
    expect(w.p.vx).toBeGreaterThan(before - 5)
  })
})


describe('Brittle breakthrough from any fast impact', () => {
  it.each([-1, 1] as const)('preserves non-spring momentum on ice and breaks walls in direction %i', dir => {
    const col = dir > 0 ? 10 : 4
    const w = new World(compileLevel(new LevelBuilder('short').plat(12, 0, 15, 'I')
      .wall(col, 8, 11, 'B').spawn(7, 11).goal(0, 0).build()))
    run(w, 0, 3)
    w.p.vx = dir * 300
    const coast = w.clone()
    run(coast, 0, 5)
    expect(coast.p.vx * dir).toBeGreaterThan(290)
    let broke = false
    w.onEvent = e => { if (e.type === 'brittleBreak') broke = true }
    for (let i = 0; i < 30 && !broke; i++) w.step(0)
    expect(broke).toBe(true)
    expect(w.p.vx * dir).toBeGreaterThan(110)
  })
})
