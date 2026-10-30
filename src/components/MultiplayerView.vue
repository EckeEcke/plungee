
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import PageShell from './PageShell.vue'
import CharacterCanvas from './CharacterCanvas.vue'
import { applyLook, look, sanitizeLook } from '../game/look'
import type { Theme } from '../game/theme'
import { loadName } from '../online/api'
import { connectLobby, roomRequest, type LobbyPlayer, type LobbySession } from '../multiplayer/connection'

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

const myColors = computed(() => applyLook(props.theme, look))
const occupants = computed(() =>
  players.value.slice(0, 8).map((p, index) => ({
    ...p,
    safeLook: sanitizeLook(p.look),
    index,
  })),
)

function colorsFor(player: LobbyPlayer): Theme {
  return applyLook(props.theme, sanitizeLook(player.look))
}

async function enter(action: 'create' | 'join'): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''

  try {
    const code = action === 'join' ? codeInput.value.trim().toUpperCase() : undefined
    const result = await roomRequest(action, playerId, code)
    if (!result.code) throw new Error('Room code missing')

    room.value = result.code
    status.value = 'connecting'

    session = connectLobby(
      result.code,
      playerId,
      name.value.trim().slice(0, 16) || 'Guest',
      { ...look },
      p => { players.value = p },
      s => { status.value = s },
    )

    history.replaceState(null, '', `${location.pathname}?room=${result.code}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Connection failed'
  } finally {
    busy.value = false
  }
}

async function leave(): Promise<void> {
  session?.close()
  session = null

  if (room.value) {
    try {
      await roomRequest('leave', playerId, room.value)
    } catch {
      /* expired room */
    }
  }

  room.value = ''
  players.value = []
  history.replaceState(null, '', location.pathname)
  emit('exit')
}

async function copyInvite(): Promise<void> {
  try {
    await navigator.clipboard.writeText(
      `${location.origin}${location.pathname}?room=${room.value}`,
    )
    copied.value = true
  } catch {
    error.value = 'Could not copy invite link'
  }
}

onBeforeUnmount(() => {
  session?.close()
})
</script>

<template>
  <PageShell :theme="theme">
    <div class="multiplayer">
      <header class="top">
        <button
          class="ib"
          type="button"
          aria-label="Back to menu"
          @click="void leave()"
        >
          ←
        </button>
        <div class="title">
          <b>Multiplayer</b>
          <small>Private races with friends</small>
        </div>
        <span class="tag">UP TO 8</span>
      </header>

      <div class="scroll">
        <div class="content">
          <section
            v-if="room"
            class="stage"
            aria-label="Animated multiplayer lobby"
          >
            <div class="stage-top">
              <span class="stage-label">YOUR LOBBY</span>
              <span class="stage-count">{{ players.length }} / 8</span>
            </div>

            <div class="playfield">
              <div class="track track-one"></div>
              <div class="track track-two"></div>

              <span class="decoration star">✦</span>
              <span class="decoration ring"></span>
              <span class="decoration dot">●</span>

              <div class="platform platform-a"></div>
              <div class="platform platform-b"></div>
              <div class="platform platform-c"></div>

              <div
                v-for="player in occupants"
                :key="player.id"
                class="runner"
                :class="'runner-' + player.index"
              >
                <span v-if="player.host" class="runner-host">HOST</span>
                <span class="runner-name">{{ player.name }}</span>
                <div
                  class="runner-bob"
                  :style="{ animationDelay: `${player.index * -0.33}s` }"
                >
                  <CharacterCanvas
                    :colors="colorsFor(player)"
                    :look="player.safeLook"
                    :size="60"
                  />
                </div>
              </div>
            </div>
          </section>

          <template v-if="!room">
            <section class="panel character-panel">
              <CharacterCanvas
                :colors="myColors"
                :look="look"
                :size="72"
              />
              <div class="character-details">
                <strong>{{ name.trim() || 'Guest' }}</strong>
                <button
                  class="edit-character"
                  type="button"
                  @click="emit('editCharacter')"
                >
                  Edit character
                </button>
              </div>
            </section>

            <section class="panel name-panel">
              <label class="field">
                <span>YOUR NAME</span>
                <input
                  v-model="name"
                  maxlength="16"
                  placeholder="Player name"
                />
              </label>
            </section>

            <section v-if="!hasInvite" class="panel">
              <div class="section-head">
                <div>
                  <b>CREATE A ROOM</b>
                  <small>Invite your friends to race</small>
                </div>
              </div>
              <button
                class="cta"
                type="button"
                :disabled="busy"
                @click="void enter('create')"
              >
                ＋ Create lobby
              </button>
            </section>

            <section class="panel join-panel">
              <div class="section-head">
                <div>
                  <b>JOIN A ROOM</b>
                  <small>
                    {{ hasInvite ? 'You have been invited to a lobby' : 'Got an invite code?' }}
                  </small>
                </div>
              </div>
              <div class="join-row">
                <input
                  v-model="codeInput"
                  maxlength="5"
                  aria-label="Room code"
                  placeholder="5-CHARACTER CODE"
                  autocapitalize="characters"
                />
                <button
                  class="cta"
                  type="button"
                  :disabled="busy || codeInput.trim().length !== 5"
                  @click="void enter('join')"
                >
                  Join →
                </button>
              </div>
            </section>
          </template>

          <template v-else>
            <section class="panel room-panel">
              <div class="room-info">
                <b>ROOM CODE</b>
                <div class="invite-row">
                  <strong class="room-code">{{ room }}</strong>
                  <button
                    class="cta copy-link"
                    :class="{ copied }"
                    type="button"
                    @click="void copyInvite()"
                  >
                    {{ copied ? '✓ Copied' : 'Copy link' }}
                  </button>
                </div>
                <small>Share this code with your friends</small>
              </div>
            </section>

            <section class="panel players-panel">
              <div class="section-head">
                <div>
                  <b>PLAYERS</b>
                  <small>{{ players.length }} of 8 slots filled</small>
                </div>
              </div>

              <div class="slots">
                <div
                  v-for="player in occupants"
                  :key="player.id"
                  class="slot"
                >
                  <CharacterCanvas
                    :colors="colorsFor(player)"
                    :look="player.safeLook"
                    :size="46"
                  />
                  <div class="slot-identity">
                    <small v-if="player.host">HOST</small>
                    <span>{{ player.name }}</span>
                  </div>
                </div>

                <div
                  v-for="n in Math.max(0, 8 - occupants.length)"
                  :key="'empty-' + n"
                  class="slot empty-slot"
                >
                  <span class="empty-icon">＋</span>
                  <span>Waiting…</span>
                </div>
              </div>
            </section>

            <p class="coming-soon">
              Race settings and ready-up are coming next.
            </p>
          </template>

          <p v-if="error" class="error" role="alert">
            {{ error }}
          </p>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.multiplayer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  background: var(--panel);
  border-bottom: 3px solid var(--line);
}

.ib {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}

.title {
  flex: 1;
  min-width: 0;
}

.title b {
  display: block;
  font-size: 18px;
  font-weight: 900;
  color: var(--accent);
}

.title small {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.tag {
  border: 2px solid var(--line);
  border-radius: 9px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 900;
  color: var(--accent);
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px max(24px, env(safe-area-inset-bottom));
}

.content {
  width: min(100%, 560px);
  margin: auto;
  display: grid;
  gap: 14px;
}

.panel,
.stage {
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 4px 4px 0 var(--outline);
  overflow: hidden;
}

.panel {
  padding: 16px;
  display: grid;
  gap: 13px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-head b {
  display: block;
  font-size: 16px;
  font-weight: 900;
  color: var(--accent);
}

.section-head small {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.field {
  display: grid;
  gap: 6px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  color: var(--muted);
}

input::placeholder {
  color: var(--muted);
  opacity: 1;
}

input {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 5px 8px;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 10px;
}

.cta {
  border: 3px solid var(--outline);
  border-radius: 12px;
  background: var(--accent);
  color: var(--outline);
  font: inherit;
  font-size: 16px;
  font-weight: 900;
  padding: 11px 16px;
  box-shadow: 3px 3px 0 var(--outline);
  cursor: pointer;
}

.cta:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--outline);
}

.cta:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.cta.copy-link.copied {
  background: #39c76a;
  color: var(--outline);
}

.join-row,
.invite-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.join-row input {
  flex: 1;
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* Room code */
.room-panel {
  gap: 0;
}

.room-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.room-info > b {
  font-size: 16px;
  font-weight: 900;
  color: var(--accent);
}

.room-info > small {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.room-info .invite-row {
  justify-content: space-between;
  gap: 12px;
}

.room-code {
  font-size: clamp(19px, 5vw, 29px);
  letter-spacing: 2px;
  color: var(--accent);
  flex: 1;
  overflow-wrap: anywhere;
}

.room-info .copy-link {
  flex-shrink: 0;
}

/* Player slots */
.slots {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.slot {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px;
  border: 2px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-size: 12px;
  font-weight: 800;
}

.slot > span:not(.empty-icon) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot small {
  margin-left: auto;
  color: var(--accent);
  font-size: 9px;
}

.slot-identity {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.slot-identity span {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-identity small {
  margin: 0;
  color: var(--accent);
  font-size: 9px;
}

.empty-slot {
  border-style: dashed;
  color: var(--muted);
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  font-size: 24px;
}

.coming-soon {
  margin: 0;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.error {
  margin: 0;
  color: var(--accent);
  font-weight: 800;
  text-align: center;
}

/* Animated lobby */
.stage-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--accent);
  color: var(--outline);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
}

.playfield {
  position: relative;
  height: 230px;
  overflow: hidden;
  background: linear-gradient(145deg, var(--bg1), var(--bg2));
}

.track {
  position: absolute;
  width: 140%;
  height: 5px;
  left: -20%;
  background: var(--c1);
  opacity: .45;
  transform: rotate(-12deg);
}

.track-one {
  top: 60px;
}

.track-two {
  top: 155px;
  transform: rotate(13deg);
}

.platform {
  position: absolute;
  height: 15px;
  border: 3px solid var(--outline);
  border-radius: 5px;
  background: var(--c0);
  box-shadow: 0 5px 0 var(--outline);
}

.platform-a {
  width: 30%;
  top: 100px;
  left: -5%;
  transform: rotate(-8deg);
}

.platform-b {
  width: 34%;
  top: 135px;
  right: -6%;
  transform: rotate(7deg);
  background: var(--c3);
}

.platform-c {
  width: 35%;
  bottom: 34px;
  left: 32%;
  background: var(--c1);
}

.decoration {
  position: absolute;
  font-weight: 900;
  color: var(--c2);
}

.star {
  font-size: 37px;
  top: 18px;
  right: 20%;
}

.ring {
  width: 25px;
  height: 25px;
  border: 6px solid var(--c3);
  border-radius: 50%;
  left: 15%;
  bottom: 30px;
}

.dot {
  right: 10%;
  bottom: 60px;
  font-size: 16px;
}

.runner {
  position: absolute;
  z-index: 2;
  left: calc(5% + (var(--runner-index, 0) * 12%));
  top: 60px;
  display: flex;
  align-items: center;
  flex-direction: column;
  min-width: 70px;
  max-width: 100px;
  transform: translateX(-50%);
}

.runner-0 { left: 13%; top: 25px; }
.runner-1 { left: 37%; top: 70px; }
.runner-2 { left: 63%; top: 25px; }
.runner-3 { left: 86%; top: 75px; }
.runner-4 { left: 16%; top: 122px; }
.runner-5 { left: 39%; top: 139px; }
.runner-6 { left: 63%; top: 125px; }
.runner-7 { left: 84%; top: 145px; }

.runner-name {
  display: block;
  max-width: 100%;
  padding: 3px 7px;
  border: 2px solid var(--outline);
  border-radius: 7px;
  background: var(--accent);
  color: var(--outline);
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 2px 2px 0 var(--outline);
}

.runner-host {
  font-size: 9px;
  font-weight: 900;
  color: var(--text);
  background: var(--panel);
  padding: 1px 5px;
  border-radius: 5px;
}

.runner-bob {
  animation: bob 1.8s ease-in-out infinite alternate;
}

@keyframes bob {
  from { transform: translateY(0) rotate(-6deg); }
  to { transform: translateY(9px) rotate(6deg); }
}

/* Character preview */
.character-panel {
  display: flex;
  align-items: center;
  gap: 14px;
}

.character-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.character-details strong {
  font-size: 16px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.edit-character {
  font: inherit;
  font-weight: 800;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 10px;
  padding: 5px 8px;
  cursor: pointer;
}

@media (min-width: 520px) {
  .slots {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .playfield {
    height: 260px;
  }

  .runner-4 { top: 145px; }
  .runner-5 { top: 165px; }
  .runner-6 { top: 145px; }
  .runner-7 { top: 165px; }
}

@media (max-width: 519px) {
  .players-panel {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .runner-bob {
    animation: none;
  }
}
</style>
