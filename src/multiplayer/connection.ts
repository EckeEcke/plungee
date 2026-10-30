import { Apinator, type PresenceChannel } from '@apinator/client'
import type { Look } from '../game/look'

export interface LobbyPlayer { id: string; name: string; look: Look; host: boolean }
export interface LobbySession {
  close(): void
}

export async function roomRequest(action: 'create' | 'join' | 'leave', playerId: string, code?: string): Promise<{ code?: string; hostId?: string }> {
  const response = await fetch('/.netlify/functions/multiplayer-room', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, code, playerId }),
  })
  const data = await response.json() as { code?: string; hostId?: string; error?: string }
  if (!response.ok) throw new Error(data.error || 'Room request failed')
  return data
}

export function connectLobby(code: string, playerId: string, name: string, look: Look, onPlayers: (players: LobbyPlayer[]) => void, onStatus: (status: string) => void): LobbySession {
  const appKey = import.meta.env.VITE_APINATOR_KEY
  if (!appKey) throw new Error('VITE_APINATOR_KEY is missing')
  const cluster = import.meta.env.VITE_APINATOR_CLUSTER || 'us'
  const connection = new Apinator({
    appKey, cluster,
    authEndpoint: `/.netlify/functions/apinator-auth?player_id=${encodeURIComponent(playerId)}&name=${encodeURIComponent(name)}&look=${encodeURIComponent(JSON.stringify(look))}`,
  })
  connection.bind('state_change', (data: unknown) => {
    if (
      typeof data === 'object' &&
      data !== null &&
      'current' in data &&
      typeof data.current === 'string'
    ) {
      onStatus(data.current)
    }
  })  
  connection.connect()
  const channel = connection.subscribe(`presence-plungee-${code}`) as PresenceChannel
  const refresh = () => {
    onPlayers(channel.getMembers().map(member => ({
      id: String(member.user_id),
      name: String(member.user_info?.name ?? 'Guest'),
      look: member.user_info?.look as Look,
      host: member.user_info?.host === true,
    })))
  }
  channel.bind('realtime:subscription_succeeded', () => { onStatus('connected'); refresh() })
  channel.bind('realtime:member_added', refresh)
  channel.bind('realtime:member_removed', refresh)
  channel.bind('realtime:subscription_error', (e: unknown) => onStatus(`error: ${JSON.stringify(e)}`))
  return { close: () => connection.disconnect() }
}
