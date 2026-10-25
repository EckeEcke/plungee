import type { Db } from '../../netlify/lib/db'

/** In-Memory-Ersatz für Upstash mit denselben Regeln wie Redis (Ablaufzeiten über eine einstellbare Uhr) */
export class FakeDb implements Db {
  private strings = new Map<string, { value: string; expiresAt: number | null }>()
  private zsets = new Map<string, Map<string, number>>()
  private zExpires = new Map<string, number>()
  /** Anzahl der Befehle, um das Befehlsbudget zu prüfen */
  commands = 0

  constructor(private now: () => number) {}

  private alive(key: string): string | null {
    const e = this.strings.get(key)
    if (!e) return null
    if (e.expiresAt !== null && e.expiresAt <= this.now()) {
      this.strings.delete(key)
      return null
    }
    return e.value
  }

  /** Abgelaufene Sortierlisten verschwinden wie in Redis */
  private purge(key: string): void {
    const at = this.zExpires.get(key)
    if (at !== undefined && at <= this.now()) {
      this.zExpires.delete(key)
      this.zsets.delete(key)
    }
  }

  private z(key: string): Map<string, number> {
    this.purge(key)
    let m = this.zsets.get(key)
    if (!m) this.zsets.set(key, (m = new Map()))
    return m
  }

  /** aufsteigend nach Score, bei Gleichstand nach Mitglied (wie Redis) */
  private sorted(key: string): Array<{ member: string; score: number }> {
    this.purge(key)
    return [...(this.zsets.get(key) ?? new Map<string, number>())]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : a.member > b.member ? 1 : 0))
  }

  has(key: string): boolean {
    this.purge(key)
    return this.alive(key) !== null || (this.zsets.get(key)?.size ?? 0) > 0
  }

  async mget(keys: string[]) {
    this.commands++
    return keys.map((k) => this.alive(k))
  }
  async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
    this.commands++
    if (opts?.nx && this.alive(key) !== null) return false
    this.strings.set(key, { value, expiresAt: opts?.ex ? this.now() + opts.ex * 1000 : null })
    return true
  }
  async del(...keys: string[]) {
    this.commands++
    for (const k of keys) {
      this.strings.delete(k)
      this.zsets.delete(k)
      this.zExpires.delete(k)
    }
  }
  async incr(key: string) {
    this.commands++
    const n = Number(this.alive(key) ?? 0) + 1
    const e = this.strings.get(key)
    this.strings.set(key, { value: String(n), expiresAt: e?.expiresAt ?? null })
    return n
  }
  async expire(key: string, seconds: number) {
    this.commands++
    const e = this.strings.get(key)
    if (e) e.expiresAt = this.now() + seconds * 1000
    if (this.zsets.has(key)) this.zExpires.set(key, this.now() + seconds * 1000)
  }
  async zadd(key: string, score: number, member: string) {
    this.commands++
    this.z(key).set(member, score)
  }
  async zaddNx(key: string, score: number, member: string) {
    this.commands++
    if (!this.z(key).has(member)) this.z(key).set(member, score)
  }
  async zaddIfLower(key: string, score: number, member: string) {
    this.commands++
    const cur = this.z(key).get(member)
    if (cur !== undefined && cur <= score) return false
    this.z(key).set(member, score)
    return true
  }
  async zincr(key: string, by: number, member: string) {
    this.commands++
    this.z(key).set(member, (this.z(key).get(member) ?? 0) + by)
  }
  async zrem(key: string, ...members: string[]) {
    this.commands++
    for (const m of members) this.zsets.get(key)?.delete(m)
  }
  async zrange(key: string, start: number, stop: number, opts?: { rev?: boolean }) {
    this.commands++
    const all = this.sorted(key)
    if (opts?.rev) all.reverse()
    return all.slice(start, stop < 0 ? all.length + stop + 1 : stop + 1)
  }
  async zscores(key: string, members: string[]) {
    this.commands++
    this.purge(key)
    return members.map((m) => this.zsets.get(key)?.get(m) ?? null)
  }
  async zrank(key: string, member: string) {
    this.commands++
    const i = this.sorted(key).findIndex((r) => r.member === member)
    return i < 0 ? null : i
  }
  async zcard(key: string) {
    this.commands++
    this.purge(key)
    return this.zsets.get(key)?.size ?? 0
  }
}