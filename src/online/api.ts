import type { LevelData } from '../sim'
import { nameProblem } from './nameFilter'

export { nameProblem }

/** Antworten der Netlify-API (siehe netlify/lib/levels.ts) */
export interface OnlineMeta {
  id: string
  title: string
  author: string
  size: string
  createdAt: number
  plays: number
  /** Wer das Level als Erster geschafft hat (ohne den Ersteller); null, solange es niemand geschafft hat */
  firstClear?: { name: string; at: number } | null
}

export interface BoardRow {
  rank: number
  name: string
  ticks: number
  you: boolean
}

export interface Board {
  total: number
  /** Eigener Platz (1-basiert) oder null, wenn noch keine Zeit */
  rank: number | null
  top: BoardRow[]
}

/** Bestzeiten im Ergebnis-Fenster eines Community-Levels */
export interface BoardState {
  /** needsName: Zeit ist noch nicht gesendet, der Spieler wählt erst Name oder anonym */
  status: 'loading' | 'ok' | 'error' | 'needsName'
  error?: string
  improved?: boolean
  /** Der Server hat den Namen abgelehnt */
  nameRejected?: boolean
  /** Der Spieler hat das Level als Erster geschafft */
  firstClear?: boolean
  board?: Board
}

/** nameRejected: der Server hat den Namen abgelehnt (die Zeit zählt trotzdem) */
export type SubmitResult = Board & { ticks: number; improved: boolean; nameRejected?: boolean; firstClear?: boolean }
export type LevelSort = 'new' | 'plays'

export class OnlineError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

// --- Spieler-ID und Name -------------------------------------------------------------

const PID_KEY = 'plungee:player'
const NAME_KEY = 'plungee:name'
let memoryPid = ''

function randomId(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** Zufällige ID pro Browser. Sie bleibt geheim: der Server zeigt sie nie an. */
export function playerId(): string {
  try {
    const saved = localStorage.getItem(PID_KEY)
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved
    const fresh = randomId()
    localStorage.setItem(PID_KEY, fresh)
    return fresh
  } catch {
    return memoryPid || (memoryPid = randomId())
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Speichert den Namen. Ein gesperrter Name wird nicht gespeichert (false), damit er nie gesendet wird. */
export function saveName(name: string): boolean {
  if (nameProblem(name)) return false
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 16))
  } catch {
    /* nicht kritisch */
  }
  return true
}

// --- Aufrufe -------------------------------------------------------------------------

async function call<T>(path: string, init?: { body?: unknown; headers?: Record<string, string> }): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method: init?.body === undefined ? 'GET' : 'POST',
      headers: { ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new OnlineError('No connection to the server', 0)
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* kein JSON, z. B. beim lokalen Start ohne Netlify */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new OnlineError(msg ?? `Server error (${res.status})`, res.status)
  }
  if (data === null) throw new OnlineError('Unexpected answer from the server', res.status)
  return data as T
}

const nameOrUndefined = (): string | undefined => {
  const n = loadName().trim()
  return n && !nameProblem(n) ? n : undefined
}

export const fetchLevels = (sort: LevelSort, offset = 0, limit = 20) =>
  call<{ levels: OnlineMeta[]; total: number }>(`/levels?sort=${sort}&offset=${offset}&limit=${limit}`)

/** Lädt ein Level zum Spielen; der Server zählt den Start (einmal pro Spieler und Stunde) */
export const startOnlineLevel = (id: string) =>
  call<{ meta: OnlineMeta; data: LevelData }>('/start', { body: { id, playerId: playerId() } })

export const submitTime = (id: string, replay: string) =>
  call<SubmitResult>('/time', { body: { id, replay, playerId: playerId(), name: nameOrUndefined() } })

export interface GhostEntry {
  rank: number
  name: string
  ticks: number
  replay: string
  /** Der eigene Eintrag */
  you: boolean
}

/** Replays der Top 5 eines Community-Levels (für Ghosts) */
export const fetchGhosts = (id: string) =>
  call<{ entries: GhostEntry[] }>(`/ghosts?id=${encodeURIComponent(id)}&player=${playerId()}`)

export const fetchBoard = (id: string) => call<Board>(`/times?id=${encodeURIComponent(id)}&player=${playerId()}`)

export const uploadLevel = (title: string, data: LevelData, replay: string) =>
  call<{ id: string; status: 'pending' }>('/upload', {
    body: { title, author: nameOrUndefined(), data, replay, playerId: playerId() },
  })

// --- Weekly Challenge ----------------------------------------------------------------

export interface WeeklyInfo {
  /** Datum des Montags, z. B. 2026-10-26 */
  week: string
  startsAt: number
  endsAt: number
  key: string
  title: string
  data: LevelData
}

export interface LastWeek extends Board {
  week: string
  title: string | null
}

export type WeeklyBoard = Board & { week: string; lastWeek: LastWeek | null }

export const fetchWeekly = () => call<WeeklyInfo>('/weekly')

export const fetchWeeklyBoard = () => call<WeeklyBoard>(`/weekly/board?player=${playerId()}`)

export const submitWeeklyTime = (replay: string) =>
  call<SubmitResult>('/weekly/time', { body: { replay, playerId: playerId(), name: nameOrUndefined() } })

// --- Admin ---------------------------------------------------------------------------

export interface PendingMeta extends OnlineMeta {
  status: string
}

const adminHeaders = (token: string) => ({ 'x-admin-token': token })

export const adminPending = (token: string) =>
  call<{ levels: PendingMeta[] }>('/admin/pending', { headers: adminHeaders(token) })

export const adminLevel = (token: string, id: string) =>
  call<{ meta: PendingMeta; data: LevelData }>(`/admin/level?id=${encodeURIComponent(id)}`, {
    headers: adminHeaders(token),
  })

export const adminReview = (token: string, id: string, action: 'approve' | 'reject' | 'delete') =>
  call<{ id: string; status: string }>('/admin/review', { body: { id, action }, headers: adminHeaders(token) })

export interface AdminLevelRow extends OnlineMeta {
  flagged: boolean
}

export interface AdminTimeRow {
  rank: number
  playerId: string
  name: string
  ticks: number
  hasReplay: boolean
  flagged: boolean
}

export const adminLevels = (token: string, offset = 0, limit = 50) =>
  call<{ levels: AdminLevelRow[]; total: number }>(`/admin/levels?offset=${offset}&limit=${limit}`, {
    headers: adminHeaders(token),
  })

export const adminWeeks = (token: string) => call<{ weeks: string[] }>('/admin/weeks', { headers: adminHeaders(token) })

/** target: "level:{id}" oder "week:{montag}" */
export const adminTimes = (token: string, target: string) =>
  call<{ total: number; entries: AdminTimeRow[] }>(`/admin/times?target=${encodeURIComponent(target)}`, {
    headers: adminHeaders(token),
  })

export const adminDeleteTime = (token: string, target: string, playerId: string, clearName: boolean) =>
  call<{ deleted: true }>('/admin/time/delete', { body: { target, playerId, clearName }, headers: adminHeaders(token) })

export const adminClearName = (token: string, playerId: string) =>
  call<{ cleared: true }>('/admin/name/clear', { body: { playerId }, headers: adminHeaders(token) })

export const adminClearFirstClear = (token: string, id: string) =>
  call<{ cleared: true }>('/admin/firstclear/clear', { body: { id }, headers: adminHeaders(token) })