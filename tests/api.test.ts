import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../netlify/lib/router'
import { K, LIMITS, type Ctx } from '../netlify/lib/levels'
import { LevelBuilder, compileLevel, decodeInputs, encodeInputs, formatTicks, simulate, type LevelData } from '../src/sim'
import { FakeDb } from './helpers/fakeDb'

const ADMIN = 'geheim-geheim-geheim'
const ALICE = 'alice-alice-alice-alice'
const BOB = 'bob-bob-bob-bob-bob-bob'

/** Spawn oben, Boden in Zeile 5, Ziel rechts davon: laufen = fertig. goalCol unterscheidet Level (und damit ihren Hash). */
function level(goalCol = 12): LevelData {
  return new LevelBuilder('short').plat(5, 0, 15).spawn(7, 2).goal(goalCol, 4).build()
}
const FAST = 'N30R100'
const SLOW = 'N30R20N60R100'

let now = 1_700_000_000_000
let db: FakeDb
let ip = '1.2.3.4'
let adminToken: string | undefined

function ctx(): Ctx {
  return { db, now: () => now, ip, adminToken }
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await handle(
    new Request(`https://plungee.test/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ctx(),
  )
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers }
}

const admin = { 'x-admin-token': ADMIN }
const upload = (over: Record<string, unknown> = {}) =>
  call('POST', '/upload', { data: level(), title: 'Test Level', author: 'Alice', playerId: ALICE, replay: FAST, ...over })

async function approved(over: Record<string, unknown> = {}): Promise<string> {
  const up = await upload(over)
  expect(up.status).toBe(201)
  const id = up.body.id as string
  expect((await call('POST', '/admin/review', { id, action: 'approve' }, admin)).status).toBe(200)
  return id
}

beforeEach(() => {
  now = 1_700_000_000_000
  ip = '1.2.3.4'
  adminToken = ADMIN
  db = new FakeDb(() => now)
})

describe('Testlevel und Replays', () => {
  it('FAST und SLOW beenden das Level, SLOW braucht länger', () => {
    const c = compileLevel(level())
    const fast = simulate(c, decodeInputs(FAST))
    const slow = simulate(c, decodeInputs(SLOW))
    expect(fast.finished && slow.finished).toBe(true)
    expect(slow.ticks).toBeGreaterThan(fast.ticks)
  })
})

describe('Upload', () => {
  it('speichert das Level als wartend: nicht in der Liste, aber in der Admin-Warteschlange', async () => {
    const up = await upload()
    expect(up.status).toBe(201)
    expect(up.body.status).toBe('pending')
    expect(up.body.id).toMatch(/^[A-Za-z0-9]{8}$/)
    expect((await call('GET', '/levels')).body.levels).toEqual([])
    const pending = await call('GET', '/admin/pending', undefined, admin)
    expect(pending.body.levels).toHaveLength(1)
    expect(pending.body.levels[0]).toMatchObject({ title: 'Test Level', author: 'Alice', status: 'pending', simVersion: 1 })
  })

  it('die Zeit des Erstellers kommt nicht in die Rangliste, und er kann dort keine Zeit aufstellen', async () => {
    const id = await approved()
    const t = await call('GET', `/times?id=${id}&player=${ALICE}`)
    expect(t.body.top).toHaveLength(0)
    expect(t.body.rank).toBeNull()
    expect(db.has(K.replay(id, ALICE))).toBe(false)
    const own = await call('POST', '/time', { id, playerId: ALICE, replay: FAST, name: 'Alice' })
    expect(own.status).toBe(200)
    expect(own.body).toMatchObject({ improved: false, ownLevel: true, newBest: false, rank: null, total: 0 })
    expect((await call('GET', `/times?id=${id}`)).body.top).toHaveLength(0)
  })

  it('lehnt ungültige Level, unfertige Replays und schlechte Titel ab', async () => {
    const bad = level()
    bad.tiles[3] = '?' + bad.tiles[3].slice(1)
    let n = 0
    // jede Anfrage von einer anderen IP, sonst greift das Rate-Limit (eigener Test unten)
    const up = (over: Record<string, unknown>) => {
      ip = `10.0.0.${++n}`
      return upload(over)
    }
    expect((await up({ data: bad })).status).toBe(400)
    expect((await up({ replay: 'N10' })).body.error).toMatch(/does not finish/)
    expect((await up({ replay: 'kaputt' })).body.error).toMatch(/Invalid replay/)
    expect((await up({ replay: undefined })).status).toBe(400)
    expect((await up({ title: 'ab' })).status).toBe(400)
    expect((await up({ title: 'x'.repeat(33) })).status).toBe(400)
    expect((await up({ playerId: 'kurz' })).status).toBe(400)
    expect(await db.zcard(K.pending)).toBe(0)
  })

  it('verhindert doppelte Uploads desselben Levels', async () => {
    expect((await upload()).status).toBe(201)
    const again = await upload({ title: 'Anderer Titel' })
    expect(again.status).toBe(409)
  })

  it('Rate-Limit: nach 5 Versuchen pro Stunde und IP ist Schluss, danach geht es wieder', async () => {
    for (let i = 0; i < LIMITS.uploadsPerHour; i++) expect((await upload({ title: 'x' })).status).toBe(400)
    expect((await upload()).status).toBe(429)
    ip = '9.9.9.9'
    expect((await upload()).status).toBe(201)
    ip = '1.2.3.4'
    now += 3600_000 + 1
    expect((await upload({ data: level(11) })).status).toBe(201)
  })

  it('säubert Titel und Autor', async () => {
    const up = await upload({ title: '  <b>Hallo</b>\n   Welt ', author: '<i>Eve</i>' })
    const meta = (await call('GET', '/admin/pending', undefined, admin)).body.levels[0]
    expect(up.status).toBe(201)
    expect(meta.title).toBe('bHallo/b Welt')
    expect(meta.author).toBe('iEve/i')
  })

  it('zu große Anfragen und kaputtes JSON werden abgewiesen', async () => {
    expect((await call('POST', '/upload', 'x'.repeat(200_001))).status).toBe(413)
    expect((await call('POST', '/upload', '{kaputt')).status).toBe(400)
    expect((await call('POST', '/upload', '[]')).status).toBe(400)
  })
})

describe('Admin', () => {
  it('ohne gültiges Token geht nichts', async () => {
    expect((await call('GET', '/admin/pending')).status).toBe(401)
    expect((await call('GET', '/admin/pending', undefined, { 'x-admin-token': 'falsch' })).status).toBe(401)
    adminToken = undefined
    expect((await call('GET', '/admin/pending', undefined, admin)).status).toBe(401)
    adminToken = ''
    expect((await call('GET', '/admin/pending', undefined, { 'x-admin-token': '' })).status).toBe(401)
    expect((await call('POST', '/admin/review', { id: 'AAAAAAAA', action: 'approve' })).status).toBe(401)
  })

  it('Vorschau: Admin kann ein wartendes Level laden, andere nicht', async () => {
    const up = await upload()
    const id = up.body.id as string
    const preview = await call('GET', `/admin/level?id=${id}`, undefined, admin)
    expect(preview.status).toBe(200)
    expect(preview.body.data.title).toBe('Test Level')
    expect(preview.body.data.tiles).toHaveLength(40)
    expect((await call('POST', '/start', { id, playerId: BOB })).status).toBe(404)
    expect((await call('GET', `/times?id=${id}`)).status).toBe(404)
    expect((await call('POST', '/time', { id, playerId: BOB, replay: FAST })).status).toBe(404)
  })

  it('freigeben: erscheint in Neueste und Meistgespielt mit Zähler 0; doppelt freigeben geht nicht', async () => {
    const id = await approved()
    for (const sort of ['new', 'plays']) {
      const list = await call('GET', `/levels?sort=${sort}`)
      expect(list.body.levels).toEqual([
        { id, title: 'Test Level', author: 'Alice', size: 'short', createdAt: now, plays: 0, firstClear: null },
      ])
      expect(list.body.total).toBe(1)
    }
    expect((await call('GET', '/admin/pending', undefined, admin)).body.levels).toEqual([])
    expect((await call('POST', '/admin/review', { id, action: 'approve' }, admin)).status).toBe(409)
  })

  it('ablehnen räumt alles auf und gibt den Upload wieder frei', async () => {
    const up = await upload()
    const id = up.body.id as string
    expect((await call('POST', '/admin/review', { id, action: 'reject' }, admin)).body.status).toBe('deleted')
    for (const key of [K.level(id), K.meta(id), K.times(id), K.replay(id, ALICE)]) expect(db.has(key)).toBe(false)
    expect(await db.zcard(K.pending)).toBe(0)
    expect((await upload()).status).toBe(201)
  })

  it('löschen nimmt ein veröffentlichtes Level samt Zeiten wieder heraus', async () => {
    const id = await approved()
    await call('POST', '/start', { id, playerId: BOB })
    expect((await call('POST', '/admin/review', { id, action: 'delete' }, admin)).status).toBe(200)
    expect((await call('GET', '/levels')).body.levels).toEqual([])
    expect((await call('GET', '/levels?sort=plays')).body.levels).toEqual([])
    expect((await call('POST', '/start', { id, playerId: BOB })).status).toBe(404)
  })

  it('unbekannte Aktion und unbekanntes Level', async () => {
    const id = await approved()
    expect((await call('POST', '/admin/review', { id, action: 'boom' }, admin)).status).toBe(400)
    expect((await call('POST', '/admin/review', { id: 'ZZZZZZZZ', action: 'approve' }, admin)).status).toBe(404)
    expect((await call('POST', '/admin/review', { id: '../x', action: 'approve' }, admin)).status).toBe(400)
  })
})

describe('Spielen und Zähler', () => {
  it('start liefert das Level und zählt einmal pro Spieler und Stunde', async () => {
    const id = await approved()
    const first = await call('POST', '/start', { id, playerId: BOB })
    expect(first.status).toBe(200)
    expect(first.body.data.title).toBe('Test Level')
    expect(first.body.data.tiles).toHaveLength(40)
    const plays = async () => (await call('GET', '/levels')).body.levels[0].plays
    expect(await plays()).toBe(1)
    await call('POST', '/start', { id, playerId: BOB })
    await call('POST', '/start', { id, playerId: BOB })
    expect(await plays()).toBe(1)
    await call('POST', '/start', { id, playerId: ALICE })
    expect(await plays()).toBe(2)
    now += 3600_000 + 1
    await call('POST', '/start', { id, playerId: BOB })
    expect(await plays()).toBe(3)
  })

  it('ohne Spieler-ID wird geladen, aber nicht gezählt', async () => {
    const id = await approved()
    expect((await call('POST', '/start', { id })).status).toBe(200)
    expect((await call('GET', '/levels')).body.levels[0].plays).toBe(0)
  })

  it('Meistgespielt sortiert nach Zähler, Neueste nach Zeit', async () => {
    const a = await approved({ data: level(12), title: 'Erstes' })
    now += 1000
    const b = await approved({ data: level(11), title: 'Zweites' })
    now += 1000
    const c = await approved({ data: level(10), title: 'Drittes' })
    await call('POST', '/start', { id: b, playerId: ALICE })
    await call('POST', '/start', { id: b, playerId: BOB })
    await call('POST', '/start', { id: a, playerId: BOB })
    const byNew = (await call('GET', '/levels?sort=new')).body.levels.map((l: any) => l.id)
    const byPlays = (await call('GET', '/levels?sort=plays')).body.levels.map((l: any) => [l.id, l.plays])
    expect(byNew).toEqual([c, b, a])
    expect(byPlays).toEqual([
      [b, 2],
      [a, 1],
      [c, 0],
    ])
    const page = await call('GET', '/levels?sort=new&limit=1&offset=1')
    expect(page.body.levels.map((l: any) => l.id)).toEqual([b])
    expect(page.body.total).toBe(3)
  })

  it('die Liste darf vom CDN kurz zwischengespeichert werden, vom Browser nicht', async () => {
    const res = await call('GET', '/levels')
    expect(res.headers.get('netlify-cdn-cache-control')).toMatch(/s-maxage=30/)
    expect(res.headers.get('cache-control')).toMatch(/max-age=0/)
    expect((await call('GET', '/times?id=AAAAAAAA')).headers.get('cache-control')).toBe('no-store')
  })
})

describe('Bestzeiten', () => {
  it('trägt die vom Server berechnete Zeit ein, behält nur die bessere und zeigt Rang und Namen', async () => {
    const id = await approved({ replay: SLOW })
    const c = compileLevel(level())
    const fast = simulate(c, decodeInputs(FAST)).ticks
    const slow = simulate(c, decodeInputs(SLOW)).ticks

    const bob = await call('POST', '/time', { id, playerId: BOB, name: 'Bob', replay: SLOW })
    expect(bob.status).toBe(200)
    expect(bob.body).toMatchObject({ ticks: slow, improved: true, rank: 1, total: 1 })
    expect(bob.body.top.map((t: any) => [t.name, t.ticks, t.you])).toEqual([['Bob', slow, true]])

    const better = await call('POST', '/time', { id, playerId: BOB, replay: FAST })
    expect(better.body).toMatchObject({ ticks: fast, improved: true, rank: 1 })
    expect(better.body.top[0]).toMatchObject({ name: 'Bob', ticks: fast, you: true })

    const worse = await call('POST', '/time', { id, playerId: BOB, replay: SLOW })
    expect(worse.body).toMatchObject({ ticks: slow, improved: false, rank: 1 })
    expect(worse.body.top[0].ticks).toBe(fast)
    expect(formatTicks(fast)).toMatch(/^\d+\.\d\d$/)
  })

  it('Betrug: die Zeit kommt nur aus dem Replay, nicht aus dem, was der Client behauptet', async () => {
    const id = await approved({ replay: SLOW })
    const res = await call('POST', '/time', { id, playerId: BOB, replay: SLOW, ticks: 1, time: 0.01 })
    expect(res.body.ticks).toBeGreaterThan(60)
  })

  it('lehnt unfertige, kaputte oder zu lange Replays ab, ohne etwas zu schreiben', async () => {
    const id = await approved()
    for (const replay of ['N5', 'quatsch', '', 'N999999', 'N' + '1'.repeat(10)]) {
      const r = await call('POST', '/time', { id, playerId: BOB, replay })
      expect(r.status, replay).toBe(400)
    }
    expect((await call('POST', '/time', { id, playerId: BOB })).status).toBe(400)
    expect(await db.zrank(K.times(id), BOB)).toBeNull()
  })

  it('Name ist optional und wird gesäubert; ohne Namen heißt der Spieler Anonymous', async () => {
    const id = await approved()
    const r = await call('POST', '/time', { id, playerId: BOB, replay: FAST })
    expect(r.body.top.find((t: any) => t.you).name).toBe('Anonymous')
    const r2 = await call('POST', '/time', { id, playerId: BOB, replay: FAST, name: '  <Bob>  ' })
    expect(r2.body.top.find((t: any) => t.you).name).toBe('Bob')
    expect((await call('POST', '/time', { id, playerId: BOB, replay: FAST, name: 'x'.repeat(17) })).status).toBe(400)
  })

  it('Spieler-IDs gelangen nie in eine Antwort', async () => {
    const id = await approved()
    await call('POST', '/time', { id, playerId: BOB, replay: SLOW })
    const all = JSON.stringify([
      (await call('GET', `/times?id=${id}&player=${BOB}`)).body,
      (await call('GET', '/levels')).body,
      (await call('POST', '/start', { id, playerId: BOB })).body,
    ])
    expect(all).not.toContain(BOB)
    expect(all).not.toContain(ALICE)
  })

  it('Rang ohne Spieler-ID: keiner ist "you"', async () => {
    const id = await approved()
    const t = await call('GET', `/times?id=${id}`)
    expect(t.body.rank).toBeNull()
    expect(t.body.top.every((x: any) => x.you === false)).toBe(true)
  })

  it('Rate-Limit beim Eintragen von Zeiten', async () => {
    const id = await approved()
    for (let i = 0; i < LIMITS.timesPerHour; i++) await call('POST', '/time', { id, playerId: BOB, replay: 'N1' })
    expect((await call('POST', '/time', { id, playerId: BOB, replay: FAST })).status).toBe(429)
  })

  it('Replay wird nur bei einer Verbesserung gespeichert', async () => {
    const id = await approved()
    await call('POST', '/time', { id, playerId: BOB, replay: SLOW })
    expect(db.has(K.replay(id, BOB))).toBe(true)
    await call('POST', '/time', { id, playerId: BOB, replay: FAST })
    expect(encodeInputs(decodeInputs(FAST))).toBe(FAST)
  })
})

describe('Replays nur für die Top 5', () => {
  const pid = (n: number) => `p${n}`.padEnd(16, 'x')

  it('wer aus den Top 5 fällt, verliert sein Replay; angezeigt werden nur 5 Plätze', async () => {
    const id = await approved({ replay: SLOW })
    for (let n = 1; n <= 3; n++) await call('POST', '/time', { id, playerId: pid(n), replay: SLOW })
    // Gleichstand wird nach Spieler-ID geordnet
    const slowPlayers = [pid(1), pid(2), pid(3)]
    for (const p of slowPlayers) expect(db.has(K.replay(id, p)), p).toBe(true)

    for (const n of [4, 5]) await call('POST', '/time', { id, playerId: pid(n), replay: SLOW })
    const sixth = await call('POST', '/time', { id, playerId: pid(6), replay: SLOW })
    expect(sixth.body.top).toHaveLength(5)
    expect(sixth.body.total).toBe(6)

    const stored = [1, 2, 3, 4, 5, 6].map(pid).filter((p) => db.has(K.replay(id, p)))
    expect(stored).toHaveLength(5)

    // Ein schnellerer Spieler rückt auf Platz 1: der bisherige Fünfte verliert sein Replay
    const before = await db.zrange(K.times(id), 0, 5)
    const fifthPlace = before[4].member
    const sixthPlace = before[5].member
    expect(db.has(K.replay(id, fifthPlace))).toBe(true)
    const fast = await call('POST', '/time', { id, playerId: BOB, replay: FAST })
    expect(fast.body.rank).toBe(1)
    expect(db.has(K.replay(id, BOB))).toBe(true)
    expect(db.has(K.replay(id, fifthPlace))).toBe(false)
    expect(db.has(K.replay(id, sixthPlace))).toBe(false)
    const withReplay = [BOB, ...[1, 2, 3, 4, 5, 6].map(pid)].filter((p) => db.has(K.replay(id, p)))
    expect(withReplay).toHaveLength(5)
  })

  it('wer außerhalb der Top 5 landet, bekommt kein Replay, der eigene Rang steht trotzdem in der Antwort', async () => {
    const id = await approved({ replay: FAST })
    for (let n = 1; n <= 6; n++) await call('POST', '/time', { id, playerId: pid(n), replay: FAST })
    const late = await call('POST', '/time', { id, playerId: BOB, replay: SLOW })
    expect(late.body).toMatchObject({ improved: true, rank: 7, total: 7 })
    expect(late.body.top).toHaveLength(5)
    expect(late.body.top.some((t: any) => t.you)).toBe(false)
    expect(db.has(K.replay(id, BOB))).toBe(false)
  })

  it('Ablehnen räumt auch die Replays der Top-Plätze auf', async () => {
    const id = await approved({ replay: SLOW })
    await call('POST', '/time', { id, playerId: BOB, replay: FAST })
    await call('POST', '/admin/review', { id, action: 'delete' }, admin)
    expect(db.has(K.replay(id, ALICE))).toBe(false)
    expect(db.has(K.replay(id, BOB))).toBe(false)
  })
})

describe('Router', () => {
  it('unbekannte Pfade und falsche Methoden', async () => {
    expect((await call('GET', '/gibtsnicht')).status).toBe(404)
    expect((await call('GET', '/upload')).status).toBe(405)
    expect((await call('POST', '/levels', {})).status).toBe(405)
    expect((await call('GET', '/levels/')).status).toBe(200)
  })

  it('Befehlsbudget: Liste 4, Start 3, Zeit eintragen höchstens 13 Befehle (der erste Spieler braucht einen mehr für den First Clear)', async () => {
    const id = await approved()
    let before = db.commands
    await call('GET', '/levels?sort=plays')
    expect(db.commands - before).toBeLessThanOrEqual(4)
    before = db.commands
    await call('POST', '/start', { id, playerId: BOB })
    expect(db.commands - before).toBeLessThanOrEqual(3)
    before = db.commands
    await call('POST', '/time', { id, playerId: BOB, name: 'Bob', replay: FAST })
    expect(db.commands - before).toBeLessThanOrEqual(13)
    // Danach kostet der First Clear nichts mehr
    before = db.commands
    await call('POST', '/time', { id, playerId: ALICE, name: 'Alice', replay: FAST })
    expect(db.commands - before).toBeLessThanOrEqual(12)
  })
})