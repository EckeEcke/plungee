<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import EditorView from './components/EditorView.vue'
import CampaignView from './components/CampaignView.vue'
import GameView from './components/GameView.vue'
import OnlineView from './components/OnlineView.vue'
import AdminView from './components/AdminView.vue'
import WeeklyView from './components/WeeklyView.vue'
import SoundIcon from './components/SoundIcon.vue'
import { audioSettings } from './audio/audio'
import { startOnlineLevel, submitTime, submitWeeklyTime, type BoardState, type OnlineMeta, type WeeklyInfo } from './online/api'
import type { LevelData } from './sim'
import { loadProgress, recordResult } from './game/progress'
import { themeById } from './game/theme'
import { DIFFICULTIES, LEVELS_BY_DIFFICULTY, type Difficulty } from './levels'

const screen = ref<'menu' | 'campaign' | 'play' | 'edit' | 'online' | 'onlinePlay' | 'weekly' | 'weeklyPlay' | 'admin'>('menu')

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

// --- Community-Level ---------------------------------------------------------------

const onlineLevel = ref<{ meta: OnlineMeta; data: LevelData } | null>(null)
const board = ref<BoardState | null>(null)
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let loadingOnline = false

function showNotice(text: string): void {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = ''), 4500)
}

/** Lädt ein Community-Level und startet es; `back` ist die Seite, auf die Fehler und „Zurück“ führen */
async function playOnline(id: string, back: 'online' | 'menu' = 'online'): Promise<void> {
  if (loadingOnline) return
  loadingOnline = true
  try {
    const res = await startOnlineLevel(id)
    onlineLevel.value = res
    board.value = null
    screen.value = 'onlinePlay'
  } catch (e) {
    screen.value = back
    showNotice(e instanceof Error ? e.message : 'Could not load the level')
  } finally {
    loadingOnline = false
  }
}

async function onOnlineFinished(res: { ticks: number; deaths: number; replay: string }): Promise<void> {
  const lv = onlineLevel.value
  if (!lv) return
  board.value = { status: 'loading' }
  try {
    const r = await submitTime(lv.meta.id, res.replay)
    if (onlineLevel.value === lv) board.value = { status: 'ok', improved: r.improved, board: r }
  } catch (e) {
    if (onlineLevel.value === lv) {
      board.value = { status: 'error', error: e instanceof Error ? e.message : 'Could not send your time' }
    }
  }
}

// --- Weekly Challenge ---------------------------------------------------------------

const weeklyLevel = ref<WeeklyInfo | null>(null)

function playWeekly(info: WeeklyInfo): void {
  weeklyLevel.value = info
  board.value = null
  screen.value = 'weeklyPlay'
}

async function onWeeklyFinished(res: { ticks: number; deaths: number; replay: string }): Promise<void> {
  const lv = weeklyLevel.value
  if (!lv) return
  board.value = { status: 'loading' }
  try {
    const r = await submitWeeklyTime(res.replay)
    if (weeklyLevel.value === lv) board.value = { status: 'ok', improved: r.improved, board: r }
  } catch (e) {
    if (weeklyLevel.value === lv) {
      board.value = { status: 'error', error: e instanceof Error ? e.message : 'Could not send your time' }
    }
  }
}

onMounted(() => {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(location.search)
  } catch {
    return
  }
  const id = params.get('level')
  if (params.has('admin')) screen.value = 'admin'
  else if (id) void playOnline(id, 'menu')
  if (id || params.has('admin')) history.replaceState(null, '', location.pathname)
})

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
  '--player-shade': theme.value.playerShade,
  '--outline': theme.value.outline,
  '--line': theme.value.ui.line,
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

  <GameView
    v-else-if="screen === 'onlinePlay' && onlineLevel"
    :key="onlineLevel.meta.id"
    :level-data="onlineLevel.data"
    :level-key="'online:' + onlineLevel.meta.id"
    :theme="theme"
    :board="board"
    :intro="{ number: 0, title: onlineLevel.meta.title }"
    exit-icon="▦"
    exit-text="Community levels"
    @exit="screen = 'online'"
    @finished="onOnlineFinished"
  />

  <GameView
    v-else-if="screen === 'weeklyPlay' && weeklyLevel"
    :key="weeklyLevel.week"
    :level-data="weeklyLevel.data"
    :level-key="'weekly:' + weeklyLevel.week"
    :theme="theme"
    :board="board"
    :intro="{ number: 0, title: weeklyLevel.title, label: 'Weekly challenge' }"
    exit-icon="▦"
    exit-text="Weekly challenge"
    @exit="screen = 'weekly'"
    @finished="onWeeklyFinished"
  />

  <WeeklyView v-else-if="screen === 'weekly'" :theme="theme" @exit="screen = 'menu'" @play="playWeekly" />

  <OnlineView v-else-if="screen === 'online'" :theme="theme" @exit="screen = 'menu'" @play="playOnline($event)" />

  <AdminView v-else-if="screen === 'admin'" :theme="theme" @exit="screen = 'menu'" />

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
        <!-- Gleiche Zeichnung wie der Spielcharakter (renderer.ts drawPlayer) -->
        <svg class="face" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <clipPath id="face-body"><rect x="6" y="6" width="52" height="52" rx="17" /></clipPath>
          </defs>
          <rect x="6" y="6" width="52" height="52" rx="17" class="f-body" />
          <rect x="6" y="41" width="52" height="17" clip-path="url(#face-body)" class="f-shade" />
          <ellipse cx="17.7" cy="16.4" rx="7.4" ry="4.3" transform="rotate(-28.6 17.7 16.4)" class="f-gloss" />
          <rect x="6" y="6" width="52" height="52" rx="17" class="f-line" />
          <circle cx="18.6" cy="27.7" r="10.8" class="f-eye" />
          <circle cx="45.4" cy="27.7" r="10.8" class="f-eye" />
          <circle cx="18.6" cy="27.7" r="5.4" class="f-pupil" />
          <circle cx="45.4" cy="27.7" r="5.4" class="f-pupil" />
        </svg>
        <h1>PLUNGEE</h1>
        <p>Fall fast. Land smart.</p>
      </div>

      <div class="buttons">
        <button class="play" type="button" @click="screen = 'campaign'">Campaign</button>
        <button class="build" type="button" @click="screen = 'weekly'">Weekly challenge</button>
        <button class="build" type="button" @click="screen = 'online'">Community levels</button>
        <button class="build" type="button" @click="screen = 'edit'">Build a level</button>
      </div>

      <div class="snd-row">
        <button
          class="mode"
          type="button"
          role="switch"
          :aria-checked="dark"
          aria-label="Dark mode"
          :title="dark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="dark = !dark"
        >
          <span class="opt" :class="{ on: !dark }" aria-hidden="true">☀</span>
          <span class="opt" :class="{ on: dark }" aria-hidden="true">☾</span>
        </button>
        <button
          class="snd"
          :class="{ on: audioSettings.music }"
          type="button"
          role="switch"
          :aria-checked="audioSettings.music"
          @click="audioSettings.music = !audioSettings.music"
        >
          <SoundIcon kind="music" :on="audioSettings.music" :size="17" /> Music
        </button>
        <button
          class="snd"
          :class="{ on: audioSettings.sfx }"
          type="button"
          role="switch"
          :aria-checked="audioSettings.sfx"
          @click="audioSettings.sfx = !audioSettings.sfx"
        >
          <SoundIcon kind="sound" :on="audioSettings.sfx" :size="17" /> Sound
        </button>
      </div>

      <ul class="tips">
        <li><b>◀ ▶</b> to move, gravity does the rest</li>
        <li><b>Springs</b> send you back up</li>
        <li><b>Red</b> is always dangerous</li>
      </ul>
    </div>
  </main>
  </Transition>
  <Transition name="notice">
    <div v-if="notice" class="notice" role="alert">{{ notice }}</div>
  </Transition>
</template>

<style scoped>
.notice {
  position: fixed;
  left: 50%;
  bottom: max(24px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 50;
  max-width: min(90vw, 420px);
  padding: 10px 18px;
  font-weight: 800;
  text-align: center;
  color: #fff;
  background: #2b2350;
  border: 3px solid #fff;
  border-radius: 14px;
}

.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.25s;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}

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
  width: 78px;
  height: 78px;
  overflow: visible;
  filter: drop-shadow(4px 4px 0 var(--outline));
  animation: bob 1.8s ease-in-out infinite;
}

.f-body {
  fill: var(--player);
}

.f-shade {
  fill: var(--player-shade);
}

.f-gloss {
  fill: #fff;
  opacity: 0.55;
}

.f-line {
  fill: none;
  stroke: var(--outline);
  stroke-width: 5;
  stroke-linejoin: round;
}

.f-eye {
  fill: #fff;
}

.f-pupil {
  fill: var(--outline);
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
  min-width: 240px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 900;
  padding: 10px 34px;
  color: var(--menu-text);
  background: transparent;
  border: 3px solid var(--line);
  border-radius: 16px;
}

.build:active {
  transform: translate(2px, 2px);
}

.mode {
  cursor: pointer;
  display: flex;
  padding: 2px;
  gap: 2px;
  font: inherit;
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 999px;
}

.opt {
  display: grid;
  place-items: center;
  width: 32px;
  height: 28px;
  font-size: 16px;
  line-height: 1;
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

.snd-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.snd {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  color: var(--muted);
  background: transparent;
  border: 3px solid var(--line);
  border-radius: 999px;
}

.snd.on {
  color: var(--outline);
  background: var(--accent);
}
</style>