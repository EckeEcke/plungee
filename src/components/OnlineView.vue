<script setup lang="ts">
import PageShell from './PageShell.vue'
import { computed, onMounted, ref, watch } from 'vue'
import type { Theme } from '../game/theme'
import { fetchLevels, loadName, nameProblem, saveName, type LevelSort, type OnlineMeta } from '../online/api'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: []; play: [id: string] }>()

const PAGE = 20
const sort = ref<LevelSort>('new')
const levels = ref<OnlineMeta[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const name = ref(loadName())
const nameBad = computed(() => nameProblem(name.value))
/** Verwirft Antworten veralteter Anfragen (schnelles Umschalten der Reiter) */
let ticket = 0

/** Freigegebene Level können in der Liste fehlen (Seite voll, aber nicht alle sichtbar): offset zählt Server-Zeilen */
let offset = 0

async function load(reset: boolean): Promise<void> {
  const mine = ++ticket
  if (reset) {
    levels.value = []
    offset = 0
    total.value = 0
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetchLevels(sort.value, offset, PAGE)
    if (mine !== ticket) return
    levels.value = reset ? res.levels : [...levels.value, ...res.levels]
    offset += PAGE
    total.value = res.total
  } catch (e) {
    if (mine !== ticket) return
    error.value = e instanceof Error ? e.message : 'Could not load levels'
  } finally {
    if (mine === ticket) loading.value = false
  }
}

onMounted(() => load(true))
watch(sort, () => load(true))

const canMore = computed(() => !loading.value && !error.value && offset < total.value)

function onName(e: Event): void {
  name.value = (e.target as HTMLInputElement).value.slice(0, 16)
  saveName(name.value)
}

function ago(ts: number): string {
  const min = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (min < 60) return min <= 1 ? 'just now' : `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d} d ago` : new Date(ts).toLocaleDateString()
}

const SIZE_TEXT: Record<string, string> = { short: 'Short', medium: 'Medium', long: 'Long' }
</script>

<template>
  <PageShell :theme="theme">
  <div class="community">
    <header class="top">
      <div class="top-in">
        <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
        <div class="title">
          <b>Community levels</b>
          <small>Built by players</small>
        </div>
      </div>
    </header>

    <div class="bar">
      <div class="bar-in">
        <div class="tabs" role="group" aria-label="Sort">
          <button type="button" :class="{ on: sort === 'new' }" :aria-pressed="sort === 'new'" @click="sort = 'new'">
            Newest
          </button>
          <button type="button" :class="{ on: sort === 'plays' }" :aria-pressed="sort === 'plays'" @click="sort = 'plays'">
            Most played
          </button>
        </div>
        <label class="name">
          <span>Your name</span>
          <input type="text" maxlength="16" placeholder="Anonymous" :value="name" :aria-invalid="nameBad ? 'true' : undefined" @input="onName" />
        </label>
        <p v-if="nameBad" class="bad">{{ nameBad }}</p>
      </div>
    </div>

    <div class="scroll">
      <ul class="list">
        <li v-for="l in levels" :key="l.id" class="item">
          <button class="play" type="button" @click="emit('play', l.id)">
            <span class="t">{{ l.title }}</span>
            <span class="m">by {{ l.author }} · {{ SIZE_TEXT[l.size] ?? l.size }} · {{ ago(l.createdAt) }}</span>
            <span class="p">▶ {{ l.plays }} {{ l.plays === 1 ? 'play' : 'plays' }}</span>
          </button>
        </li>
      </ul>

      <p v-if="loading" class="note">Loading …</p>
      <div v-else-if="error" class="note err">
        <p>{{ error }}</p>
        <button class="more" type="button" @click="load(levels.length === 0)">Try again</button>
      </div>
      <p v-else-if="levels.length === 0" class="note">No levels here yet. Build one and upload it from the editor!</p>
      <button v-if="canMore" class="more" type="button" @click="load(false)">Show more</button>
    </div>
  </div>
  </PageShell>
</template>

<style scoped>
.community {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.top,
.bar {
  background: var(--panel);
  border-bottom: 3px solid var(--line);
}

.top-in,
.bar-in {
  width: min(100%, 520px);
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.top-in {
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
}

.bar-in {
  padding: 10px 12px;
  justify-content: space-between;
  flex-wrap: wrap;
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

.tabs {
  display: flex;
  gap: 4px;
  padding: 2px;
  border: 3px solid var(--line);
  border-radius: 999px;
}

.tabs button {
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  padding: 5px 12px;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.tabs button.on {
  color: var(--outline);
  background: var(--accent);
}

.name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}

.name input {
  width: 110px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 5px 8px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
}

.bad {
  flex-basis: 100%;
  margin: 0;
  text-align: right;
  font-size: 12px;
  font-weight: 800;
  color: var(--accent);
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px max(24px, env(safe-area-inset-bottom));
}

.list {
  list-style: none;
  width: min(100%, 520px);
  margin: 0 auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  display: flex;
  gap: 8px;
}

.play {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  padding: 10px 14px;
  color: var(--text);
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 16px;
  box-shadow: 4px 4px 0 var(--outline);
}

.play:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 var(--outline);
}

.t {
  font-size: 17px;
  font-weight: 900;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m,
.p {
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.note {
  width: min(100%, 520px);
  margin: 18px auto 0;
  text-align: center;
  font-weight: 700;
  color: var(--muted);
}

.note.err {
  color: var(--accent);
}

.more {
  display: block;
  margin: 16px auto 0;
  cursor: pointer;
  font: inherit;
  font-size: 16px;
  font-weight: 900;
  padding: 10px 24px;
  color: var(--outline);
  background: var(--accent);
  border: 3px solid var(--outline);
  border-radius: 14px;
  box-shadow: 3px 3px 0 var(--outline);
}

/* Im breiten Container sitzen die Kopfzeilen links wie bei den anderen Seiten */
@media (min-width: 600px) {
  .top-in,
  .bar-in {
    width: 100%;
    padding-inline: 24px;
  }
}
</style>