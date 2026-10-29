import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../netlify/lib/router'
import { K, LIMITS, type Ctx } from '../netlify/lib/levels'
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

async function approved(): Promise<string> {
  const up = await call('POST', '/upload', { data: lv(12), title: 'Nice Level', author: 'Alice', playerId: pid(1), replay: FAST })
  const id = up.body.id as string
  await call('POST', '/admin/review', { id, action: 'approve' }, admin)
  return id
}

beforeEach(() => {
  now = 1_700_000_000_000
  ip = '1.2.3.4'
  db = new FakeDb(() => now)
})

describe('GET /ghosts', () => {
  it('liefert die Replays der Top 5 mit Rang, Name und Zeit, ohne Spieler-IDs', async () => {
    const id = await approved()
    await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Cara' })
    await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    const r = await call('GET', `/ghosts?id=${id}&player=${pid(2)}`)
    expect(r.status).toBe(200)
    expect(r.body.entries.map((e: any) => [e.rank, e.name, e.replay, e.you])).toEqual([
      [1, 'Cara', FAST, false],
      [2, 'Bob', SLOW, true],
    ])
    expect(r.body.entries[1].ticks).toBeGreaterThan(r.body.entries[0].ticks)
    expect(JSON.stringify(r.body)).not.toContain(pid(1))
    expect(JSON.stringify(r.body)).not.toContain(pid(2))
  })

  it('höchstens fünf Einträge', async () => {
    const id = await approved()
    for (let i = 2; i <= 8; i++) {
      ip = `9.9.9.${i}`
      await call('POST', '/time', { id, playerId: pid(i), replay: SLOW, name: `P${i}` })
    }
    const r = await call('GET', `/ghosts?id=${id}`)
    expect(r.body.entries.length).toBeLessThanOrEqual(LIMITS.topTimes)
    expect(r.body.entries.every((e: any) => e.you === false)).toBe(true)
  })

  it('Einträge ohne Replay fehlen, etwa nach einem Admin-Löschen nachgerückte', async () => {
    const id = await approved()
    await call('POST', '/time', { id, playerId: pid(3), replay: FAST, name: 'Cara' })
    await call('POST', '/time', { id, playerId: pid(2), replay: SLOW, name: 'Bob' })
    await db.del(K.replay(id, pid(2)))
    const r = await call('GET', `/ghosts?id=${id}`)
    expect(r.body.entries.map((e: any) => e.name)).toEqual(['Cara'])
  })

  it('nur freigegebene Level; ungültige IDs', async () => {
    const up = await call('POST', '/upload', { data: lv(13), title: 'Waiting', author: 'Alice', playerId: pid(1), replay: FAST })
    expect((await call('GET', `/ghosts?id=${up.body.id}`)).status).toBe(404)
    expect((await call('GET', '/ghosts?id=quatsch')).status).toBe(400)
    expect((await call('GET', '/ghosts')).status).toBe(400)
  })

  it('braucht wenige Befehle', async () => {
    const id = await approved()
    const before = db.commands
    await call('GET', `/ghosts?id=${id}`)
    expect(db.commands - before).toBeLessThanOrEqual(3)
  })
})