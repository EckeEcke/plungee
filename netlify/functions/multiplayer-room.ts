import { randomBytes } from 'node:crypto'
import { Redis } from '@upstash/redis'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE = /^[A-Z2-9]{8}$/
const ID = /^[a-f0-9-]{36}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const TTL = 7200

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const { action, code, playerId } = await request.json() as Record<string, unknown>
    if (typeof playerId !== 'string' || !ID.test(playerId)) return json({ error: 'Invalid player ID' }, 400)
    const redis = Redis.fromEnv()
    if (action === 'create') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const bytes = randomBytes(8)
        const newCode = [...bytes].map(n => ALPHABET[n % ALPHABET.length]).join('')
        const ok = await redis.set(`plungee:room:${newCode}:host`, playerId, { nx: true, ex: TTL })
        if (ok === 'OK') {
          await redis.sadd(`plungee:room:${newCode}:members`, playerId)
          await redis.expire(`plungee:room:${newCode}:members`, TTL)
          return json({ code: newCode, hostId: playerId })
        }
      }
      return json({ error: 'Could not create room' }, 503)
    }
    if (typeof code !== 'string' || !CODE.test(code)) return json({ error: 'Invalid room code' }, 400)
    const hostKey = `plungee:room:${code}:host`
    const membersKey = `plungee:room:${code}:members`
    if (action === 'join') {
      // Atomic capacity check: concurrent joins cannot exceed eight members.
      const result = await redis.eval(`
        local host = redis.call('GET', KEYS[1])
        if not host then return 0 end
        if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return 2 end
        if redis.call('SCARD', KEYS[2]) >= 8 then return 1 end
        redis.call('SADD', KEYS[2], ARGV[1])
        redis.call('EXPIRE', KEYS[2], 7200)
        return 2
      `, [hostKey, membersKey], [playerId])
      if (Number(result) === 0) return json({ error: 'Room not found or expired' }, 404)
      if (Number(result) === 1) return json({ error: 'Room is full (8 players)' }, 409)
      return json({ code, hostId: await redis.get(hostKey) })
    }
    if (action === 'leave') {
      const host = await redis.get<string>(hostKey)
      if (host === playerId) {
        await redis.del(hostKey, membersKey)
      } else {
        await redis.srem(membersKey, playerId)
      }
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('Multiplayer room failed', error)
    return json({ error: 'Room request failed' }, 500)
  }
}
