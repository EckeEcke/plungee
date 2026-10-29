<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { startMusic, stopMusic } from '../audio/audio'
import { Game, type HudState } from '../game/game'
import { GHOST_COLORS, type GhostSpec } from '../game/ghost'
import type { Theme } from '../game/theme'
import { compileLevel, formatTicks } from '../sim'
import type { WeeklyRace } from '../online/api'

/** Rennen der Top 5 der Vorwoche: alle laufen gleichzeitig, die Kamera folgt dem Erstplatzierten. */
const props = defineProps<{ theme: Theme; race: WeeklyRace }>()
const emit = defineEmits<{ exit: [] }>()

const column = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hudBar = ref<HTMLElement | null>(null)
const failed = ref(false)
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
} as unknown as HudState)

let game: Game | null = null

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--muted': props.theme.ui.muted,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
  '--line': props.theme.ui.line,
  '--surround': props.theme.surround,
  '--frame': props.theme.frame,
}))

const specs = computed<GhostSpec[]>(() =>
  props.race.entries.map((e, i) => ({ replay: e.replay, label: e.name, color: GHOST_COLORS[i % GHOST_COLORS.length] })),
)

/** Zeile je Läufer: Platz, Name, Fortschritt und – im Ziel – die Zeit */
const rows = computed(() =>
  props.race.entries.map((e, i) => {
    const r = hud.value.race[i]
    const done = r?.finishTick != null
    return {
      rank: e.rank,
      name: e.name,
      ticks: e.ticks,
      color: GHOST_COLORS[i % GHOST_COLORS.length],
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
  game.load(compileLevel(props.race.data), 'race:' + props.race.week)
  if (!game.spectate(specs.value)) {
    failed.value = true
    return
  }
  game.restart()
  insetObs = new ResizeObserver(measureInset)
  insetObs.observe(column.value)
})

onBeforeUnmount(() => {
  insetObs?.disconnect()
  stopMusic()
  game?.dispose()
  game = null
})

const finished = computed(() => hud.value.status === 'finished')
</script>

<template>
  <div class="stage" :style="cssVars">
    <div ref="column" class="column">
      <canvas ref="canvas" class="canvas" />

      <div ref="hudBar" class="hud">
        <span class="pill time">{{ formatTicks(hud.ticks) }}</span>
        <span class="pill title">Last week · {{ race.title }}</span>
        <span class="spacer" />
        <button class="pill btn" type="button" aria-label="Watch again" @click="replay">↻</button>
        <button class="pill btn" type="button" aria-label="Back" @click="emit('exit')">✕</button>
      </div>

      <ol class="standings" aria-label="Standings">
        <li v-for="r in rows" :key="r.rank" :class="{ done: r.done, you: r.you }">
          <span class="dot" :style="{ background: r.color }" />
          <span class="n">{{ r.rank }}</span>
          <span class="nm">{{ r.name }}</span>
          <span class="tm">{{ r.done ? formatTicks(r.ticks) : '' }}</span>
          <span class="bar"><i :style="{ width: r.progress * 100 + '%', background: r.color }" /></span>
        </li>
      </ol>

      <div v-if="hud.status === 'ready' && !failed" class="countdown" aria-live="assertive">
        <span :key="hud.countdown">{{ hud.countdown }}</span>
      </div>

      <div v-if="failed" class="result">
        <div class="card">
          <div class="head">Replay not available</div>
          <p class="note">These runs could not be played back.</p>
          <button class="cta" type="button" @click="emit('exit')">Back</button>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="finished" class="result" data-noinput>
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
              <button class="ghost" type="button" @click="emit('exit')">Back</button>
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
.standings li,
.final li {
  display: grid;
  grid-template-columns: 10px 14px 1fr auto;
  align-items: center;
  column-gap: 6px;
  padding: 2px 0;
}
.standings li .bar {
  grid-column: 1 / -1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
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
  color: var(--accent);
}
.countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 120px;
  font-weight: 900;
  color: var(--text);
  text-shadow: 4px 4px 0 var(--outline);
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