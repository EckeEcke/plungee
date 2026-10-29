import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { levelHash } from '../../src/editor/hash'
import {
  SIM_VERSION,
  compileLevel,
  decodeInputs,
  simulate,
  validateLevel,
  type LevelData,
  type LevelSize,
} from '../../src/sim'
import { isNameAllowed } from '../../src/online/nameFilter'
import type { Db } from './db'
import { ApiError } from './errors'

/**
 * Datenmodell in Redis (alles mit Präfix "plungee:"):
 *   level:{id}          String   Level-JSON (v, size, tiles, entities)
 *   meta:{id}           String   LevelMeta als JSON
 *   lv:new              ZSet     freigegebene Level, Score = Erstellzeit (ms)
 *   lv:plays            ZSet     freigegebene Level, Score = Spielzähler
 *   lv:pending          ZSet     wartet auf Freigabe, Score = Erstellzeit
 *   times:{id}          ZSet     Spieler-ID -> Bestzeit in Ticks (kleiner = besser)
 *   name:{playerId}     String   Anzeigename
 *   replay:{id}:{pid}   String   Replay der Bestzeit, nur für die Top-Plätze (LIMITS.topTimes); fällt ein Spieler heraus, wird es gelöscht
 *   firstclear:{id}     String   JSON {name, at}: erster Spieler (nicht der Ersteller), der das Level geschafft hat; Name als Momentaufnahme
 *   hash:{levelHash}    String   Level-ID (verhindert doppelte Uploads)
 *   seen:{id}:{pid}     String   mit Ablauf: zählt ein Spiel nur einmal pro Spieler und Stunde
 *   rl:{aktion}:{ip}    Zähler   mit Ablauf: Rate-Limit
 */
const P = 'plungee:'
export const K = {
  level: (id: string) => `${P}level:${id}`,
  meta: (id: string) => `${P}meta:${id}`,
  isNew: `${P}lv:new`,
  plays: `${P}lv:plays`,
  pending: `${P}lv:pending`,
  times: (id: string) => `${P}times:${id}`,
  name: (pid: string) => `${P}name:${pid}`,
  replay: (id: string, pid: string) => `${P}replay:${id}:${pid}`,
  hash: (h: string) => `${P}hash:${h}`,
  firstClear: (id: string) => `${P}firstclear:${id}`,
  seen: (id: string, pid: string) => `${P}seen:${id}:${pid}`,
  rl: (action: string, ip: string) => `${P}rl:${action}:${ip}`,
  // Weekly Challenge (week = Datum des Montags, z. B. 2026-10-26)
  weekLevel: (week: string) => `${P}week:${week}:level`,
  weekTimes: (week: string) => `${P}week:${week}:times`,
  weekReplay: (week: string, pid: string) => `${P}week:${week}:replay:${pid}`,
}

export interface Ctx {
  db: Db
  now: () => number
  ip: string
  adminToken: string | undefined
  /** Kampagnen-Level für die Weekly Challenge (Standard: netlify/generated/campaign.json). Nur Tests setzen das. */
  campaign?: ReadonlyArray<{ key: string; title: string; data: LevelData }>
  /** Zusätzlich gesperrte Wörter für Namen und Titel (Umgebungsvariable BLOCKED_WORDS) */
  blockedWords?: readonly string[]
}

export interface LevelMeta {
  id: string
  title: string
  author: string
  size: LevelSize
  createdAt: number
  hash: string
  simVersion: number
  status: 'pending' | 'approved'
  /** Spieler-ID des Erstellers (nur intern/Admin; fehlt bei Leveln aus der Zeit davor) */
  creator?: string
}

export interface FirstClear {
  name: string
  at: number
}

export const LIMITS = {
  uploadsPerHour: 5,
  timesPerHour: 60,
  adminPerHour: 120,
  /** So viele Plätze werden angezeigt und behalten ihr Replay */
  topTimes: 5,
  maxPage: 50,
  seenSeconds: 3600,
  maxReplayChars: 120_000,
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ID_RE = /^[A-Za-z0-9]{8}$/
export const PLAYER_RE = /^[A-Za-z0-9_-]{16,64}$/

// --- Eingaben prüfen -------------------------------------------------------------

export function newId(): string {
  const bytes = randomBytes(8)
  let id = ''
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length]
  return id
}

function cleanText(v: unknown, min: number, max: number, what: string): string {
  if (typeof v !== 'string') throw new ApiError(400, `${what} is missing`)
  // Steuerzeichen und spitze Klammern raus, Leerraum glätten
  const s = v
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length < min || s.length > max) throw new ApiError(400, `${what} must be ${min}-${max} characters`)
  return s
}

export function cleanName(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null
  return cleanText(v, 1, 16, 'Name')
}

/** Der Name, der gespeichert werden darf. Gesperrte Namen werden verworfen (die Zeit zählt trotzdem), `rejected` meldet das dem Client. */
export function chosenName(ctx: Ctx, v: unknown): { name: string | null; rejected: boolean } {
  const name = cleanName(v)
  if (name && !isNameAllowed(name, ctx.blockedWords)) return { name: null, rejected: true }
  return { name, rejected: false }
}

function levelId(v: unknown): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw new ApiError(400, 'Invalid level id')
  return v
}

export function playerId(v: unknown): string {
  if (typeof v !== 'string' || !PLAYER_RE.test(v)) throw new ApiError(400, 'Invalid player id')
  return v
}

/** Spielt das Replay auf dem Server nach und liefert die Zeit in Ticks. Nur fertige Läufe zählen. */
export function verifyReplay(data: LevelData, replay: unknown): number {
  if (typeof replay !== 'string' || replay.length === 0 || replay.length > LIMITS.maxReplayChars) {
    throw new ApiError(400, 'Replay is missing or too large')
  }
  let inputs: Int8Array
  try {
    inputs = decodeInputs(replay)
  } catch {
    throw new ApiError(400, 'Invalid replay')
  }
  let result
  try {
    result = simulate(compileLevel(data), inputs)
  } catch {
    throw new ApiError(400, 'Invalid replay')
  }
  if (!result.finished) throw new ApiError(400, 'The replay does not finish the level')
  return result.ticks
}

export async function rateLimit(ctx: Ctx, action: string, max: number, windowSeconds: number): Promise<void> {
  const ip = createHash('sha256').update(ctx.ip).digest('hex').slice(0, 16)
  const key = K.rl(action, ip)
  const n = await ctx.db.incr(key)
  if (n === 1) await ctx.db.expire(key, windowSeconds)
  if (n > max) throw new ApiError(429, 'Too many requests, please try again later')
}

function parseMeta(raw: string | null): LevelMeta | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as LevelMeta
  } catch {
    return null
  }
}

export function parseFirstClear(raw: string | null): FirstClear | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<FirstClear>
    return typeof v.name === 'string' && typeof v.at === 'number' ? { name: v.name, at: v.at } : null
  } catch {
    return null
  }
}

function publicMeta(m: LevelMeta, plays?: number | null, firstClear?: FirstClear | null) {
  return {
    id: m.id,
    title: m.title,
    author: m.author,
    size: m.size,
    createdAt: m.createdAt,
    plays: plays ?? 0,
    firstClear: firstClear ?? null,
  }
}

// --- Spieler: hochladen ------------------------------------------------------------

export async function uploadLevel(ctx: Ctx, body: Record<string, unknown>) {
  const { db } = ctx
  await rateLimit(ctx, 'upload', LIMITS.uploadsPerHour, 3600)

  const title = cleanText(body.title, 3, 32, 'Title')
  const author = cleanName(body.author) ?? 'Anonymous'
  if (!isNameAllowed(title, ctx.blockedWords)) throw new ApiError(400, 'This title is not allowed.')
  if (!isNameAllowed(author, ctx.blockedWords)) throw new ApiError(400, 'This name is not allowed.')
  const pid = playerId(body.playerId)
  const raw = body.data as LevelData
  const errors = validateLevel(raw)
  if (errors.length > 0) throw new ApiError(400, errors[0])
  const data: LevelData = { v: 1, size: raw.size, tiles: raw.tiles, entities: raw.entities }
  // Beweis, dass das Level lösbar ist: Das Replay des Erstellers muss es abschließen
  const ticks = verifyReplay(data, body.replay)

  const id = newId()
  const hash = levelHash(data)
  if (!(await db.set(K.hash(hash), id, { nx: true }))) throw new ApiError(409, 'This level was already uploaded')

  const createdAt = ctx.now()
  const meta: LevelMeta = { id, title, author, size: data.size, createdAt, hash, simVersion: SIM_VERSION, status: 'pending', creator: pid }
  await db.set(K.level(id), JSON.stringify(data))
  await db.set(K.meta(id), JSON.stringify(meta))
  await db.zadd(K.pending, createdAt, id)
  // Die Zeit des Erstellers ist der erste Eintrag in der Rangliste
  await db.zadd(K.times(id), ticks, pid)
  await db.set(K.replay(id, pid), String(body.replay))
  if (cleanName(body.author)) await db.set(K.name(pid), author)
  return { id, status: 'pending' as const }
}

// --- Spieler: Liste, Start, Zeiten ------------------------------------------------------

export async function listLevels(ctx: Ctx, sort: string, offset: number, limit: number) {
  const { db } = ctx
  const take = Math.max(1, Math.min(LIMITS.maxPage, limit))
  const from = Math.max(0, offset)
  let ids: string[]
  let plays: Array<number | null>
  if (sort === 'plays') {
    const rows = await db.zrange(K.plays, from, from + take - 1, { rev: true })
    ids = rows.map((r) => r.member)
    plays = rows.map((r) => r.score)
  } else {
    const rows = await db.zrange(K.isNew, from, from + take - 1, { rev: true })
    ids = rows.map((r) => r.member)
    plays = await db.zscores(K.plays, ids)
  }
  // Level-Daten und First Clears in einem Befehl
  const raw = await db.mget([...ids.map(K.meta), ...ids.map(K.firstClear)])
  const levels = ids.flatMap((_, i) => {
    const m = parseMeta(raw[i])
    return m && m.status === 'approved' ? [publicMeta(m, plays[i], parseFirstClear(raw[ids.length + i]))] : []
  })
  const total = await db.zcard(K.isNew)
  return { levels, total }
}

/** Lädt ein freigegebenes Level zum Spielen und zählt das Spiel (einmal pro Spieler und Stunde) */
export async function startLevel(ctx: Ctx, body: Record<string, unknown>) {
  const { db } = ctx
  const id = levelId(body.id)
  const [rawMeta, rawLevel, rawFirst] = await db.mget([K.meta(id), K.level(id), K.firstClear(id)])
  const meta = parseMeta(rawMeta)
  if (!meta || meta.status !== 'approved' || !rawLevel) throw new ApiError(404, 'Level not found')
  if (typeof body.playerId === 'string' && PLAYER_RE.test(body.playerId)) {
    if (await db.set(K.seen(id, body.playerId), '1', { nx: true, ex: LIMITS.seenSeconds })) await db.zincr(K.plays, 1, id)
  }
  return { meta: publicMeta(meta, undefined, parseFirstClear(rawFirst)), data: { ...(JSON.parse(rawLevel) as LevelData), title: meta.title } }
}

export const leaderboard = (ctx: Ctx, id: string, pid: string | null) => boardOf(ctx, K.times(id), pid)

/** Top-Plätze, eigener Rang und Gesamtzahl einer Zeitenliste (Level oder Woche) */
export async function boardOf(ctx: Ctx, timesKey: string, pid: string | null) {
  const { db } = ctx
  const id = timesKey
  const top = await db.zrange(id, 0, LIMITS.topTimes - 1)
  const names = await db.mget(top.map((t) => K.name(t.member)))
  const [rank, total] = await Promise.all([pid ? db.zrank(id, pid) : Promise.resolve(null), db.zcard(id)])
  return {
    total,
    rank: rank === null ? null : rank + 1,
    // Spieler-IDs bleiben geheim: sie sind das einzige, womit man sich ausweist
    top: top.map((t, i) => ({ rank: i + 1, name: names[i] ?? 'Anonymous', ticks: t.score, you: t.member === pid })),
  }
}

export async function getTimes(ctx: Ctx, idRaw: unknown, pidRaw: unknown) {
  const id = levelId(idRaw)
  const meta = parseMeta((await ctx.db.mget([K.meta(id)]))[0] ?? null)
  if (!meta || meta.status !== 'approved') throw new ApiError(404, 'Level not found')
  const pid = typeof pidRaw === 'string' && PLAYER_RE.test(pidRaw) ? pidRaw : null
  return leaderboard(ctx, id, pid)
}

/**
 * Hält fest, wer ein Level als Erster geschafft hat (außer dem Ersteller, dessen Beweis-Replay schon beim Upload zählt).
 * SET NX: nur der erste Eintrag gewinnt, auch bei gleichzeitigen Anfragen. Der Name ist eine Momentaufnahme.
 * Level aus der Zeit vor dieser Funktion kennen ihren Ersteller nicht: Dort zählt nur, wenn außer dem einen Eintrag
 * (dem des Erstellers) noch niemand eine Zeit hat.
 */
async function recordFirstClear(ctx: Ctx, id: string, meta: LevelMeta, pid: string, name: string | null): Promise<boolean> {
  const { db } = ctx
  let creator = meta.creator
  if (!creator) {
    const rows = await db.zrange(K.times(id), 0, 1)
    if (rows.length !== 1) return false
    creator = rows[0].member
  }
  if (pid === creator) return false
  const shown = name ?? (await db.mget([K.name(pid)]))[0] ?? 'Anonymous'
  const entry: FirstClear = { name: shown, at: ctx.now() }
  return db.set(K.firstClear(id), JSON.stringify(entry), { nx: true })
}

/**
 * Die Replays der Top 5 eines Community-Levels (für die Ghosts im Spiel). Nur freigegebene Level.
 * Spieler-IDs bleiben geheim: `you` markiert nur den Eintrag des Anfragenden. Einträge ohne Replay (nachgerückt
 * nach einem Admin-Löschen) fehlen. Zwei Befehle: Rangliste, dann Namen und Replays zusammen.
 */
export async function levelGhosts(ctx: Ctx, idRaw: unknown, pidRaw: unknown) {
  const { db } = ctx
  const id = levelId(idRaw)
  const pid = typeof pidRaw === 'string' && PLAYER_RE.test(pidRaw) ? pidRaw : null
  const meta = parseMeta((await db.mget([K.meta(id)]))[0] ?? null)
  if (!meta || meta.status !== 'approved') throw new ApiError(404, 'Level not found')
  const top = await db.zrange(K.times(id), 0, LIMITS.topTimes - 1)
  const raw = await db.mget([...top.map((t) => K.name(t.member)), ...top.map((t) => K.replay(id, t.member))])
  const entries = top.flatMap((t, i) => {
    const replay = raw[top.length + i]
    return replay ? [{ rank: i + 1, name: raw[i] ?? 'Anonymous', ticks: t.score, replay, you: t.member === pid }] : []
  })
  return { entries }
}

/** Trägt eine Zeit ein, nachdem der Server das Replay selbst nachgespielt hat */
export async function submitTime(ctx: Ctx, body: Record<string, unknown>) {
  const { db } = ctx
  await rateLimit(ctx, 'time', LIMITS.timesPerHour, 3600)
  const id = levelId(body.id)
  const pid = playerId(body.playerId)
  const { name, rejected } = chosenName(ctx, body.name)
  const [rawMeta, rawLevel, rawFirst] = await db.mget([K.meta(id), K.level(id), K.firstClear(id)])
  const meta = parseMeta(rawMeta)
  if (!meta || meta.status !== 'approved' || !rawLevel) throw new ApiError(404, 'Level not found')

  const ticks = verifyReplay(JSON.parse(rawLevel) as LevelData, body.replay)
  // Nur solange es noch keinen gibt (also einmal pro Level), sonst kostet es keinen Befehl
  const firstClear = rawFirst ? false : await recordFirstClear(ctx, id, meta, pid, name)
  const improved = await db.zaddIfLower(K.times(id), ticks, pid)
  if (improved) {
    // Replays gibt es nur für die Top-Plätze: wer hineinkommt, bekommt eines, wer hinausfällt, verliert es
    const place = await db.zrank(K.times(id), pid)
    if (place !== null && place < LIMITS.topTimes) {
      await db.set(K.replay(id, pid), String(body.replay))
      const [out] = await db.zrange(K.times(id), LIMITS.topTimes, LIMITS.topTimes)
      if (out) await db.del(K.replay(id, out.member))
    }
  }
  if (name) await db.set(K.name(pid), name)
  return { ticks, improved, ...(rejected ? { nameRejected: true } : {}), ...(firstClear ? { firstClear: true } : {}), ...(await leaderboard(ctx, id, pid)) }
}

// --- Admin ---------------------------------------------------------------------------

export async function requireAdmin(ctx: Ctx, token: string | null): Promise<void> {
  await rateLimit(ctx, 'admin', LIMITS.adminPerHour, 3600)
  const expected = ctx.adminToken
  if (!expected || !token) throw new ApiError(401, 'Unauthorized')
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(expected).digest()
  if (!timingSafeEqual(a, b)) throw new ApiError(401, 'Unauthorized')
}

export async function adminPending(ctx: Ctx) {
  const rows = await ctx.db.zrange(K.pending, 0, 99, { rev: true })
  const metas = await ctx.db.mget(rows.map((r) => K.meta(r.member)))
  return { levels: rows.flatMap((_, i) => (metas[i] ? [parseMeta(metas[i])!] : [])) }
}

export async function adminLevel(ctx: Ctx, idRaw: unknown) {
  const id = levelId(idRaw)
  const [rawMeta, rawLevel] = await ctx.db.mget([K.meta(id), K.level(id)])
  const meta = parseMeta(rawMeta)
  if (!meta || !rawLevel) throw new ApiError(404, 'Level not found')
  return { meta, data: { ...(JSON.parse(rawLevel) as LevelData), title: meta.title } }
}

/** approve: veröffentlichen. reject/delete: Level samt Zeiten, Replays und Hash entfernen (gibt den Upload wieder frei). */
export async function adminReview(ctx: Ctx, body: Record<string, unknown>) {
  const { db } = ctx
  const id = levelId(body.id)
  const action = body.action
  const meta = parseMeta((await db.mget([K.meta(id)]))[0] ?? null)
  if (!meta) throw new ApiError(404, 'Level not found')

  if (action === 'approve') {
    if (meta.status !== 'pending') throw new ApiError(409, 'Level is not pending')
    await db.set(K.meta(id), JSON.stringify({ ...meta, status: 'approved' } satisfies LevelMeta))
    await db.zrem(K.pending, id)
    await db.zadd(K.isNew, meta.createdAt, id)
    await db.zaddNx(K.plays, 0, id)
    return { id, status: 'approved' as const }
  }
  if (action === 'reject' || action === 'delete') {
    // Nur die Top-Plätze haben ein Replay (Reserve für Gleichstände und gleichzeitige Einträge)
    const players = await db.zrange(K.times(id), 0, LIMITS.topTimes + 4)
    await db.del(
      K.level(id),
      K.meta(id),
      K.firstClear(id),
      K.times(id),
      K.hash(meta.hash),
      ...players.map((p) => K.replay(id, p.member)),
    )
    await db.zrem(K.pending, id)
    await db.zrem(K.isNew, id)
    await db.zrem(K.plays, id)
    return { id, status: 'deleted' as const }
  }
  throw new ApiError(400, 'Unknown action')
}