import { isNameAllowed } from '../../src/online/nameFilter'
import { ApiError } from './errors'
import { K, LIMITS, PLAYER_RE, parseFirstClear, type Ctx, type LevelMeta } from './levels'
import { weekOf } from './weekly'

/**
 * Moderation: freigegebene Level und Bestenlisten ansehen, einzelne Einträge löschen.
 * Alles hinter requireAdmin (der Router prüft das Token). Hier sieht der Admin als Einziger Spieler-IDs.
 *
 * Ziel einer Bestenliste ("target"):  level:{id}  oder  week:{montag, z. B. 2026-10-26}
 */

const LEVEL_TARGET = /^level:([A-Za-z0-9]{8})$/
const WEEK_TARGET = /^week:(\d{4}-\d{2}-\d{2})$/
const MAX_ROWS = 100

function parseTarget(v: unknown): { times: string; replay: (pid: string) => string } {
  const s = typeof v === 'string' ? v : ''
  const lv = LEVEL_TARGET.exec(s)
  if (lv) return { times: K.times(lv[1]), replay: (pid) => K.replay(lv[1], pid) }
  const wk = WEEK_TARGET.exec(s)
  if (wk) return { times: K.weekTimes(wk[1]), replay: (pid) => K.weekReplay(wk[1], pid) }
  throw new ApiError(400, 'Invalid target')
}

function parseMeta(raw: string | null): LevelMeta | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as LevelMeta
  } catch {
    return null
  }
}

/** Freigegebene Level, neueste zuerst. `flagged` = Titel oder Autor sieht nach einem gesperrten Wort aus. */
export async function adminLevels(ctx: Ctx, offset: number, limit: number) {
  const { db } = ctx
  const take = Math.max(1, Math.min(MAX_ROWS, limit))
  const from = Math.max(0, offset)
  const rows = await db.zrange(K.isNew, from, from + take - 1, { rev: true })
  const ids = rows.map((r) => r.member)
  const [raw, plays] = await Promise.all([db.mget([...ids.map(K.meta), ...ids.map(K.firstClear)]), db.zscores(K.plays, ids)])
  const levels = ids.flatMap((_, i) => {
    const m = parseMeta(raw[i])
    if (!m) return []
    const fc = parseFirstClear(raw[ids.length + i])
    const flagged = !isNameAllowed(m.title, ctx.blockedWords) || !isNameAllowed(m.author, ctx.blockedWords)
    return [{ id: m.id, title: m.title, author: m.author, size: m.size, createdAt: m.createdAt, plays: plays[i] ?? 0, firstClear: fc, flagged: flagged || (fc !== null && !isNameAllowed(fc.name, ctx.blockedWords)) }]
  })
  return { levels, total: await db.zcard(K.isNew) }
}

/** Die beiden Wochen, die man moderieren kann (laufende und vorige) */
export function adminWeeks(ctx: Ctx) {
  const w = weekOf(ctx.now())
  return { weeks: [w.id, w.previousId] }
}

/** Alle Einträge einer Bestenliste (bis 100) mit Name und Spieler-ID, beste zuerst */
export async function adminTimes(ctx: Ctx, target: unknown) {
  const { db } = ctx
  const t = parseTarget(target)
  const rows = await db.zrange(t.times, 0, MAX_ROWS - 1)
  const names = await db.mget(rows.map((r) => K.name(r.member)))
  const total = await db.zcard(t.times)
  return {
    total,
    entries: rows.map((r, i) => {
      const name = names[i] ?? 'Anonymous'
      return {
        rank: i + 1,
        playerId: r.member,
        name,
        ticks: r.score,
        hasReplay: i < LIMITS.topTimes,
        flagged: !isNameAllowed(name, ctx.blockedWords),
      }
    }),
  }
}

/** Löscht eine Zeit samt Replay. `clearName` setzt außerdem den Anzeigenamen des Spielers zurück (gilt überall). */
export async function adminDeleteTime(ctx: Ctx, body: Record<string, unknown>) {
  const { db } = ctx
  const t = parseTarget(body.target)
  const pid = typeof body.playerId === 'string' && PLAYER_RE.test(body.playerId) ? body.playerId : null
  if (!pid) throw new ApiError(400, 'Invalid player id')
  if ((await db.zrank(t.times, pid)) === null && body.clearName !== true) throw new ApiError(404, 'Entry not found')
  await db.zrem(t.times, pid)
  await db.del(t.replay(pid))
  if (body.clearName === true) await db.del(K.name(pid))
  return { deleted: true as const, clearedName: body.clearName === true }
}

/** Setzt nur den Anzeigenamen eines Spielers zurück (Einträge bleiben, die Zeit zählt weiter) */
export async function adminClearName(ctx: Ctx, body: Record<string, unknown>) {
  const pid = typeof body.playerId === 'string' && PLAYER_RE.test(body.playerId) ? body.playerId : null
  if (!pid) throw new ApiError(400, 'Invalid player id')
  await ctx.db.del(K.name(pid))
  return { cleared: true as const }
}

/** Entfernt die First-Clear-Markierung eines Levels (z. B. bei unpassendem Namen) */
export async function adminClearFirstClear(ctx: Ctx, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' && /^[A-Za-z0-9]{8}$/.test(body.id) ? body.id : null
  if (!id) throw new ApiError(400, 'Invalid level id')
  await ctx.db.del(K.firstClear(id))
  return { cleared: true as const }
}