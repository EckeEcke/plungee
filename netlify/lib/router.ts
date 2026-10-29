import { adminClearFirstClear, adminClearName, adminDeleteTime, adminLevels, adminTimes, adminWeeks } from './adminBoards'
import { ApiError } from './errors'
import {
  adminLevel,
  adminPending,
  adminReview,
  getTimes,
  levelGhosts,
  listLevels,
  requireAdmin,
  startLevel,
  submitTime,
  uploadLevel,
  type Ctx,
} from './levels'
import { weeklyBoard, weeklyInfo, weeklySubmit } from './weekly'

/** Level (≈ 30 KB) plus Replay (läuft in Lauflängen, selten mehr als ein paar KB) */
const MAX_BODY_CHARS = 200_000

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > MAX_BODY_CHARS) throw new ApiError(413, 'Request is too large')
  try {
    const v: unknown = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    /* fällt unten in den Fehler */
  }
  throw new ApiError(400, 'Invalid JSON')
}

function intParam(url: URL, name: string, fallback: number): number {
  const n = Number(url.searchParams.get(name))
  return Number.isFinite(n) && url.searchParams.has(name) ? Math.floor(n) : fallback
}

/** Alle Routen unter /api. Die Netlify-Function ruft nur diese Funktion auf, damit die Tests ohne Netlify laufen. */
export async function handle(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/'
    const route = `${req.method} ${path}`

    switch (route) {
      case 'GET /levels': {
        const sort = url.searchParams.get('sort') === 'plays' ? 'plays' : 'new'
        const res = await listLevels(ctx, sort, intParam(url, 'offset', 0), intParam(url, 'limit', 20))
        // Nur das CDN darf die Liste kurz zwischenspeichern (spart Datenbank-Befehle), der Browser nicht
        return json(res, 200, {
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-cdn-cache-control': 'public, s-maxage=30, stale-while-revalidate=120',
        })
      }
      case 'POST /start':
        return json(await startLevel(ctx, await readBody(req)))
      case 'POST /upload':
        return json(await uploadLevel(ctx, await readBody(req)), 201)
      case 'POST /time':
        return json(await submitTime(ctx, await readBody(req)))
      case 'GET /times':
        return json(await getTimes(ctx, url.searchParams.get('id'), url.searchParams.get('player')))
      case 'GET /ghosts':
        return json(await levelGhosts(ctx, url.searchParams.get('id'), url.searchParams.get('player')))
      case 'GET /weekly': {
        // Level und Zeitraum sind für alle gleich: das CDN darf sie kurz zwischenspeichern
        return json(await weeklyInfo(ctx), 200, {
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-cdn-cache-control': 'public, s-maxage=30, stale-while-revalidate=120',
        })
      }
      case 'GET /weekly/board':
        return json(await weeklyBoard(ctx, url.searchParams.get('player')))
      case 'POST /weekly/time':
        return json(await weeklySubmit(ctx, await readBody(req)))
      case 'GET /admin/pending':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminPending(ctx))
      case 'GET /admin/level':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminLevel(ctx, url.searchParams.get('id')))
      case 'POST /admin/review':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminReview(ctx, await readBody(req)))
      case 'GET /admin/levels':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminLevels(ctx, intParam(url, 'offset', 0), intParam(url, 'limit', 50)))
      case 'GET /admin/weeks':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(adminWeeks(ctx))
      case 'GET /admin/times':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminTimes(ctx, url.searchParams.get('target')))
      case 'POST /admin/time/delete':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminDeleteTime(ctx, await readBody(req)))
      case 'POST /admin/firstclear/clear':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminClearFirstClear(ctx, await readBody(req)))
      case 'POST /admin/name/clear':
        await requireAdmin(ctx, req.headers.get('x-admin-token'))
        return json(await adminClearName(ctx, await readBody(req)))
    }
    const known = ['/ghosts', '/weekly', '/weekly/board', '/weekly/time', '/levels', '/start', '/upload', '/time', '/times', '/admin/pending', '/admin/level', '/admin/review', '/admin/levels', '/admin/weeks', '/admin/times', '/admin/time/delete', '/admin/name/clear', '/admin/firstclear/clear']
    return known.includes(path) ? json({ error: 'Method not allowed' }, 405) : json({ error: 'Not found' }, 404)
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'Internal error' }, 500)
  }
}