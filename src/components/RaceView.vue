<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { startMusic, stopMusic } from '../audio/audio'
import { Game, type HudState } from '../game/game'
import { GHOST_COLORS, type GhostSpec } from '../game/ghost'
import { applyLook } from '../game/look'
import type { Theme } from '../game/theme'
import { compileLevel, formatTicks } from '../sim'
import type { WeeklyRace } from '../online/api'

/** Rennen der Top 5 der Vorwoche: alle laufen gleichzeitig, die Kamera folgt dem Erstplatzierten. */
const props = withDefaults(defineProps<{
  theme: Theme
  race: WeeklyRace
  /** Multiplayer uses the same replay engine with the actual player looks. */
  multiplayer?: boolean
  /** Only the multiplayer host can skip playback for every player. */
  canSkip?: boolean
  ghosts?: GhostSpec[]
  replayStartAt?: number | null
}>(), { multiplayer: false, canSkip: false, ghosts: () => [], replayStartAt: null })
const emit = defineEmits<{ exit: []; skip: [] }>()

const column = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hudBar = ref<HTMLElement | null>(null)
const failed = ref(false)
const showReplayIntro = ref(false)
const showFinishIntro = ref(false)
const leavingReplay = ref(false)
let replayIntroTimer: ReturnType<typeof setTimeout> | undefined
let finishHoldTimer: ReturnType<typeof setTimeout> | undefined
let finishExitTimer: ReturnType<typeof setTimeout> | undefined
const hud = shallowRef<HudState>({
  status: 'ready',
  ticks: 0,
  deaths: 0,
  progress: 0,
  countdown: 3,
  race: [],
  newBest: false,
  bestTicks: null,
  replay: '',
  focusedRunner: null,
} as unknown as HudState)

let game: Game | null = null

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--highlight': props.theme.ui.highlight,
  '--muted': props.theme.ui.muted,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
  '--line': props.theme.ui.line,
  '--surround': props.theme.surround,
  '--frame': props.theme.frame,
}))

const specs = computed<GhostSpec[]>(() => props.multiplayer
  ? (props.ghosts ?? [])
  : props.race.entries.map((e, i) => ({ replay: e.replay, label: e.name, color: GHOST_COLORS[i % GHOST_COLORS.length] })),
)

const runnerColor = (index: number): string => {
  const spec = specs.value[index]
  return spec?.color ?? (spec?.look ? applyLook(props.theme, spec.look).player : GHOST_COLORS[index % GHOST_COLORS.length])
}

/** Zeile je Läufer: Platz, Name, Fortschritt und – im Ziel – die Zeit */
const rows = computed(() =>
  props.race.entries.map((e, i) => {
    const r = hud.value.race[i]
    const done = r?.finishTick != null
    return {
      index: i,
      rank: e.rank,
      name: e.name,
      ticks: e.ticks,
      color: runnerColor(i),
      progress: done ? 1 : (r?.progress ?? 0),
      done,
      you: e.you,
    }
  }),
)

function measureInset(): void {
  if (!game || !column.value || !hudBar.value) return
  const bottom = hudBar.value.getBoundingClientRect().bottom - column.value.getBoundingClientRect().top
  game.setTopInset(Math.max(0, bottom) + 8)
}

let insetObs: ResizeObserver | null = null

function focusRunner(index: number): void {
  game?.focusRunner(index)
}

/** The multiplayer intro stays visible until playback begins, with no numeric countdown. */
function cueReplayIntro(startAt: number | null): void {
  clearTimeout(replayIntroTimer)
  const remaining = startAt === null ? 0 : startAt - Date.now()
  showReplayIntro.value = props.multiplayer && remaining > 0
  if (showReplayIntro.value) {
    replayIntroTimer = setTimeout(() => {
      showReplayIntro.value = false
    }, remaining)
  }
}

function replay(): void {
  game?.restart()
}

onMounted(() => {
  startMusic()
  if (!column.value || !canvas.value) return
  game = new Game(canvas.value, column.value, props.theme, (h) => {
    hud.value = h
  })
  measureInset()
  game.setStartAt(props.replayStartAt ?? null)
  game.load(compileLevel(props.race.data), 'race:' + props.race.week)
  if (!game.spectate(specs.value)) {
    failed.value = true
    return
  }
  cueReplayIntro(props.replayStartAt)
  game.restart()
  insetObs = new ResizeObserver(measureInset)
  insetObs.observe(column.value)
})

onBeforeUnmount(() => {
  clearTimeout(replayIntroTimer)
  clearTimeout(finishHoldTimer)
  clearTimeout(finishExitTimer)
  insetObs?.disconnect()
  stopMusic()
  game?.dispose()
  game = null
})

const finished = computed(() => hud.value.status === 'finished')
// Keep the last frame visible for FINISH!, then fade into the existing results view.
watch(finished, (done: boolean) => {
  if (!done || !props.multiplayer) return
  showFinishIntro.value = true
  finishHoldTimer = setTimeout(() => {
    leavingReplay.value = true
  }, 950)
  finishExitTimer = setTimeout(() => emit('exit'), 1250)
})
</script>

<template>
  <div class="stage" :class="{ 'leaving-replay': leavingReplay }" :style="cssVars">
    <div ref="column" class="column">
      <canvas ref="canvas" class="canvas" />

      <div ref="hudBar" class="hud">
        <span class="pill time">{{ formatTicks(hud.ticks) }}</span>
        <span v-if="multiplayer && hud.status === 'running'" class="pill replay-badge">▶ REPLAY</span>
        <span v-else class="pill title">{{ multiplayer ? 'Multiplayer' : 'Last week' }} · {{ race.title }}</span>
        <span class="spacer" />
        <button v-if="!multiplayer" class="pill btn" type="button" aria-label="Watch again" @click="replay">↻</button>
        <button
          v-if="multiplayer && canSkip && !leavingReplay"
          class="pill btn"
          type="button"
          aria-label="Skip replay for everyone"
          @click="emit('skip')"
        >
          Skip
        </button>
        <button
          v-if="!multiplayer || !canSkip"
          class="pill btn"
          type="button"
          :aria-label="multiplayer ? 'Results' : 'Back'"
          @click="emit('exit')"
        >✕</button>
      </div>

      <ol class="standings" aria-label="Standings">
        <li v-for="r in rows" :key="r.rank" :class="{ done: r.done, you: r.you, focused: hud.focusedRunner === r.index }">
          <button class="runner" type="button" :disabled="r.done || finished" :aria-pressed="hud.focusedRunner === r.index" :aria-label="'Follow ' + r.name" @click="focusRunner(r.index)">
            <span class="dot" :style="{ background: r.color }" />
            <span class="n">{{ r.rank }}</span>
            <span class="nm">{{ r.name }}</span>
            <span class="tm">{{ r.done ? formatTicks(r.ticks) : '' }}</span>
            <span class="bar"><i :style="{ width: r.progress * 100 + '%', background: r.color }" /></span>
          </button>
        </li>
      </ol>

      <div v-if="!multiplayer && hud.status === 'ready' && !failed" class="countdown" aria-live="assertive">
        <span :key="hud.countdown">{{ hud.countdown }}</span>
      </div>

      <Transition name="replay-pop">
        <div v-if="multiplayer && showReplayIntro && hud.status === 'ready' && !failed" class="replay-intro" aria-live="polite">
          <span>REPLAY!</span>
        </div>
      </Transition>

      <Transition name="replay-pop">
        <div v-if="multiplayer && showFinishIntro && !failed" class="replay-intro" aria-live="polite">
          <span>FINISH!</span>
        </div>
      </Transition>

      <div v-if="failed" class="result">
        <div class="card">
          <div class="head">Replay not available</div>
          <p class="note">These runs could not be played back.</p>
          <button class="cta" type="button" @click="emit('exit')">{{ multiplayer ? 'Results' : 'Back' }}</button>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="finished && !multiplayer" class="result" data-noinput>
          <div class="card">
            <div class="head">Race finished</div>
            <ol class="final">
              <li v-for="r in rows" :key="r.rank">
                <span class="dot" :style="{ background: r.color }" />
                <span class="n">{{ r.rank }}</span>
                <span class="nm">{{ r.name }}</span>
                <b class="tm">{{ formatTicks(r.ticks) }}</b>
              </li>
            </ol>
            <div class="actions">
              <button class="cta" type="button" @click="replay">Watch again</button>
              <button class="ghost" type="button" @click="emit('exit')">{{ multiplayer ? 'Results' : 'Back' }}</button>
            </div>
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
  background: var(--surround);
  touch-action: none;
  transition: opacity 0.3s ease;
}
.stage.leaving-replay {
  opacity: 0;
}
.column {
  position: relative;
  width: min(100%, 520px);
  height: 100%;
  overflow: hidden;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  box-shadow: 0 0 0 4px var(--frame);
}
.canvas {
  display: block;
}
.hud {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  left: 10px;
  right: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
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
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.time {
  min-width: 7ch;
  text-align: center;
}
.title {
  font-size: 13px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.btn {
  cursor: pointer;
}
.replay-badge {
  background: var(--accent);
  color: var(--outline);
  font-size: 13px;
  letter-spacing: 0.06em;
}
.standings,
.final {
  list-style: none;
  margin: 0;
  padding: 0;
}
.standings {
  position: absolute;
  left: 10px;
  bottom: max(12px, env(safe-area-inset-bottom));
  width: min(230px, 62%);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 14px;
  padding: 6px 8px;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
  opacity: 0.94;
}
.runner,
.final li {
  display: grid;
  grid-template-columns: 10px 14px 1fr auto;
  align-items: center;
  column-gap: 6px;
  padding: 2px 0;
}
.runner .bar {
  grid-column: 1 / -1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
.runner {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
}
.runner:disabled { cursor: default; }
.focused .runner { background: color-mix(in srgb, var(--highlight) 22%, transparent); }
.runner:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.bar i {
  display: block;
  height: 100%;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--outline);
}
.n {
  color: var(--muted);
}
.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.you .nm {
  color: var(--highlight);
}
.countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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
  0% { transform: scale(1.6); opacity: 0; }
  35% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.85; }
}
.replay-intro {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.replay-intro span {
  padding: 12px 22px;
  border: 4px solid var(--outline);
  border-radius: 16px;
  background: var(--accent);
  color: var(--outline);
  box-shadow: 7px 7px 0 var(--outline);
  font-size: clamp(44px, 12vw, 76px);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.04em;
  transform: rotate(-3deg);
  animation: replay-bounce 0.55s cubic-bezier(.22, 1.5, .44, 1) both;
}
@keyframes replay-bounce {
  0% { opacity: 0; transform: scale(0.35) rotate(-12deg); }
  65% { opacity: 1; transform: scale(1.12) rotate(3deg); }
  100% { opacity: 1; transform: scale(1) rotate(-3deg); }
}
.replay-pop-leave-active { transition: opacity 0.18s ease; }
.replay-pop-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .replay-intro span { animation: none; }
  .replay-pop-leave-active { transition: none; }
  .stage { transition: none; }
}
.result {
  position: absolute;
  inset: 0;
  display: flex;
  overflow-y: auto;
  background: rgba(10, 6, 30, 0.45);
  padding: 20px;
}
.card {
  width: min(100%, 340px);
  background: var(--panel);
  color: var(--text);
  border: 3px solid var(--line);
  border-radius: 24px;
  padding: 22px 22px 18px;
  text-align: center;
  box-shadow: 6px 6px 0 var(--outline);
  margin: auto;
}
.head {
  font-size: 26px;
  font-weight: 900;
  color: var(--accent);
  margin-bottom: 10px;
}
.note {
  color: var(--muted);
}
.final {
  text-align: left;
  font-weight: 800;
  margin-bottom: 14px;
}
.final li {
  grid-template-columns: 10px 14px 1fr auto;
  padding: 6px 4px;
  border-top: 1.5px dashed rgba(255, 255, 255, 0.18);
}
.actions {
  display: flex;
  gap: 10px;
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>