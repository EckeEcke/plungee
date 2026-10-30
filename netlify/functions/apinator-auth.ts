import { createHmac, timingSafeEqual } from 'node:crypto'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})
const ROOM = /^presence-plungee-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/
const ID = /^[a-f0-9-]{36}$/i

function validHostToken(token: string | null, code: string, playerId: string, secret: string): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 4) return false
  const [tokenCode, tokenId, until, signature] = parts
  if (tokenCode !== code || tokenId !== playerId || !until || !signature || !/^\d+$/.test(until)) return false
  const expires = Number(until)
  if (!Number.isSafeInteger(expires) || expires < Date.now()) return false
  const expected = createHmac('sha256', secret).update(`${tokenCode}.${tokenId}.${until}`).digest()
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const key = process.env.APINATOR_KEY ?? process.env.VITE_APINATOR_KEY
  const secret = process.env.APINATOR_SECRET
  if (!key || !secret) return json({ error: 'Apinator is not configured' }, 500)
  try {
    const data = await request.json() as Record<string, unknown>
    const socket = data.socket_id
    const channel = data.channel_name
    const url = new URL(request.url)
    const id = url.searchParams.get('player_id')
    if (typeof socket !== 'string' || !socket.trim() || typeof channel !== 'string' || !ROOM.test(channel) || !id || !ID.test(id)) {
      return json({ error: 'Invalid auth request' }, 400)
    }
    const code = channel.slice('presence-plungee-'.length)
    const host = validHostToken(url.searchParams.get('host_token'), code, id, secret)
    const name = (url.searchParams.get('name') ?? 'Guest').trim().slice(0, 16)
    const rawLook = url.searchParams.get('look')
    const l = rawLook && rawLook.length < 512 ? JSON.parse(rawLook) as Record<string, unknown> : {}
    const safe = (v: unknown, options: string[], fallback: string) =>
      typeof v === 'string' && options.includes(v) ? v : fallback
    const look = {
      color: safe(l.color, ['pink', 'orange', 'lime', 'green', 'blue', 'purple'], 'pink'),
      eyes: safe(l.eyes, ['round', 'big', 'small', 'sleepy', 'lashes'], 'round'),
      pattern: safe(l.pattern, ['none', 'stripes', 'dots', 'checks', 'stars', 'hearts'], 'none'),
      patternColor: safe(l.patternColor, ['white', 'ink', 'yellow', 'rose', 'mint', 'sky', 'orange'], 'white'),
    }
    const channel_data = JSON.stringify({ user_id: id, user_info: { name: name || 'Guest', look, host } })
    const signature = createHmac('sha256', secret).update(`${socket}:${channel}:${channel_data}`).digest('hex')
    return json({ auth: `${key}:${signature}`, channel_data })
  } catch (error) {
    console.error('Apinator auth failed', error)
    return json({ error: 'Authorization failed' }, 500)
  }
}
