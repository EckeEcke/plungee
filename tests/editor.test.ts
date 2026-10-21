import { describe, expect, it } from 'vitest'
import {
  LEVEL_COLS,
  LEVEL_ROWS,
  MAX_ENTITIES,
  compileLevel,
  compileLevelUnchecked,
  encodeInputs,
  validateLevel,
  type LevelData,
} from '../src/sim'
import { EditorDoc } from '../src/editor/doc'
import {
  defaultBrush,
  hammerPhasePatch,
  hammerPhaseQuarter,
  hammerSpeedIndex,
  laserPhasePatch,
  laserPhaseQuarter,
  laserSpeedIndex,
  laserSpeedPatch,
  makeEntity,
} from '../src/editor/brush'
import { levelHash } from '../src/editor/hash'
import { exportLevel, importLevel, verifyRun } from '../src/editor/share'
import { createDemoLevel } from './helpers/fixtures'
import { solve } from './helpers/solver'

function starter(): EditorDoc {
  return EditorDoc.createStarter('short')
}

describe('EditorDoc: Grundzustand', () => {
  it('Startvorlage ist ein gültiges Level', () => {
    for (const size of ['short', 'medium', 'long'] as const) {
      const doc = EditorDoc.createStarter(size)
      expect(doc.rows).toBe(LEVEL_ROWS[size])
      expect(doc.validate()).toEqual([])
    }
  })

  it('toLevelData / Konstruktor sind verlustfrei', () => {
    const data = createDemoLevel()
    const doc = new EditorDoc(data)
    const back = doc.toLevelData()
    expect(back.tiles).toEqual(data.tiles)
    expect(back.entities).toEqual(data.entities)
    expect(back.size).toBe(data.size)
  })

  it('compileLevelUnchecked verträgt unvollständige Levels', () => {
    const doc = starter()
    const spawn = doc.findEntity('spawn', 7, 3)!
    doc.remove(spawn)
    expect(doc.validate().join()).toMatch(/start point/)
    expect(() => compileLevelUnchecked(doc.toLevelData())).not.toThrow()
    expect(() => compileLevel(doc.toLevelData())).toThrow()
  })
})

describe('EditorDoc: Blöcke', () => {
  it('malt und löscht Wände', () => {
    const doc = starter()
    expect(doc.paintTile(2, 10, true)).toBe(true)
    expect(doc.isSolid(2, 10)).toBe(true)
    expect(doc.paintTile(2, 10, true)).toBe(false)
    expect(doc.paintTile(2, 10, false)).toBe(true)
    expect(doc.isSolid(2, 10)).toBe(false)
  })

  it('ignoriert Zellen außerhalb', () => {
    const doc = starter()
    expect(doc.paintTile(-1, 3, true)).toBe(false)
    expect(doc.paintTile(LEVEL_COLS, 3, true)).toBe(false)
    expect(doc.paintTile(3, doc.rows, true)).toBe(false)
  })

  it('Wand über einem Objekt entfernt das Objekt (außer Hammer und Laser)', () => {
    const doc = starter()
    doc.place({ t: 'spikes', x: 3, y: 10, dir: 'u' })
    doc.place({ t: 'hammer', x: 4, y: 10, len: 3, amp: 60, period: 130, phase: 0 })
    doc.place({ t: 'laser', x: 5, y: 10, dir: 'd', period: 150, on: 54, phase: 0 })
    doc.paintTile(3, 10, true)
    doc.paintTile(4, 10, true)
    doc.paintTile(5, 10, true)
    expect(doc.findEntity('spikes', 3, 10)).toBeNull()
    expect(doc.findEntity('hammer', 4, 10)).not.toBeNull()
    expect(doc.findEntity('laser', 5, 10)).not.toBeNull()
  })

  it('Radieren eines Laser-Emitters entfernt das Objekt', () => {
    const doc = starter()
    doc.place({ t: 'laser', x: 5, y: 10, dir: 'd', period: 150, on: 54, phase: 0 })
    expect(doc.isSolidVisible(5, 10)).toBe(true)
    doc.paintTile(5, 10, false)
    expect(doc.findEntity('laser', 5, 10)).toBeNull()
    expect(doc.isSolidVisible(5, 10)).toBe(false)
  })

  it('eraseCell räumt Wand, Objekte und Hammer-Aufhängung', () => {
    const doc = starter()
    doc.place({ t: 'hammer', x: 6, y: 8, len: 3, amp: 60, period: 130, phase: 0 })
    doc.place({ t: 'spring', x: 6, y: 8, power: 1 })
    expect(doc.eraseCell(6, 8)).toBe(true)
    expect(doc.entityAt(6, 8)).toBeNull()
    expect(doc.eraseCell(6, 8)).toBe(false)
  })
})

describe('EditorDoc: Objekte', () => {
  it('Start und Ziel sind eindeutig und wandern', () => {
    const doc = starter()
    expect(doc.place({ t: 'spawn', x: 2, y: 2 })).toBe(true)
    expect(doc.entityList.filter((e) => e.t === 'spawn')).toHaveLength(1)
    expect(doc.findEntity('spawn', 2, 2)).not.toBeNull()
    expect(doc.findEntity('spawn', 7, 3)).toBeNull()
    doc.place({ t: 'goal', x: 1, y: 20 })
    expect(doc.entityList.filter((e) => e.t === 'goal')).toHaveLength(1)
  })

  it('verbietet Objekte in Wänden, erlaubt aber Laser und Hammer', () => {
    const doc = starter()
    expect(doc.place({ t: 'spring', x: 6, y: 4, power: 1 })).toBe(false) // Zelle (6,4) ist Wand
    expect(doc.place({ t: 'spikes', x: 6, y: 4, dir: 'u' })).toBe(false)
    expect(doc.place({ t: 'checkpoint', x: 6, y: 4 })).toBe(false)
    expect(doc.place({ t: 'laser', x: 6, y: 4, dir: 'd', period: 150, on: 54, phase: 0 })).toBe(true)
    expect(doc.isSolid(6, 4)).toBe(false) // Emitter ersetzt die Wand
    expect(doc.place({ t: 'hammer', x: 7, y: 4, len: 3, amp: 60, period: 130, phase: 0 })).toBe(true)
  })

  it('pro Zelle ein Objekt, neues ersetzt altes; Hammer teilt sich die Zelle', () => {
    const doc = starter()
    doc.place({ t: 'spikes', x: 2, y: 9, dir: 'u' })
    doc.place({ t: 'spring', x: 2, y: 9, power: 2 })
    expect(doc.findEntity('spikes', 2, 9)).toBeNull()
    expect(doc.findEntity('spring', 2, 9)).not.toBeNull()
    doc.place({ t: 'hammer', x: 2, y: 9, len: 3, amp: 60, period: 130, phase: 0 })
    expect(doc.entityList.filter((e) => e.x === 2 && e.y === 9)).toHaveLength(2)
    expect(doc.entityAt(2, 9)!.t).toBe('spring') // normales Objekt hat Vorrang
    doc.place({ t: 'hammer', x: 2, y: 9, len: 4, amp: 80, period: 90, phase: 0.25 })
    expect(doc.entityList.filter((e) => e.t === 'hammer' && e.x === 2 && e.y === 9)).toHaveLength(1)
  })

  it('Ergebnis besteht die Level-Validierung', () => {
    const doc = starter()
    doc.place({ t: 'spring', x: 8, y: 3, power: 1 })
    doc.place({ t: 'spikes', x: 9, y: 3, dir: 'u' })
    doc.place({ t: 'laser', x: 15, y: 12, dir: 'l', period: 150, on: 54, phase: 0 })
    doc.place({ t: 'hammer', x: 8, y: 14, len: 3, amp: 60, period: 130, phase: 0.5 })
    doc.place({ t: 'checkpoint', x: 3, y: 20 })
    expect(doc.validate()).toEqual([])
  })

  it('update ändert Parameter, aber nicht Typ und Position', () => {
    const doc = starter()
    doc.place({ t: 'laser', x: 15, y: 12, dir: 'l', period: 150, on: 54, phase: 0 })
    const key = { t: 'laser' as const, x: 15, y: 12 }
    expect(doc.update(key, { period: 90, on: 36, x: 3, t: 'goal' })).toBe(true)
    const e = doc.findEntity('laser', 15, 12) as Extract<ReturnType<typeof makeEntity>, { t: 'laser' }>
    expect(e.period).toBe(90)
    expect(e.on).toBe(36)
    expect(doc.update(key, { period: 90 })).toBe(false) // keine Änderung
  })

  it('move verschiebt, lehnt Regelverstöße ab und lässt dann alles wie es war', () => {
    const doc = starter()
    doc.place({ t: 'spring', x: 2, y: 9, power: 1 })
    expect(doc.move({ t: 'spring', x: 2, y: 9 }, 4, 9)).toBe(true)
    expect(doc.findEntity('spring', 4, 9)).not.toBeNull()
    expect(doc.findEntity('spring', 2, 9)).toBeNull()
    // Ziel in der Wand (6,4): abgelehnt, Objekt bleibt
    expect(doc.move({ t: 'spring', x: 4, y: 9 }, 6, 4)).toBe(false)
    expect(doc.findEntity('spring', 4, 9)).not.toBeNull()
    expect(doc.move({ t: 'spring', x: 4, y: 9 }, 99, 9)).toBe(false)
  })

  it('begrenzt die Zahl der Objekte', () => {
    const doc = new EditorDoc({
      v: 1,
      size: 'long',
      tiles: Array.from({ length: LEVEL_ROWS.long }, () => '.'.repeat(LEVEL_COLS)),
      entities: [],
    })
    let placed = 0
    for (let r = 0; r < doc.rows && placed < MAX_ENTITIES + 5; r++) {
      for (let c = 0; c < LEVEL_COLS; c++) {
        if (doc.place({ t: 'spikes', x: c, y: r, dir: 'u' })) placed++
      }
    }
    expect(placed).toBe(MAX_ENTITIES)
    expect(doc.entityList.length).toBe(MAX_ENTITIES)
  })
})

describe('EditorDoc: Verlauf', () => {
  it('Undo und Redo für Einzelaktionen', () => {
    const doc = starter()
    const before = doc.toLevelData()
    doc.paintTile(1, 10, true)
    doc.place({ t: 'spring', x: 3, y: 9, power: 1 })
    expect(doc.canUndo).toBe(true)
    expect(doc.undo()).toBe(true)
    expect(doc.findEntity('spring', 3, 9)).toBeNull()
    expect(doc.isSolid(1, 10)).toBe(true)
    expect(doc.undo()).toBe(true)
    expect(doc.toLevelData().tiles).toEqual(before.tiles)
    expect(doc.undo()).toBe(false)
    expect(doc.redo()).toBe(true)
    expect(doc.isSolid(1, 10)).toBe(true)
    expect(doc.redo()).toBe(true)
    expect(doc.findEntity('spring', 3, 9)).not.toBeNull()
    expect(doc.canRedo).toBe(false)
  })

  it('ein Strich ist ein Undo-Schritt', () => {
    const doc = starter()
    doc.beginStroke()
    for (let c = 0; c < 8; c++) doc.paintTile(c, 12, true)
    doc.endStroke()
    expect(doc.isSolid(7, 12)).toBe(true)
    doc.undo()
    for (let c = 0; c < 8; c++) expect(doc.isSolid(c, 12)).toBe(false)
    expect(doc.canUndo).toBe(false)
  })

  it('Aktionen ohne Wirkung erzeugen keinen Undo-Schritt', () => {
    const doc = starter()
    doc.paintTile(6, 4, true) // ist schon Wand
    doc.beginStroke()
    doc.paintTile(6, 4, true)
    doc.endStroke()
    doc.place({ t: 'spring', x: 6, y: 4, power: 1 }) // verboten
    expect(doc.canUndo).toBe(false)
  })

  it('neue Aktion nach Undo verwirft Redo', () => {
    const doc = starter()
    doc.paintTile(1, 10, true)
    doc.undo()
    expect(doc.canRedo).toBe(true)
    doc.paintTile(2, 10, true)
    expect(doc.canRedo).toBe(false)
  })

  it('meldet Änderungen und erhöht die Version', () => {
    const doc = starter()
    let calls = 0
    doc.onChange = () => calls++
    const v = doc.version
    doc.paintTile(1, 10, true)
    expect(calls).toBeGreaterThan(0)
    expect(doc.version).toBeGreaterThan(v)
    const v2 = doc.version
    doc.undo()
    expect(doc.version).toBeGreaterThan(v2)
  })

  it('Größe ändern ist rückgängig machbar und schneidet unten ab', () => {
    const doc = EditorDoc.createStarter('medium')
    expect(doc.wouldLoseContent('short')).toBe(true) // Boden und Ziel liegen weit unten
    expect(doc.wouldLoseContent('long')).toBe(false)
    expect(doc.resize('short')).toBe(true)
    expect(doc.rows).toBe(LEVEL_ROWS.short)
    expect(doc.findEntity('goal', 8, LEVEL_ROWS.medium - 2)).toBeNull()
    expect(doc.validate().join()).toMatch(/goal/)
    doc.undo()
    expect(doc.rows).toBe(LEVEL_ROWS.medium)
    expect(doc.findEntity('goal', 8, LEVEL_ROWS.medium - 2)).not.toBeNull()
  })

  it('replaceWith setzt den Verlauf zurück', () => {
    const doc = starter()
    doc.paintTile(1, 10, true)
    doc.replaceWith(createDemoLevel())
    expect(doc.canUndo).toBe(false)
    expect(doc.validate()).toEqual([])
  })
})

describe('Pinsel-Hilfen', () => {
  it('makeEntity liefert Objekte pro Werkzeug', () => {
    const b = defaultBrush()
    expect(makeEntity('spring', 3, 4, b)).toMatchObject({ t: 'spring', x: 3, y: 4, power: 1 })
    expect(makeEntity('spikes', 3, 4, b)).toMatchObject({ t: 'spikes', dir: 'u' })
    expect(makeEntity('laser', 3, 4, b)).toMatchObject({ t: 'laser', period: 150 })
    expect(makeEntity('hammer', 3, 4, b)).toMatchObject({ t: 'hammer', len: 3 })
    expect(makeEntity('tile', 3, 4, b)).toBeNull()
    expect(makeEntity('select', 3, 4, b)).toBeNull()
  })

  it('Vorlagen sind unabhängig voneinander', () => {
    const a = defaultBrush()
    const b = defaultBrush()
    a.laser.period = 90
    expect(b.laser.period).toBe(150)
    const e = makeEntity('laser', 1, 1, a)!
    expect(e).not.toBe(a.laser)
  })

  it('Laser-Takt und -Phase lassen sich über Stufen einstellen', () => {
    const e = { period: 150, on: 54, phase: 75 }
    expect(laserSpeedIndex(e)).toBe(1)
    expect(laserPhaseQuarter(e)).toBe(2)
    const patch = laserSpeedPatch(e, 0) // schnell: Phase bleibt bei "zwei Viertel"
    expect(patch).toEqual({ period: 90, on: 36, phase: 45 })
    expect(laserPhasePatch({ period: 240 }, 3)).toEqual({ phase: 180 })
    expect(laserSpeedIndex({ period: 111, on: 5 })).toBe(-1)
  })

  it('Hammer-Takt und -Phase lassen sich über Stufen einstellen', () => {
    expect(hammerSpeedIndex({ period: 90 })).toBe(0)
    expect(hammerSpeedIndex({ period: 91 })).toBe(-1)
    expect(hammerPhaseQuarter({ phase: 0.5 })).toBe(2)
    expect(hammerPhasePatch(3)).toEqual({ phase: 0.75 })
  })
})

describe('Teilen und Prüfen', () => {
  it('Hash ignoriert den Titel, reagiert aber auf jede Änderung', () => {
    const a = createDemoLevel()
    const b = { ...createDemoLevel(), title: 'Anders' }
    expect(levelHash(a)).toBe(levelHash(b))
    const c = createDemoLevel()
    c.entities.push({ t: 'checkpoint', x: 1, y: 1 })
    expect(levelHash(c)).not.toBe(levelHash(a))
    expect(levelHash(a)).toMatch(/^[0-9a-f]{8}$/)
  })

  const level: LevelData = createDemoLevel()
  const sol = solve(compileLevel(level))!
  const proof = { ticks: sol.ticks, replay: encodeInputs(sol.inputs) }

  it('akzeptiert einen echten Lauf', () => {
    expect(verifyRun(level, proof)).toEqual({ ok: true })
  })

  it('lehnt gefälschte oder kaputte Läufe ab', () => {
    expect(verifyRun(level, { ...proof, ticks: proof.ticks - 5 })).toMatchObject({ ok: false })
    expect(verifyRun(level, { ...proof, replay: 'N10' })).toMatchObject({ ok: false })
    expect(verifyRun(level, { ...proof, replay: 'kaputt' })).toMatchObject({ ok: false })
    expect(verifyRun(level, { ticks: 0, replay: '' })).toMatchObject({ ok: false })
    const broken = createDemoLevel()
    broken.entities = broken.entities.filter((e) => e.t !== 'goal')
    expect(verifyRun(broken, proof)).toMatchObject({ ok: false })
  })

  it('ein verändertes Level macht den alten Lauf ungültig', () => {
    const changed = createDemoLevel()
    changed.tiles[3] = '#'.repeat(LEVEL_COLS) // Decke direkt über dem Start
    expect(validateLevel(changed)).toEqual([])
    expect(verifyRun(changed, proof)).toMatchObject({ ok: false })
  })

  it('Export und Import sind verlustfrei', () => {
    const json = exportLevel(level, proof)
    const back = importLevel(json)
    expect(back.level).toEqual(level)
    expect(back.run).toEqual(proof)
  })

  it('Import meldet verständliche Fehler', () => {
    expect(() => importLevel('{kaputt')).toThrow(/JSON/)
    expect(() => importLevel('{"v":2}')).toThrow(/format/)
    expect(() => importLevel(exportLevel(level, { ...proof, ticks: 1 }))).toThrow(/time/)
    expect(() => importLevel('x'.repeat(300_000))).toThrow(/large/)
  })
}, 120000)

import { levelToTs } from '../src/editor/tscode'
import { LevelBuilder } from '../src/sim/builder'
import { createTestLevel as createSpikesLevel } from './helpers/fixtures'
import { createDemoLevel as createDemo2 } from './helpers/fixtures'

describe('TypeScript-Export', () => {
  for (const [name, make] of [['Mind the Spikes', createSpikesLevel], ['Demo', createDemo2]] as const) {
    it(`erzeugt für "${name}" Code, der dasselbe Level baut`, () => {
      const level = make()
      // Die Datei liegt in src/levels/<schwierigkeit>/: Importpfade müssen zwei Ebenen hoch zeigen
      expect(levelToTs(level, 'create')).toContain("from '../../sim/builder'")
      const code = levelToTs(level, 'create')
        .replace(/^import .*$/gm, '')
        .replace('export function', 'function')
        .replace('(): LevelData', '()')
      const fn = new Function('LevelBuilder', `${code}\nreturn create()`)
      const rebuilt = fn(LevelBuilder)
      expect(rebuilt.tiles).toEqual(level.tiles)
      expect(rebuilt.size).toBe(level.size)
      expect(rebuilt.title).toBe(level.title)
      const key = (e: any) => JSON.stringify(e)
      expect(rebuilt.entities.map(key).sort()).toEqual(level.entities.map(key).sort())
    })
  }
})
