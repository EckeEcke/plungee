<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { Theme } from '../game/theme'
import type { ProgressMap } from '../game/progress'
import { DIFFICULTIES, LEVELS_BY_DIFFICULTY, type Difficulty } from '../levels'
import { formatTicks } from '../sim'
import MedalIcon from './MedalIcon.vue'

const props = defineProps<{ theme: Theme; progress: ProgressMap; difficulty: Difficulty; focusKey?: string }>()
const emit = defineEmits<{ exit: []; play: [index: number]; 'update:difficulty': [d: Difficulty] }>()

const levels = computed(() => LEVELS_BY_DIFFICULTY[props.difficulty])
const diffIdx = computed(() => DIFFICULTIES.findIndex((d) => d.id === props.difficulty))
const diffLabel = computed(() => DIFFICULTIES[diffIdx.value].label)

/** Durchschalten mit Umbruch: nach Schwer kommt wieder Leicht */
function shift(step: number): void {
  const n = DIFFICULTIES.length
  emit('update:difficulty', DIFFICULTIES[(diffIdx.value + step + n) % n].id)
}

/** Fortschritt je Schwierigkeitsgrad für die Punkte unter dem Umschalter */
function doneIn(d: Difficulty): string {
  const list = LEVELS_BY_DIFFICULTY[d]
  return `${list.filter((l) => props.progress[l.key]).length}/${list.length}`
}

const grid = ref<HTMLElement | null>(null)

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--muted': props.theme.ui.muted,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
}))

const done = computed(() => levels.value.filter((l) => props.progress[l.key]).length)
const golds = computed(() => levels.value.filter((l) => props.progress[l.key]?.medal === 'gold').length)

function resetScroll(): void {
  if (grid.value) grid.value.scrollTop = 0
}

onMounted(async () => {
  await nextTick()
  const el = grid.value?.querySelector<HTMLElement>('[data-focus="true"]')
  el?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div class="camp" :style="cssVars">
    <div class="column">
      <header class="top">
        <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
        <div class="title">
          <b>Campaign</b>
          <small>{{ done }} / {{ levels.length }} completed</small>
        </div>
        <div class="gold" :title="`${golds} gold medals`">
          <MedalIcon medal="gold" :size="20" />
          <b>{{ golds }}</b>
        </div>
      </header>

      <div class="diff" role="group" aria-label="Difficulty">
        <button class="ib" type="button" aria-label="Previous difficulty" @click="shift(-1)">◀</button>
        <div class="diff-name" aria-live="polite">
          <b>{{ diffLabel }}</b>
          <span class="dots">
            <i v-for="d in DIFFICULTIES" :key="d.id" :class="{ on: d.id === difficulty }" :title="`${d.label}: ${doneIn(d.id)}`" />
          </span>
        </div>
        <button class="ib" type="button" aria-label="Next difficulty" @click="shift(1)">▶</button>
      </div>

      <div ref="grid" class="grid-wrap">
        <Transition name="tab" mode="out-in" @after-leave="resetScroll">
        <div :key="difficulty" class="pane">
        <p v-if="levels.length === 0" class="empty">No levels here yet.</p>
        <div class="grid">
          <button
            v-for="(l, i) in levels"
            :key="l.key"
            type="button"
            class="tile"
            :class="{ done: !!progress[l.key] }"
            :data-focus="l.key === focusKey"
            :aria-label="`Level ${i + 1}: ${l.title}${progress[l.key] ? ', completed' : ''}`"
            @click="emit('play', i)"
          >
            <span class="num">{{ i + 1 }}</span>
            <span v-if="progress[l.key]" class="meta">
              <MedalIcon :medal="progress[l.key].medal" :size="18" />
              <span class="time">{{ formatTicks(progress[l.key].bestTicks) }}</span>
            </span>
            <span v-else class="name">{{ l.title }}</span>
          </button>
        </div>
        </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.camp {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  color: var(--text);
}

.column {
  width: min(100%, 520px);
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  background: var(--panel);
  border-bottom: 3px solid var(--outline);
}

.title {
  flex: 1;
  line-height: 1.15;
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

.ib {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--outline);
  border-radius: 12px;
  cursor: pointer;
}

.gold {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 16px;
  font-weight: 900;
}

.diff {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--panel);
  border-bottom: 3px solid var(--outline);
}

.diff-name {
  flex: 1;
  text-align: center;
  line-height: 1.2;
}

.diff-name b {
  display: block;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.dots {
  display: inline-flex;
  gap: 6px;
  margin-top: 3px;
}

.dots i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--outline);
  background: transparent;
}

.dots i.on {
  background: var(--accent);
}

.empty {
  margin: 24px 0 0;
  text-align: center;
  font-weight: 700;
  color: var(--muted);
}

.grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  touch-action: pan-y;
  padding: 14px 12px max(18px, env(safe-area-inset-bottom));
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
}

.tile {
  cursor: pointer;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px;
  font: inherit;
  color: var(--text);
  background: var(--panel);
  border: 3px solid var(--outline);
  border-radius: 16px;
  box-shadow: 3px 3px 0 var(--outline);
}

.tile:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--outline);
}

.tile.done {
  color: #0B2E1C;
  background: #2ECC71;
}

.num {
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
}

.name {
  max-width: 100%;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  color: var(--muted);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.meta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.time {
  font-size: 12px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

/* Tab change (easy / normal / hard): old list fades out quickly, new one fades in */
.tab-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}
.tab-leave-active {
  transition: opacity 0.1s ease;
}
.tab-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.tab-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tab-enter-active,
  .tab-leave-active {
    transition: none;
  }
}
</style>
