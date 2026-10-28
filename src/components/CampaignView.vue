<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Theme } from '../game/theme'
import type { ProgressMap } from '../game/progress'
import { DIFFICULTIES, LEVELS_BY_DIFFICULTY, type Difficulty } from '../levels'
import { formatTicks } from '../sim'
import MedalIcon from './MedalIcon.vue'
import PageShell from './PageShell.vue'

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

const done = computed(() => levels.value.filter((l) => props.progress[l.key]).length)
const golds = computed(() => levels.value.filter((l) => props.progress[l.key]?.medal === 'gold').length)

function resetScroll(): void {
  if (grid.value) grid.value.scrollTop = 0
}

/** Desktop: Pfeiltasten wechseln den Schwierigkeitsgrad, Esc geht zurück */
function onKey(e: KeyboardEvent): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (e.key === 'ArrowLeft') shift(-1)
  else if (e.key === 'ArrowRight') shift(1)
  else if (e.key === 'Escape') emit('exit')
  else return
  e.preventDefault()
}

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await nextTick()
  const el = grid.value?.querySelector<HTMLElement>('[data-focus="true"]')
  el?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <PageShell :theme="theme">
  <div class="camp">
    <header class="top">
      <div class="top-in">
        <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
        <div class="title">
          <b>Campaign</b>
          <small>{{ done }} / {{ levels.length }} completed</small>
          <span class="bar" aria-hidden="true"><i :style="{ width: levels.length ? (done / levels.length) * 100 + '%' : '0%' }" /></span>
        </div>
        <div class="tabs" role="group" aria-label="Difficulty">
          <button
            v-for="d in DIFFICULTIES"
            :key="d.id"
            type="button"
            class="dtab"
            :class="{ on: d.id === difficulty }"
            :aria-pressed="d.id === difficulty"
            @click="emit('update:difficulty', d.id)"
          >
            {{ d.label }} <small>{{ doneIn(d.id) }}</small>
          </button>
        </div>
        <div class="gold" :title="`${golds} gold medals`">
          <MedalIcon medal="gold" :size="20" />
          <b>{{ golds }}</b>
        </div>
      </div>
    </header>

    <div class="diff" role="group" aria-label="Difficulty">
      <div class="diff-in">
        <button class="ib" type="button" aria-label="Previous difficulty" @click="shift(-1)">◀</button>
        <div class="diff-name" aria-live="polite">
          <b>{{ diffLabel }}</b>
          <span class="dots">
            <i v-for="d in DIFFICULTIES" :key="d.id" :class="{ on: d.id === difficulty }" :title="`${d.label}: ${doneIn(d.id)}`" />
          </span>
        </div>
        <button class="ib" type="button" aria-label="Next difficulty" @click="shift(1)">▶</button>
      </div>
    </div>

    <div ref="grid" class="grid-wrap">
      <div class="column">
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
                <span class="name" :class="{ 'on-done': !!progress[l.key] }">{{ l.title }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
  </PageShell>
</template>

<style scoped>
.camp {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Kopfzeilen laufen über die ganze Breite, der Inhalt darin ist begrenzt */
.top,
.diff {
  position: relative;
  background: var(--panel);
  border-bottom: 3px solid var(--line);
}

.top-in,
.diff-in {
  width: min(100%, 520px);
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.top-in {
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
}

.diff-in {
  padding: 10px 12px;
}

.tabs,
.bar {
  display: none;
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
  border: 2px solid var(--line);
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
  border: 2px solid var(--line);
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

/* Der Scrollbereich geht über die volle Breite, so sitzt die Scrollleiste am Fensterrand */
.grid-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  touch-action: pan-y;
}

.column {
  width: min(100%, 520px);
  min-height: 100%;
  margin: 0 auto;
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
  border: 3px solid var(--line);
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

/* Mobil: Name nur bei offenen Leveln, damit die Kachel ruhig bleibt */
.name.on-done {
  display: none;
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

/* --- Tablet und Desktop (ab 600 px) -----------------------------------------------
   Die Kopfleiste geht über die ganze Breite, darunter steht ein Streifen mit den Kacheln,
   der seitlich nur durch Rahmenlinien begrenzt ist. Tabs ersetzen die Pfeile. */
@media (min-width: 600px) {
  .top-in {
    width: 100%;
    gap: 18px;
    padding: 16px 24px;
  }

  .top .ib {
    width: 44px;
    height: 44px;
    transition: transform 0.12s ease, background 0.12s ease;
  }

  .top .ib:hover {
    background: var(--accent);
    color: var(--outline);
    transform: translate(-1px, -1px);
  }

  .title {
    flex: 0 0 auto;
    min-width: 150px;
  }

  .title b {
    font-size: 26px;
    letter-spacing: 0.01em;
  }

  .title small {
    font-size: 13px;
  }

  .bar {
    display: block;
    width: 100%;
    height: 6px;
    margin-top: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--line) 70%, transparent);
    overflow: hidden;
  }

  .bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .gold {
    font-size: 20px;
  }

  .diff {
    display: none;
  }

  .tabs {
    display: flex;
    gap: 6px;
    padding: 4px;
    margin: 0 auto;
    border: 3px solid var(--line);
    border-radius: 999px;
  }

  .dtab {
    cursor: pointer;
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 7px 18px;
    font: inherit;
    font-size: 16px;
    font-weight: 900;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-radius: 999px;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .dtab small {
    font-size: 12px;
    font-weight: 800;
    opacity: 0.8;
  }

  .dtab:hover:not(.on) {
    color: var(--text);
  }

  .dtab.on {
    color: var(--outline);
    background: var(--accent);
  }

  .column {
    width: 100%;
    padding: 28px 28px 36px;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 18px;
  }

  .tile {
    aspect-ratio: 1 / 0.95;
    gap: 6px;
    padding: 10px;
    border-radius: 20px;
    box-shadow: 4px 4px 0 var(--outline);
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }

  .tile:hover {
    transform: translate(-2px, -3px);
    box-shadow: 7px 8px 0 var(--outline);
  }

  .tile:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--outline);
  }

  .tile:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }

  .num {
    font-size: 36px;
  }

  .name,
  .name.on-done {
    display: -webkit-box;
    font-size: 13px;
    -webkit-line-clamp: 2;
  }

  .tile.done .name {
    color: inherit;
    opacity: 0.75;
  }

  .time {
    font-size: 14px;
  }
}

/* Schmale Tablets: Titel und Tabs würden sich drängen, die Tabs bekommen eine eigene Zeile */
@media (min-width: 600px) and (max-width: 819px) {
  .top-in {
    flex-wrap: wrap;
    row-gap: 14px;
  }

  .title {
    flex: 1;
  }

  .tabs {
    order: 3;
    flex: 1 0 100%;
    margin: 0;
  }

  .dtab {
    flex: 1;
    justify-content: center;
  }

  .column {
    padding: 22px 20px 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab-enter-active,
  .tab-leave-active {
    transition: none;
  }
}
</style>