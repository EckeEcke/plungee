import { Apinator, type PresenceChannel } from '@apinator/client'
import type { Look } from '../game/look'

export interface LobbyPlayer { id: string; name: string; look: Look; host: boolean }
export type LobbyDifficulty = 'all' | 'easy' | 'medium' | 'hard'
export type LobbyRounds = 3 | 5 | 10 | 15
export interface MatchSettings { rounds: LobbyRounds; difficulty: LobbyDifficulty }
export interface RaceResult { ticks: number; deaths: number; replay: string; finished: boolean }
export interface MatchRound {
  number: number
  levelKey: string
  startAt: number
  /** Host-coordinated replay countdown; null if there is no completed run. */
  replayAt: number | null
  playerIds: string[]
  results: Record<string, RaceResult>
}
export interface MatchState {
  settings: MatchSettings
  readyIds: string[]
  started: boolean
  revision: number
  round: MatchRound | null
}

/** Messages go ONLY over the Apinator presence channel, never via Redis or HTTP polling. */
export type LobbyEvent =
  | { kind: 'sync-request' }
  | { kind: 'state'; state: MatchState }
  | { kind: 'ready'; playerId: string; ready: boolean }
  | { kind: 'finish'; playerId: string; replay: string; round: number }
  | { kind: 'result'; playerId: string; round: number; result: RaceResult }

export interface LobbySession {
  send(message: LobbyEvent): void
  close(): void
}

export async function createRoom(playerId: string): Promise<{ code: string; hostToken: string }> {
  const response = await fetch('/.netlify/functions/multiplayer-room', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', playerId }),
  })
  const data = await response.json() as { code?: string; hostToken?: string; error?: string }
  if (!response.ok || !data.code || !data.hostToken) {
    throw new Error(data.error || 'Room creation failed')
  }
  return { code: data.code, hostToken: data.hostToken }
}

export function connectLobby(
  code: string,
  playerId: string,
  name: string,
  look: Look,
  hostToken: string | null,
  onPlayers: (players: LobbyPlayer[]) => void,
  onStatus: (status: string) => void,
  onEvent: (event: LobbyEvent) => void,
): LobbySession {
  const appKey = import.meta.env.VITE_APINATOR_KEY
  if (!appKey) throw new Error('VITE_APINATOR_KEY is missing')
  const cluster = import.meta.env.VITE_APINATOR_CLUSTER || 'eu'
  const params = new URLSearchParams({ player_id: playerId, name, look: JSON.stringify(look) })
  if (hostToken) params.set('host_token', hostToken)
  const connection = new Apinator({
    appKey, cluster,
    authEndpoint: `/.netlify/functions/apinator-auth?${params.toString()}`,
  })
  const channel = connection.subscribe(`presence-plungee-${code}`) as PresenceChannel
  let active = true
  const refresh = () => {
    if (!active) return
    onPlayers(channel.getMembers().map(member => ({
      id: String(member.user_id),
      name: String(member.user_info?.name ?? 'Guest'),
      look: member.user_info?.look as Look,
      host: member.user_info?.host === true,
    })))
  }

  channel.bind('realtime:subscription_succeeded', () => {
    onStatus('connected')
    refresh()
    // Late joiners ask the host for the authoritative match state.
    if (active && !hostToken && channel.subscribed) channel.trigger('client-plungee', { kind: 'sync-request' })
  })
  channel.bind('realtime:member_added', refresh)
  channel.bind('realtime:member_removed', refresh)
  channel.bind('realtime:subscription_error', (data: unknown) => {
    const err = data as { error?: string } | null
    onStatus(err?.error || 'Could not join room')
  })
  channel.bind('client-plungee', (data: unknown) => {
    if (!active || !data || typeof data !== 'object' || !('kind' in data)) return
    const kind = (data as { kind?: unknown }).kind
    if (kind === 'sync-request' || kind === 'state' || kind === 'ready' || kind === 'finish' || kind === 'result') {
      onEvent(data as LobbyEvent)
    }
  })
  connection.bind('state_change', (data: unknown) => {
    if (active && data && typeof data === 'object' && 'current' in data && typeof data.current === 'string') {
      onStatus(data.current)
    }
  })
  connection.bind('realtime:error', (data: unknown) => {
    const err = data as { message?: string } | null
    if (active) onStatus(err?.message || 'Apinator connection error')
  })
  connection.connect()

  return {
    send(message) {
      if (!active || !channel.subscribed) throw new Error('Lobby is not connected')
      channel.trigger('client-plungee', message)
    },
    close() {
      active = false
      connection.disconnect()
    },
  }
}
