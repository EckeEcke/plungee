import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../netlify/lib/router'
import { K, LIMITS, type Ctx } from '../netlify/lib/levels'
import { pickForWeek, rotation, weekOf } from '../netlify/lib/weekly'
import { LevelBuilder, type LevelData } from '../src/sim'
import { FakeDb } from './helpers/fakeDb'

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

const WED = Date.UTC(2026, 9, 28, 10) // Mittwoch 28.10.2026, Woche ab Montag 26.10.
const WEEK = 7 * 86_400_000

let now = WED
let db: FakeDb
let campaign = POOL
let ip = '1.2.3.4'
const ctx = (): Ctx => ({ db, now: () => now, ip, adminToken: undefined, campaign })

async function call(method: string, path: string, body?: unknown) {
  const res = await handle(
    new Request(`https://plungee.test/api${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ctx(),
  )
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers }
}
const submit = (p: string, replay: string, name?: string) =>
  call('POST', '/weekly/time', { playerId: p, replay, name })

beforeEach(() => {
  now = WED
  campaign = POOL
  ip = '1.2.3.4'
  db = new FakeDb(() => now)
})

describe('Woche in deutscher Zeit', () => {
  it('beginnt Montag 00:00 deutscher Zeit (Winterzeit)', () => {
    const w = weekOf(WED)
    expect(w.id).toBe('2026-10-26')
    expect(new Date(w.startsAt).toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(new Date(w.endsAt).toISOString()).toBe('2026-11-01T23:00:00.000Z')
    expect(w.index).toBe(0)
  })

  it('Sommerzeit: 2 Stunden Abstand', () => {
    const w = weekOf(Date.UTC(2026, 5, 10, 12))
    expect(w.id).toBe('2026-06-08')
    expect(new Date(w.startsAt).toISOString()).toBe('2026-06-07T22:00:00.000Z')
    expect(new Date(w.endsAt).toISOString()).toBe('2026-06-14T22:00:00.000Z')
  })

  it('Wechsel exakt um Mitternacht, auch in der Woche der Zeitumstellung', () => {
    expect(weekOf(Date.UTC(2026, 9, 25, 22, 59, 59)).id).toBe('2026-10-19')
    expect(weekOf(Date.UTC(2026, 9, 25, 23, 0, 0)).id).toBe('2026-10-26')
    const dst = weekOf(Date.UTC(2026, 9, 21, 12))
    expect(new Date(dst.startsAt).toISOString()).toBe('2026-10-18T22:00:00.000Z') // noch Sommerzeit
    expect(new Date(dst.endsAt).toISOString()).toBe('2026-10-25T23:00:00.000Z') // schon Winterzeit
  })

  it('Sonntag 23:30 gehört noch zur alten Woche', () => {
    expect(weekOf(Date.UTC(2026, 10, 1, 22, 30)).id).toBe('2026-10-26')
    expect(weekOf(Date.UTC(2026, 10, 1, 23, 30)).id).toBe('2026-11-02')
  })
})

describe('Rotation', () => {
  it('Normal 01.., dann Hard 01.., nur nummerierte Level, Easy nie', () => {
    expect(rotation(POOL).map((l) => l.key)).toEqual(['normal/01-eins', 'normal/02-zwei', 'hard/01-eins', 'hard/02-zwei'])
  })

  it('wird numerisch sortiert (2 vor 10) und springt nach dem letzten Hard-Level auf Normal 01', () => {
    const many = [1, 2, 10, 11].map((n) => ({ key: `normal/${String(n).padStart(2, '0')}-x`, title: String(n), data: lv(11) }))
    expect(rotation(many).map((l) => l.title)).toEqual(['1', '2', '10', '11'])
    const keys = [0, 1, 2, 3, 4, 5, 8].map((i) => pickForWeek(POOL, i)!.key)
    expect(keys).toEqual([
      'normal/01-eins',
      'normal/02-zwei',
      'hard/01-eins',
      'hard/02-zwei',
      'normal/01-eins',
      'normal/02-zwei',
      'normal/01-eins',
    ])
  })

  it('ohne Level gibt es keine Challenge', () => {
    expect(pickForWeek([{ key: 'easy/01', title: 'x', data: lv(11) }], 0)).toBeNull()
  })

  it('Wochen vor dem Start rechnen ebenfalls sauber (negativer Index)', () => {
    expect(pickForWeek(POOL, -1)!.key).toBe('hard/02-zwei')
  })
})

describe('GET /weekly', () => {
  it('liefert Level, Titel und Zeitraum der Woche, CDN darf kurz zwischenspeichern', async () => {
    const r = await call('GET', '/weekly')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ week: '2026-10-26', key: 'normal/01-eins', title: 'Normal One' })
    expect(r.body.data.size).toBe('short')
    expect(r.body.endsAt).toBeGreaterThan(r.body.startsAt)
    expect(r.headers.get('netlify-cdn-cache-control')).toMatch(/s-maxage/)
  })

  it('das Level bleibt in der Woche stabil, auch wenn die Kampagne wächst', async () => {
    expect((await call('GET', '/weekly')).body.key).toBe('normal/01-eins')
    campaign = [{ key: 'normal/00-neu', title: 'Neu', data: lv(11) }, ...POOL]
    expect((await call('GET', '/weekly')).body.key).toBe('normal/01-eins')
    now += WEEK
    expect((await call('GET', '/weekly')).body.key).toBe(pickForWeek(campaign, 1)!.key)
  })

  it('Woche für Woche das nächste Level', async () => {
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      seen.push((await call('GET', '/weekly')).body.key)
      now += WEEK
    }
    expect(seen).toEqual(['normal/01-eins', 'normal/02-zwei', 'hard/01-eins', 'hard/02-zwei', 'normal/01-eins'])
  })

  it('ohne Kampagnen-Level: 503', async () => {
    campaign = []
    expect((await call('GET', '/weekly')).status).toBe(503)
  })
})

describe('Zeiten der Woche', () => {
  it('nimmt die Zeit aus dem Replay, behält die bessere und zeigt Rang und Namen', async () => {
    const a = await submit(pid(1), SLOW, 'Anna')
    expect(a.status).toBe(200)
    expect(a.body).toMatchObject({ improved: true, rank: 1, total: 1 })
    const b = await submit(pid(2), FAST, 'Ben')
    expect(b.body).toMatchObject({ improved: true, rank: 1, total: 2 })
    expect(b.body.top.map((t: any) => [t.name, t.you])).toEqual([['Ben', true], ['Anna', false]])
    const worse = await submit(pid(2), SLOW)
    expect(worse.body).toMatchObject({ improved: false, rank: 1 })
    expect(JSON.stringify(a.body)).not.toContain(pid(1))
  })

  it('Betrug: unfertige oder kaputte Replays werden abgelehnt', async () => {
    for (const replay of ['N5', 'quatsch', '', 'N999999']) {
      expect((await submit(pid(1), replay)).status, replay).toBe(400)
    }
    expect((await call('POST', '/weekly/time', { replay: FAST })).status).toBe(400)
    expect((await call('POST', '/weekly/time', { playerId: 'zu-kurz', replay: FAST })).status).toBe(400)
  })

  it('Replays gibt es nur für die Top 5, nur 5 Plätze werden angezeigt', async () => {
    for (let n = 1; n <= 6; n++) await submit(pid(n), SLOW)
    const week = weekOf(now).id
    const have = [1, 2, 3, 4, 5, 6].filter((n) => db.has(K.weekReplay(week, pid(n))))
    expect(have).toHaveLength(LIMITS.topTimes)
    const r = await submit(pid(7), FAST)
    expect(r.body.top).toHaveLength(5)
    expect(r.body).toMatchObject({ rank: 1, total: 7 })
    const have2 = [1, 2, 3, 4, 5, 6, 7].filter((n) => db.has(K.weekReplay(week, pid(n))))
    expect(have2).toHaveLength(5)
    expect(db.has(K.weekReplay(week, pid(7)))).toBe(true)
  })

  it('jede Woche hat eine eigene Liste und kennt das eigene Level', async () => {
    await submit(pid(1), FAST)
    now += WEEK // nächste Woche: Normal 02 mit anderem Ziel, FAST läuft auch dort
    const r = await submit(pid(1), SLOW)
    expect(r.body).toMatchObject({ improved: true, rank: 1, total: 1 })
  })

  it('Rate-Limit', async () => {
    for (let i = 0; i < LIMITS.timesPerHour; i++) await submit(pid(1), 'N1')
    expect((await submit(pid(1), FAST)).status).toBe(429)
  })

  it('Befehlsbudget: Zeit senden höchstens 13, Rangliste höchstens 9', async () => {
    await call('GET', '/weekly')
    let before = db.commands
    await submit(pid(1), FAST, 'Anna')
    expect(db.commands - before).toBeLessThanOrEqual(13)
    before = db.commands
    await call('GET', `/weekly/board?player=${pid(1)}`)
    expect(db.commands - before).toBeLessThanOrEqual(9)
  })
})

describe('Rangliste und Vorwoche', () => {
  it('zeigt die Top 5 der Woche, den eigenen Rang und die Vorwoche mit Titel', async () => {
    await submit(pid(1), FAST, 'Anna')
    await submit(pid(2), SLOW, 'Ben')
    now += WEEK
    await submit(pid(3), FAST, 'Cora')
    const r = await call('GET', `/weekly/board?player=${pid(2)}`)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ week: '2026-11-02', total: 1, rank: null })
    expect(r.body.top.map((t: any) => t.name)).toEqual(['Cora'])
    expect(r.body.lastWeek).toMatchObject({ week: '2026-10-26', title: 'Normal One', total: 2, rank: 2 })
    expect(r.body.lastWeek.top.map((t: any) => [t.name, t.you])).toEqual([['Anna', false], ['Ben', true]])
  })

  it('ohne Zeiten in der Vorwoche gibt es keinen Vorwochen-Block', async () => {
    const r = await call('GET', '/weekly/board')
    expect(r.body.lastWeek).toBeNull()
    expect(r.body).toMatchObject({ total: 0, rank: null, top: [] })
  })

  it('Wochen laufen nach 6 Wochen aus der Datenbank', async () => {
    await submit(pid(1), FAST)
    const old = weekOf(now).id
    now += 7 * WEEK
    expect(db.has(K.weekTimes(old))).toBe(false)
  })

  it('falsche Methoden und Pfade', async () => {
    expect((await call('POST', '/weekly')).status).toBe(405)
    expect((await call('GET', '/weekly/time')).status).toBe(405)
  })
})
