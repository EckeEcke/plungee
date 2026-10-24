import { describe, expect, it } from 'vitest'
import { EditorDoc } from '../src/editor/doc'
import { levelToTs } from '../src/editor/tscode'
import {
  BLINK_HALF,
  BLINK_PERIOD,
  LevelBuilder,
  PLAYER_H,
  TILE,
  World,
  compileLevel,
  validateLevel,
  type InputDir,
} from '../src/sim'

function run(w: World, input: InputDir, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step(input)
}

describe('Blinkblock', () => {
  const level = () => new LevelBuilder('short').plat(10, 0, 15, 'X').spawn(7, 8).goal(0, 0).build()

  it('trägt in der festen Phase und lässt in der anderen durch', () => {
    const w = new World(compileLevel(level()))
    run(w, 0, 30)
    expect(w.p.onGround).toBe(true)
    expect(w.p.y).toBeCloseTo(10 * TILE - PLAYER_H, 3)
    // über das Ende der festen Phase hinaus: fällt durch
    run(w, 0, BLINK_HALF)
    expect(w.p.y).toBeGreaterThan(10 * TILE - PLAYER_H + 4)
  })

  it('O ist gegenphasig zu X', () => {
    const lv = new LevelBuilder('short').plat(10, 0, 15, 'O').spawn(7, 8).goal(0, 0).build()
    const w = new World(compileLevel(lv))
    run(w, 0, 30)
    expect(w.p.y).toBeGreaterThan(10 * TILE - PLAYER_H + 4)
  })

  it('wird in einem Block festgehalten? Nein: bleibt durchlässig, bis der Spieler draußen ist', () => {
    const w = new World(compileLevel(level()))
    w.tick = BLINK_PERIOD - 3 // X ist gleich nicht mehr fest, O wird fest
    w.p.y = 10 * TILE - 2
    w.p.x = 3 * TILE
    run(w, 0, 3)
    expect(Number.isFinite(w.p.y)).toBe(true)
    run(w, 0, 20)
    expect(w.p.y).toBeGreaterThan(10 * TILE)
  })

  it('blockiert keine Laserstrahlen', () => {
    const lv = new LevelBuilder('short')
      .plat(5, 5, 5, 'X')
      .laser(5, 2, 'd')
      .spawn(1, 1)
      .goal(0, 0)
      .build()
    const c = compileLevel(lv)
    expect(c.solid[5 * 16 + 5]).toBe(0)
    expect(c.lasers[0].beam!.h).toBeGreaterThan(5 * TILE)
  })

  it('ist rein vom Tick abhängig (clone läuft identisch)', () => {
    const a = new World(compileLevel(level()))
    run(a, 1, 40)
    const b = a.clone()
    run(a, -1, 200)
    run(b, -1, 200)
    expect(b.p).toEqual(a.p)
  })
})

describe('Bewegliche Plattform', () => {
  const base = (axis: 'h' | 'v', opts = {}) =>
    new LevelBuilder('short').mover(4, 20, axis, 6, { w: 3, period: 120, ...opts }).spawn(5, 18).goal(0, 0).build()

  it('trägt den Spieler mit (horizontal)', () => {
    const w = new World(compileLevel(base('h')))
    run(w, 0, 20)
    const idx = w.riding
    expect(idx).toBe(0)
    const x0 = w.p.x
    run(w, 0, 30)
    expect(w.riding).toBe(0)
    expect(w.p.x).toBeGreaterThan(x0 + 5)
    const pos = w.moverPos(0, w.tick)
    expect(w.p.y + PLAYER_H).toBeCloseTo(pos.y, 0)
  })

  it('trägt den Spieler nach oben und unten (vertikal)', () => {
    const w = new World(compileLevel(base('v')))
    run(w, 0, 30)
    expect(w.riding).toBe(0)
    let moved = 0
    let last = w.p.y
    for (let i = 0; i < 100; i++) {
      w.step(0)
      expect(w.riding).toBe(0)
      moved += Math.abs(w.p.y - last)
      last = w.p.y
    }
    expect(moved).toBeGreaterThan(40)
  })

  it('ist von unten durchlässig', () => {
    const lv = new LevelBuilder('short').mover(4, 20, 'h', 2, { w: 3 }).spawn(6, 22).goal(0, 0).build()
    const w = new World(compileLevel(lv))
    w.p.vy = -420
    let minY = w.p.y
    for (let i = 0; i < 40; i++) {
      w.step(0)
      minY = Math.min(minY, w.p.y)
    }
    // durchgesprungen (Oberkante der Figur war unter der Platte, jetzt darüber) und von oben gelandet
    expect(minY).toBeLessThan(20 * TILE - PLAYER_H)
    run(w, 0, 40)
    expect(w.riding).toBe(0)
  })

  it('hebt einen Spieler an, der auf einem Block steht, wenn die Plattform von unten hochfährt', () => {
    const lv = new LevelBuilder('short')
      .plat(20, 4, 6)
      .mover(4, 16, 'v', 6, { w: 3, period: 240, phase: 0.5 })
      .spawn(5, 18)
      .goal(0, 0)
      .build()
    const w = new World(compileLevel(lv))
    run(w, 0, 20)
    expect(w.riding).toBe(-1)
    const y0 = w.p.y
    let rode = false
    let minY = y0
    for (let i = 0; i < 200; i++) {
      w.step(0)
      if (w.riding === 0) rode = true
      minY = Math.min(minY, w.p.y)
    }
    expect(rode).toBe(true)
    expect(minY).toBeLessThan(y0 - 8)
  })

  it('Aufzug in einen Schacht: Überstand am Plattenrand schiebt die Kante auf die Platte, kein Durchfallen', () => {
    // Schacht (Spalten 11-12) mit Wänden in Zeile 4..13; darunter offener Gang. Die Platte ist so breit wie der Schacht.
    const b = new LevelBuilder('short').plat(16, 0, 15)
    for (let r = 4; r <= 13; r++) b.plat(r, 9, 10).plat(r, 13, 14)
    b.mover(11, 4, 'v', 12, { w: 2, period: 120 }).spawn(1, 14).goal(0, 0)
    const lv = compileLevel(b.build())
    for (const overhang of [1, 3, 6, 9]) {
      const w = new World(lv)
      w.tick = 60 // Platte steht unten (Zeile 16) und fährt gleich hoch
      const a = w.moverPos(0, w.tick)
      w.p.x = a.x - overhang // ragt links in den offenen Gang, unter der Schachtwand
      w.p.y = a.y - PLAYER_H
      for (let i = 0; i < 59; i++) {
        w.step(0)
        expect(w.p.dead).toBe(false)
        expect(w.riding, `Überstand ${overhang}px, Tick ${w.tick}`).toBe(0)
      }
      const top = w.moverPos(0, w.tick)
      expect(w.p.y + PLAYER_H).toBeCloseTo(top.y, 0)
      expect(w.p.x).toBeGreaterThanOrEqual(11 * TILE) // in den Schacht geschoben
    }
  })

  it('echtes Einquetschen (ganze Figur unter Fels) bleibt unverändert: keine Verschiebung', () => {
    const b = new LevelBuilder('short').plat(16, 0, 15).plat(8, 0, 15)
    b.mover(5, 8, 'v', 8, { w: 4, period: 120 }).spawn(1, 14).goal(0, 0)
    const w = new World(compileLevel(b.build()))
    w.tick = 60
    const a = w.moverPos(0, w.tick)
    w.p.x = a.x + 20
    w.p.y = a.y - PLAYER_H
    const x0 = w.p.x
    run(w, 0, 59)
    expect(w.p.x).toBe(x0)
  })

  it('wirkt nicht als Boden unter Eis-/Bandfläche', () => {
    const w = new World(compileLevel(base('h')))
    run(w, 0, 20)
    expect(w.surface).toBe(0)
  })

  it('Validierung und Editor kürzen die Bahn', () => {
    const lv = base('h')
    expect(validateLevel(lv)).toEqual([])
    const bad = base('h')
    bad.entities.push({ t: 'mover', x: 14, y: 5, axis: 'h', len: 3, w: 3, period: 120, phase: 0 })
    expect(validateLevel(bad).join()).toContain('outside')

    const doc = EditorDoc.createStarter('short')
    expect(doc.place({ t: 'mover', x: 12, y: 20, axis: 'h', len: 8, w: 2, period: 180, phase: 0 })).toBe(true)
    const m = doc.entityList.find((e) => e.t === 'mover')!
    expect(m.t === 'mover' && m.len).toBe(2)
  })

  it('Export als TS enthält mover und Blinkblöcke', () => {
    const lv = new LevelBuilder('short').plat(10, 2, 4, 'X').mover(1, 5, 'v', 3, { w: 2 }).spawn(1, 1).goal(2, 2).build()
    const ts = levelToTs(lv)
    expect(ts).toContain("b.mover(1, 5, 'v', 3, { w: 2")
    expect(ts).toContain("'X'")
  })
})