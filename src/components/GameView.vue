<script setup lang="ts">
import { audioSettings, startMusic, stopMusic, toggleAllSound } from '../audio/audio'
import SoundIcon from './SoundIcon.vue'
import { consumeControlsHint } from '../game/hintSeen'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Game, type HudState } from '../game/game'
import type { Theme } from '../game/theme'
import { medalFor, medalTargets } from '../game/medals'
import { compileLevel, formatTicks, type LevelData } from '../sim'
import MedalIcon from './MedalIcon.vue'

const props = withDefaults(
  defineProps<{
    levelData: LevelData
    levelKey: string
    theme: Theme
    exitIcon?: string
    exitText?: string
    par?: number | null
    hasNext?: boolean
    intro?: { number: number; title: string } | null
  }>(),
  { exitIcon: '☰', exitText: 'Menu', par: null, hasNext: false, intro: null },
)
const emit = defineEmits<{
  exit: []
  next: []
  finished: [result: { ticks: number; deaths: number; replay: string }]
}>()

const column = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hud = shallowRef<HudState>({
  status: 'ready',
  ticks: 0,
  deaths: 0,
  progress: 0,
  countdown: 3,
  bestTicks: null,
  newBest: false,
  replay: '',
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
const bestText = computed(() => (hud.value.bestTicks === null ? '–' : formatTicks(hud.value.bestTicks)))
const medal = computed(() =>
  hud.value.status === 'finished' ? medalFor(hud.value.ticks, hud.value.deaths, props.par) : null,
)
const targets = computed(() => (props.par === null ? null : medalTargets(props.par)))
const MEDAL_TEXT = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const
// Steuerung nur im ersten Level der Sitzung zeigen
const hintAllowed = consumeControlsHint()
const showHint = computed(() => hintAllowed && hud.value.status !== 'finished' && hud.value.ticks < 360)

onMounted(() => {
  startMusic()
  if (!column.value || !canvas.value) return
  game = new Game(canvas.value, column.value, props.theme, (h) => {
    hud.value = h
  })
  game.load(compileLevel(props.levelData), props.levelKey)
})

onBeforeUnmount(() => {
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

function restart(): void {
  game?.restart()
}

</script>

<template>
  <div class="stage" :style="cssVars">
    <div ref="column" class="column">
      <canvas ref="canvas" class="canvas" />

      <div class="hud" data-noinput>
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
        <button class="pill btn" type="button" aria-label="Restart" @click="restart">↻</button>
        <button class="pill btn" type="button" :aria-label="exitText" @click="emit('exit')">{{ exitIcon }}</button>
      </div>

      <div class="progress" aria-hidden="true">
        <div class="progress-fill" :style="{ height: hud.progress * 100 + '%' }" />
        <div class="progress-dot" :style="{ top: hud.progress * 100 + '%' }" />
      </div>

      <Transition name="fadeout">
        <div v-if="intro && hud.status === 'ready'" class="intro" aria-hidden="true">
          <small>Level {{ intro.number }}</small>
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
          <div v-if="medal" class="medal">
            <MedalIcon :medal="medal" :size="34" />
            <b>{{ MEDAL_TEXT[medal] }}</b>
          </div>
          <div v-if="targets" class="goals">
            <span>Gold with no deaths ≤ {{ formatTicks(targets.gold) }}</span>
            <span>Silver ≤ {{ formatTicks(targets.silver) }}</span>
          </div>
          <div class="row">
            <span>Deaths</span><b>{{ hud.deaths }}</b>
          </div>
          <div class="row" :class="{ 'row-best': hud.newBest }">
            <span>Best</span><b>{{ bestText }}</b>
          </div>
          <div v-if="hud.newBest" class="badge">
            <i v-for="n in 8" :key="n" class="spark" :style="{ '--a': n * 45 + 'deg' }" aria-hidden="true" />
            <span class="badge-text">★ New best!</span>
          </div>
          <div class="actions">
            <button class="cta" type="button" @click="restart">Retry</button>
            <button class="ghost" type="button" @click="emit('exit')">{{ exitText }}</button>
          </div>
          <button v-if="hasNext" class="cta next" type="button" @click="emit('next')">Next level ▶</button>
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
}

.time {
  font-size: 20px;
  min-width: 84px;
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
  top: 22%;
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
    transform: translateX(-50%) translateY(-12px);
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
  display: grid;
  place-items: center;
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

.next {
  width: 100%;
  margin-top: 10px;
}

.badge {
  position: relative;
  display: inline-block;
  margin-top: 10px;
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