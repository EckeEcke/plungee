import campaignJson from '../generated/campaign.json'
import { ApiError } from './errors'
import { beatsBest, boardOf, chosenName, K, LIMITS, playerId, PLAYER_RE, rateLimit, verifyReplay, type Ctx } from './levels'
import type { LevelData } from '../../src/sim'

/**
 * Weekly Challenge: Jede Woche (Montag 00:00 deutscher Zeit bis zum nächsten Montag) gibt es ein Kampagnen-Level
 * mit eigener Bestenliste. Reihenfolge: Normal 01, 02, … bis zur letzten nummerierten Datei, dann Hard 01, 02, …,
 * danach wieder Normal 01. Easy und Level ohne führende Nummer kommen nicht vor.
 *
 * Redis (Präfix "plungee:"):
 *   week:{montag}:level          String  Schlüssel des Levels, beim ersten Zugriff der Woche festgelegt (bleibt bei neuen Leveln stabil)
 *   week:{montag}:times          ZSet    Spieler-ID -> Bestzeit in Ticks
 *   week:{montag}:replay:{pid}   String  Replay, nur für die Top-Plätze
 * Alles läuft nach 6 Wochen ab, die Vorwoche bleibt also sichtbar.
 */

export interface CampaignLevel {
  key: string
  title: string
  data: LevelData
}

const CAMPAIGN = campaignJson as unknown as Array<CampaignLevel & { difficulty: string }>

const DAY_MS = 86_400_000
const KEEP_SECONDS = 6 * 7 * 86_400
/** Erste Woche der Rotation: hier steht Normal 01 */
const FIRST_WEEK = Date.UTC(2026, 9, 26)

// --- Woche in deutscher Zeit ----------------------------------------------------------

const berlin = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function berlinParts(ms: number) {
  const p: Record<string, string> = {}
  for (const x of berlin.formatToParts(new Date(ms))) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: WEEKDAYS.indexOf(p.weekday) }
}

/** Abstand der deutschen Wanduhr zu UTC in ms (3 600 000 im Winter, 7 200 000 im Sommer) */
function berlinOffset(ms: number): number {
  const p = berlinParts(ms)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

/** UTC-Zeitpunkt von 00:00 deutscher Zeit an diesem Kalendertag (Datum als UTC-Mitternacht gegeben) */
function berlinMidnight(dayUtc: number): number {
  let t = dayUtc - berlinOffset(dayUtc)
  t = dayUtc - berlinOffset(t)
  return t
}

const iso = (dayUtc: number): string => new Date(dayUtc).toISOString().slice(0, 10)

export function weekOf(now: number) {
  const p = berlinParts(now)
  const mondayUtc = Date.UTC(p.y, p.m - 1, p.d - p.wd)
  return {
    id: iso(mondayUtc),
    index: Math.round((mondayUtc - FIRST_WEEK) / (7 * DAY_MS)),
    startsAt: berlinMidnight(mondayUtc),
    endsAt: berlinMidnight(mondayUtc + 7 * DAY_MS),
    previousId: iso(mondayUtc - 7 * DAY_MS),
  }
}

// --- Rotation -------------------------------------------------------------------------

/** Normal 01.., dann Hard 01..: nur Dateien mit führender Nummer, nach dieser Nummer geordnet */
export function rotation(levels: ReadonlyArray<CampaignLevel>): CampaignLevel[] {
  const numbered = (prefix: string) =>
    levels
      .map((l) => ({ l, m: /^(\d+)/.exec(l.key.startsWith(prefix) ? l.key.slice(prefix.length) : '') }))
      .filter((x) => x.m)
      .sort((a, b) => Number(a.m![1]) - Number(b.m![1]) || (a.l.key < b.l.key ? -1 : 1))
      .map((x) => x.l)
  return [...numbered('normal/'), ...numbered('hard/')]
}

export function pickForWeek(levels: ReadonlyArray<CampaignLevel>, weekIndex: number): CampaignLevel | null {
  const pool = rotation(levels)
  if (pool.length === 0) return null
  return pool[((weekIndex % pool.length) + pool.length) % pool.length]
}

// --- Aufrufe --------------------------------------------------------------------------

const poolOf = (ctx: Ctx): ReadonlyArray<CampaignLevel> => ctx.campaign ?? CAMPAIGN

/** Das Level dieser Woche. Beim ersten Zugriff festgelegt, damit neue Kampagnen-Level die laufende Woche nicht verschieben. */
async function levelOfWeek(ctx: Ctx, week: ReturnType<typeof weekOf>): Promise<CampaignLevel> {
  const all = poolOf(ctx)
  const [stored] = await ctx.db.mget([K.weekLevel(week.id)])
  const found = stored ? all.find((l) => l.key === stored) : undefined
  if (found) return found
  const pick = pickForWeek(all, week.index)
  if (!pick) throw new ApiError(503, 'No challenge available')
  await ctx.db.set(K.weekLevel(week.id), pick.key, { ex: 8 * 7 * 86_400 })
  return pick
}

/** Level und Zeitraum der aktuellen Woche (zum Spielen). Enthält die Level-Daten, damit Client und Server dasselbe nachspielen. */
export async function weeklyInfo(ctx: Ctx) {
  const week = weekOf(ctx.now())
  const level = await levelOfWeek(ctx, week)
  return { week: week.id, startsAt: week.startsAt, endsAt: week.endsAt, key: level.key, title: level.title, data: level.data }
}

/** Bestenliste dieser Woche samt Platz des Spielers und den Top-Plätzen der Vorwoche */
export async function weeklyBoard(ctx: Ctx, pidRaw: unknown) {
  const week = weekOf(ctx.now())
  const pid = typeof pidRaw === 'string' && PLAYER_RE.test(pidRaw) ? pidRaw : null
  const [current, last, lastLevelKey] = await Promise.all([
    boardOf(ctx, K.weekTimes(week.id), pid),
    boardOf(ctx, K.weekTimes(week.previousId), pid),
    ctx.db.mget([K.weekLevel(week.previousId)]).then((r) => r[0] ?? null),
  ])
  const lastTitle = lastLevelKey ? (poolOf(ctx).find((l) => l.key === lastLevelKey)?.title ?? null) : null
  return {
    week: week.id,
    ...current,
    lastWeek: last.total > 0 ? { week: week.previousId, title: lastTitle, ...last } : null,
  }
}

/**
 * Die Top 5 der VORIGEN Woche mit Replays und Level (für das Rennen in der App). Die laufende Woche gibt es nie heraus:
 * Wer noch mitspielt, soll die Linien der anderen nicht abschauen können. Drei Befehle.
 */
export async function weeklyReplays(ctx: Ctx, pidRaw: unknown) {
  const { db } = ctx
  const week = weekOf(ctx.now())
  const pid = typeof pidRaw === 'string' && PLAYER_RE.test(pidRaw) ? pidRaw : null
  const none = { week: week.previousId, title: null, data: null, entries: [] as never[] }
  const key = (await db.mget([K.weekLevel(week.previousId)]))[0]
  const level = key ? poolOf(ctx).find((l) => l.key === key) : undefined
  if (!level) return none
  const top = await db.zrange(K.weekTimes(week.previousId), 0, LIMITS.topTimes - 1)
  if (top.length === 0) return none
  const raw = await db.mget([...top.map((t) => K.name(t.member)), ...top.map((t) => K.weekReplay(week.previousId, t.member))])
  const entries = top.flatMap((t, i) => {
    const replay = raw[top.length + i]
    return replay ? [{ rank: i + 1, name: raw[i] ?? 'Anonymous', ticks: t.score, replay, you: t.member === pid }] : []
  })
  if (entries.length === 0) return none
  return { week: week.previousId, title: level.title, data: level.data, entries }
}

export async function weeklySubmit(ctx: Ctx, body: Record<string, unknown>) {
  const { db } = ctx
  await rateLimit(ctx, 'time', LIMITS.timesPerHour, 3600)
  const pid = playerId(body.playerId)
  const { name, rejected } = chosenName(ctx, body.name)
  const week = weekOf(ctx.now())
  const level = await levelOfWeek(ctx, week)

  const ticks = verifyReplay(level.data, body.replay)
  const times = K.weekTimes(week.id)
  const improved = await db.zaddIfLower(times, ticks, pid)
  if (improved) {
    await db.expire(times, KEEP_SECONDS)
    // Wie bei Community-Leveln: Replays nur für die Top-Plätze
    const place = await db.zrank(times, pid)
    if (place !== null && place < LIMITS.topTimes) {
      await db.set(K.weekReplay(week.id, pid), String(body.replay), { ex: KEEP_SECONDS })
      const [out] = await db.zrange(times, LIMITS.topTimes, LIMITS.topTimes)
      if (out) await db.del(K.weekReplay(week.id, out.member))
    }
  }
  if (name) await db.set(K.name(pid), name)
  const board = await boardOf(ctx, times, pid)
  // Die allererste Zeit der Woche schlägt niemanden: kein „New best“
  return { ticks, improved, newBest: beatsBest(improved, ticks, board, false), ...(rejected ? { nameRejected: true } : {}), ...board }
}