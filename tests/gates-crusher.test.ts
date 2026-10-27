import { describe, expect, it } from 'vitest'
import { EditorDoc, fitCrusherParams } from '../src/editor/doc'
import { TILE_OPTIONS, makeEntity, defaultBrush } from '../src/editor/brush'
import { levelToTs } from '../src/editor/tscode'
import {
  CRUSHER_HOLD,
  CRUSHER_REST,
  CRUSHER_SLAM,
  LevelBuilder,
  PLAYER_H,
  PLAYER_W,
  TILE,
  World,
  compileLevel,
  crusherState,
  validateLevel,
  type InputDir,
  type LevelData,
  type SimEvent,
} from '../src/sim'

function run(w: World, input: InputDir, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step(input)
}

/** Boden in Zeile 10, Start steht in Spalte `col` darauf */
function floor(col: number): LevelBuilder {
  return new LevelBuilder('short').plat(10, 0, 15).spawn(col, 9).goal(0, 0)
}

describe('Torblock seitlich', () => {
  // Tor in Spalte 9, zwei Zellen hoch (Zeilen 8 und 9), nach links offen
  const gate = (ch: '{' | '}', col: number) => floor(col).wall(9, 8, 9, ch).build()

  it('nach links offen: von links kommend dicht', () => {
    const w = new World(compileLevel(gate('{', 7)))
    run(w, 1, 90)
    expect(w.p.x).toBeCloseTo(9 * TILE - PLAYER_W, 3)
  })

  it('nach links offen: von rechts kommend durchlässig', () => {
    const w = new World(compileLevel(gate('{', 12)))
    run(w, -1, 120)
    expect(w.p.x).toBeLessThan(9 * TILE - PLAYER_W)
  })

  it('nach rechts offen: gespiegelt', () => {
    const left = new World(compileLevel(gate('}', 7)))
    run(left, 1, 120)
    expect(left.p.x).toBeGreaterThan(9 * TILE)
    const right = new World(compileLevel(gate('}', 12)))
    run(right, -1, 90)
    expect(right.p.x).toBeCloseTo(10 * TILE, 3)
  })

  it('man kann im Tor umkehren und auf der offenen Seite wieder hinaus', () => {
    const w = new World(compileLevel(gate('}', 7)))
    // Hinein, bis der Körper halb im Tor steckt
    while (w.p.x + PLAYER_W < 9 * TILE + 6) w.step(1)
    run(w, -1, 40)
    expect(w.p.x).toBeLessThan(9 * TILE - PLAYER_W + 1)
  })

  it('blockiert keine Laser', () => {
    const level = compileLevel(floor(7).wall(9, 8, 9, '{').laser(15, 9, 'l').build())
    expect(level.lasers[0].beam).not.toBeNull()
    // Strahl reicht bis an die Zelle neben dem Emitter und weiter durch das Tor
    expect(level.lasers[0].beam!.w).toBeGreaterThan(5 * TILE)
  })
})

describe('Torblock senkrecht', () => {
  it('nach unten offen: man fällt hindurch', () => {
    const data = new LevelBuilder('short').plat(10, 0, 15).plat(6, 0, 15, 'v').spawn(7, 3).goal(0, 0).build()
    const w = new World(compileLevel(data))
    run(w, 0, 120)
    expect(w.p.onGround).toBe(true)
    expect(w.p.y).toBeCloseTo(10 * TILE - PLAYER_H, 3)
  })

  it('nach unten offen: von unten stößt man an', () => {
    const data = new LevelBuilder('short').plat(10, 0, 15).plat(6, 0, 15, 'v').spawn(7, 9).goal(0, 0).build()
    const w = new World(compileLevel(data))
    w.p.vy = -420
    let minY = w.p.y
    for (let i = 0; i < 60; i++) {
      w.step(0)
      minY = Math.min(minY, w.p.y)
    }
    expect(minY).toBeGreaterThanOrEqual(7 * TILE - 0.01)
  })

  it('nach oben offen (Einweg) bleibt wie bisher', () => {
    const data = new LevelBuilder('short').plat(10, 0, 15).plat(6, 0, 15, '=').spawn(7, 9).goal(0, 0).build()
    const w = new World(compileLevel(data))
    w.p.vy = -420
    run(w, 0, 20)
    expect(w.p.y).toBeLessThan(6 * TILE)
  })
})

describe('Quetscher: Zeitverlauf', () => {
  it('ruht, schlägt zu, hält und kehrt zurück', () => {
    const c = { period: 200, phase: 0 }
    expect(crusherState(c, 0).f).toBe(0)
    expect(crusherState(c, 200 * CRUSHER_REST - 1).f).toBe(0)
    // Mitte des Schlags liegt zwischen Ruhe und Ende
    const mid = crusherState(c, 200 * (CRUSHER_REST + CRUSHER_SLAM / 2))
    expect(mid.slamming).toBe(true)
    expect(mid.f).toBeGreaterThan(0)
    expect(mid.f).toBeLessThan(1)
    expect(crusherState(c, 200 * (CRUSHER_REST + CRUSHER_SLAM + CRUSHER_HOLD / 2)).f).toBe(1)
    expect(crusherState(c, 200 - 0.001).f).toBeCloseTo(0, 2)
    expect(crusherState(c, 200).f).toBe(0)
  })

  it('der Schlag ist deutlich schneller als der Rückweg', () => {
    const c = { period: 200, phase: 0 }
    const slamStart = 200 * CRUSHER_REST
    const slamEnd = slamStart + 200 * CRUSHER_SLAM
    const holdEnd = slamEnd + 200 * CRUSHER_HOLD
    const slamSpeed = (1 - 0) / (slamEnd - slamStart)
    const backSpeed = (1 - crusherState(c, holdEnd + 30).f) / 30
    expect(slamSpeed).toBeGreaterThan(backSpeed * 3)
  })

  it('warnt kurz vor dem Schlag', () => {
    const c = { period: 200, phase: 0 }
    expect(crusherState(c, 200 * CRUSHER_REST - 5).warn).toBe(true)
    expect(crusherState(c, 10).warn).toBe(false)
  })

  it('Phase verschiebt den Zyklus', () => {
    const a = crusherState({ period: 200, phase: 0 }, 100)
    const b = crusherState({ period: 200, phase: 0.5 }, 0)
    expect(a).toEqual(b)
  })
})

describe('Quetscher: fester Block', () => {
  // Block 2×2 in Spalten 6 und 7, Ruhelage Zeilen 3-4, schlägt 5 Tiles nach unten bis auf den Boden (Zeilen 8-9)
  const level = (col: number, period = 100): LevelData => floor(col).crusher(6, 3, 'd', 5, { size: 2, period }).build()

  it('zerquetscht den Spieler am Boden, nicht vorher', () => {
    const events: SimEvent[] = []
    const w = new World(compileLevel(level(7)))
    w.onEvent = (e) => events.push(e)
    run(w, 0, 45)
    expect(w.deaths).toBe(0)
    run(w, 0, 30)
    expect(w.deaths).toBe(1)
    expect(events.some((e) => e.type === 'death' && e.cause === 'crusher')).toBe(true)
  })

  it('daneben ist man sicher', () => {
    const w = new World(compileLevel(level(12)))
    run(w, 0, 400)
    expect(w.deaths).toBe(0)
  })

  it('überspringt bei sehr schnellem Schlag den Spieler nicht', () => {
    // Periode 60, Reichweite 6: ca. 20 Einheiten pro Tick, mehr als die Körperhöhe
    const data = new LevelBuilder('short').plat(10, 0, 15).spawn(7, 9).goal(0, 0).crusher(6, 2, 'd', 6, { size: 2, period: 60 }).build()
    const w = new World(compileLevel(data))
    run(w, 0, 70)
    expect(w.deaths).toBe(1)
  })

  it('ist deterministisch', () => {
    const run1 = new World(compileLevel(level(7)))
    const run2 = new World(compileLevel(level(7)))
    run(run1, 0, 300)
    run(run2, 0, 300)
    expect(run1.deaths).toBe(run2.deaths)
    expect(run1.p).toEqual(run2.p)
  })

  it('Berühren ist harmlos: man läuft dagegen und wird aufgehalten', () => {
    // Quetscher ruht auf dem Boden (Zeilen 8-9) und bewegt sich nur 1 Tile; Spieler läuft von links dagegen
    const data = floor(2).crusher(6, 8, 'u', 1, { size: 2, period: 600 }).build()
    const w = new World(compileLevel(data))
    run(w, 1, 120)
    expect(w.deaths).toBe(0)
    expect(w.p.x).toBeCloseTo(6 * TILE - PLAYER_W, 3)
  })

  it('man kann darauf stehen und fährt mit nach unten', () => {
    const w = new World(compileLevel(level(14)))
    // Den Spieler auf den ruhenden Block setzen (Oberkante bei Zeile 3)
    w.p.x = 6 * TILE + 8
    w.p.y = 3 * TILE - PLAYER_H
    run(w, 0, 5)
    expect(w.p.onGround).toBe(true)
    expect(w.ridingCrusher).toBe(0)
    // Der Schlag beginnt nach 50 Ticks: danach liegt der Spieler auf dem unten liegenden Block
    run(w, 0, 90)
    expect(w.deaths).toBe(0)
    expect(w.p.onGround).toBe(true)
    const r = w.crusherRects[0]
    expect(w.p.y + PLAYER_H).toBeCloseTo(r.y, 2)
    expect(r.y).toBeGreaterThan(3 * TILE)
  })

  it('wird oben stehend gegen die Decke gedrückt und zerquetscht', () => {
    // Block fährt in der Haltephase unten, Decke über seiner Ruhelage; Rückweg quetscht den Spieler an der Decke
    const data = floor(14).plat(5, 6, 7).crusher(6, 6, 'd', 3, { size: 2, period: 150, phase: 0.6 }).build()
    const w = new World(compileLevel(data))
    const r0 = w.crusherRects[0]
    w.p.x = r0.x + 8
    w.p.y = r0.y - PLAYER_H
    run(w, 0, 3)
    expect(w.ridingCrusher).toBe(0)
    run(w, 0, 80)
    expect(w.deaths).toBe(1)
  })

  it('wird seitlich gegen eine Wand gedrückt und zerquetscht', () => {
    const data = floor(7).crusher(1, 8, 'r', 5, { size: 2, period: 100 }).wall(8, 8, 9).build()
    const w = new World(compileLevel(data))
    run(w, 0, 62)
    expect(w.deaths).toBe(1)
  })

  it('wird seitlich nur weggeschoben, wenn dahinter Platz ist', () => {
    const data = floor(7).crusher(1, 8, 'r', 5, { size: 2, period: 100 }).build()
    const w = new World(compileLevel(data))
    run(w, 0, 62)
    expect(w.deaths).toBe(0)
    // Der Spieler steht rechts neben dem Block
    expect(w.p.x).toBeGreaterThanOrEqual(w.crusherRects[0].x + 2 * TILE - 0.01)
  })

  it('trägt einen Spieler auf der Oberseite zur Seite mit', () => {
    const data = floor(14).crusher(1, 8, 'r', 6, { size: 2, period: 150, phase: 0.45 }).build()
    const w = new World(compileLevel(data))
    const r0 = w.crusherRects[0]
    w.p.x = r0.x + 6
    w.p.y = r0.y - PLAYER_H
    run(w, 0, 3)
    const x0 = w.p.x
    run(w, 0, 30)
    expect(w.deaths).toBe(0)
    expect(w.p.x).toBeGreaterThan(x0 + 20)
  })
})

describe('Quetscher: Validierung', () => {
  const ok = () => floor(7).crusher(6, 3, 'd', 4)

  it('gültig', () => {
    expect(validateLevel(ok().build())).toEqual([])
  })

  it('Ruhelage und Endlage müssen im Level liegen', () => {
    expect(validateLevel(floor(7).crusher(15, 3, 'd', 2, { size: 2 }).build()).join()).toContain('outside')
    expect(validateLevel(floor(7).crusher(6, 37, 'd', 4).build()).join()).toContain('outside')
    expect(validateLevel(floor(7).crusher(6, 1, 'u', 4).build()).join()).toContain('outside')
    expect(validateLevel(floor(7).crusher(1, 5, 'l', 3).build()).join()).toContain('outside')
  })

  it('Parameter werden geprüft', () => {
    const bad = ok().build()
    const c = bad.entities.find((e) => e.t === 'crusher')!
    Object.assign(c, { size: 4 })
    expect(validateLevel(bad)).not.toEqual([])
    Object.assign(c, { size: 2, period: 10 })
    expect(validateLevel(bad)).not.toEqual([])
    Object.assign(c, { period: 100, len: 0 })
    expect(validateLevel(bad)).not.toEqual([])
  })

  it('teilt sich die Zelle mit anderen Objekten und Wänden', () => {
    const data = floor(7).plat(3, 6, 7).crusher(6, 3, 'd', 4).build()
    expect(validateLevel(data)).toEqual([])
  })
})

describe('Editor: Quetscher und Torblöcke', () => {
  it('Torblöcke stehen als Block-Typen zur Wahl', () => {
    const chars = TILE_OPTIONS.map((o) => o.ch)
    for (const ch of ['=', 'v', '{', '}']) expect(chars).toContain(ch)
  })

  it('malt Torblöcke und exportiert sie als plat', () => {
    const doc = EditorDoc.createStarter('short')
    expect(doc.paintTile(3, 5, 'v')).toBe(true)
    expect(doc.tileAt(3, 5)).toBe('v')
    expect(levelToTs(doc.toLevelData())).toContain("'v'")
  })

  it('setzt und exportiert einen Quetscher', () => {
    const doc = EditorDoc.createStarter('short')
    const e = makeEntity('crusher', 4, 4, defaultBrush())!
    expect(doc.place(e)).toBe(true)
    expect(doc.findEntity('crusher', 4, 4)).toMatchObject({ dir: 'd', size: 2 })
    expect(levelToTs(doc.toLevelData())).toContain("b.crusher(4, 4, 'd', 3, { size: 2")
  })

  it('kürzt Reichweite und Größe am Levelrand', () => {
    expect(fitCrusherParams(15, 10, 3, 'd', 5, 40)).toEqual({ size: 1, len: 5 })
    expect(fitCrusherParams(2, 36, 2, 'd', 6, 40)).toEqual({ size: 2, len: 2 })
    expect(fitCrusherParams(2, 38, 2, 'd', 6, 40)).toBeNull()
    expect(fitCrusherParams(0, 10, 2, 'l', 3, 40)).toBeNull()
  })

  it('Quetscher kann in einer Wand sitzen und lässt sie stehen', () => {
    const doc = EditorDoc.createStarter('short')
    doc.paintTile(5, 6, true)
    expect(doc.place({ t: 'crusher', x: 5, y: 6, dir: 'd', size: 1, len: 2, period: 150, phase: 0 })).toBe(true)
    expect(doc.tileAt(5, 6)).toBe('#')
  })

  it('große Quetscher sind auch in den anderen Zellen auswählbar', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ t: 'crusher', x: 4, y: 4, dir: 'd', size: 2, len: 3, period: 150, phase: 0 })
    expect(doc.entityAt(5, 5)?.t).toBe('crusher')
    expect(doc.entityAt(6, 5)).toBeNull()
  })

  it('Parameteränderung passt die Reichweite an', () => {
    const doc = EditorDoc.createStarter('short')
    doc.place({ t: 'crusher', x: 4, y: 34, dir: 'd', size: 2, len: 3, period: 150, phase: 0 })
    doc.update({ t: 'crusher', x: 4, y: 34 }, { size: 3 })
    expect(doc.findEntity('crusher', 4, 34)).toMatchObject({ size: 3, len: 3 })
    doc.update({ t: 'crusher', x: 4, y: 34 }, { len: 12 })
    expect(doc.findEntity('crusher', 4, 34)).toMatchObject({ len: 3 })
  })
})