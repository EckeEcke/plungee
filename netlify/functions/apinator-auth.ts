
import { createHmac } from 'node:crypto'
import { Redis } from '@upstash/redis'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })

const ROOM = /^presence-plungee-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/
const ID = /^[a-f0-9-]{36}$/i

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const key = process.env.APINATOR_KEY ?? process.env.VITE_APINATOR_KEY
  const secret = process.env.APINATOR_SECRET

  if (!key || !secret) {
    return json({ error: 'Apinator not configured' }, 500)
  }

  try {
    const data = await request.json() as Record<string, unknown>
    const socket = data.socket_id
    const channel = data.channel_name

    const url = new URL(request.url)
    const id = url.searchParams.get('player_id')

    // Temporäre Diagnose für HTTP 400
    const invalid = {
      socket:
        typeof socket !== 'string' ||
        socket.length === 0,

      channel:
        typeof channel !== 'string' ||
        !ROOM.test(channel),

      id:
        typeof id !== 'string' ||
        !ID.test(id),
    }

    if (Object.values(invalid).some(Boolean)) {
      console.error('Invalid Apinator auth request', invalid)

      return json({
        error: 'Invalid auth request',
        invalid,
      }, 400)
    }

    // Ab hier sind die benötigten Werte validiert
    const socketId = socket as string
    const channelName = channel as string
    const playerId = id as string

    const code = channelName.slice('presence-plungee-'.length)

    const redis = Redis.fromEnv()

    const host = await redis.get<string>(
      `plungee:room:${code}:host`,
    )

    if (!host) {
      return json({ error: 'Room expired' }, 404)
    }

    const member = await redis.sismember(
      `plungee:room:${code}:members`,
      playerId,
    )

    if (!member) {
      return json({ error: 'Join room first' }, 403)
    }

    const name = (url.searchParams.get('name') ?? 'Guest')
      .trim()
      .slice(0, 16)

    const rawLook = url.searchParams.get('look')

    const l =
      rawLook && rawLook.length < 512
        ? JSON.parse(rawLook) as Record<string, unknown>
        : {}

    const safe = (
      value: unknown,
      options: string[],
      fallback: string,
    ) =>
      typeof value === 'string' && options.includes(value)
        ? value
        : fallback

    const look = {
      color: safe(
        l.color,
        ['pink', 'orange', 'lime', 'green', 'blue', 'purple'],
        'pink',
      ),
      eyes: safe(
        l.eyes,
        ['round', 'big', 'small', 'sleepy', 'lashes'],
        'round',
      ),
      pattern: safe(
        l.pattern,
        ['none', 'stripes', 'dots', 'checks', 'stars', 'hearts'],
        'none',
      ),
      patternColor: safe(
        l.patternColor,
        ['white', 'ink', 'yellow', 'rose', 'mint', 'sky', 'orange'],
        'white',
      ),
    }

    const channel_data = JSON.stringify({
      user_id: playerId,
      user_info: {
        name: name || 'Guest',
        look,
        host: host === playerId,
      },
    })

    const signature = createHmac('sha256', secret)
      .update(`${socketId}:${channelName}:${channel_data}`)
      .digest('hex')

    return json({
      auth: `${key}:${signature}`,
      channel_data,
    })
  } catch (error) {
    console.error('Apinator auth failed', error)

    return json({
      error: 'Authorization failed',
    }, 500)
  }
}
