import { Redis } from '@upstash/redis'
import { ApiError } from './errors'

/**
 * Schmale Datenbank-Schnittstelle: nur das, was die API braucht.
 * Echte Umsetzung: Upstash (unten). Tests: In-Memory (tests/helpers/fakeDb.ts).
 * Alle Werte sind Strings (JSON wird von der API selbst gelesen und geschrieben).
 */
export interface Db {
  /** Mehrere Schlüssel in einem Befehl lesen */
  mget(keys: string[]): Promise<Array<string | null>>
  /** true = geschrieben (bei nx: false, wenn der Schlüssel schon existierte) */
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<boolean>
  del(...keys: string[]): Promise<void>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<void>
  zadd(key: string, score: number, member: string): Promise<void>
  /** Nur anlegen, wenn das Mitglied noch fehlt */
  zaddNx(key: string, score: number, member: string): Promise<void>
  /** Anlegen oder nur dann überschreiben, wenn der neue Wert kleiner ist. true = etwas hat sich geändert */
  zaddIfLower(key: string, score: number, member: string): Promise<boolean>
  zincr(key: string, by: number, member: string): Promise<void>
  zrem(key: string, ...members: string[]): Promise<void>
  /** start/stop inklusive wie bei Redis (-1 = bis zum Ende); rev = absteigend nach Score */
  zrange(key: string, start: number, stop: number, opts?: { rev?: boolean }): Promise<Array<{ member: string; score: number }>>
  zscores(key: string, members: string[]): Promise<Array<number | null>>
  /** 0-basiert, aufsteigend nach Score */
  zrank(key: string, member: string): Promise<number | null>
  zcard(key: string): Promise<number>
}

/** Upstash über REST. Ohne automatische JSON-Umwandlung, damit alles als String zurückkommt, so wie geschrieben. */
export function getDb(env: Record<string, string | undefined> = process.env): Db {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new ApiError(500, 'Server is not configured')
  const r = new Redis({ url, token, automaticDeserialization: false })

  return {
    async mget(keys) {
      if (keys.length === 0) return []
      const res = await r.mget<Array<string | null>>(...keys)
      return res.map((v) => (v === null || v === undefined ? null : String(v)))
    },
    async set(key, value, opts) {
      let res
      if (opts?.nx && opts.ex) res = await r.set(key, value, { nx: true, ex: opts.ex })
      else if (opts?.nx) res = await r.set(key, value, { nx: true })
      else if (opts?.ex) res = await r.set(key, value, { ex: opts.ex })
      else res = await r.set(key, value)
      return res === 'OK'
    },
    async del(...keys) {
      if (keys.length > 0) await r.del(...keys)
    },
    incr: (key) => r.incr(key),
    async expire(key, seconds) {
      await r.expire(key, seconds)
    },
    async zadd(key, score, member) {
      await r.zadd(key, { score, member })
    },
    async zaddNx(key, score, member) {
      await r.zadd(key, { nx: true }, { score, member })
    },
    async zaddIfLower(key, score, member) {
      const changed = await r.zadd(key, { lt: true, ch: true }, { score, member })
      return Number(changed) > 0
    },
    async zincr(key, by, member) {
      await r.zincrby(key, by, member)
    },
    async zrem(key, ...members) {
      if (members.length > 0) await r.zrem(key, ...members)
    },
    async zrange(key, start, stop, opts) {
      const flat = await r.zrange<string[]>(key, start, stop, { withScores: true, rev: opts?.rev === true })
      const out: Array<{ member: string; score: number }> = []
      for (let i = 0; i + 1 < flat.length; i += 2) out.push({ member: String(flat[i]), score: Number(flat[i + 1]) })
      return out
    },
    async zscores(key, members) {
      if (members.length === 0) return []
      const res = await r.zmscore(key, members)
      return (res ?? []).map((v) => (v === null || v === undefined ? null : Number(v)))
    },
    async zrank(key, member) {
      const res = await r.zrank(key, member)
      return res === null || res === undefined ? null : Number(res)
    },
    zcard: (key) => r.zcard(key),
  }
}
