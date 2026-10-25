import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBoard, fetchWeeklyBoard, submitWeeklyTime, loadName, OnlineError, playerId, saveName, startOnlineLevel, submitTime, uploadLevel } from '../src/online/api'

const store = new Map<string, string>()
const calls: Array<{ url: string; init: RequestInit }> = []

beforeEach(() => {
  store.clear()
  calls.length = 0
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
})
afterEach(() => vi.unstubAllGlobals())

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return { ok: status < 400, status, json: async () => body }
  })
}

describe('Online-Client', () => {
  it('Spieler-ID wird einmal erzeugt, gespeichert und hat ein gültiges Format', () => {
    const a = playerId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
    expect(playerId()).toBe(a)
  })

  it('Name wird gespeichert und auf 16 Zeichen gekürzt', () => {
    saveName('x'.repeat(30))
    expect(loadName()).toHaveLength(16)
  })

  it('submitTime sendet ID, Replay und Namen als POST', async () => {
    saveName('Chris')
    mockFetch(200, { ticks: 600, improved: true, total: 1, rank: 1, top: [] })
    const res = await submitTime('abc12345', 'N30R10')
    expect(res.improved).toBe(true)
    expect(calls[0].url).toBe('/api/time')
    expect(calls[0].init.method).toBe('POST')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({ id: 'abc12345', replay: 'N30R10', name: 'Chris', playerId: playerId() })
  })

  it('ohne Namen wird kein name gesendet', async () => {
    mockFetch(200, { ticks: 1, improved: false, total: 1, rank: 1, top: [] })
    await submitTime('abc12345', 'N1')
    expect(JSON.parse(String(calls[0].init.body)).name).toBeUndefined()
  })

  it('Fehlermeldung des Servers kommt als OnlineError an', async () => {
    mockFetch(409, { error: 'This level was already uploaded' })
    await expect(uploadLevel('Titel', { v: 1, size: 'short', tiles: [], entities: [] } as never, 'N1')).rejects.toMatchObject({
      message: 'This level was already uploaded',
      status: 409,
    })
  })

  it('Weekly: Zeit geht an /api/weekly/time, Rangliste fragt mit der eigenen ID', async () => {
    mockFetch(200, { ticks: 1, improved: true, total: 1, rank: 1, top: [] })
    await submitWeeklyTime('N30R10')
    expect(calls[0].url).toBe('/api/weekly/time')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ replay: 'N30R10', playerId: playerId() })
    calls.length = 0
    mockFetch(200, { week: '2026-10-26', total: 0, rank: null, top: [], lastWeek: null })
    await fetchWeeklyBoard()
    expect(calls[0].url).toBe(`/api/weekly/board?player=${playerId()}`)
  })

  it('fehlende Verbindung und Nicht-JSON werden verständlich gemeldet', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fail')
    })
    await expect(fetchBoard('abc12345')).rejects.toBeInstanceOf(OnlineError)
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => Promise.reject(new Error('x')) }))
    await expect(startOnlineLevel('abc12345')).rejects.toThrow('Unexpected answer')
  })
})