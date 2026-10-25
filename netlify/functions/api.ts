import { getDb, type Db } from '../lib/db'
import { handle } from '../lib/router'

/**
 * Eine Function für die ganze API unter /api/*. Umgebungsvariablen (in Netlify eintragen):
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  – Datenbank
 *   ADMIN                                              – geheimes Token für die Freigabe
 */
export default async (req: Request, context: { ip?: string }): Promise<Response> => {
  let db: Db
  try {
    db = getDb()
  } catch {
    return new Response(JSON.stringify({ error: 'Server is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  return handle(req, {
    db,
    now: Date.now,
    ip: context.ip ?? req.headers.get('x-nf-client-connection-ip') ?? 'unknown',
    adminToken: process.env.ADMIN,
  })
}

export const config = { path: '/api/*' }
