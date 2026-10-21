import { describe, expect, it } from 'vitest'
import {
  GRAVITY,
  HAMMER_HIT_COOLDOWN,
  HAMMER_STUN_TICKS,
  LEVEL_COLS,
  LEVEL_ROWS,
  LevelBuilder,
  MOVE_SPEED,
  PLAYER_H,
  RESPAWN_TICKS,
  SPRING_POWER,
  TERMINAL_VY,
  TILE,
  World,
  compileLevel,
  cosTurns,
  decodeInputs,
  encodeInputs,
  formatTicks,
  hammerState,
  laserPhase,
  simulate,
  sinTurns,
  validateLevel,
  type InputDir,
  type LevelData,
  type SimEvent,
} from '../src/sim'
import { createDemoLevel } from './helpers/fixtures'
import { solve } from './helpers/solver'

/** Basis-Level: Boden in Zeile 10, Start steht darauf, Ziel weit oben links. */
function base(): LevelBuilder {
  return new LevelBuilder('short').plat(10, 0, 15).spawn(7, 9).goal(0, 0)
}

function world(data: LevelData): { w: World; events: SimEvent[] } {
  const w = new World(compileLevel(data))
  const events: SimEvent[] = []
  w.onEvent = (e) => events.push(e)
  return { w, events }
}

function run(w: World, input: InputDir, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step(input)
}

/** Läuft, bis der Spieler stirbt (oder max Ticks erreicht sind). Gibt die Anzahl Ticks zurück. */
function runUntilDead(w: World, input: InputDir, max = 600): number {
  let n = 0
  while (!w.p.dead && n < max) {
    w.step(input)
    n++
  }
  return n
}

/** Spieler fällt von oben auf eine Feder in Zelle (7, 9). */
function springLevel(power: 1 | 2): LevelData {
  return new LevelBuilder('short').plat(10, 0, 15).spawn(7, 5).goal(0, 0).spring(7, 9, power).build()
}

describe('deterministische Trigonometrie', () => {
  it('weicht kaum von Math.sin ab', () => {
    let maxErr = 0
    for (let i = 0; i <= 2000; i++) {
      const u = i / 500 - 2
      maxErr = Math.max(maxErr, Math.abs(sinTurns(u) - Math.sin(u * 2 * Math.PI)))
      maxErr = Math.max(maxErr, Math.abs(cosTurns(u) - Math.cos(u * 2 * Math.PI)))
    }
    expect(maxErr).toBeLessThan(1e-5)
  })

  it('liefert Eckwerte exakt genug', () => {
    expect(sinTurns(0)).toBeCloseTo(0, 12)
    expect(sinTurns(0.25)).toBeCloseTo(1, 6)
    expect(sinTurns(0.5)).toBeCloseTo(0, 6)
    expect(sinTurns(0.75)).toBeCloseTo(-1, 6)
  })
})

describe('Level-Validierung', () => {
  it('akzeptiert das Demo-Level', () => {
    expect(validateLevel(createDemoLevel())).toEqual([])
  })

  it('kennt drei Größen mit passender Zeilenzahl', () => {
    for (const size of ['short', 'medium', 'long'] as const) {
      const b = new LevelBuilder(size)
      const rows = LEVEL_ROWS[size]
      b.plat(rows - 1, 0, 15).spawn(7, 1).goal(7, rows - 2)
      const data = b.build()
      expect(data.tiles).toHaveLength(rows)
      expect(validateLevel(data)).toEqual([])
    }
  })

  it('verlangt genau einen Start und ein Ziel', () => {
    const noGoal = new LevelBuilder('short').spawn(1, 1).build()
    expect(validateLevel(noGoal).join()).toMatch(/goal/)
    const noSpawn = new LevelBuilder('short').goal(1, 1).build()
    expect(validateLevel(noSpawn).join()).toMatch(/start point/)
    const twoSpawns = new LevelBuilder('short').spawn(1, 1).spawn(2, 2).goal(3, 3).build()
    expect(validateLevel(twoSpawns).join()).toMatch(/start point/)
  })

  it('lehnt falsche Zeilenlängen und Zeichen ab', () => {
    const d = base().build()
    d.tiles[3] = '#'.repeat(LEVEL_COLS - 1)
    expect(validateLevel(d).length).toBeGreaterThan(0)
    const d2 = base().build()
    d2.tiles[3] = 'x'.repeat(LEVEL_COLS)
    expect(validateLevel(d2).length).toBeGreaterThan(0)
  })

  it('lehnt Objekte in Wänden, außerhalb und doppelt belegte Zellen ab', () => {
    expect(validateLevel(base().spikes(3, 10, 'u').build()).join()).toMatch(/inside a wall/)
    expect(validateLevel(base().spring(20, 3).build()).join()).toMatch(/outside/)
    expect(validateLevel(base().spring(3, 3).spikes(3, 3).build()).join()).toMatch(/occupied/)
  })

  it('prüft Laser- und Hammer-Parameter', () => {
    expect(validateLevel(base().laser(3, 3, 'd', { period: 10, on: 5 }).build()).join()).toMatch(/laser/)
    expect(validateLevel(base().hammer(3, 3, { len: 9 }).build()).join()).toMatch(/arm length/)
    expect(validateLevel(base().hammer(3, 3, { amp: 0 }).build()).join()).toMatch(/amplitude/)
  })

  it('compileLevel wirft bei ungültigen Daten', () => {
    expect(() => compileLevel(new LevelBuilder('short').build())).toThrow()
  })
})

describe('Bewegung und Kollision', () => {
  it('Spieler steht auf der Plattform', () => {
    const { w } = world(base().build())
    run(w, 0, 30)
    expect(w.p.onGround).toBe(true)
    expect(w.p.y + PLAYER_H).toBeCloseTo(10 * TILE, 6)
    expect(w.p.vx).toBe(0)
  })

  it('fällt, landet und meldet den Aufprall', () => {
    const d = new LevelBuilder('short').plat(20, 0, 15).spawn(7, 2).goal(0, 0).build()
    const { w, events } = world(d)
    run(w, 0, 120)
    expect(w.p.onGround).toBe(true)
    expect(events.some((e) => e.type === 'land')).toBe(true)
  })

  it('begrenzt die Fallgeschwindigkeit', () => {
    const d = new LevelBuilder('short').spawn(7, 0).goal(0, 0).build()
    const { w } = world(d)
    run(w, 0, 100)
    expect(w.p.vy).toBeLessThanOrEqual(TERMINAL_VY)
    expect(w.p.vy).toBeGreaterThan(0)
  })

  it('läuft mit Maximalgeschwindigkeit und wird von der Wand gestoppt', () => {
    const d = base().wall(12, 8, 9).build()
    const { w } = world(d)
    run(w, 1, 20)
    expect(w.p.vx).toBeCloseTo(MOVE_SPEED, 6)
    run(w, 1, 120)
    expect(w.p.x + 12).toBeCloseTo(12 * TILE, 6)
    expect(w.p.vx).toBe(0)
  })

  it('wird von den Levelrändern gehalten', () => {
    const { w } = world(base().build())
    run(w, -1, 300)
    expect(w.p.x).toBeCloseTo(0, 6)
    run(w, 1, 600)
    expect(w.p.x + 12).toBeCloseTo(LEVEL_COLS * TILE, 6)
  })

  it('läuft von der Kante und fällt', () => {
    const d = new LevelBuilder('short').plat(10, 5, 9).plat(20, 0, 15).spawn(7, 9).goal(0, 0).build()
    const { w } = world(d)
    run(w, 1, 60)
    expect(w.p.y).toBeGreaterThan(10 * TILE)
  })

  it('stößt sich den Kopf an der Decke', () => {
    const d = base().plat(7, 0, 15).build() // Decke direkt über dem Spieler (Zeile 7)
    const { w } = world(d)
    run(w, 0, 5)
    expect(w.p.y).toBeGreaterThanOrEqual(8 * TILE - 1e-6)
  })

  it('Schwerkraft beschleunigt wie erwartet (erster Tick)', () => {
    const d = new LevelBuilder('short').spawn(7, 0).goal(0, 0).build()
    const { w } = world(d)
    w.step(0)
    expect(w.p.vy).toBeCloseTo(GRAVITY / 60, 9)
  })
})

describe('Federn', () => {
  it('katapultiert mit der definierten Kraft', () => {
    const { w, events } = world(springLevel(1))
    for (let i = 0; i < 120 && !events.some((e) => e.type === 'spring'); i++) w.step(0)
    expect(events.some((e) => e.type === 'spring')).toBe(true)
    expect(w.p.vy).toBe(-SPRING_POWER[0])
  })

  it('Flughöhe passt zur Feder-Kraft (normal ca. 5 Tiles)', () => {
    const { w, events } = world(springLevel(1))
    for (let i = 0; i < 120 && !events.some((e) => e.type === 'spring'); i++) w.step(0)
    const startY = w.p.y
    let top = startY
    for (let i = 0; i < 80; i++) {
      w.step(0)
      top = Math.min(top, w.p.y)
    }
    const height = (startY - top) / TILE
    expect(height).toBeGreaterThan(4.5)
    expect(height).toBeLessThan(5.5)
  })

  it('starke Feder fliegt höher als normale', () => {
    function apex(power: 1 | 2): number {
      const { w } = world(springLevel(power))
      let top = Infinity
      for (let i = 0; i < 200; i++) {
        w.step(0)
        top = Math.min(top, w.p.y)
      }
      return top
    }
    expect(apex(2)).toBeLessThan(apex(1) - 30)
  })

  it('löst nicht erneut aus, solange der Spieler aufwärts fliegt', () => {
    const { w, events } = world(springLevel(1))
    for (let i = 0; i < 120 && !events.some((e) => e.type === 'spring'); i++) w.step(0)
    run(w, 0, 20)
    expect(events.filter((e) => e.type === 'spring')).toHaveLength(1)
  })
})

describe('Stacheln, Tod und Respawn', () => {
  it('töten und setzen nach kurzer Zeit zurück', () => {
    const d = base().spikes(9, 9, 'u').build()
    const { w, events } = world(d)
    const startX = w.level.spawn.x
    runUntilDead(w, 1) // läuft nach rechts in die Stacheln
    expect(w.deaths).toBe(1)
    expect(events.some((e) => e.type === 'death')).toBe(true)
    run(w, 0, RESPAWN_TICKS + 2)
    expect(events.some((e) => e.type === 'respawn')).toBe(true)
    expect(w.p.dead).toBe(false)
    expect(Math.abs(w.p.x - startX)).toBeLessThan(1)
  })

  it('Checkpoint verschiebt den Respawn', () => {
    const d = base().checkpoint(8, 9).spikes(11, 9, 'u').build()
    const { w } = world(d)
    runUntilDead(w, 1) // über den Checkpoint in die Stacheln
    expect(w.checkpointIndex).toBe(0)
    expect(w.deaths).toBe(1)
    run(w, 0, RESPAWN_TICKS + 2)
    expect(w.p.x).toBeGreaterThan(w.level.spawn.x + 5)
  })

  it('Sturz aus dem Level zählt als Tod', () => {
    const d = new LevelBuilder('short').spawn(7, 2).goal(0, 0).build()
    const { w } = world(d)
    run(w, 0, 400)
    expect(w.deaths).toBeGreaterThanOrEqual(1)
  })
})

describe('Laser', () => {
  it('Takt: on / warn / off', () => {
    const l = { period: 150, on: 54, phase: 0 }
    expect(laserPhase(l, 0)).toBe('on')
    expect(laserPhase(l, 53)).toBe('on')
    expect(laserPhase(l, 54)).toBe('off')
    expect(laserPhase(l, 126)).toBe('warn')
    expect(laserPhase(l, 149)).toBe('warn')
    expect(laserPhase(l, 150)).toBe('on')
  })

  it('tötet nur während der aktiven Phase', () => {
    const d = base().laser(15, 9, 'l', { period: 150, on: 54, phase: 60 }).build()
    const { w } = world(d)
    run(w, 0, 60)
    expect(w.deaths).toBe(0)
    run(w, 0, 40)
    expect(w.deaths).toBe(1)
  })

  it('Strahl endet an soliden Tiles', () => {
    const d = base().wall(10, 8, 9).laser(15, 9, 'l').build()
    const level = compileLevel(d)
    const beam = level.lasers[0].beam!
    expect(beam.x).toBe(11 * TILE)
    expect(beam.w).toBe(4 * TILE)
    // Spieler links der Wand ist sicher
    const { w } = world(base().wall(10, 8, 9).laser(15, 9, 'l', { period: 60, on: 50, phase: 0 }).build())
    run(w, 0, 100)
    expect(w.deaths).toBe(0)
  })
})

describe('Hammer', () => {
  const hammerLevel = () => base().hammer(7, 5, { len: 4, amp: 60, period: 120, phase: 0 }).build()

  it('Pose ist eine reine Funktion der Zeit', () => {
    const level = compileLevel(hammerLevel())
    const h = level.hammers[0]
    const a = hammerState(h, 37)
    const b = hammerState(h, 37)
    expect(a).toEqual(b)
    // Maximale Auslenkung nach einer Viertelperiode
    const peak = hammerState(h, 30)
    expect(peak.angle).toBeCloseTo(h.amp, 4)
    expect(Math.abs(peak.vx)).toBeLessThan(1)
  })

  it('stößt den Spieler weg und betäubt kurz', () => {
    const { w, events } = world(hammerLevel())
    w.step(0)
    expect(events.some((e) => e.type === 'hammer')).toBe(true)
    expect(w.p.stun).toBe(HAMMER_STUN_TICKS)
    expect(Math.abs(w.p.vx)).toBeGreaterThan(200)
  })

  it('trifft pro Schwung nicht mehrfach (Cooldown)', () => {
    const { w, events } = world(hammerLevel())
    run(w, 0, HAMMER_HIT_COOLDOWN - 1)
    expect(events.filter((e) => e.type === 'hammer')).toHaveLength(1)
  })

  it('Eingaben werden während der Betäubung ignoriert', () => {
    const { w } = world(hammerLevel())
    w.step(0)
    const vx = w.p.vx
    w.step(vx > 0 ? -1 : 1)
    expect(Math.sign(w.p.vx)).toBe(Math.sign(vx))
  })
})

describe('Ziel und Zeit', () => {
  it('Berühren des Ziels beendet den Lauf', () => {
    const d = base().build()
    d.entities = d.entities.filter((e) => e.t !== 'goal')
    d.entities.push({ t: 'goal', x: 9, y: 9 })
    const { w, events } = world(d)
    run(w, 1, 120)
    expect(w.finished).toBe(true)
    expect(w.finishTick).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'finish')).toBe(true)
    const t = w.tick
    w.step(1)
    expect(w.tick).toBe(t) // nach dem Ziel keine Simulation mehr
  })

  it('formatiert Zeiten', () => {
    expect(formatTicks(0)).toBe('0.00')
    expect(formatTicks(60)).toBe('1.00')
    expect(formatTicks(324)).toBe('5.40')
    expect(formatTicks(60 * 75 + 30)).toBe('1:15.50')
  })
})

describe('Replays und Determinismus', () => {
  it('Kodierung ist verlustfrei', () => {
    const inputs = new Int8Array([0, 0, 0, 1, 1, -1, -1, -1, -1, 0, 1])
    const enc = encodeInputs(inputs)
    expect(enc).toBe('N3R2L4N1R1')
    expect(Array.from(decodeInputs(enc))).toEqual(Array.from(inputs))
    expect(decodeInputs('')).toHaveLength(0)
  })

  it('lehnt kaputte oder übergroße Replays ab', () => {
    expect(() => decodeInputs('X5')).toThrow()
    expect(() => decodeInputs('N5 R3')).toThrow()
    expect(() => decodeInputs('N999999R999999')).toThrow()
  })

  it('gleiche Eingaben ergeben exakt dasselbe Ergebnis', () => {
    const level = compileLevel(createDemoLevel())
    const inputs = new Int8Array(600)
    for (let i = 0; i < inputs.length; i++) inputs[i] = ((i * 7) % 5) - 2 > 0 ? 1 : ((i * 3) % 4 === 0 ? -1 : 0)
    const a = simulate(level, inputs)
    const b = simulate(level, inputs)
    expect(a).toEqual(b)

    const w1 = new World(level)
    const w2 = new World(level)
    for (const v of inputs) {
      w1.step(v as InputDir)
      w2.step(v as InputDir)
    }
    expect(w1.p).toEqual(w2.p)
    expect(w1.tick).toBe(w2.tick)
  })

  it('clone() ist unabhängig vom Original', () => {
    const level = compileLevel(createDemoLevel())
    const w = new World(level)
    run(w, 1, 20)
    const c = w.clone()
    run(c, -1, 40)
    expect(w.tick).toBe(20)
    expect(c.tick).toBe(60)
    expect(c.p.x).not.toBe(w.p.x)
  })

  it('Demo-Level ist lösbar und die Zeit ist reproduzierbar', () => {
    const level = compileLevel(createDemoLevel())
    const sol = solve(level)
    expect(sol).not.toBeNull()
    const res = simulate(level, sol!.inputs)
    expect(res.finished).toBe(true)
    expect(res.deaths).toBe(0)
    expect(res.ticks).toBe(sol!.ticks)

    // Replay über die Kodierung geschickt: identisches Ergebnis wie auf dem Server
    const again = simulate(level, decodeInputs(encodeInputs(sol!.inputs)))
    expect(again).toEqual(res)
  }, 120000)
})
