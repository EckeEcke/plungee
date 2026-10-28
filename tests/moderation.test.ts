import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../netlify/lib/router'
import { K, type Ctx } from '../netlify/lib/levels'
import { weekOf } from '../netlify/lib/weekly'
import { LevelBuilder, type LevelData } from '../src/sim'
import { FakeDb } from './helpers/fakeDb'

const ADMIN = 'geheim-geheim-geheim'
const FAST = 'N30R100'
const SLOW = 'N30R20N60R100'
const pid = (n: number) => `p${n}`.padEnd(16, 'x')
const lv = (goalCol: number): LevelData => new LevelBuilder('short').plat(5, 0, 15).spawn(7, 2).goal(goalCol, 4).build()
const POOL = [{ key: 'normal/01-eins', title: 'Normal One', data: lv(11) }]

const WED = Date.UTC(2026, 9, 28, 10)
let now = WED
let db: FakeDb
let ip = '1.2.3.4'
const ctx = (): Ctx => ({ db, now: () => now, ip, adminToken: ADMIN, campaign: POOL, blockedWords: ['blubber'] })

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
const admin = { 'x-admin-token': ADMIN }

async function approvedLevel(goal = 12, title = 'Nice Level'): Promise<string> {
  const up = await call('POST', '/upload', { data: lv(goal), title, author: 'Alice', playerId: pid(1), replay: FAST })
  expect(up.status).toBe(201)
  const id = up.body.id as string
  await call('POST', '/admin/review', { id, action: 'approve' }, admin)
  return id
}

beforeEach(() => {
  now = WED
  ip = '1.2.3.4'
  db = new FakeDb(() => now)
})

describe('Namensfilter auf dem Server', () => {
  it('lehnt gesperrte Titel und Autoren beim Upload ab', async () => {
    const bad = (over: Record<string, unknown>) =>
      call('POST', '/upload', { data: lv(12), title: 'Nice Level', author: 'Alice', playerId: pid(1), replay: FAST, ...over })
    expect((await bad({ title: 'Fuck this' })).status).toBe(400)
    expect((await bad({ author: 'Hitler' })).status).toBe(400)
    expect((await bad({ author: 'Blubberer' })).status).toBe(400) // BLOCKED_WORDS
    ip = '9.9.9.9'
    expect((await bad({})).status).toBe(201)
  })

  it('nimmt die Zeit an, verwirft aber einen gesperrten Namen', async () => {
    const id = await approvedLevel()
    const r = await call('POST', '/time', { id, playerId: pid(2), replay: FAST, name: 'f.u.c.k' })
    expect(r.status).toBe(200)
    expect(r.body.nameRejected).toBe(true)
    expect(r.body.top.some((t: any) => t.name === 'Anonymous')).toBe(true)
    expect(await db.mget([K.name(pid(2))])).toEqual([null])
    const ok = await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Marschall' })
    expect(ok.body.nameRejected).toBeUndefined()
  })

  it('gilt auch in der Weekly Challenge', async () => {
    const r = await call('POST', '/weekly/time', { playerId: pid(4), replay: FAST, name: 'Nazi' })
    expect(r.status).toBe(200)
    expect(r.body.nameRejected).toBe(true)
  })
})

describe('Admin: Level und Zeiten löschen', () => {
  it('verlangt das Token', async () => {
    for (const [m, p] of [
      ['GET', '/admin/levels'],
      ['GET', '/admin/weeks'],
      ['GET', '/admin/times?target=week:2026-10-26'],
      ['POST', '/admin/time/delete'],
      ['POST', '/admin/name/clear'],
    ] as const) {
      expect((await call(m, p, m === 'POST' ? {} : undefined)).status).toBe(401)
    }
  })

  it('listet freigegebene Level und markiert auffällige', async () => {
    await approvedLevel(12, 'Nice Level')
    now += 1000 // gleiche Erstellzeit wäre eine zufällige Reihenfolge
    const old = await approvedLevel(13, 'Old Level')
    // Ein Titel, der erst durch eine später ergänzte Wortliste auffällt
    const meta = JSON.parse((await db.mget([K.meta(old)]))[0]!)
    await db.set(K.meta(old), JSON.stringify({ ...meta, title: 'Blubber Land' }))
    const r = await call('GET', '/admin/levels', undefined, admin)
    expect(r.body.total).toBe(2)
    expect(r.body.levels.map((l: any) => [l.title, l.flagged])).toEqual([
      ['Blubber Land', true],
      ['Nice Level', false],
    ])
  })

  it('löscht ein freigegebenes Level samt Zeiten', async () => {
    const id = await approvedLevel()
    expect((await call('POST', '/admin/review', { id, action: 'delete' }, admin)).status).toBe(200)
    expect((await call('GET', '/admin/levels', undefined, admin)).body.levels).toEqual([])
    expect((await call('GET', `/times?id=${id}`)).status).toBe(404)
  })

  it('zeigt Zeiten mit Spieler-ID und löscht einzelne Einträge samt Replay', async () => {
    const id = await approvedLevel()
    await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    const t = `level:${id}`
    const list = await call('GET', `/admin/times?target=${t}`, undefined, admin)
    expect(list.body.total).toBe(2)
    expect(list.body.entries.map((e: any) => [e.name, e.playerId])).toEqual([
      ['Alice', pid(1)],
      ['Bob', pid(2)],
    ])
    // Öffentlich bleibt die ID geheim
    expect(JSON.stringify((await call('GET', `/times?id=${id}`)).body)).not.toContain(pid(2))

    const del = await call('POST', '/admin/time/delete', { target: t, playerId: pid(2), clearName: true }, admin)
    expect(del.status).toBe(200)
    expect((await call('GET', `/admin/times?target=${t}`, undefined, admin)).body.total).toBe(1)
    expect(await db.mget([K.replay(id, pid(2)), K.name(pid(2))])).toEqual([null, null])
    expect((await call('POST', '/admin/time/delete', { target: t, playerId: pid(2) }, admin)).status).toBe(404)
  })

  it('setzt nur den Namen zurück, die Zeit bleibt', async () => {
    const id = await approvedLevel()
    await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    expect((await call('POST', '/admin/name/clear', { playerId: pid(2) }, admin)).status).toBe(200)
    const list = await call('GET', `/admin/times?target=level:${id}`, undefined, admin)
    expect(list.body.entries.map((e: any) => e.name)).toEqual(['Alice', 'Anonymous'])
  })

  it('moderiert auch die Weekly-Bestenliste', async () => {
    await call('POST', '/weekly/time', { playerId: pid(5), replay: FAST, name: 'Eve' })
    const wk = (await call('GET', '/admin/weeks', undefined, admin)).body.weeks as string[]
    expect(wk[0]).toBe(weekOf(WED).id)
    const t = `week:${wk[0]}`
    expect((await call('GET', `/admin/times?target=${t}`, undefined, admin)).body.entries).toHaveLength(1)
    await call('POST', '/admin/time/delete', { target: t, playerId: pid(5) }, admin)
    expect((await call('GET', `/admin/times?target=${t}`, undefined, admin)).body.total).toBe(0)
  })

  it('weist ungültige Ziele und Spieler-IDs ab', async () => {
    expect((await call('GET', '/admin/times?target=quatsch', undefined, admin)).status).toBe(400)
    expect((await call('POST', '/admin/time/delete', { target: 'week:2026-10-26', playerId: 'x' }, admin)).status).toBe(400)
  })
})
