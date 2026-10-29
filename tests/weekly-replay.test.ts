import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../netlify/lib/router'
import { beatsBest } from '../netlify/lib/levels'
import { K, type Ctx } from '../netlify/lib/levels'
import { weekOf } from '../netlify/lib/weekly'
import { LevelBuilder, type LevelData } from '../src/sim'
import { FakeDb } from './helpers/fakeDb'

const ADMIN = 'geheim-geheim-geheim'
const FAST = 'N30R100'
const SLOW = 'N30R20N60R100'
const pid = (n: number) => `p${n}`.padEnd(16, 'x')
const lv = (goalCol: number): LevelData => new LevelBuilder('short').plat(5, 0, 15).spawn(7, 2).goal(goalCol, 4).build()
const POOL = [
  { key: 'easy/01-leicht', title: 'Easy', data: lv(10) },
  { key: 'hard/02-zwei', title: 'Hard Two', data: lv(13) },
  { key: 'normal/02-zwei', title: 'Normal Two', data: lv(12) },
  { key: 'hard/01-eins', title: 'Hard One', data: lv(14) },
  { key: 'normal/01-eins', title: 'Normal One', data: lv(11) },
  { key: 'normal/ohne-nummer', title: 'Unnumbered', data: lv(9) },
  { key: 'hard/ohne-nummer', title: 'Unnumbered Hard', data: lv(8) },
]

const WED = Date.UTC(2026, 9, 28, 10)
const WEEK = 7 * 86_400_000
let now = WED
let db: FakeDb
let ip = '1.2.3.4'
const ctx = (): Ctx => ({ db, now: () => now, ip, adminToken: ADMIN, campaign: POOL })

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await handle(
    new Request(`https://plungee.test/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ctx(),
  )
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

beforeEach(() => {
  now = WED
  ip = '1.2.3.4'
  db = new FakeDb(() => now)
})

/** Zwei Spieler in der laufenden Woche */
async function playWeek(): Promise<string> {
  const id = weekOf(now).id
  await call('POST', '/weekly/time', { replay: FAST, playerId: pid(1), name: 'Alice' })
  await call('POST', '/weekly/time', { replay: SLOW, playerId: pid(2), name: 'Bob' })
  return id
}

describe('GET /weekly/replays', () => {
  it('zeigt in der laufenden Woche nichts von ihr', async () => {
    await playWeek()
    const r = await call('GET', '/weekly/replays')
    expect(r.status).toBe(200)
    expect(r.body.entries).toEqual([])
    expect(r.body.title).toBeNull()
  })

  it('liefert in der Folgewoche die Top der Vorwoche mit Rang, Name, Zeit und Replay', async () => {
    const id = await playWeek()
    now += WEEK
    const r = await call('GET', `/weekly/replays?player=${pid(2)}`)
    expect(r.body.week).toBe(id)
    expect(typeof r.body.title).toBe('string')
    expect(r.body.data).toBeTruthy()
    expect(r.body.entries.map((e: any) => [e.rank, e.name, e.replay, e.you])).toEqual([
      [1, 'Alice', FAST, false],
      [2, 'Bob', SLOW, true],
    ])
    expect(JSON.stringify(r.body)).not.toContain(pid(1))
  })

  it('zwei Wochen später ist die Vorwoche eine andere (leer)', async () => {
    await playWeek()
    now += 2 * WEEK
    const r = await call('GET', '/weekly/replays')
    expect(r.body.entries).toEqual([])
  })

  it('braucht nur wenige Befehle', async () => {
    await playWeek()
    now += WEEK
    const before = db.commands
    await call('GET', '/weekly/replays')
    expect(db.commands - before).toBeLessThanOrEqual(4)
  })

  it('Einträge ohne Replay fehlen', async () => {
    const id = await playWeek()
    await db.del(K.weekReplay(id, pid(1)))
    now += WEEK
    const r = await call('GET', '/weekly/replays')
    expect(r.body.entries.map((e: any) => e.name)).toEqual(['Bob'])
  })
})

describe('New best', () => {
  it('Weekly: die erste Zeit der Woche ist kein New best, eine schnellere danach schon', async () => {
    const a = await call('POST', '/weekly/time', { replay: SLOW, playerId: pid(1), name: 'Alice' })
    expect(a.body.newBest).toBe(false)
    const b = await call('POST', '/weekly/time', { replay: FAST, playerId: pid(2), name: 'Bob' })
    expect(b.body.newBest).toBe(true)
    const c = await call('POST', '/weekly/time', { replay: SLOW, playerId: pid(3), name: 'Cy' })
    expect(c.body.newBest).toBe(false)
  })

  it('beatsBest', () => {
    const row = (ticks: number) => ({ ticks })
    expect(beatsBest(false, 5, { rank: 1, top: [row(5)] })).toBe(false)
    expect(beatsBest(true, 5, { rank: 2, top: [row(4), row(5)] })).toBe(false)
    expect(beatsBest(true, 5, { rank: 1, top: [row(5), row(6)] })).toBe(true)
    expect(beatsBest(true, 5, { rank: 1, top: [row(5), row(5)] })).toBe(false)
    expect(beatsBest(true, 5, { rank: 1, top: [row(5)] })).toBe(true)
    expect(beatsBest(true, 5, { rank: 1, top: [row(5)] }, false)).toBe(false)
  })
})

describe('New best in Community-Leveln', () => {
  const up = async () => {
    const r = await call('POST', '/upload', { data: lv(12), title: 'Nice Level', author: 'Alice', playerId: pid(1), replay: SLOW })
    const id = r.body.id as string
    await call('POST', '/admin/review', { id, action: 'approve' }, { 'x-admin-token': ADMIN })
    return id
  }

  it('Erster Spieler: First clear, aber kein New best', async () => {
    const id = await up()
    const r = await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    expect(r.body.firstClear).toBe(true)
    expect(r.body.newBest).toBe(false)
  })

  it('Schneller als die bisherige Bestzeit eines anderen: New best', async () => {
    const id = await up()
    await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    const r = await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Cy' })
    expect(r.body.newBest).toBe(true)
  })

  it('Der Ersteller kommt weder mit seiner Testzeit noch mit späteren Läufen in die Rangliste', async () => {
    const id = await up()
    expect((await call('GET', `/times?id=${id}&player=${pid(1)}`)).body.total).toBe(0)
    const r = await call('POST', '/time', { id, playerId: pid(1), replay: FAST, name: 'Alice' })
    expect(r.body).toMatchObject({ improved: false, newBest: false, ownLevel: true, total: 0 })
    expect(r.body.firstClear).toBeFalsy()
    expect((await call('GET', `/times?id=${id}`)).body.total).toBe(0)
  })
})