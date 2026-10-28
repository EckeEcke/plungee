import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../netlify/lib/router'
import { K, type Ctx } from '../netlify/lib/levels'
import { LevelBuilder, type LevelData } from '../src/sim'
import { FakeDb } from './helpers/fakeDb'

const ADMIN = 'geheim-geheim-geheim'
const FAST = 'N30R100'
const SLOW = 'N30R20N60R100'
const pid = (n: number) => `p${n}`.padEnd(16, 'x')
const lv = (goalCol: number): LevelData => new LevelBuilder('short').plat(5, 0, 15).spawn(7, 2).goal(goalCol, 4).build()

let now = 1_700_000_000_000
let db: FakeDb
let ip = '1.2.3.4'
const ctx = (): Ctx => ({ db, now: () => now, ip, adminToken: ADMIN })

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

async function approved(goal = 12): Promise<string> {
  const up = await call('POST', '/upload', { data: lv(goal), title: 'Nice Level', author: 'Alice', playerId: pid(1), replay: FAST })
  expect(up.status).toBe(201)
  const id = up.body.id as string
  await call('POST', '/admin/review', { id, action: 'approve' }, admin)
  return id
}
const listed = async (id: string) => (await call('GET', '/levels')).body.levels.find((l: any) => l.id === id)

beforeEach(() => {
  now = 1_700_000_000_000
  ip = '1.2.3.4'
  db = new FakeDb(() => now)
})

describe('First Clear', () => {
  it('neues Level hat noch keinen First Clear, auch nicht durch den Beweis-Replay des Erstellers', async () => {
    const id = await approved()
    expect((await listed(id)).firstClear).toBeNull()
    // Der Ersteller spielt sein eigenes Level
    await call('POST', '/time', { id, playerId: pid(1), replay: FAST, name: 'Alice' })
    expect((await listed(id)).firstClear).toBeNull()
  })

  it('der erste andere Spieler wird festgehalten, spätere nicht', async () => {
    const id = await approved()
    now += 5000
    await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Cleo' })
    const fc = (await listed(id)).firstClear
    expect(fc).toEqual({ name: 'Bob', at: 1_700_000_005_000 })
    // Auch eine bessere Zeit von Bob später ändert nichts
    await call('POST', '/time', { id, playerId: pid(2), replay: FAST, name: 'Bobby' })
    expect((await listed(id)).firstClear.name).toBe('Bob')
  })

  it('die Antwort meldet dem Spieler, ob er der Erste war', async () => {
    const id = await approved()
    const own = await call('POST', '/time', { id, playerId: pid(1), replay: FAST })
    expect(own.body.firstClear).toBeUndefined()
    const bob = await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    expect(bob.body.firstClear).toBe(true)
    const cleo = await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Cleo' })
    expect(cleo.body.firstClear).toBeUndefined()
    // Bob verbessert sich später: kein zweites Mal
    expect((await call('POST', '/time', { id, playerId: pid(2), replay: FAST })).body.firstClear).toBeUndefined()
  })

  it('ohne Namen steht der gespeicherte Name oder Anonymous', async () => {
    const a = await approved(12)
    await call('POST', '/time', { id: a, playerId: pid(2), replay: FAST })
    expect((await listed(a)).firstClear.name).toBe('Anonymous')
    await db.set(K.name(pid(3)), 'Cleo')
    const b = await approved(13)
    await call('POST', '/time', { id: b, playerId: pid(3), replay: FAST })
    expect((await listed(b)).firstClear.name).toBe('Cleo')
  })

  it('ein ungültiges Replay oder ein gesperrter Name machen niemanden zum First Clear', async () => {
    const id = await approved()
    expect((await call('POST', '/time', { id, playerId: pid(2), replay: 'R1' })).status).toBe(400)
    expect((await listed(id)).firstClear).toBeNull()
    await call('POST', '/time', { id, playerId: pid(2), replay: FAST, name: 'f.u.c.k' })
    expect((await listed(id)).firstClear.name).toBe('Anonymous')
  })

  it('/start liefert den First Clear mit', async () => {
    const id = await approved()
    await call('POST', '/time', { id, playerId: pid(2), replay: FAST, name: 'Bob' })
    expect((await call('POST', '/start', { id })).body.meta.firstClear.name).toBe('Bob')
  })

  it('Level aus der Zeit vor der Funktion: nur zählt, wer als Zweiter dazukommt', async () => {
    const id = await approved()
    const meta = JSON.parse((await db.mget([K.meta(id)]))[0]!)
    delete meta.creator
    await db.set(K.meta(id), JSON.stringify(meta))
    // Der Ersteller (einziger Eintrag) ist kein First Clear
    await call('POST', '/time', { id, playerId: pid(1), replay: FAST })
    expect((await listed(id)).firstClear).toBeNull()
    await call('POST', '/time', { id, playerId: pid(2), replay: FAST, name: 'Bob' })
    expect((await listed(id)).firstClear.name).toBe('Bob')
    // Bei einem alten Level mit mehreren Einträgen und ohne Markierung gibt es keine nachträgliche
    const old = await approved(13)
    const m2 = JSON.parse((await db.mget([K.meta(old)]))[0]!)
    delete m2.creator
    await db.set(K.meta(old), JSON.stringify(m2))
    await db.zadd(K.times(old), 999, pid(9))
    await call('POST', '/time', { id: old, playerId: pid(2), replay: FAST, name: 'Bob' })
    expect((await listed(old)).firstClear).toBeNull()
  })

  it('Admin: sieht ihn, entfernt ihn, und beim Löschen des Levels verschwindet er', async () => {
    const id = await approved()
    await call('POST', '/time', { id, playerId: pid(2), replay: FAST, name: 'Bob' })
    expect((await call('GET', '/admin/levels', undefined, admin)).body.levels[0].firstClear.name).toBe('Bob')
    expect((await call('POST', '/admin/firstclear/clear', { id })).status).toBe(401)
    expect((await call('POST', '/admin/firstclear/clear', { id: 'x' }, admin)).status).toBe(400)
    expect((await call('POST', '/admin/firstclear/clear', { id }, admin)).status).toBe(200)
    expect((await listed(id)).firstClear).toBeNull()
    await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Cleo' })
    expect((await listed(id)).firstClear.name).toBe('Cleo')
    await call('POST', '/admin/review', { id, action: 'delete' }, admin)
    expect(await db.mget([K.firstClear(id)])).toEqual([null])
  })
})