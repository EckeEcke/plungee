<script setup lang="ts">
import PageShell from './PageShell.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Theme } from '../game/theme'
import { formatTicks } from '../sim'
import { fetchWeekly, fetchWeeklyBoard, fetchWeeklyRace, type WeeklyBoard, type WeeklyInfo, type WeeklyRace } from '../online/api'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: []; play: [info: WeeklyInfo]; race: [race: WeeklyRace] }>()
const raceBusy = ref(false)
const raceError = ref('')

/** Das Rennen der Top 5 der Vorwoche laden und öffnen */
async function watchRace(): Promise<void> {
  if (raceBusy.value) return
  raceBusy.value = true
  raceError.value = ''
  try {
    const r = await fetchWeeklyRace()
    if (r) emit('race', r)
    else raceError.value = 'No replays to show for last week.'
  } catch (e) {
    raceError.value = e instanceof Error ? e.message : 'Could not load the race'
  } finally {
    raceBusy.value = false
  }
}

const info = ref<WeeklyInfo | null>(null)
const board = ref<WeeklyBoard | null>(null)
const loading = ref(true)
const error = ref('')
const nowMs = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [i, b] = await Promise.all([fetchWeekly(), fetchWeeklyBoard()])
    info.value = i
    board.value = b
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load the challenge'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => (nowMs.value = Date.now()), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

const left = computed(() => {
  if (!info.value) return ''
  const min = Math.max(0, Math.floor((info.value.endsAt - nowMs.value) / 60_000))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  if (d > 0) return `${d} d ${h} h left`
  return h > 0 ? `${h} h ${min % 60} min left` : `${min} min left`
})

</script>

<template>
  <PageShell :theme="theme">
  <div class="weekly">
    <header class="top">
      <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
      <div class="title">
        <b>Weekly challenge</b>
        <small>One level, one week, best time wins</small>
      </div>
    </header>

    <div class="scroll">
      <div class="col">
        <p v-if="loading" class="note">Loading …</p>
        <div v-else-if="error" class="note err">
          <p>{{ error }}</p>
          <button class="cta" type="button" @click="load">Try again</button>
        </div>

        <template v-else-if="info && board">
          <section class="hero">
            <small>This week</small>
            <b class="lv">{{ info.title }}</b>
            <span class="left">{{ left }}</span>
            <button class="cta" type="button" @click="emit('play', info)">▶ Play</button>
          </section>

          <section class="card">
            <div class="head">
              <b>Best times</b>
              <span v-if="board.rank">Your rank {{ board.rank }} / {{ board.total }}</span>
              <span v-else-if="board.total">{{ board.total }} {{ board.total === 1 ? 'player' : 'players' }}</span>
            </div>
            <ol v-if="board.top.length" class="rows">
              <li v-for="r in board.top" :key="r.rank" :class="{ you: r.you }">
                <span class="n">{{ r.rank }}</span>
                <span class="who">{{ r.name }}</span>
                <span class="t">{{ formatTicks(r.ticks) }}</span>
              </li>
            </ol>
            <p v-else class="empty">Nobody has finished yet. Be the first!</p>
          </section>

          <section v-if="board.lastWeek" class="card">
            <div class="head">
              <b>Last week<template v-if="board.lastWeek.title"> · {{ board.lastWeek.title }}</template></b>
            </div>
            <ol class="rows">
              <li v-for="r in board.lastWeek.top" :key="r.rank" :class="{ you: r.you }">
                <span class="n">{{ r.rank === 1 ? '🏆' : r.rank }}</span>
                <span class="who">{{ r.name }}</span>
                <span class="t">{{ formatTicks(r.ticks) }}</span>
              </li>
            </ol>
            <button class="race" type="button" :disabled="raceBusy" @click="watchRace">
              {{ raceBusy ? 'Loading …' : '▶ Watch the top 5 race' }}
            </button>
            <p v-if="raceError" class="race-err">{{ raceError }}</p>
          </section>

        </template>
      </div>
    </div>
  </div>
  </PageShell>
</template>

<style scoped>
.weekly {
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

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px max(24px, env(safe-area-inset-bottom));
}

.col {
  width: min(100%, 520px);
  margin: 0 auto;
  display: grid;
  gap: 14px;
}

.note {
  text-align: center;
  font-weight: 700;
  color: var(--muted);
}

.note.err {
  color: var(--accent);
}

.hero,
.card {
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 4px 4px 0 var(--outline);
  padding: 14px 16px;
}

.hero {
  display: grid;
  justify-items: center;
  gap: 4px;
  text-align: center;
}

.hero small {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.lv {
  font-size: 26px;
  font-weight: 900;
  color: var(--accent);
}

.left {
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 8px;
}

.cta {
  cursor: pointer;
  font: inherit;
  font-size: 20px;
  font-weight: 900;
  padding: 10px 36px;
  color: var(--outline);
  background: var(--accent);
  border: 3px solid var(--outline);
  border-radius: 16px;
  box-shadow: 3px 3px 0 var(--outline);
}

.cta:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--outline);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 15px;
}

.head span {
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.rows {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 15px;
  font-weight: 700;
}

.rows li {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 8px;
}

.rows li.you {
  color: var(--outline);
  background: var(--highlight);
}

.rows .n {
  opacity: 0.75;
}

.rows .who {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rows .t {
  font-variant-numeric: tabular-nums;
}

.race {
  display: block;
  margin: 12px auto 2px;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  font-weight: 900;
  padding: 8px 18px;
  color: var(--outline);
  background: var(--accent);
  border: 3px solid var(--outline);
  border-radius: 14px;
  box-shadow: 3px 3px 0 var(--outline);
}

.race:disabled {
  opacity: 0.6;
  cursor: default;
}

.race-err {
  margin: 8px 0 0;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}

.empty {
  margin: 8px 0 0;
  font-weight: 700;
  color: var(--muted);
}

</style>
