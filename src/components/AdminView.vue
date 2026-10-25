<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import type { Theme } from '../game/theme'
import type { LevelData } from '../sim'
import { adminLevel, adminPending, adminReview, type PendingMeta } from '../online/api'
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
  const res = await run(() => adminPending(t))
  if (!res) return
  try {
    sessionStorage.setItem(TOKEN_KEY, t)
  } catch {
    /* nicht kritisch */
  }
  levels.value = res.levels
  loaded.value = true
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
      <b>Review levels</b>
    </header>

    <div class="body">
      <form class="login" @submit.prevent="refresh">
        <input v-model="token" type="password" autocomplete="off" placeholder="Admin token" aria-label="Admin token" />
        <button class="go" type="submit" :disabled="busy || !token.trim()">Load</button>
      </form>
      <p v-if="error" class="err">{{ error }}</p>

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
