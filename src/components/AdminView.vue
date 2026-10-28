<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import type { Theme } from '../game/theme'
import type { LevelData } from '../sim'
import { formatTicks } from '../sim'
import {
  adminClearFirstClear,
  adminClearName,
  adminDeleteTime,
  adminLevel,
  adminLevels,
  adminPending,
  adminReview,
  adminTimes,
  adminWeeks,
  type AdminLevelRow,
  type AdminTimeRow,
  type PendingMeta,
} from '../online/api'
import GameView from './GameView.vue'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: [] }>()

const TOKEN_KEY = 'plungee:admin-token'
function savedToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

const token = ref(savedToken())
const levels = ref<PendingMeta[]>([])
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const preview = shallowRef<{ id: string; data: LevelData } | null>(null)

type Tab = 'review' | 'levels' | 'weekly'
const tab = ref<Tab>('review')
const approved = ref<AdminLevelRow[]>([])
const approvedTotal = ref(0)
const weeks = ref<string[]>([])
/** Geöffnete Bestenliste: "level:{id}" oder "week:{montag}" */
const timesOf = ref<{ target: string; label: string } | null>(null)
const entries = ref<AdminTimeRow[]>([])
const entriesTotal = ref(0)

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--muted': props.theme.ui.muted,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
  '--line': props.theme.ui.line,
}))

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = ''
  try {
    return await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed'
    return undefined
  } finally {
    busy.value = false
  }
}

async function refresh(): Promise<void> {
  const t = token.value.trim()
  if (!t) return
  if (tab.value === 'review') {
    const res = await run(() => adminPending(t))
    if (!res) return
    levels.value = res.levels
  } else if (tab.value === 'levels') {
    const res = await run(() => adminLevels(t, 0, 100))
    if (!res) return
    approved.value = res.levels
    approvedTotal.value = res.total
  } else {
    const res = await run(() => adminWeeks(t))
    if (!res) return
    weeks.value = res.weeks
  }
  try {
    sessionStorage.setItem(TOKEN_KEY, t)
  } catch {
    /* nicht kritisch */
  }
  loaded.value = true
}

async function switchTab(next: Tab): Promise<void> {
  tab.value = next
  timesOf.value = null
  error.value = ''
  if (loaded.value) await refresh()
}

async function deleteLevel(l: AdminLevelRow): Promise<void> {
  if (!window.confirm(`Delete "${l.title}" with all its times? This cannot be undone.`)) return
  const res = await run(() => adminReview(token.value.trim(), l.id, 'delete'))
  if (res) {
    approved.value = approved.value.filter((x) => x.id !== l.id)
    approvedTotal.value = Math.max(0, approvedTotal.value - 1)
  }
}

async function clearFirstClear(l: AdminLevelRow): Promise<void> {
  if (!l.firstClear || !window.confirm(`Remove the first clear by "${l.firstClear.name}" from "${l.title}"?`)) return
  const res = await run(() => adminClearFirstClear(token.value.trim(), l.id))
  if (res) l.firstClear = null
}

async function openTimes(target: string, label: string): Promise<void> {
  const res = await run(() => adminTimes(token.value.trim(), target))
  if (!res) return
  timesOf.value = { target, label }
  entries.value = res.entries
  entriesTotal.value = res.total
}

async function deleteEntry(e: AdminTimeRow, clearName: boolean): Promise<void> {
  const what = clearName ? `Delete ${e.name}'s time and reset their name?` : `Delete ${e.name}'s time?`
  if (!timesOf.value || !window.confirm(what)) return
  const target = timesOf.value.target
  const res = await run(() => adminDeleteTime(token.value.trim(), target, e.playerId, clearName))
  if (res) await openTimes(target, timesOf.value.label)
}

async function resetName(e: AdminTimeRow): Promise<void> {
  if (!timesOf.value || !window.confirm(`Reset the name "${e.name}" to Anonymous?`)) return
  const target = timesOf.value.target
  const res = await run(() => adminClearName(token.value.trim(), e.playerId))
  if (res) await openTimes(target, timesOf.value.label)
}

async function review(l: PendingMeta, action: 'approve' | 'reject'): Promise<void> {
  if (action === 'reject' && !window.confirm(`Reject and delete "${l.title}"?`)) return
  const res = await run(() => adminReview(token.value.trim(), l.id, action))
  if (res) levels.value = levels.value.filter((x) => x.id !== l.id)
}

async function open(l: PendingMeta): Promise<void> {
  const res = await run(() => adminLevel(token.value.trim(), l.id))
  if (res) preview.value = { id: l.id, data: res.data }
}
</script>

<template>
  <GameView
    v-if="preview"
    :key="preview.id"
    :level-data="preview.data"
    :level-key="'admin:' + preview.id"
    :theme="theme"
    exit-icon="←"
    exit-text="Back to review"
    @exit="preview = null"
  />

  <div v-else class="ad" :style="cssVars">
    <header class="top">
      <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
      <b>Moderation</b>
    </header>

    <div class="body">
      <form class="login" @submit.prevent="refresh">
        <input v-model="token" type="password" autocomplete="off" placeholder="Admin token" aria-label="Admin token" />
        <button class="go" type="submit" :disabled="busy || !token.trim()">Load</button>
      </form>
      <p v-if="error" class="err">{{ error }}</p>

      <div class="tabs" role="group" aria-label="Section">
        <button type="button" :class="{ on: tab === 'review' }" @click="switchTab('review')">Review</button>
        <button type="button" :class="{ on: tab === 'levels' }" @click="switchTab('levels')">Levels</button>
        <button type="button" :class="{ on: tab === 'weekly' }" @click="switchTab('weekly')">Weekly</button>
      </div>

      <!-- Bestenliste mit Löschen -->
      <template v-if="timesOf">
        <div class="crumb">
          <button type="button" @click="timesOf = null">← Back</button>
          <b>{{ timesOf.label }}</b>
          <span>{{ entriesTotal }} {{ entriesTotal === 1 ? 'time' : 'times' }}</span>
        </div>
        <p v-if="entries.length === 0" class="note">No times here.</p>
        <ul class="list">
          <li v-for="e in entries" :key="e.playerId" class="item" :class="{ flag: e.flagged }">
            <div class="info">
              <b>{{ e.rank }}. {{ e.name }} <em v-if="e.flagged">· check name</em></b>
              <span>{{ formatTicks(e.ticks) }}{{ e.hasReplay ? ' · replay' : '' }}</span>
            </div>
            <div class="acts">
              <button type="button" :disabled="busy" @click="resetName(e)">Reset name</button>
              <button class="no" type="button" :disabled="busy" @click="deleteEntry(e, false)">Delete time</button>
              <button class="no" type="button" :disabled="busy" @click="deleteEntry(e, true)">Delete + reset name</button>
            </div>
          </li>
        </ul>
        <p v-if="entriesTotal > entries.length" class="note">Showing the best {{ entries.length }}.</p>
      </template>

      <template v-else-if="tab === 'levels'">
        <p v-if="loaded" class="note">{{ approvedTotal }} published {{ approvedTotal === 1 ? 'level' : 'levels' }}</p>
        <ul class="list">
          <li v-for="l in approved" :key="l.id" class="item" :class="{ flag: l.flagged }">
            <div class="info">
              <b>{{ l.title }} <em v-if="l.flagged">· check text</em></b>
              <span>by {{ l.author }} · {{ l.size }} · {{ l.plays }} plays · {{ new Date(l.createdAt).toLocaleDateString() }}</span>
              <span v-if="l.firstClear">🚩 First clear: {{ l.firstClear.name }}</span>
            </div>
            <div class="acts">
              <button type="button" :disabled="busy" @click="open({ ...l, status: 'approved' })">▶ Play</button>
              <button type="button" :disabled="busy" @click="openTimes('level:' + l.id, l.title)">Times</button>
              <button v-if="l.firstClear" type="button" :disabled="busy" @click="clearFirstClear(l)">Clear flag</button>
              <button class="no" type="button" :disabled="busy" @click="deleteLevel(l)">Delete</button>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="tab === 'weekly'">
        <ul class="list">
          <li v-for="(w, i) in weeks" :key="w" class="item">
            <div class="info">
              <b>{{ i === 0 ? 'This week' : 'Last week' }}</b>
              <span>Week of {{ w }}</span>
            </div>
            <div class="acts">
              <button type="button" :disabled="busy" @click="openTimes('week:' + w, (i === 0 ? 'This week' : 'Last week') + ' · ' + w)">Times</button>
            </div>
          </li>
        </ul>
      </template>

      <template v-else>
      <p v-if="loaded && levels.length === 0" class="note">Nothing waiting for review.</p>
      <ul class="list">
        <li v-for="l in levels" :key="l.id" class="item">
          <div class="info">
            <b>{{ l.title }}</b>
            <span>by {{ l.author }} · {{ l.size }} · {{ new Date(l.createdAt).toLocaleString() }}</span>
          </div>
          <div class="acts">
            <button type="button" :disabled="busy" @click="open(l)">▶ Play</button>
            <button class="ok" type="button" :disabled="busy" @click="review(l, 'approve')">Approve</button>
            <button class="no" type="button" :disabled="busy" @click="review(l, 'reject')">Reject</button>
          </div>
        </li>
      </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ad {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  color: var(--text);
}

.top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  background: var(--panel);
  border-bottom: 3px solid var(--line);
  font-size: 18px;
  color: var(--accent);
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

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: min(100%, 560px);
  margin: 0 auto;
  padding: 14px 12px 32px;
}

.login {
  display: flex;
  gap: 8px;
}

.login input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 8px 10px;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 10px;
}

button {
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

.go,
.acts button {
  padding: 7px 12px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
}

.go {
  color: var(--outline);
  background: var(--accent);
  border-color: var(--outline);
}

.tabs {
  display: flex;
  gap: 4px;
  margin-top: 12px;
  padding: 2px;
  border: 3px solid var(--line);
  border-radius: 999px;
}

.tabs button {
  flex: 1;
  padding: 5px 10px;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.tabs button.on {
  color: var(--outline);
  background: var(--accent);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.crumb button {
  padding: 5px 10px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
}

.crumb span {
  margin-left: auto;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.item.flag {
  border-color: var(--accent);
}

.info em {
  font-style: normal;
  color: var(--accent);
}

.acts {
  flex-wrap: wrap;
}

.acts .no {
  color: var(--accent);
}

.acts .ok {
  color: var(--outline);
  background: var(--accent);
  border-color: var(--outline);
}

.err {
  color: var(--accent);
  font-weight: 800;
}

.note {
  text-align: center;
  color: var(--muted);
  font-weight: 700;
}

.list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.item {
  padding: 10px 12px;
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 14px;
}

.info {
  display: grid;
  gap: 2px;
}

.info span {
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.acts {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>