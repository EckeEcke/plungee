import { createHmac } from 'node:crypto'
import { Redis } from '@upstash/redis'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const ROOM = /^presence-plungee-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/
const ID = /^[a-f0-9-]{36}$/i

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const key = process.env.APINATOR_KEY ?? process.env.VITE_APINATOR_KEY
  const secret = process.env.APINATOR_SECRET
  if (!key || !secret) return json({ error: 'Apinator not configured' }, 500)
  try {
    const data = await request.json() as Record<string, unknown>
    const socket = data.socket_id
    const channel = data.channel_name
    const url = new URL(request.url)
    const id = url.searchParams.get('player_id')
    if (typeof socket !== 'string' || !/^[0-9]+\.[0-9]+$/.test(socket) || typeof channel !== 'string' || !ROOM.test(channel) || typeof id !== 'string' || !ID.test(id)) return json({ error: 'Invalid auth request' }, 400)
    const code = channel.slice('presence-plungee-'.length)
    const redis = Redis.fromEnv()
    const host = await redis.get<string>(`plungee:room:${code}:host`)
    if (!host) return json({ error: 'Room expired' }, 404)
    const member = await redis.sismember(`plungee:room:${code}:members`, id)
    if (!member) return json({ error: 'Join room first' }, 403)
    const name = (url.searchParams.get('name') ?? 'Guest').trim().slice(0, 16)
    const rawLook = url.searchParams.get('look')
    const l = rawLook && rawLook.length < 512 ? JSON.parse(rawLook) as Record<string, unknown> : {}
    const safe = (v: unknown, options: string[], fallback: string) => typeof v === 'string' && options.includes(v) ? v : fallback
    const look = {
      color: safe(l.color, ['pink','orange','lime','green','blue','purple'], 'pink'),
      eyes: safe(l.eyes, ['round','big','small','sleepy','lashes'], 'round'),
      pattern: safe(l.pattern, ['none','stripes','dots','checks','stars','hearts'], 'none'),
      patternColor: safe(l.patternColor, ['white','ink','yellow','rose','mint','sky','orange'], 'white'),
    }
    const channel_data = JSON.stringify({ user_id: id, user_info: { name: name || 'Guest', look, host: host === id } })
    const signature = createHmac('sha256', secret).update(`${socket}:${channel}:${channel_data}`).digest('hex')
    return json({ auth: `${key}:${signature}`, channel_data })
  } catch (error) {
    console.error('Apinator auth failed', error)
    return json({ error: 'Authorization failed' }, 500)
  }
}
