<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import PageShell from './PageShell.vue'
import GameView from './GameView.vue'
import RaceView from './RaceView.vue'
import type { GhostSpec } from '../game/ghost'
import { LEVELS } from '../levels'
import { compileLevel, decodeInputs, formatTicks, simulate } from '../sim'
import { addRoundTotals, compareTotals, roundPoints } from '../multiplayer/scoring'
import CharacterCanvas from './CharacterCanvas.vue'
import { applyLook, look, sanitizeLook, type Look } from '../game/look'
import type { Theme } from '../game/theme'
import { loadName, type WeeklyRace } from '../online/api'
import {
  connectLobby, createRoom,
  type LobbyPlayer, type LobbySession, type LobbyEvent,
  type MatchState, type MatchSettings, type RaceResult,
  type LobbyDifficulty, type LobbyRounds,
} from '../multiplayer/connection'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: []; editCharacter: [] }>()
const name = ref(loadName() || 'Guest')
const invitedCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? ''
const hasInvite = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(invitedCode)
const codeInput = ref(invitedCode)
const room = ref('')
const players = ref<LobbyPlayer[]>([])
const status = ref('idle')
const error = ref('')
const busy = ref(false)
const copied = ref(false)
const playerId = crypto.randomUUID()
let session: LobbySession | null = null

const emptyMatch = (): MatchState => ({
  settings: { rounds: 5, difficulty: 'all' }, readyIds: [],
  started: false, revision: 0, round: null,
  totals: {}, playedLevels: [], completed: false,
})
const match = ref<MatchState>(emptyMatch())
const namesById = ref<Record<string, string>>({})
const looksById = ref<Record<string, Look>>({})
const showResults = ref(false)
const pendingReplay = ref<string | null>(null)
const raceLevel = computed(() => LEVELS.find(l => l.key === match.value.round?.levelKey))
const allFinished = computed(() => {
  const r = match.value.round
  return !!r && r.playerIds.length > 0 && r.playerIds.every(id => !!r.results[id])
})
const currentPoints = computed(() => match.value.round && allFinished.value
  ? roundPoints(match.value.round) : {})
const cumulativeTotals = computed(() => {
  const r = match.value.round
  return r && allFinished.value && !match.value.completed
    ? addRoundTotals(match.value.totals, r)
    : match.value.totals
})
const overallStandings = computed(() => Object.entries(cumulativeTotals.value)
  .map(([id, totals]) => ({
    id, totals,
    name: namesById.value[id] ?? (id === playerId ? name.value : 'Player'),
  }))
  .sort((a, b) => compareTotals(a.totals, b.totals) || a.name.localeCompare(b.name)))
const isFinalRound = computed(() => (match.value.round?.number ?? 0) >= match.value.settings.rounds)
const standings = computed(() => {
  const r = match.value.round
  if (!r) return []
  return r.playerIds.map(id => ({ id, name: namesById.value[id] ?? (id === playerId ? name.value : 'Player'), result: r.results[id] }))
    .sort((a, b) => {
      const ta = a.result?.finished ? a.result.ticks : Infinity
      const tb = b.result?.finished ? b.result.ticks : Infinity
      return ta - tb || (a.result?.deaths ?? Infinity) - (b.result?.deaths ?? Infinity)
    })
})
/** Replays are delivered individually by the host, not in the compact state. */
const replayEntries = computed(() => {
  const round = match.value.round
  if (!round || !allFinished.value || round.replayAt === null) return null
  const completed = standings.value.filter(entry => entry.result?.finished)
  if (!completed.length || completed.some(entry => !entry.result?.replay)) return null
  return completed.map((entry, index) => ({
    id: entry.id,
    rank: index + 1,
    name: entry.name,
    ticks: entry.result!.ticks,
    replay: entry.result!.replay,
    you: entry.id === playerId,
  }))
})
const replayRace = computed<WeeklyRace | null>(() => {
  const entries = replayEntries.value
  const level = raceLevel.value
  if (!entries || !level) return null
  return { week: room.value, title: level.title, data: level.data, entries }
})
const replayGhosts = computed<GhostSpec[]>(() => replayEntries.value?.map(entry => ({
  replay: entry.replay,
  label: entry.name,
  look: sanitizeLook(looksById.value[entry.id]),
  solid: true,
})) ?? [])
const isHost = computed(() => players.value.some(p => p.id === playerId && p.host))
const isReady = computed(() => match.value.readyIds.includes(playerId))
const canStart = computed(() =>
  isHost.value && status.value === 'connected' && players.value.length >= 2 &&
  players.value.filter(p => !p.host).every(p => match.value.readyIds.includes(p.id)) &&
  !match.value.started,
)
const myColors = computed(() => applyLook(props.theme, look))
const occupants = computed(() => players.value.slice(0, 8).map((p, index) => ({
  ...p, safeLook: sanitizeLook(p.look), index,
})))
function colorsFor(player: LobbyPlayer): Theme { return applyLook(props.theme, sanitizeLook(player.look)) }

// Match state lives in the HOST BROWSER. Apinator carries only messages.
// Snapshots exclude replay payloads so no event exceeds Apinator's message limit.
function publicState(): MatchState {
  const r = match.value.round
  return {
    ...match.value,
    readyIds: [...match.value.readyIds],
    playedLevels: [...match.value.playedLevels],
    totals: Object.fromEntries(Object.entries(match.value.totals).map(([id, total]) => [id, { ...total }])),
    round: r ? {
      ...r, playerIds: [...r.playerIds],
      results: Object.fromEntries(Object.entries(r.results).map(([id, result]) => [id, { ...result, replay: '' }])),
    } : null,
  }
}
function broadcast(): void {
  if (!session || !isHost.value || status.value !== 'connected') return
  try { session.send({ kind: 'state', state: publicState() }) }
  catch (e) { error.value = e instanceof Error ? e.message : 'Could not send lobby state' }
}
function commit(): void {
  match.value = { ...match.value, revision: match.value.revision + 1 }
  broadcast()
}
function restoreState(next: MatchState): void {
  if (!next || !Number.isSafeInteger(next.revision) || next.revision < match.value.revision ||
      !next.settings || ![3, 5, 10, 15].includes(next.settings.rounds) ||
      !['all', 'easy', 'medium', 'hard'].includes(next.settings.difficulty) ||
      !next.totals || !Array.isArray(next.playedLevels) || typeof next.completed !== 'boolean') return
  // Retain previously delivered individual replay events only within the same round.
  const prior = match.value.round
  if (next.round?.number !== prior?.number) {
    showResults.value = false
    pendingReplay.value = null
  }
  if (next.round && prior?.number === next.round.number && prior.levelKey === next.round.levelKey) {
    next = {
      ...next, round: {
        ...next.round,
        results: Object.fromEntries(Object.entries(next.round.results).map(([id, result]) =>
          [id, { ...result, replay: prior.results[id]?.replay || result.replay }]),
        ),
      },
    }
  }
  match.value = next
  if (next.started && next.round && !next.round.playerIds.includes(playerId)) {
    resetLobby('Match already started')
    return
  }
  if (pendingReplay.value && next.round && !next.round.results[playerId] && !isHost.value) {
    sendFinish(pendingReplay.value)
  }
  if (next.round?.results[playerId]) pendingReplay.value = null
}

function receiveResult(message: Extract<LobbyEvent, { kind: 'result' }>): void {
  const round = match.value.round
  if (!round || round.number !== message.round || !round.playerIds.includes(message.playerId) ||
      !message.result || typeof message.result.ticks !== 'number' ||
      typeof message.result.deaths !== 'number' || typeof message.result.replay !== 'string') return
  match.value = {
    ...match.value,
    round: { ...round, results: { ...round.results, [message.playerId]: message.result } },
  }
  if (message.playerId === playerId) pendingReplay.value = null
}

function recordFinish(id: string, replay: string, roundNumber: number): void {
  if (!isHost.value || typeof replay !== 'string' || !replay || replay.length > 100_000) return
  const r = match.value.round
  if (!r || r.number !== roundNumber || !r.playerIds.includes(id) || r.results[id]) return
  const level = LEVELS.find(l => l.key === r.levelKey)
  if (!level) return
  let result: RaceResult
  try {
    const run = simulate(compileLevel(level.data), decodeInputs(replay))
    if (!run.finished) return
    result = { ticks: run.ticks, deaths: run.deaths, replay, finished: true }
  } catch { return }
  const results = { ...r.results, [id]: result }
  const complete = r.playerIds.every(pid => !!results[pid])
  const replayAt = complete ? Date.now() + 2000 : r.replayAt
  match.value = { ...match.value, round: { ...r, results, replayAt } }
  try { session?.send({ kind: 'result', playerId: id, round: roundNumber, result }) }
  catch (e) { error.value = e instanceof Error ? e.message : 'Could not send race result' }
  commit()
  if (id === playerId) pendingReplay.value = null
}

function onMessage(message: LobbyEvent): void {
  if (message.kind === 'sync-request') {
    if (isHost.value) {
      broadcast()
      // Re-send individual recordings after a reconnect, not in a huge snapshot.
      const r = match.value.round
      if (r) for (const [id, result] of Object.entries(r.results)) {
        if (result.replay) {
          try { session?.send({ kind: 'result', playerId: id, round: r.number, result }) }
          catch { /* leave the compact results available */ }
        }
      }
    }
  } else if (message.kind === 'state') {
    if (!isHost.value && players.value.some(p => p.host)) restoreState(message.state)
  } else if (message.kind === 'ready') {
    if (!isHost.value || match.value.started || typeof message.ready !== 'boolean' ||
        !players.value.some(p => p.id === message.playerId && !p.host)) return
    const ready = new Set(match.value.readyIds)
    if (message.ready) ready.add(message.playerId)
    else ready.delete(message.playerId)
    match.value = { ...match.value, readyIds: [...ready] }
    commit()
  } else if (message.kind === 'finish') {
    recordFinish(message.playerId, message.replay, message.round)
  } else if (message.kind === 'result') {
    if (!isHost.value && players.value.some(p => p.host)) receiveResult(message)
  }
}

function resetLobby(reason: string): void {
  session?.close()
  session = null
  room.value = ''
  players.value = []
  match.value = emptyMatch()
  pendingReplay.value = null
  showResults.value = false
  status.value = 'idle'
  history.replaceState(null, '', location.pathname)
  error.value = reason
}

function onPlayers(next: LobbyPlayer[]): void {
  const previous = players.value.map(p => p.id).join(',')
  players.value = next.slice(0, 8)
  for (const p of players.value) {
    namesById.value[p.id] = p.name
    looksById.value[p.id] = sanitizeLook(p.look)
  }
  if (!players.value.some(p => p.id === playerId)) {
    resetLobby('Room is full (8 players)')
    return
  }
  if (!players.value.some(p => p.host)) {
    resetLobby('Room not found or host disconnected')
    return
  }
  if (isHost.value && previous !== players.value.map(p => p.id).join(',')) {
    const active = new Set(players.value.map(p => p.id))
    match.value = { ...match.value, readyIds: match.value.readyIds.filter(id => active.has(id)) }
    // Disconnects during a race count as unfinished results; the host owns the decision.
    const r = match.value.round
    if (r) {
      const results = { ...r.results }
      for (const id of r.playerIds) {
        if (!active.has(id) && !results[id]) results[id] = { ticks: 0, deaths: 0, replay: '', finished: false }
      }
      const complete = r.playerIds.every(id => !!results[id])
      const hasReplay = Object.values(results).some(result => result.finished)
      const replayAt = r.replayAt ?? (complete && hasReplay ? Date.now() + 2000 : null)
      match.value = { ...match.value, round: { ...r, results, replayAt } }
    }
    commit()
  }
}

async function enter(action: 'create' | 'join'): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const created = action === 'create' ? await createRoom(playerId) : null
    const code = created?.code ?? codeInput.value.trim().toUpperCase()
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(code)) throw new Error('Invalid room code')
    room.value = code
    match.value = emptyMatch()
    status.value = 'connecting'
    session = connectLobby(
      code, playerId, name.value.trim().slice(0, 16) || 'Guest', { ...look },
      created?.hostToken ?? null,
      onPlayers,
      s => {
        status.value = s
        if (s === 'connected' && isHost.value) broadcast()
        if (!['connected', 'connecting', 'initialized'].includes(s)) error.value = s
      },
      onMessage,
    )
    history.replaceState(null, '', `${location.pathname}?room=${code}`)
  } catch (e) {
    resetLobby(e instanceof Error ? e.message : 'Connection failed')
  } finally { busy.value = false }
}
async function leave(): Promise<void> {
  session?.close()
  session = null
  room.value = ''
  players.value = []
  pendingReplay.value = null
  showResults.value = false
  match.value = emptyMatch()
  history.replaceState(null, '', location.pathname)
  emit('exit')
}
async function copyInvite(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${room.value}`)
    copied.value = true
  } catch { error.value = 'Could not copy invite link' }
}
function setReady(): void {
  if (busy.value || !room.value || isHost.value || match.value.started) return
  try { session?.send({ kind: 'ready', playerId, ready: !isReady.value }); error.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Could not send ready status' }
}
function changeSettings(settings: MatchSettings): void {
  if (busy.value || !isHost.value || !room.value || match.value.started) return
  match.value = { ...match.value, settings, readyIds: [] }
  commit()
}
function chooseLevel(played: string[]): (typeof LEVELS)[number] | null {
  const difficulty = match.value.settings.difficulty === 'medium' ? 'normal' : match.value.settings.difficulty
  const pool = LEVELS.filter(l => difficulty === 'all' || l.difficulty === difficulty)
  if (!pool.length) { error.value = 'No levels available for this difficulty'; return null }
  // Avoid repeats while enough different levels remain in the selected difficulty.
  const fresh = pool.filter(l => !played.includes(l.key))
  const available = fresh.length ? fresh : pool
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return available[random[0]! % available.length]!
}
function startMatch(): void {
  if (!canStart.value) return
  const level = chooseLevel([])
  if (!level) return
  const ids = players.value.map(p => p.id)
  match.value = {
    ...match.value, started: true, completed: false,
    totals: Object.fromEntries(ids.map(id => [id, { points: 0, ticks: 0, deaths: 0, dnfs: 0 }])),
    playedLevels: [level.key],
    round: { number: 1, levelKey: level.key, startAt: Date.now() + 3000, replayAt: null, playerIds: ids, results: {} },
  }
  showResults.value = false
  commit()
}
function nextRound(): void {
  const previous = match.value.round
  if (!isHost.value || !previous || !allFinished.value || match.value.completed || isFinalRound.value) return
  const level = chooseLevel(match.value.playedLevels)
  if (!level) return
  const ids = players.value.map(p => p.id)
  match.value = {
    ...match.value,
    totals: addRoundTotals(match.value.totals, previous),
    playedLevels: [...match.value.playedLevels, level.key],
    round: { number: previous.number + 1, levelKey: level.key, startAt: Date.now() + 3000, replayAt: null, playerIds: ids, results: {} },
  }
  showResults.value = false
  pendingReplay.value = null
  commit()
}
function finishMatch(): void {
  if (!isHost.value || !allFinished.value || !isFinalRound.value || match.value.completed || !match.value.round) return
  match.value = {
    ...match.value,
    totals: addRoundTotals(match.value.totals, match.value.round),
    completed: true,
  }
  showResults.value = true
  commit()
}
function sendFinish(replay: string): void {
  const round = match.value.round
  if (!round) return
  try { session?.send({ kind: 'finish', playerId, round: round.number, replay }); error.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Could not send race recording' }
}
function finishReplay(): void {
  showResults.value = true
}
function onRaceFinished(result: { replay: string }): void {
  pendingReplay.value = result.replay
  if (!match.value.round) return
  if (isHost.value) recordFinish(playerId, result.replay, match.value.round.number)
  else sendFinish(result.replay)
}

onBeforeUnmount(() => { session?.close() })
</script>
<template>
  <PageShell :theme="theme">
    <RaceView
      v-if="match.started && match.round && allFinished && replayRace && !showResults"
      :key="'multiplayer-replay-' + room + '-' + match.round.number"
      :theme="theme"
      :race="replayRace"
      :ghosts="replayGhosts"
      :replay-start-at="match.round.replayAt"
      multiplayer
      @exit="finishReplay"
    />
    <GameView
      v-else-if="match.started && match.round && raceLevel && !allFinished"
      :key="'multiplayer-' + room + '-' + match.round.number"
      :theme="myColors"
      :level-data="raceLevel.data"
      :level-key="'multiplayer:' + room + ':' + match.round.number"
      :intro="{ number: match.round.number, title: raceLevel.title, label: 'Multiplayer race' }"
      :multiplayer-start-at="match.round.startAt"
      exit-text="Leave match"
      @exit="void leave()"
      @finished="onRaceFinished"
    />
    <div v-else-if="match.started && match.round && allFinished && match.round.replayAt !== null && !replayRace && !showResults" class="multiplayer">
      <header class="top"><button class="ib" type="button" aria-label="Leave match" @click="void leave()">←</button><div class="title"><b>Multiplayer</b><small>{{ raceLevel?.title ?? 'Race' }}</small></div></header>
      <div class="scroll"><div class="content"><section class="panel"><div class="section-head"><div><b>PREPARING REPLAY</b><small>Receiving the completed runs…</small></div></div></section><p v-if="error" class="error" role="alert">{{ error }}</p></div></div>
    </div>
    <div v-else-if="match.started && match.round && allFinished" class="multiplayer">
      <header class="top"><button class="ib" type="button" aria-label="Leave match" @click="void leave()">←</button><div class="title"><b>{{ match.completed ? 'Final standings' : 'Race results' }}</b><small>{{ match.completed ? 'Match complete' : (raceLevel?.title ?? 'Multiplayer') }}</small></div><span class="tag">{{ match.round.number }} / {{ match.settings.rounds }}</span></header>
      <div class="scroll"><div class="content">
        <section v-if="!match.completed" class="panel results-panel">
          <div class="section-head"><div><b>FINISH ORDER</b><small>Race {{ match.round.number }} of {{ match.settings.rounds }}</small></div></div>
          <ol class="results-list"><li v-for="(entry, i) in standings" :key="entry.id" :class="{ self: entry.id === playerId }"><strong>{{ i + 1 }}.</strong><span>{{ entry.name }}</span><b>{{ entry.result?.finished ? formatTicks(entry.result.ticks) : 'DNF' }}</b><small>+{{ currentPoints[entry.id] ?? 0 }} pts</small></li></ol>
        </section>
        <section class="panel results-panel">
          <div class="section-head"><div><b>{{ match.completed ? 'FINAL STANDINGS' : 'OVERALL STANDINGS' }}</b><small>Points across {{ match.completed ? match.settings.rounds : match.round.number }} races</small></div></div>
          <ol class="results-list"><li v-for="(entry, i) in overallStandings" :key="entry.id" :class="{ self: entry.id === playerId }"><strong>{{ i + 1 }}.</strong><span>{{ entry.name }}</span><b>{{ entry.totals.points }} pts</b><small>{{ entry.totals.dnfs ? entry.totals.dnfs + ' DNF' : formatTicks(entry.totals.ticks) }}</small></li></ol>

          <button v-if="isHost && !match.completed" class="cta" type="button" @click="isFinalRound ? finishMatch() : nextRound()">{{ isFinalRound ? 'Show final standings' : 'Next race ▶' }}</button>
          <small v-else-if="!isHost && !match.completed">{{ isFinalRound ? 'Waiting for the host to show the final standings…' : 'Waiting for the host to start the next race…' }}</small>
        </section>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div></div>
    </div>
    <div v-else class="multiplayer">
      <header class="top">
        <button class="ib" type="button" aria-label="Back to menu" @click="void leave()">←</button>
        <div class="title"><b>Multiplayer</b><small>Private races with friends</small></div>
        <span class="tag">UP TO 8</span>
      </header>

      <div class="scroll">
        <div class="content">
          <section v-if="room" class="stage" aria-label="Animated multiplayer lobby">
            <div class="stage-top"><span class="stage-label">{{ room ? 'YOUR LOBBY' : 'READY TO PLUNGE?' }}</span><span class="stage-count">{{ room ? players.length : 1 }} / 8</span></div>
            <div class="playfield">
              <div class="track track-one"></div><div class="track track-two"></div>
              <span class="decoration star">✦</span><span class="decoration ring"></span><span class="decoration dot">●</span>
              <div class="platform platform-a"></div><div class="platform platform-b"></div><div class="platform platform-c"></div>
              <div v-if="!room" class="runner preview-runner">
                <span class="runner-name">{{ name.trim() || 'YOU' }}</span>
                <div class="runner-bob"><CharacterCanvas :colors="myColors" :look="look" :size="72" /></div>
              </div>
              <div v-for="player in occupants" v-else :key="player.id" class="runner" :class="'runner-' + player.index">
                <span v-if="player.host" class="runner-host">HOST</span><span class="runner-name">{{ player.name }}</span><span v-if="!player.host && match.readyIds.includes(player.id)" class="runner-ready">READY ✓</span>
                <div class="runner-bob" :style="{ animationDelay: `${player.index * -0.33}s` }"><CharacterCanvas :colors="colorsFor(player)" :look="player.safeLook" :size="60" /></div>
              </div>

            </div>
          </section>

          <section v-if="room" class="panel ready-panel">
            <template v-if="match.started"><strong>Starting race…</strong><small v-if="!raceLevel">Level unavailable. Please update your game.</small></template>
            <template v-else-if="isHost"><button class="cta" type="button" :disabled="!canStart || busy" @click="void startMatch()">Start Game</button><small>{{ canStart ? 'Everyone is ready!' : 'Waiting for all players to be ready' }}</small></template>
            <template v-else><button class="cta" type="button" :disabled="busy" @click="void setReady()">{{ isReady ? '✓ Ready — Cancel' : 'Ready' }}</button></template>
          </section>

          <template v-if="!room">
            <section class="panel character-panel">
              <CharacterCanvas :colors="myColors" :look="look" :size="72" />
              <div class="character-details">
                <strong>{{ name.trim() || 'Guest' }}</strong>
                <button class="edit-character" type="button" @click="emit('editCharacter')">Edit character</button>
              </div>
            </section>
            <section class="panel name-panel">
              <label class="field"><span>YOUR NAME</span><input v-model="name" maxlength="16" placeholder="Player name" /></label>
            </section>
            <section v-if="!hasInvite" class="panel">
              <div class="section-head"><div><b>CREATE A ROOM</b><small>Invite your friends to race</small></div></div>
              <button class="cta" type="button" :disabled="busy" @click="void enter('create')">＋ Create lobby</button>
            </section>
            <section class="panel join-panel">
              <div class="section-head"><div><b>JOIN A ROOM</b><small>{{ hasInvite ? 'You have been invited to a lobby' : 'Got an invite code?' }}</small></div></div>
              <div class="join-row"><input v-model="codeInput" maxlength="5" aria-label="Room code" placeholder="5-CHARACTER CODE" autocapitalize="characters" /><button class="cta" type="button" :disabled="busy || codeInput.trim().length !== 5" @click="void enter('join')">Join →</button></div>
            </section>
          </template>
          <template v-else>
            <section class="panel room-panel">
              <div class="room-info"><b>ROOM CODE</b><div class="invite-row"><strong class="room-code">{{ room }}</strong><button class="cta copy-link" :class="{ copied }" type="button" @click="void copyInvite()">{{ copied ? '✓ Copied' : 'Copy link' }}</button></div><small>Share this code with your friends</small></div>
            </section>
            <section class="panel players-panel">
              <div class="section-head"><div><b>PLAYERS</b><small>{{ players.length }} of 8 slots filled</small></div></div>
              <div class="slots"><div v-for="player in occupants" :key="player.id" class="slot"><CharacterCanvas :colors="colorsFor(player)" :look="player.safeLook" :size="46" /><div class="slot-identity"><small v-if="player.host">HOST</small><span>{{ player.name }}</span><small v-if="!player.host && match.readyIds.includes(player.id)">READY ✓</small></div></div><div v-for="n in Math.max(0, 8 - occupants.length)" :key="'empty-' + n" class="slot empty-slot"><span class="empty-icon">＋</span><span>Waiting…</span></div></div>
            </section>
            <section class="panel settings-panel">
              <div class="section-head"><div><b>MATCH SETTINGS</b><small>{{ isHost ? 'Host controls' : 'Selected by host' }}</small></div></div>
              <div v-if="isHost" class="settings-grid">
                <label class="field"><span>ROUNDS</span><select :value="match.settings.rounds" :disabled="busy || match.started" @change="changeSettings({ ...match.settings, rounds: Number(($event.target as HTMLSelectElement).value) as LobbyRounds })"><option v-for="n in [3, 5, 10, 15]" :key="n" :value="n">{{ n }}</option></select></label>
                <label class="field"><span>DIFFICULTY</span><select :value="match.settings.difficulty" :disabled="busy || match.started" @change="changeSettings({ ...match.settings, difficulty: ($event.target as HTMLSelectElement).value as LobbyDifficulty })"><option value="all">All</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
              </div>
              <div v-else class="settings-summary">{{ match.settings.rounds }} rounds · {{ { all: 'All', easy: 'Easy', medium: 'Medium', hard: 'Hard' }[match.settings.difficulty] }} difficulty</div>
            </section>
          </template>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.multiplayer{flex:1;min-height:0;display:flex;flex-direction:column}.top{display:flex;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;background:var(--panel);border-bottom:3px solid var(--line)}.ib{width:38px;height:38px;flex-shrink:0;font-size:20px;font-weight:900;color:var(--text);background:transparent;border:2px solid var(--line);border-radius:12px;cursor:pointer}.title{flex:1;min-width:0}.title b{display:block;font-size:18px;font-weight:900;color:var(--accent)}.title small{font-size:12px;font-weight:700;color:var(--muted)}.tag{border:2px solid var(--line);border-radius:9px;padding:5px 8px;font-size:11px;font-weight:900;color:var(--accent)}.scroll{flex:1;min-height:0;overflow-y:auto;padding:14px 12px max(24px,env(safe-area-inset-bottom))}.content{width:min(100%,560px);margin:auto;display:grid;gap:14px}.panel,.stage{background:var(--panel);border:3px solid var(--line);border-radius:20px;box-shadow:4px 4px 0 var(--outline);overflow:hidden}.panel{padding:16px;display:grid;gap:13px}.section-head{display:flex;align-items:center;gap:12px}.section-head b{display:block;font-size:16px;font-weight:900;color:var(--accent)}.section-head small{display:block;font-size:12px;font-weight:700;color:var(--muted)}.field{display:grid;gap:6px;font-size:11px;font-weight:900;letter-spacing:1px;color:var(--muted)}input::placeholder{color:var(--muted);opacity:1}input{min-width:0;width:100%;box-sizing:border-box;font:inherit;font-size:14px;font-weight:700;padding:5px 8px;color:var(--text);background:var(--panel);border:2px solid var(--line);border-radius:10px}.cta{border:3px solid var(--outline);border-radius:12px;background:var(--accent);color:var(--outline);font:inherit;font-size:16px;font-weight:900;padding:11px 16px;box-shadow:3px 3px 0 var(--outline);cursor:pointer}.cta:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--outline)}.cta:disabled{opacity:.5;cursor:not-allowed}.cta.copy-link.copied{background:#39c76a;color:var(--outline)}.join-row,.invite-row{display:flex;gap:10px;align-items:center}.join-row input{flex:1;letter-spacing:1px;text-transform:uppercase}.room-code{font-size:clamp(19px,5vw,29px);letter-spacing:2px;color:var(--accent);flex:1;overflow-wrap:anywhere}.connection{margin:0;color:var(--muted);font-size:12px;font-weight:700}.connection-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c2);margin-right:7px}.connection-dot.connected{background:var(--c3)}.slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.slot{min-width:0;display:flex;align-items:center;gap:6px;padding:7px;border:2px solid var(--line);border-radius:12px;color:var(--text);font-size:12px;font-weight:800}.slot>span:not(.empty-icon){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.slot small{margin-left:auto;color:var(--accent);font-size:9px}.empty-slot{border-style:dashed;color:var(--muted)}.empty-icon{display:grid;place-items:center;width:46px;height:46px;font-size:24px}.coming-soon{margin:0;text-align:center;color:var(--muted);font-size:12px;font-weight:700}.error{margin:0;color:var(--accent);font-weight:800;text-align:center}.stage-top{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--accent);color:var(--outline);font-size:12px;font-weight:900;letter-spacing:1px}.playfield{position:relative;height:230px;overflow:hidden;background:linear-gradient(145deg,var(--bg1),var(--bg2))}.track{position:absolute;width:140%;height:5px;left:-20%;background:var(--c1);opacity:.45;transform:rotate(-12deg)}.track-one{top:60px}.track-two{top:155px;transform:rotate(13deg)}.platform{position:absolute;height:15px;border:3px solid var(--outline);border-radius:5px;background:var(--c0);box-shadow:0 5px 0 var(--outline)}.platform-a{width:30%;top:100px;left:-5%;transform:rotate(-8deg)}.platform-b{width:34%;top:135px;right:-6%;transform:rotate(7deg);background:var(--c3)}.platform-c{width:35%;bottom:34px;left:32%;background:var(--c1)}.decoration{position:absolute;font-weight:900;color:var(--c2)}.star{font-size:37px;top:18px;right:20%}.ring{width:25px;height:25px;border:6px solid var(--c3);border-radius:50%;left:15%;bottom:30px}.dot{right:10%;bottom:60px;font-size:16px}.runner{position:absolute;z-index:2;left:calc(5% + (var(--runner-index, 0) * 12%));top:60px;display:flex;align-items:center;flex-direction:column;min-width:70px;max-width:100px;transform:translateX(-50%)}.preview-runner{left:50%;top:65px}.runner-0{left:13%;top:25px}.runner-1{left:37%;top:70px}.runner-2{left:63%;top:25px}.runner-3{left:86%;top:75px}.runner-4{left:16%;top:122px}.runner-5{left:39%;top:139px}.runner-6{left:63%;top:125px}.runner-7{left:84%;top:145px}.runner-name{display:block;max-width:100%;padding:3px 7px;border:2px solid var(--outline);border-radius:7px;background:var(--accent);color:var(--outline);font-size:10px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:2px 2px 0 var(--outline)}.crown{color:var(--c0)}.runner-bob{animation:bob 1.8s ease-in-out infinite alternate}@keyframes bob{from{transform:translateY(0) rotate(-6deg)}to{transform:translateY(9px) rotate(6deg)}}@media(min-width:520px){.slots{grid-template-columns:repeat(4,minmax(0,1fr))}.playfield{height:260px}.runner-4{top:145px}.runner-5{top:165px}.runner-6{top:145px}.runner-7{top:165px}}@media(prefers-reduced-motion:reduce){.runner-bob{animation:none}}

.slot-identity{display:flex;flex:1;min-width:0;flex-direction:column;align-items:flex-start;gap:2px}
.slot-identity span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.slot-identity small{margin:0;color:var(--accent);font-size:9px}
.runner-host{font-size:9px;font-weight:900;color:var(--text);background:var(--panel);padding:1px 5px;border-radius:5px}
@media(max-width:519px){.players-panel{display:none}}
</style>

<style scoped>
.character-panel{display:flex;align-items:center;gap:14px}
.character-details{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}
.character-details strong{font-size:16px;color:var(--text);overflow-wrap:anywhere}
.edit-character{font:inherit;font-weight:800;color:var(--text);background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:5px 8px;cursor:pointer}
</style>

<style scoped>
.room-panel{gap:0}.room-info{display:flex;flex-direction:column;gap:4px}.room-info>b{font-size:16px;font-weight:900;color:var(--accent)}.room-info>small,.ready-panel>small{font-size:12px;font-weight:700;color:var(--muted)}.room-info .invite-row{justify-content:space-between;gap:12px}.room-info .copy-link{flex-shrink:0}.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.settings-grid select{width:100%;min-width:0;font:inherit;font-weight:700;font-size:14px;padding:7px 8px;color:var(--text);background:var(--panel);border:2px solid var(--line);border-radius:10px}.settings-grid select:disabled{opacity:.65}.runner-ready{font-size:9px;font-weight:900;padding:2px 5px;background:var(--panel);color:var(--text);border-radius:5px}.ready-panel{display:grid}.ready-panel>strong{color:var(--text)}.settings-summary{font-size:14px;font-weight:800;color:var(--text)}
</style>

<style scoped>
.results-list{list-style:none;margin:0;padding:0;display:grid;gap:9px}.results-list li{display:flex;align-items:center;gap:9px;border:2px solid var(--line);border-radius:12px;padding:10px;color:var(--text);font-weight:800}.results-list li.self{background:var(--accent);color:var(--outline)}.results-list li.self small{color:var(--outline)}.results-list li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.results-list li small{color:var(--muted);font-size:12px}.results-panel>small{color:var(--muted);font-size:12px}
</style>
