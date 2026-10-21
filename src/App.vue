<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EditorView from './components/EditorView.vue'
import CampaignView from './components/CampaignView.vue'
import GameView from './components/GameView.vue'
import { loadProgress, recordResult } from './game/progress'
import { themeById } from './game/theme'
import { DIFFICULTIES, LEVELS_BY_DIFFICULTY, type Difficulty } from './levels'

const screen = ref<'menu' | 'campaign' | 'play' | 'edit'>('menu')

/** Gespeicherte Wahl zuerst, sonst die Systemeinstellung (im Webview der Reddit-App erbt sie das Gerät) */
function initialDark(): boolean {
  try {
    const saved = localStorage.getItem('plunge:theme')
    if (saved === 'memphis-dark') return true
    if (saved === 'memphis-light') return false
  } catch {
    /* nicht kritisch */
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

const dark = ref(initialDark())
const themeId = computed(() => (dark.value ? 'memphis-dark' : 'memphis-light'))
const theme = computed(() => themeById(themeId.value))
function loadDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem('plunge:difficulty')
    if (DIFFICULTIES.some((d) => d.id === v)) return v as Difficulty
  } catch {
    /* nicht kritisch */
  }
  return 'easy'
}

/** In der Kampagne angezeigter Schwierigkeitsgrad */
const difficulty = ref<Difficulty>(loadDifficulty())
watch(difficulty, (d) => {
  try {
    localStorage.setItem('plunge:difficulty', d)
  } catch {
    /* nicht kritisch */
  }
})

/** Zuletzt gestartetes Level (Schwierigkeit + Position darin) */
const playDifficulty = ref<Difficulty>(difficulty.value)
const levelIdx = ref(0)
const playList = computed(() => LEVELS_BY_DIFFICULTY[playDifficulty.value])
const current = computed(() => playList.value[levelIdx.value])
const progress = ref(loadProgress())
const hasNext = computed(() => levelIdx.value + 1 < playList.value.length)

function startLevel(i: number, d: Difficulty = difficulty.value): void {
  playDifficulty.value = d
  levelIdx.value = i
  screen.value = 'play'
}

function onFinished(res: { ticks: number; deaths: number }): void {
  progress.value = recordResult(progress.value, current.value.key, res.ticks, res.deaths, current.value.par)
}

watch(themeId, (id) => {
  try {
    localStorage.setItem('plunge:theme', id)
  } catch {
    /* nicht kritisch */
  }
})

const cssVars = computed(() => ({
  '--bg1': theme.value.bgTop,
  '--bg2': theme.value.bgBottom,
  '--panel': theme.value.ui.panel,
  '--text': theme.value.ui.text,
  '--accent': theme.value.ui.accent,
  '--muted': theme.value.ui.muted,
  '--player': theme.value.player,
  '--outline': theme.value.outline,
  '--solid': theme.value.solid,
  '--danger': theme.value.danger,
  '--help': theme.value.help,
  '--c0': theme.value.decor[0],
  '--c1': theme.value.decor[1],
  '--c2': theme.value.decor[2],
  '--c3': theme.value.decor[3],
}))

const menuText = computed(() => (theme.value.id === 'memphis-dark' ? '#FFFFFF' : theme.value.solid))
</script>

<template>
  <Transition name="screen" :duration="220">
  <GameView
    v-if="screen === 'play' && current"
    :key="current.key"
    :level-data="current.data"
    :level-key="current.key"
    :theme="theme"
    :par="current.par"
    :has-next="hasNext"
    :intro="{ number: levelIdx + 1, title: current.title }"
    exit-icon="▦"
    exit-text="Level select"
    @exit="screen = 'campaign'"
    @next="startLevel(levelIdx + 1, playDifficulty)"
    @finished="onFinished"
  />

  <CampaignView
    v-else-if="screen === 'campaign'"
    :theme="theme"
    v-model:difficulty="difficulty"
    :progress="progress"
    :focus-key="current?.key"
    @exit="screen = 'menu'"
    @play="startLevel"
  />

  <EditorView v-else-if="screen === 'edit'" :theme="theme" @exit="screen = 'menu'" />

  <main v-else class="menu" :style="{ ...cssVars, '--menu-text': menuText }">
    <svg class="decor" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <polygon points="60,120 110,210 10,210" fill="var(--c0)" opacity="0.5" />
      <circle cx="330" cy="150" r="34" fill="none" stroke="var(--c2)" stroke-width="10" opacity="0.5" />
      <path d="M250 330 q15 -22 30 0 t30 0 t30 0 t30 0" fill="none" stroke="var(--c1)" stroke-width="10" stroke-linecap="round" opacity="0.6" />
      <path d="M30 470 l22 -26 l22 26 l22 -26 l22 26" fill="none" stroke="var(--c3)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" />
      <g fill="var(--c2)" opacity="0.55">
        <circle cx="300" cy="560" r="6" /><circle cx="324" cy="560" r="6" /><circle cx="348" cy="560" r="6" />
        <circle cx="300" cy="584" r="6" /><circle cx="324" cy="584" r="6" /><circle cx="348" cy="584" r="6" />
      </g>
      <polygon points="90,640 150,690 90,740" fill="var(--c1)" opacity="0.5" />
      <rect x="320" y="690" width="44" height="44" rx="10" fill="var(--c0)" opacity="0.45" transform="rotate(14 342 712)" />
      <path d="M200 20 v40 M180 40 h40" stroke="var(--c3)" stroke-width="10" stroke-linecap="round" opacity="0.5" />
    </svg>

    <div class="content">
      <div class="logo">
        <span class="face" aria-hidden="true">
          <i class="eye l" /><i class="eye r" />
        </span>
        <h1>PLUNGEE</h1>
        <p>Fall fast. Land smart.</p>
      </div>

      <div class="buttons">
        <button class="play" type="button" @click="screen = 'campaign'">Campaign</button>
        <button class="build" type="button" @click="screen = 'edit'">Build a level</button>
      </div>

      <button
        class="mode"
        type="button"
        role="switch"
        :aria-checked="dark"
        aria-label="Dark mode"
        @click="dark = !dark"
      >
        <span class="opt" :class="{ on: !dark }">☀ Light</span>
        <span class="opt" :class="{ on: dark }">☾ Dark</span>
      </button>

      <ul class="tips">
        <li><b>◀ ▶</b> to move, gravity does the rest</li>
        <li><b>Springs</b> send you back up</li>
        <li><b>Red</b> is always dangerous</li>
      </ul>
    </div>
  </main>
  </Transition>
</template>

<style scoped>
.menu {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  color: var(--menu-text);
  overflow: hidden;
}

.decor {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.content {
  position: relative;
  width: min(100%, 420px);
  padding: 24px 24px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
}

.logo {
  text-align: center;
}

.face {
  display: inline-block;
  position: relative;
  width: 64px;
  height: 64px;
  background: var(--player);
  border: 4px solid var(--outline);
  border-radius: 18px;
  box-shadow: 4px 4px 0 var(--outline);
  animation: bob 1.8s ease-in-out infinite;
}

.eye {
  position: absolute;
  top: 18px;
  width: 15px;
  height: 17px;
  background: #fff;
  border-radius: 50%;
  border: 2px solid var(--outline);
}

.eye::after {
  content: '';
  position: absolute;
  left: 4px;
  bottom: 2px;
  width: 6px;
  height: 6px;
  background: var(--outline);
  border-radius: 50%;
}

.eye.l {
  left: 11px;
}

.eye.r {
  right: 11px;
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  50% {
    transform: translateY(-8px) scale(0.96, 1.05);
  }
}

h1 {
  margin: 14px 0 4px;
  font-size: clamp(48px, 16vw, 72px);
  font-weight: 900;
  letter-spacing: 3px;
  color: var(--accent);
  -webkit-text-stroke: 3px var(--outline);
  paint-order: stroke fill;
  text-shadow: 5px 5px 0 var(--outline);
}

.logo p {
  margin: 0;
  font-weight: 800;
  font-size: 18px;
}

.play {
  cursor: pointer;
  font-size: 26px;
  font-weight: 900;
  padding: 14px 52px;
  color: var(--outline);
  background: var(--accent);
  border: 4px solid var(--outline);
  border-radius: 20px;
  box-shadow: 5px 5px 0 var(--outline);
}

.play:active {
  transform: translate(3px, 3px);
  box-shadow: 2px 2px 0 var(--outline);
}

.buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.build {
  cursor: pointer;
  font-size: 18px;
  font-weight: 900;
  padding: 10px 34px;
  color: var(--menu-text);
  background: transparent;
  border: 3px solid var(--outline);
  border-radius: 16px;
}

.build:active {
  transform: translate(2px, 2px);
}

.mode {
  cursor: pointer;
  display: flex;
  padding: 4px;
  gap: 4px;
  font: inherit;
  background: var(--panel);
  border: 3px solid var(--outline);
  border-radius: 999px;
}

.opt {
  padding: 7px 16px;
  font-size: 14px;
  font-weight: 800;
  color: var(--muted);
  border-radius: 999px;
}

.opt.on {
  color: var(--outline);
  background: var(--accent);
}

.tips {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.7;
  text-align: center;
}
</style>
