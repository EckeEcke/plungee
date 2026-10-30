import { createHmac, randomBytes } from 'node:crypto'

// Stateless room creation: the host owns the lobby in their browser.
// This endpoint does not save membership or match data.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ID = /^[a-f0-9-]{36}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = process.env.APINATOR_SECRET
  if (!secret) return json({ error: 'Apinator is not configured' }, 500)
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action !== 'create' || typeof body.playerId !== 'string' || !ID.test(body.playerId)) {
      return json({ error: 'Invalid room request' }, 400)
    }
    const code = Array.from(randomBytes(5), n => ALPHABET[n % ALPHABET.length]).join('')
    const expires = Date.now() + 2 * 60 * 60 * 1000
    const payload = `${code}.${body.playerId}.${expires}`
    const signature = createHmac('sha256', secret).update(payload).digest('hex')
    return json({ code, hostToken: `${payload}.${signature}` })
  } catch {
    return json({ error: 'Could not create room' }, 400)
  }
}
