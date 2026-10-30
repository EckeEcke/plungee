<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { look } from '../game/look'
import { loadName } from '../online/api'
import { connectLobby, roomRequest, type LobbyPlayer, type LobbySession } from '../multiplayer/connection'

const emit = defineEmits<{ exit: [] }>()
const name = ref(loadName() || 'Guest')
const codeInput = ref(new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '')
const room = ref('')
const players = ref<LobbyPlayer[]>([])
const status = ref('idle')
const error = ref('')
const busy = ref(false)
const playerId = crypto.randomUUID()
let session: LobbySession | null = null

async function enter(action: 'create' | 'join') {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const code = action === 'join' ? codeInput.value.trim().toUpperCase() : undefined
    const result = await roomRequest(action, playerId, code)
    if (!result.code) throw new Error('Room code missing')
    room.value = result.code
    status.value = 'connecting'
    session = connectLobby(result.code, playerId, name.value.trim().slice(0, 16) || 'Guest', { ...look }, p => { players.value = p }, s => { status.value = s })
    history.replaceState(null, '', `${location.pathname}?room=${result.code}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Connection failed'
  } finally { busy.value = false }
}

async function leave() {
  session?.close()
  session = null
  if (room.value) { try { await roomRequest('leave', playerId, room.value) } catch { /* room may have expired */ } }
  room.value = ''
  players.value = []
  history.replaceState(null, '', location.pathname)
  emit('exit')
}
function copyInvite() { void navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${room.value}`) }
onBeforeUnmount(() => { session?.close() })
</script>

<template>
  <main class="multiplayer">
    <button class="back" @click="void leave()">← Back</button>
    <h1>Multiplayer</h1>
    <p>Private lobby · Up to 8 players</p>
    <template v-if="!room">
      <label>Your name <input v-model="name" maxlength="16" /></label>
      <button :disabled="busy" @click="void enter('create')">Create lobby</button>
      <label>Room code <input v-model="codeInput" maxlength="8" placeholder="ABCDEFGH" /></label>
      <button :disabled="busy || codeInput.trim().length !== 8" @click="void enter('join')">Join lobby</button>
    </template>
    <template v-else>
      <p>Room: <strong>{{ room }}</strong></p>
      <button @click="copyInvite">Copy invite link</button>
      <p>Connection: {{ status }}</p>
      <h2>Players ({{ players.length }}/8)</h2>
      <ul><li v-for="player in players" :key="player.id">{{ player.name }} <span v-if="player.host">(Host)</span></li></ul>
      <p>Match settings and race start follow in the next step.</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </main>
</template>

<style scoped>
.multiplayer{max-width:480px;margin:3rem auto;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;text-align:center}
.multiplayer input{display:block;width:100%;box-sizing:border-box;padding:.75rem;margin-top:.5rem}
.multiplayer button{padding:.8rem;cursor:pointer}
.multiplayer ul{list-style:none;padding:0}.multiplayer li{padding:.6rem;border-bottom:1px solid currentColor}
.back{align-self:flex-start}
</style>
