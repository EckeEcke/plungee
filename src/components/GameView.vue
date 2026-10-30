<script setup lang="ts">
import { audioSettings, playSfx, startMusic, stopMusic, toggleAllSound } from '../audio/audio'
import SoundIcon from './SoundIcon.vue'
import { consumeControlsHint } from '../game/hintSeen'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Game, type HudState } from '../game/game'
import type { GhostSpec } from '../game/ghost'
import type { Theme } from '../game/theme'
import { medalFor, medalTargets } from '../game/medals'
import { compileLevel, formatTicks, type LevelData } from '../sim'
import MedalIcon from './MedalIcon.vue'
import { loadName, nameProblem, type BoardState } from '../online/api'

const props = withDefaults(
  defineProps<{
    levelData: LevelData
    levelKey: string
    theme: Theme
    exitIcon?: string
    exitText?: string
    par?: number | null
    hasNext?: boolean
    intro?: { number: number; title: string; label?: string } | null
    board?: BoardState | null
    /** Link zum Level (nur Community-Level): zeigt im Ergebnis einen Teilen-Knopf */
    shareUrl?: string | null
    /** Zusätzliche Ghosts (Top 5 eines Community-Levels) */
    ghosts?: GhostSpec[]
    /** Multiplayer: fester gemeinsamer Start, keine lokalen Restarts oder Bestenlisten. */
    multiplayerStartAt?: number | null
  }>(),
  { exitIcon: '☰', exitText: 'Menu', par: null, hasNext: false, intro: null, board: null, shareUrl: null, ghosts: () => [], multiplayerStartAt: null },
)
const emit = defineEmits<{
  exit: []
  next: []
  finished: [result: { ticks: number; deaths: number; replay: string }]
  /** Name für die Bestenliste; null = anonym senden */
  name: [name: string | null]
}>()

const nameDraft = ref(loadName())
const nameBad = computed(() => nameProblem(nameDraft.value))

const column = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hudBar = ref<HTMLElement | null>(null)
const hud = shallowRef<HudState>({
  status: 'ready',
  ticks: 0,
  deaths: 0,
  progress: 0,
  countdown: 3,
  bestTicks: null,
  newBest: false,
  replay: '',
  race: [],
  focusedRunner: null,
})
let game: Game | null = null

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--muted': props.theme.ui.muted,
  '--player': props.theme.player,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
  '--line': props.theme.ui.line,
  '--surround': props.theme.surround,
  '--frame': props.theme.frame,
}))

const timeText = computed(() => formatTicks(hud.value.ticks))
/** Eigene Bestzeit im Spiel, bei Online-Leveln und der Weekly die Bestzeit des Levels laut Server */
const showNewBest = computed(() => hud.value.newBest || props.board?.newBest === true)
// Fanfare erst, wenn der Server die Bestzeit oder den First clear bestätigt (lokal spielt sie das Spiel selbst);
// gleicher Sound, und nur einmal, wenn beides zugleich eintritt
watch(
  () => props.board?.newBest === true || props.board?.firstClear === true,
  (v) => {
    if (v) playSfx('newBest')
  },
)
const bestText = computed(() => (hud.value.bestTicks === null ? '–' : formatTicks(hud.value.bestTicks)))
const medal = computed(() =>
  hud.value.status === 'finished' ? medalFor(hud.value.ticks, hud.value.deaths, props.par) : null,
)
const targets = computed(() => (props.par === null ? null : medalTargets(props.par)))
const MEDAL_TEXT = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const
// Steuerung nur im ersten Level der Sitzung zeigen
const hintAllowed = consumeControlsHint()
const showHint = computed(() => hintAllowed && hud.value.status !== 'finished' && hud.value.ticks < 360)

/** Unterkante der Bedienleiste (plus etwas Luft) gemessen, damit das Level darunter beginnt und die Figur oben nie verdeckt wird */
const HUD_GAP_PX = 8
let insetObs: ResizeObserver | null = null
function measureInset(): void {
  if (!game || !column.value || !hudBar.value) return
  const bottom = hudBar.value.getBoundingClientRect().bottom - column.value.getBoundingClientRect().top
  game.setTopInset(Math.max(0, bottom) + HUD_GAP_PX)
}

onMounted(() => {
  startMusic()
  if (!column.value || !canvas.value) return
  game = new Game(canvas.value, column.value, props.theme, (h) => {
    hud.value = h
  })
  measureInset()
  game.setRestartEnabled(props.multiplayerStartAt === null)
  game.setStartAt(props.multiplayerStartAt)
  game.load(compileLevel(props.levelData), props.levelKey)
  if (props.ghosts.length > 0) {
    game.setGhosts(props.ghosts)
    game.restart()
  }
  insetObs = new ResizeObserver(measureInset)
  insetObs.observe(column.value)
})

onBeforeUnmount(() => {
  insetObs?.disconnect()
  insetObs = null
  stopMusic()
  game?.dispose()
  game = null
})

watch(
  () => props.theme,
  (t) => game?.setTheme(t),
)

watch(
  () => hud.value.status,
  (status, prev) => {
    if (status === 'finished' && prev !== 'finished') {
      emit('finished', { ticks: hud.value.ticks, deaths: hud.value.deaths, replay: hud.value.replay })
    }
  },
)

const shareNote = ref('')
let shareTimer: ReturnType<typeof setTimeout> | undefined

function flashShare(text: string): void {
  shareNote.value = text
  clearTimeout(shareTimer)
  shareTimer = setTimeout(() => (shareNote.value = ''), 2000)
}

/** Teilen-Dialog des Geräts, sonst Link in die Zwischenablage */
async function share(): Promise<void> {
  const url = props.shareUrl
  if (!url) return
  const title = props.intro?.title ?? 'Plungee'
  const data = { title, text: `I finished "${title}" in ${timeText.value} in Plungee. Can you beat it?`, url }
  try {
    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
      await navigator.share(data)
      return
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return // abgebrochen: nichts weiter tun
  }
  try {
    await navigator.clipboard.writeText(url)
    flashShare('✓ Link copied')
  } catch {
    window.prompt('Link to this level', url)
  }
}

onBeforeUnmount(() => clearTimeout(shareTimer))

function restart(): void {
  if (props.multiplayerStartAt === null) game?.restart()
}

</script>

<template>
  <div class="stage" :style="cssVars">
    <div ref="column" class="column">
      <canvas ref="canvas" class="canvas" />

      <div ref="hudBar" class="hud" data-noinput>
        <div class="pill time">{{ timeText }}</div>
        <div class="pill deaths" title="Deaths">✕ {{ hud.deaths }}</div>
        <div class="spacer" />
        <button
          class="pill btn"
          type="button"
          :aria-label="audioSettings.sfx || audioSettings.music ? 'Mute' : 'Unmute'"
          @click="toggleAllSound"
        >
          <SoundIcon :on="audioSettings.sfx || audioSettings.music" :size="18" />
        </button>
        <button v-if="multiplayerStartAt === null" class="pill btn" type="button" aria-label="Restart" @click="restart">↻</button>
        <button class="pill btn" type="button" :aria-label="exitText" @click="emit('exit')">{{ exitIcon }}</button>
      </div>

      <div class="progress" aria-hidden="true">
        <div class="progress-fill" :style="{ height: hud.progress * 100 + '%' }" />
        <div class="progress-dot" :style="{ top: hud.progress * 100 + '%' }" />
      </div>

      <Transition name="fadeout">
        <div v-if="intro && hud.status === 'ready'" class="intro" aria-hidden="true">
          <small>{{ intro.label ?? (intro.number > 0 ? 'Level ' + intro.number : 'Community level') }}</small>
          <b>{{ intro.title }}</b>
        </div>
      </Transition>

      <div v-if="hud.status === 'ready'" class="countdown" aria-live="assertive">
        <span :key="hud.countdown">{{ hud.countdown }}</span>
      </div>

      <div v-if="showHint" class="hint">
        ◀ ▶ or A / D · or hold left / right side · R = restart
      </div>

      <Transition name="result">
      <div v-if="hud.status === 'finished'" class="result" data-noinput>
        <div class="card">
          <div class="title">Finished!</div>
          <div class="big">{{ timeText }}</div>
          <div v-if="multiplayerStartAt === null && medal" class="medal">
            <MedalIcon :medal="medal" :size="34" />
            <b>{{ MEDAL_TEXT[medal] }}</b>
          </div>
          <div v-if="multiplayerStartAt === null && targets" class="goals">
            <span>Gold with no deaths ≤ {{ formatTicks(targets.gold) }}</span>
            <span>Silver ≤ {{ formatTicks(targets.silver) }}</span>
          </div>
          <div class="row">
            <span>Deaths</span><b>{{ hud.deaths }}</b>
          </div>
          <div v-if="multiplayerStartAt === null" class="row" :class="{ 'row-best': showNewBest }">
            <span>Best</span><b>{{ bestText }}</b>
          </div>
          <div v-if="multiplayerStartAt === null && (showNewBest || board?.firstClear)" class="badges">
            <div v-if="showNewBest" class="badge">
              <i v-for="n in 8" :key="n" class="spark" :style="{ '--a': n * 45 + 'deg' }" aria-hidden="true" />
              <span class="badge-text">★ New best!</span>
            </div>
            <!-- Kommt erst, wenn der Server antwortet: Animation ohne Verzögerung -->
            <div v-if="board?.firstClear" class="badge badge-first">
              <i v-for="n in 8" :key="n" class="spark" :style="{ '--a': n * 45 + 'deg' }" aria-hidden="true" />
              <span class="badge-text">⚑ First clear!</span>
            </div>
          </div>
          <div v-if="board" class="board" aria-live="polite">
            <form v-if="board.status === 'needsName'" class="name-form" @submit.prevent="emit('name', nameDraft)">
              <b>Post your time</b>
              <p class="board-note">Everyone can see your name on the leaderboard.</p>
              <input
                v-model="nameDraft"
                type="text"
                maxlength="16"
                placeholder="Your name"
                autocomplete="nickname"
                aria-label="Your name"
                :aria-invalid="nameBad ? 'true' : undefined"
              />
              <p v-if="nameBad" class="board-note err">{{ nameBad }}</p>
              <button class="cta" type="submit" :disabled="!nameDraft.trim() || !!nameBad">Post time</button>
              <button class="link" type="button" @click="emit('name', null)">Post as Anonymous</button>
            </form>
            <template v-else>
            <div class="board-head">
              <b>Best times</b>
              <span v-if="board.board && board.board.rank">Your rank {{ board.board.rank }} / {{ board.board.total }}</span>
            </div>
            <p v-if="board.status === 'loading'" class="board-note">Sending your time …</p>
            <p v-else-if="board.status === 'error'" class="board-note err">{{ board.error }}</p>
            <template v-else-if="board.board">
              <p v-if="board.nameRejected" class="board-note err">Your name was not accepted, so you appear as Anonymous.</p>
              <p v-if="board.ownLevel" class="board-note">This is your own level, so your time is not counted.</p>
              <p v-else-if="board.improved === false" class="board-note">Your best time on this level is faster.</p>
              <ol class="board-list">
                <li v-for="r in board.board.top" :key="r.rank" :class="{ you: r.you }">
                  <span class="n">{{ r.rank }}</span>
                  <span class="who">{{ r.name }}</span>
                  <span class="t">{{ formatTicks(r.ticks) }}</span>
                </li>
              </ol>
            </template>
            </template>
          </div>
          <p v-if="multiplayerStartAt !== null" class="board-note">Waiting for the other racers…</p>
          <div v-else class="actions">
            <button class="cta" type="button" @click="restart">Retry</button>
            <button class="ghost" type="button" @click="emit('exit')">{{ exitText }}</button>
          </div>
          <button v-if="shareUrl" class="ghost share" type="button" @click="share">
            {{ shareNote || '🔗 Share this level' }}
          </button>
          <button v-if="multiplayerStartAt === null && hasNext" class="cta next" type="button" @click="emit('next')">Next level ▶</button>
        </div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  /* Neben dem Spielfeld (Desktop, Tablet quer): ruhige, dunklere Fläche statt Spielfeldfarbe */
  background: var(--surround);
  touch-action: none;
}

.column {
  position: relative;
  width: min(100%, 520px);
  height: 100%;
  touch-action: none;
  overflow: hidden;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  /* Rahmenlinie: wird nur sichtbar, wenn neben dem Spielfeld Platz ist (auf Handys füllt es den Bildschirm) */
  box-shadow: 0 0 0 4px var(--frame);
}

.canvas {
  display: block;
  touch-action: none;
}

.hud {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  left: 10px;
  right: 22px;
  display: flex;
  gap: 8px;
  align-items: center;
  pointer-events: none;
}

.spacer {
  flex: 1;
}

.pill {
  background: var(--panel);
  color: var(--text);
  border: 2px solid var(--line);
  border-radius: 999px;
  padding: 6px 14px;
  font-weight: 800;
  font-size: 16px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  /* nie umbrechen oder schrumpfen: sonst rutscht die Zahl hinter dem ✕ in eine zweite Zeile */
  white-space: nowrap;
  flex: none;
}

.time {
  font-size: 20px;
  /* feste Breite: sonst ändert sich das Pill mit jeder Stelle der Zeit (0.00 → 10.00 → 1:05.00) und flackert.
     7ch reicht für alle Formate bis 10:00.00, weil ':' und '.' schmaler sind als eine Ziffer (tabular-nums) */
  box-sizing: content-box;
  width: 7ch;
  text-align: center;
}

.deaths {
  color: var(--accent);
}

.btn {
  pointer-events: auto;
  cursor: pointer;
  width: 40px;
  height: 36px;
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 18px;
}

.btn:active {
  transform: translateY(1px);
}

.progress {
  position: absolute;
  top: 64px;
  bottom: 24px;
  right: 8px;
  width: 4px;
  border-radius: 4px;
  /* durchscheinend, damit das Spielfeld dahinter sichtbar bleibt */
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(0, 0, 0, 0.28);
  opacity: 0.6;
  overflow: visible;
  pointer-events: none;
}

.progress-fill {
  width: 100%;
  background: var(--accent);
  border-radius: 6px;
  opacity: 0.55;
}

.progress-dot {
  position: absolute;
  left: 50%;
  width: 11px;
  height: 11px;
  margin: -5.5px 0 0 -5.5px;
  border-radius: 50%;
  background: var(--player);
  border: 2px solid var(--outline);
}

.intro {
  position: absolute;
  left: 50%;
  /* unten statt oben: die Figur startet in den obersten Reihen und darf nicht von der Karte verdeckt werden */
  bottom: 24%;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 40px);
  text-align: center;
  padding: 10px 22px 12px;
  background: var(--panel);
  color: var(--text);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 5px 5px 0 var(--outline);
  pointer-events: none;
  animation: intro-in 0.35s ease-out;
}

.intro small {
  display: block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--muted);
}

.intro b {
  font-size: 24px;
  font-weight: 900;
  color: var(--accent);
}

@keyframes intro-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%);
  }
}

.countdown {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.countdown span {
  font-size: 120px;
  font-weight: 900;
  color: var(--accent);
  -webkit-text-stroke: 4px var(--outline);
  paint-order: stroke fill;
  text-shadow: 6px 6px 0 var(--outline);
  animation: pop 0.65s ease-out;
}

@keyframes pop {
  0% {
    transform: scale(1.6);
    opacity: 0;
  }
  35% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.85;
  }
}

.hint {
  position: absolute;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 32px);
  text-align: center;
  background: var(--panel);
  color: var(--muted);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  pointer-events: none;
}

.result {
  position: absolute;
  inset: 0;
  display: flex;
  /* Passt das Fenster nicht auf den Bildschirm, scrollt es von oben statt oben abgeschnitten zu werden */
  overflow-y: auto;
  background: rgba(10, 6, 30, 0.45);
  padding: 20px;
  animation: fade 0.25s ease-out;
}

@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.card {
  width: min(100%, 340px);
  background: var(--panel);
  color: var(--text);
  border: 3px solid var(--line);
  border-radius: 24px;
  padding: 22px 22px 16px;
  text-align: center;
  box-shadow: 6px 6px 0 var(--outline);
  margin: auto;
}

.title {
  font-size: 26px;
  font-weight: 900;
  color: var(--accent);
}

.big {
  font-size: 56px;
  font-weight: 900;
  margin: 4px 0 10px;
  font-variant-numeric: tabular-nums;
}

.row {
  display: flex;
  justify-content: space-between;
  padding: 6px 4px;
  border-top: 1.5px dashed rgba(255, 255, 255, 0.18);
  font-size: 16px;
  color: var(--muted);
}

.row b {
  color: var(--text);
}

.medal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 22px;
  font-weight: 900;
}

.goals {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.share {
  width: 100%;
  margin-top: 10px;
}
.next {
  width: 100%;
  margin-top: 10px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 12px;
  margin-top: 10px;
}

.badge {
  position: relative;
  display: inline-block;
  background: var(--accent);
  color: var(--outline);
  font-weight: 900;
  border: 2px solid var(--outline);
  border-radius: 999px;
  padding: 5px 14px;
  transform: rotate(-3deg);
  /* Delay passt zum Sound, der kurz nach dem Ziel-Jingle folgt */
  animation: badge-pop 0.6s cubic-bezier(0.2, 1.3, 0.4, 1) 0.7s both;
}

.badge-first {
  animation-delay: 0s;
  transform: rotate(3deg);
}

.badge-first .spark {
  animation-delay: 0.15s;
}

.badge-text {
  position: relative;
}

@keyframes badge-pop {
  0% {
    transform: scale(0) rotate(-24deg);
    opacity: 0;
  }
  55% {
    transform: scale(1.3) rotate(3deg);
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(-3deg);
    opacity: 1;
  }
}

/* Funken, die beim Aufpoppen vom Badge wegfliegen */
.spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 13px;
  height: 13px;
  margin: -6.5px 0 0 -6.5px;
  background: var(--accent);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  pointer-events: none;
  animation: spark-fly 0.7s ease-out 0.85s both;
}

.spark:nth-child(even) {
  background: #fff;
  animation-duration: 0.6s;
}

@keyframes spark-fly {
  0% {
    transform: rotate(var(--a)) translateX(20px) scale(0.3);
    opacity: 1;
  }
  100% {
    transform: rotate(var(--a)) translateX(78px) scale(1.1);
    opacity: 0;
  }
}

/* Die Zeile "Best" leuchtet einmal auf, wenn sie gerade verbessert wurde */
.row-best b {
  display: inline-block;
  color: var(--accent);
  animation: best-bump 0.5s ease-out 0.7s both;
}

@keyframes best-bump {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

.board {
  margin-top: 10px;
  border-top: 1.5px dashed rgba(255, 255, 255, 0.18);
  padding-top: 8px;
  text-align: left;
}

.name-form {
  display: grid;
  gap: 8px;
}

.name-form input {
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  padding: 8px 10px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
}

.name-form .cta:disabled {
  opacity: 0.45;
  cursor: default;
}

.name-form .link {
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  color: var(--muted);
  background: none;
  border: 0;
  text-decoration: underline;
  padding: 2px;
}

.board-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 14px;
}

.board-head span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.board-note {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.board-note.err {
  color: var(--accent);
}

.board-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  max-height: 132px;
  overflow-y: auto;
  font-size: 14px;
  font-weight: 700;
}

.board-list li {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 8px;
}

.board-list li.you {
  background: var(--accent);
  color: var(--outline);
}

.board-list .n {
  opacity: 0.7;
}

.board-list .who {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-list .t {
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.cta,
.ghost {
  flex: 1;
  cursor: pointer;
  font-size: 17px;
  font-weight: 900;
  border-radius: 14px;
  padding: 12px 10px;
  border: 3px solid var(--line);
}

.cta {
  background: var(--accent);
  color: var(--outline);
  box-shadow: 3px 3px 0 var(--outline);
}

.ghost {
  background: transparent;
  color: var(--text);
}

.cta:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--outline);
}

/* Intro banner and result card fade out instead of vanishing */
.fadeout-leave-active,
.result-leave-active {
  transition: opacity 0.18s ease;
}
.fadeout-leave-to,
.result-leave-to {
  opacity: 0;
}

/* Schmale Bildschirme: Leiste enger, damit Zeit, Tode (auch dreistellig) und drei Knöpfe in eine Zeile passen */
/* Niedrige Bildschirme: Ergebnisfenster enger, damit es möglichst ohne Scrollen passt */
@media (max-height: 700px) {
  .card {
    padding: 14px 16px 12px;
  }
  .card .big {
    font-size: 44px;
  }
  .board-list {
    max-height: 96px;
  }
  .actions {
    margin-top: 10px;
  }
}

@media (max-width: 380px) {
  .hud {
    gap: 5px;
    left: 8px;
    right: 14px;
  }
  .pill {
    padding: 6px 9px;
    font-size: 15px;
  }
  .time {
    font-size: 16px;
  }
  .btn {
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 15px;
  }
}

@media (max-width: 300px) {
  .hud {
    gap: 4px;
  }
  .pill {
    padding: 5px 7px;
    font-size: 14px;
  }
  .time {
    font-size: 15px;
  }
  .btn {
    width: 28px;
    height: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fadeout-leave-active,
  .result-leave-active {
    transition: none;
  }
  .intro,
  .result,
  .card,
  .badge,
  .row-best b {
    animation: none;
  }
  .spark {
    display: none;
  }
}
</style>