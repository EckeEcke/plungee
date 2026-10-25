<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  DIRS,
  HAMMER_AMPLITUDES,
  HAMMER_LENGTHS,
  HAMMER_SPEEDS,
  LASER_SPEEDS,
  PHASE_QUARTERS,
  SAW_LENGTHS,
  SAW_SPEEDS,
  TILE_HINTS,
  TILE_OPTIONS,
  TOOLS,
  hammerPhasePatch,
  hammerPhaseQuarter,
  hammerSpeedIndex,
  hasParams,
  laserPhasePatch,
  laserPhaseQuarter,
  laserSpeedIndex,
  laserSpeedPatch,
  sawSpeedIndex,
  moverSpeedIndex,
  MOVER_LENGTHS,
  MOVER_SPEEDS,
  MOVER_WIDTHS,
  type ToolId,
} from '../editor/brush'
import type { TileChar } from '../sim'
import { EditorController } from '../editor/controller'
import { EditorDoc } from '../editor/doc'
import { levelHash } from '../editor/hash'
import { verifyRun, type RunProof } from '../editor/share'
import { loadName, saveName, uploadLevel } from '../online/api'
import { loadDraft, saveDraft } from '../editor/storage'
import { levelFnName, levelToTs } from '../editor/tscode'
import type { Theme } from '../game/theme'
import { LEVELS } from '../levels'
import { LEVEL_ROWS, formatTicks, type EntityData, type LevelData, type LevelSize } from '../sim'
import GameView from './GameView.vue'
import ToolIcon from './ToolIcon.vue'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: [] }>()

const DEV = import.meta.env.DEV
const ARROW = { u: '▲', d: '▼', l: '◀', r: '▶' } as const
const PHASE_LABELS = ['0', '¼', '½', '¾']
const SIZE_LABELS: Record<LevelSize, string> = { short: 'Short', medium: 'Medium', long: 'Long' }
const ENTITY_LABELS: Record<EntityData['t'], string> = {
  spawn: 'Start',
  goal: 'Goal',
  checkpoint: 'Checkpoint',
  spring: 'Spring',
  spikes: 'Spikes',
  laser: 'Laser',
  hammer: 'Hammer',
  saw: 'Saw',
  mover: 'Mover',
}
const TOOL_HINTS: Record<ToolId, string> = {
  select: 'Tap an object to edit it, drag to move it.',
  tile: 'Drag to paint blocks. Start on a block to erase.',
  erase: 'Drag to erase blocks and objects.',
  spring: 'Springs need a free cell. Place side springs against a wall, with the base facing the wall.',
  spikes: 'The spikes point in the chosen direction.',
  laser: 'The beam runs to the next wall. It flashes before it switches on.',
  hammer: 'The pivot can sit in mid-air. The dashed arc shows the swing.',
  saw: 'The saw travels back and forth along the dashed track, even through walls. The end is clipped to the level edge.',
  mover: 'A one-way platform that carries you along its dashed track. You can jump up through it and land on it from above.',
  checkpoint: 'Sets a respawn point. Tap again to remove it.',
  spawn: 'Tap to set the start point.',
  goal: 'Tap to set the goal.',
}

// --- Dokument und Zustand ----------------------------------------------------

const draft = loadDraft()
const doc = draft ? new EditorDoc(draft.level) : EditorDoc.createStarter('short')
const uiVersion = ref(0)
const bump = (): void => {
  uiVersion.value++
}
doc.onChange = bump

const proof = shallowRef<{ hash: string; run: RunProof } | null>(draft?.proof ?? null)
const ctrl = shallowRef<EditorController | null>(null)
const tool = ref<ToolId>('tile')
const mode = ref<'edit' | 'test'>('edit')
const menuOpen = ref(false)
const errorsOpen = ref(false)
const toast = ref('')
const testData = shallowRef<LevelData | null>(null)
const testKey = ref('')

const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const minimap = ref<HTMLCanvasElement | null>(null)

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
  '--danger': props.theme.danger,
}))

const errors = computed(() => {
  void uiVersion.value
  return doc.validate()
})
const hash = computed(() => {
  void uiVersion.value
  return doc.hash()
})
const verified = computed(() => !!proof.value && proof.value.hash === hash.value && errors.value.length === 0)

const statusClass = computed(() => (errors.value.length ? 'warn' : verified.value ? 'ok' : 'info'))
const statusText = computed(() => {
  const n = errors.value.length
  if (n) return `⚠ ${n} ${n === 1 ? 'problem' : 'problems'}`
  if (verified.value && proof.value) return `✓ tested ${formatTicks(proof.value.run.ticks)}`
  return '○ untested'
})

// Minimap: standardmäßig aus, damit sie das Level nicht verdeckt
const MINIMAP_KEY = 'plungee:editor-minimap'
const minimapOn = ref(false)
try {
  minimapOn.value = localStorage.getItem(MINIMAP_KEY) === '1'
} catch {
  /* Speicher nicht verfügbar */
}
function toggleMinimap() {
  minimapOn.value = !minimapOn.value
  try {
    localStorage.setItem(MINIMAP_KEY, minimapOn.value ? '1' : '0')
  } catch {
    /* nicht kritisch */
  }
}

const levelInfo = computed(() => {
  void uiVersion.value
  return `${doc.rows} rows`
})
const canUndo = computed(() => (void uiVersion.value, doc.canUndo))
const canRedo = computed(() => (void uiVersion.value, doc.canRedo))
const titleText = computed(() => (void uiVersion.value, doc.title || 'Untitled'))

const selectedEntity = computed(() => (void uiVersion.value, ctrl.value?.selectedEntity ?? null))

/** Objekt, dessen Parameter das Panel zeigt: das ausgewählte oder die Pinsel-Vorlage. */
const target = computed<EntityData | null>(() => {
  void uiVersion.value
  const c = ctrl.value
  if (!c) return null
  if (tool.value === 'select') {
    const e = c.selectedEntity
    return e && hasParams(e.t) ? { ...e } : null
  }
  if (tool.value === 'spring' || tool.value === 'spikes' || tool.value === 'laser' || tool.value === 'hammer' || tool.value === 'saw' || tool.value === 'mover') {
    // Kopie, damit Vue nach jeder Änderung neu rendert (die Pinsel-Vorlage ist nicht reaktiv)
    return { ...c.brush[tool.value] }
  }
  return null
})

function pick<T extends EntityData['t']>(e: EntityData | null, t: T): Extract<EntityData, { t: T }> | null {
  return e && e.t === t ? (e as Extract<EntityData, { t: T }>) : null
}
const sp = computed(() => pick(target.value, 'spring'))
const sk = computed(() => pick(target.value, 'spikes'))
const ls = computed(() => pick(target.value, 'laser'))
const hm = computed(() => pick(target.value, 'hammer'))
const sw = computed(() => pick(target.value, 'saw'))
const mv = computed(() => pick(target.value, 'mover'))

const tileKind = computed(() => (void uiVersion.value, ctrl.value?.brush.tile ?? '#'))
function pickTileKind(ch: TileChar): void {
  if (!ctrl.value) return
  ctrl.value.brush.tile = ch
  bump()
}
function swatchStyle(ch: TileChar): Record<string, string> {
  const t = props.theme
  if (ch === 'X' || ch === 'O') {
    return { background: ch === 'X' ? t.help : t.help2, borderColor: t.outline }
  }
  const color = ch === 'I' ? t.ice : ch === 'B' ? t.brittle : ch === '=' ? t.solidTop : t.solid
  const top = ch === 'I' ? t.iceTop : ch === 'B' ? t.brittleTop : t.solidTop
  return ch === '='
    ? { background: `linear-gradient(${top} 0 35%, transparent 35%)`, borderColor: t.outline }
    : { background: `linear-gradient(${top} 0 30%, ${color} 30%)`, borderColor: t.outline }
}

const showHint = computed(() => !(tool.value === 'select' && selectedEntity.value) && tool.value !== 'tile')

// --- Aktionen ------------------------------------------------------------------

let toastTimer = 0
function showToast(msg: string): void {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 2800)
}

function onPaletteWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  el.scrollLeft += d
  e.preventDefault()
}

function pickTool(t: ToolId): void {
  tool.value = t
  ctrl.value?.setTool(t)
}

function apply(patch: Record<string, unknown>): void {
  const c = ctrl.value
  if (!c) return
  if (tool.value === 'select') {
    c.updateSelected(patch)
  } else {
    const t = tool.value as 'spring' | 'spikes' | 'laser' | 'hammer' | 'saw' | 'mover'
    Object.assign(c.brush[t], patch)
    bump()
  }
}

function onTitle(e: Event): void {
  doc.title = (e.target as HTMLInputElement).value.slice(0, 40)
  bump()
}

function startTest(): void {
  if (errors.value.length) {
    errorsOpen.value = true
    showToast('Fix the problems first')
    return
  }
  errorsOpen.value = false
  const data = doc.toLevelData()
  testData.value = data
  testKey.value = 'edit-' + levelHash(data)
  if (ctrl.value) ctrl.value.paused = true
  mode.value = 'test'
}

function leaveTest(): void {
  mode.value = 'edit'
  testData.value = null
  if (ctrl.value) ctrl.value.paused = false
}

function onFinished(res: { ticks: number; deaths: number; replay: string }): void {
  const data = testData.value
  if (!data) return
  const run: RunProof = { ticks: res.ticks, replay: res.replay }
  const check = verifyRun(data, run)
  if (check.ok) {
    proof.value = { hash: levelHash(data), run }
    showToast('Done! The level is tested and can be shared.')
  } else {
    showToast('Run not accepted: ' + check.reason)
  }
}

function setSize(size: LevelSize): void {
  if (size === doc.size) return
  if (
    doc.wouldLoseContent(size) &&
    !window.confirm('Shrinking removes blocks and objects at the bottom. Continue?')
  ) {
    return
  }
  doc.resize(size)
  ctrl.value?.select(null)
}

function loadFresh(data: LevelData): void {
  doc.replaceWith(data)
  proof.value = null
  ctrl.value?.select(null)
  const spawn = doc.entityList.find((e) => e.t === 'spawn')
  ctrl.value?.scrollToRow(spawn ? spawn.y : 0)
  menuOpen.value = false
}

function newLevel(size: LevelSize): void {
  if (!window.confirm('The current level will be discarded. Start over?')) return
  loadFresh(EditorDoc.createStarter(size).toLevelData())
}

function loadTemplate(data: LevelData): void {
  if (!window.confirm('The current level will be replaced by the template. Continue?')) return
  loadFresh(structuredClone(data))
}

// --- Hochladen zur Freigabe ---------------------------------------------------------

const uploading = ref(false)
const authorName = ref(loadName())
/** Hashes, die in dieser Sitzung schon hochgeladen wurden (der Server lehnt Doppelte ohnehin ab) */
const uploadedHashes = new Set<string>()
const titleOk = computed(() => {
  void uiVersion.value
  const n = doc.title.trim().length
  return n >= 3 && n <= 32
})
const alreadyUploaded = computed(() => uploadedHashes.has(hash.value))
const canUpload = computed(() => verified.value && titleOk.value && !uploading.value && !alreadyUploaded.value)

function onAuthor(e: Event): void {
  authorName.value = (e.target as HTMLInputElement).value.slice(0, 16)
  saveName(authorName.value)
}

async function upload(): Promise<void> {
  if (!canUpload.value || !proof.value) return
  const data = doc.toLevelData()
  const h = levelHash(data)
  uploading.value = true
  try {
    await uploadLevel(doc.title.trim(), data, proof.value.run.replay)
    uploadedHashes.add(h)
    showToast('Uploaded! It shows up in Community levels once it has been approved.')
  } catch (e) {
    if (e instanceof Error && /already uploaded/i.test(e.message)) uploadedHashes.add(h)
    showToast(e instanceof Error ? e.message : 'Upload failed')
  } finally {
    uploading.value = false
  }
}

async function copyTs(): Promise<void> {
  if (errors.value.length) return
  try {
    await navigator.clipboard.writeText(levelToTs(doc.toLevelData()))
    showToast('TypeScript copied')
  } catch {
    showToast('Copy not possible, please save the file')
  }
}

function downloadTs(): void {
  if (errors.value.length) return
  const data = doc.toLevelData()
  const fn = levelFnName(data.title)
  const name = fn.replace(/^create/, '').replace(/Level$/, '')
  const file = (name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() || 'custom') + '.level.ts'
  const url = URL.createObjectURL(new Blob([levelToTs(data, fn)], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = file
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function onKey(e: KeyboardEvent): void {
  if (mode.value !== 'edit') return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.code === 'KeyZ') {
    e.preventDefault()
    if (e.shiftKey) doc.redo()
    else doc.undo()
  } else if (mod && e.code === 'KeyY') {
    e.preventDefault()
    doc.redo()
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
    if (ctrl.value?.selectedEntity) {
      e.preventDefault()
      ctrl.value.deleteSelected()
    }
  } else if (e.code === 'Escape') {
    if (menuOpen.value) menuOpen.value = false
    else ctrl.value?.select(null)
  }
}

// --- Entwurf automatisch sichern ------------------------------------------------

let saveTimer = 0
function save(): void {
  saveDraft({ level: doc.toLevelData(), proof: proof.value })
}
watch([uiVersion, proof], () => {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(save, 500)
})

watch(
  () => props.theme,
  (t) => ctrl.value?.setTheme(t),
)

onMounted(() => {
  if (!wrap.value || !canvas.value || !minimap.value) return
  const c = new EditorController(canvas.value, wrap.value, props.theme, doc, bump)
  c.attachMinimap(minimap.value)
  c.setTool(tool.value)
  const spawn = doc.entityList.find((e) => e.t === 'spawn')
  c.scrollToRow(spawn ? spawn.y : 0)
  ctrl.value = c
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(toastTimer)
  save()
  window.removeEventListener('keydown', onKey)
  ctrl.value?.dispose()
  ctrl.value = null
  doc.onChange = null
})
</script>

<template>
  <div class="ed" :style="cssVars">
    <div class="column">
      <header class="top">
        <button class="ib" type="button" aria-label="Menu" @click="menuOpen = true">☰</button>
        <div class="title">
          <b>{{ titleText }}</b>
          <button class="status" :class="statusClass" type="button" @click="errorsOpen = !errorsOpen">
            {{ levelInfo }} · {{ statusText }}
          </button>
        </div>
        <button class="ib" type="button" aria-label="Undo" :disabled="!canUndo" @click="doc.undo()">↶</button>
        <button class="ib" type="button" aria-label="Redo" :disabled="!canRedo" @click="doc.redo()">↷</button>
        <button class="test" type="button" @click="startTest">▶ Test</button>
      </header>

      <div ref="wrap" class="wrap">
        <canvas ref="canvas" class="canvas" />
        <canvas v-show="minimapOn" ref="minimap" class="minimap" aria-label="Level overview" />
        <button
          class="mapbtn"
          :class="{ on: minimapOn }"
          type="button"
          :aria-pressed="minimapOn"
          aria-label="Show or hide level overview"
          @click="toggleMinimap"
        >
          ▤
        </button>
        <Transition name="drop">
        <ul v-if="errorsOpen && errors.length" class="errors">
          <li v-for="e in errors" :key="e">{{ e }}</li>
        </ul>
        </Transition>
      </div>

      <footer class="bottom">
        <div class="panel">
          <div v-if="tool === 'select' && selectedEntity" class="sel-head">
            <span>
              {{ ENTITY_LABELS[selectedEntity.t] }} <small>({{ selectedEntity.x }}, {{ selectedEntity.y }})</small>
            </span>
            <button class="del" type="button" @click="ctrl?.deleteSelected()">Delete</button>
          </div>

          <template v-if="tool === 'tile'">
            <div class="grp tiles">
              <button
                v-for="o in TILE_OPTIONS"
                :key="o.ch"
                type="button"
                class="tilebtn"
                :class="{ on: tileKind === o.ch }"
                :aria-pressed="tileKind === o.ch"
                @click="pickTileKind(o.ch)"
              >
                <i class="sw" :class="{ belt: o.ch === '<' || o.ch === '>' }" :style="swatchStyle(o.ch)">
                  <template v-if="o.ch === '<'">◀</template>
                  <template v-else-if="o.ch === '>'">▶</template>
                </i>
                {{ o.label }}
              </button>
            </div>
            <p class="hint">{{ TILE_HINTS[tileKind] }}</p>
          </template>

          <template v-if="sp">
            <div class="grp">
              <span class="lbl">Direction</span>
              <div class="seg">
                <button type="button" :class="{ on: (sp.dir ?? 'u') === 'u' }" title="up" @click="apply({ dir: 'u' })">
                  ▲
                </button>
                <button type="button" :class="{ on: sp.dir === 'l' }" title="left (on a wall to the right)" @click="apply({ dir: 'l' })">
                  ◀
                </button>
                <button type="button" :class="{ on: sp.dir === 'r' }" title="right (on a wall to the left)" @click="apply({ dir: 'r' })">
                  ▶
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Power</span>
              <div class="seg">
                <button type="button" :class="{ on: sp.power === 1 }" @click="apply({ power: 1 })">normal</button>
                <button type="button" :class="{ on: sp.power === 2 }" @click="apply({ power: 2 })">strong</button>
              </div>
            </div>
          </template>

          <template v-if="sk">
            <div class="grp">
              <span class="lbl">Direction</span>
              <div class="seg">
                <button
                  v-for="d in DIRS"
                  :key="d.dir"
                  type="button"
                  :class="{ on: sk.dir === d.dir }"
                  :title="d.label"
                  @click="apply({ dir: d.dir })"
                >
                  {{ ARROW[d.dir] }}
                </button>
              </div>
            </div>
          </template>

          <template v-if="ls">
            <div class="grp">
              <span class="lbl">Direction</span>
              <div class="seg">
                <button
                  v-for="d in DIRS"
                  :key="d.dir"
                  type="button"
                  :class="{ on: ls.dir === d.dir }"
                  :title="d.label"
                  @click="apply({ dir: d.dir })"
                >
                  {{ ARROW[d.dir] }}
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Rate</span>
              <div class="seg">
                <button
                  v-for="(s, i) in LASER_SPEEDS"
                  :key="s.label"
                  type="button"
                  :class="{ on: laserSpeedIndex(ls) === i }"
                  @click="apply(laserSpeedPatch(ls, i))"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Offset</span>
              <div class="seg">
                <button
                  v-for="q in PHASE_QUARTERS"
                  :key="q"
                  type="button"
                  :class="{ on: laserPhaseQuarter(ls) === q }"
                  @click="apply(laserPhasePatch(ls, q))"
                >
                  {{ PHASE_LABELS[q] }}
                </button>
              </div>
            </div>
          </template>

          <template v-if="hm">
            <div class="grp">
              <span class="lbl">Length</span>
              <div class="seg">
                <button
                  v-for="n in HAMMER_LENGTHS"
                  :key="n"
                  type="button"
                  :class="{ on: hm.len === n }"
                  @click="apply({ len: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Swing</span>
              <div class="seg">
                <button
                  v-for="a in HAMMER_AMPLITUDES"
                  :key="a"
                  type="button"
                  :class="{ on: hm.amp === a }"
                  @click="apply({ amp: a })"
                >
                  {{ a }}°
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Speed</span>
              <div class="seg">
                <button
                  v-for="(s, i) in HAMMER_SPEEDS"
                  :key="s.label"
                  type="button"
                  :class="{ on: hammerSpeedIndex(hm) === i }"
                  @click="apply({ period: s.period })"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Offset</span>
              <div class="seg">
                <button
                  v-for="q in PHASE_QUARTERS"
                  :key="q"
                  type="button"
                  :class="{ on: hammerPhaseQuarter(hm) === q }"
                  @click="apply(hammerPhasePatch(q))"
                >
                  {{ PHASE_LABELS[q] }}
                </button>
              </div>
            </div>
          </template>

          <template v-if="sw">
            <div class="grp">
              <span class="lbl">Track</span>
              <div class="seg">
                <button type="button" :class="{ on: sw.axis === 'h' }" title="horizontal" @click="apply({ axis: 'h' })">
                  ↔
                </button>
                <button type="button" :class="{ on: sw.axis === 'v' }" title="vertical" @click="apply({ axis: 'v' })">
                  ↕
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Length</span>
              <div class="seg">
                <button
                  v-for="n in SAW_LENGTHS"
                  :key="n"
                  type="button"
                  :class="{ on: sw.len === n }"
                  @click="apply({ len: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Speed</span>
              <div class="seg">
                <button
                  v-for="(s, i) in SAW_SPEEDS"
                  :key="s.label"
                  type="button"
                  :class="{ on: sawSpeedIndex(sw) === i }"
                  @click="apply({ period: s.period })"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Offset</span>
              <div class="seg">
                <button
                  v-for="q in PHASE_QUARTERS"
                  :key="q"
                  type="button"
                  :class="{ on: hammerPhaseQuarter(sw) === q }"
                  @click="apply(hammerPhasePatch(q))"
                >
                  {{ PHASE_LABELS[q] }}
                </button>
              </div>
            </div>
          </template>

          <template v-if="mv">
            <div class="grp">
              <span class="lbl">Track</span>
              <div class="seg">
                <button type="button" :class="{ on: mv.axis === 'h' }" title="horizontal" @click="apply({ axis: 'h' })">↔</button>
                <button type="button" :class="{ on: mv.axis === 'v' }" title="vertical" @click="apply({ axis: 'v' })">↕</button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Length</span>
              <div class="seg">
                <button v-for="n in MOVER_LENGTHS" :key="n" type="button" :class="{ on: mv.len === n }" @click="apply({ len: n })">{{ n }}</button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Width</span>
              <div class="seg">
                <button v-for="n in MOVER_WIDTHS" :key="n" type="button" :class="{ on: mv.w === n }" @click="apply({ w: n })">{{ n }}</button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Speed</span>
              <div class="seg">
                <button v-for="(s, i) in MOVER_SPEEDS" :key="s.label" type="button" :class="{ on: moverSpeedIndex(mv) === i }" @click="apply({ period: s.period })">{{ s.label }}</button>
              </div>
            </div>
            <div class="grp">
              <span class="lbl">Offset</span>
              <div class="seg">
                <button v-for="q in PHASE_QUARTERS" :key="q" type="button" :class="{ on: hammerPhaseQuarter(mv) === q }" @click="apply(hammerPhasePatch(q))">{{ PHASE_LABELS[q] }}</button>
              </div>
            </div>
          </template>

          <p v-if="showHint" class="hint">{{ TOOL_HINTS[tool] }}</p>
        </div>

        <nav class="palette" aria-label="Tools" @wheel="onPaletteWheel">
          <button
            v-for="t in TOOLS"
            :key="t.id"
            type="button"
            class="tool"
            :class="{ on: tool === t.id }"
            :aria-pressed="tool === t.id"
            @click="pickTool(t.id)"
          >
            <ToolIcon :tool="t.id" />
            <span>{{ t.label }}</span>
          </button>
        </nav>
      </footer>
    </div>

    <!-- Menu -->
    <Transition name="modal">
    <div v-if="menuOpen" class="modal" @click.self="menuOpen = false">
      <div class="card">
        <div class="card-head">
          <h2>Level</h2>
          <button class="ib" type="button" aria-label="Close" @click="menuOpen = false">✕</button>
        </div>

        <label class="field">
          <span>Title</span>
          <input type="text" maxlength="40" placeholder="Untitled" :value="doc.title" @input="onTitle" />
        </label>

        <section>
          <h3>Size</h3>
          <div class="seg wide">
            <button
              v-for="(rows, size) in LEVEL_ROWS"
              :key="size"
              type="button"
              :class="{ on: doc.size === size }"
              @click="setSize(size)"
            >
              {{ SIZE_LABELS[size] }} <small>{{ rows }}</small>
            </button>
          </div>
        </section>

        <section>
          <h3>Start new</h3>
          <div class="seg wide">
            <button v-for="(rows, size) in LEVEL_ROWS" :key="size" type="button" @click="newLevel(size)">
              {{ SIZE_LABELS[size] }} <small>{{ rows }}</small>
            </button>
          </div>
          <template v-if="DEV">
          <button v-for="l in LEVELS" :key="l.key" class="link" type="button" @click="loadTemplate(l.data)">
            Template: {{ l.title }}
          </button>
          </template>
        </section>

        <section>
          <h3>Upload</h3>
          <p v-if="!verified" class="note">
            To upload a level, play it to the goal once yourself (▶ Test). Any change invalidates the test.
          </p>
          <p class="note">
            Upload it to <b>Community levels</b>: after a quick review by me, everyone can play it and compete for the best time.
          </p>
          <label class="note author">
            Your name (shown as author)
            <input type="text" maxlength="16" placeholder="Anonymous" :value="authorName" @input="onAuthor" />
          </label>
          <p v-if="verified && !titleOk" class="note">Give your level a name of 3–32 characters first (field at the top of this menu).</p>
          <div class="seg wide">
            <button type="button" :disabled="!canUpload" @click="upload">
              {{ uploading ? 'Uploading …' : alreadyUploaded ? '✓ Uploaded' : 'Upload for review' }}
            </button>
          </div>
          <template v-if="DEV">
            <p class="note">Local only: export the level as a <code>.level.ts</code> file for <code>src/levels/easy|normal|hard/</code> (the folder sets the difficulty). It is picked up by the game automatically (no test run needed).</p>
            <div class="seg wide">
              <button type="button" :disabled="errors.length > 0" @click="copyTs">Copy TS</button>
              <button type="button" :disabled="errors.length > 0" @click="downloadTs">Save as .level.ts</button>
            </div>
          </template>
        </section>

        <button class="ghost" type="button" @click="emit('exit')">Back to main menu</button>
      </div>
    </div>
    </Transition>

    <!-- Test run -->
    <GameView
      v-if="mode === 'test' && testData"
      :level-data="testData"
      :level-key="testKey"
      :theme="theme"
      exit-icon="✎"
      exit-text="Back to editor"
      @exit="leaveTest"
      @finished="onFinished"
    />

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.ed {
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
  gap: 6px;
  padding: max(8px, env(safe-area-inset-top)) 8px 8px;
  background: var(--panel);
  border-bottom: 3px solid var(--line);
}

.author {
  display: grid;
  gap: 4px;
}

.author input {
  font: inherit;
  padding: 7px 9px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
}

.title {
  flex: 1;
  min-width: 0;
  line-height: 1.15;
}

.title b {
  display: block;
  font-size: 15px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title small {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.ib {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  font-size: 19px;
  font-weight: 900;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}

.ib:disabled {
  opacity: 0.35;
  cursor: default;
}

.test {
  flex: 0 0 auto;
  height: 38px;
  padding: 0 12px;
  font-size: 15px;
  font-weight: 900;
  color: var(--outline);
  background: var(--accent);
  border: 2px solid var(--outline);
  border-radius: 12px;
  box-shadow: 2px 2px 0 var(--outline);
  cursor: pointer;
}

.test:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--outline);
}

.wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
}

.canvas {
  display: block;
  touch-action: none;
}

.minimap {
  position: absolute;
  right: 6px;
  top: 42px;
  bottom: 8px;
  width: 22px;
  box-sizing: border-box;
  height: calc(100% - 50px);
  opacity: 0.8;
  border: 2px solid var(--line);
  border-radius: 8px;
  touch-action: none;
  cursor: pointer;
}

.status {
  display: block;
  max-width: 100%;
  padding: 0;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.15;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: none;
  border: 0;
  cursor: pointer;
}

.status.ok {
  color: var(--help);
}

.status.warn {
  color: var(--danger);
}

.status.info {
  color: var(--muted);
}

.mapbtn {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  font-size: 16px;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 10px;
  opacity: 0.75;
  cursor: pointer;
}

.mapbtn.on {
  background: var(--accent);
  color: var(--outline);
  opacity: 0.9;
}

.status.ok {
  color: var(--accent);
}

.status.warn {
  color: #ffd1c9;
  border-color: var(--danger);
}

.errors {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 8px;
  max-height: 45%;
  overflow-y: auto;
  margin: 0;
  padding: 10px 12px 10px 28px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--danger);
  border-radius: 14px;
  touch-action: pan-y;
}

.bottom {
  background: var(--panel);
  border-top: 3px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 2px;
}

.sel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 900;
}

.sel-head small {
  color: var(--muted);
}

.del {
  font-size: 13px;
  font-weight: 900;
  padding: 6px 12px;
  color: #fff;
  background: var(--danger);
  border: 2px solid var(--outline);
  border-radius: 10px;
  cursor: pointer;
}

.grp {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lbl {
  flex: 0 0 70px;
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}

.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.seg button {
  min-width: 36px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}

.seg button.on {
  color: var(--outline);
  background: var(--accent);
}

.seg button:disabled {
  opacity: 0.35;
  cursor: default;
}

.tiles {
  flex-wrap: wrap;
  gap: 5px;
}

.tilebtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px 5px 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}

.tilebtn.on {
  color: var(--outline);
  background: var(--accent);
}

.sw {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 2px solid;
  border-radius: 5px;
  font-size: 9px;
  font-style: normal;
  color: #FFC400;
}

.seg.wide {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
}

.seg small {
  font-weight: 700;
  opacity: 0.7;
}

.hint {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--muted);
}

.palette {
  display: flex;
  gap: 4px;
  padding: 6px 8px 10px;
  overflow-x: auto;
  touch-action: pan-x;
  scrollbar-width: thin;
  scrollbar-color: var(--muted) transparent;
}

.tool {
  flex: 0 0 auto;
  width: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px 5px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text);
  background: transparent;
  border: 2px solid transparent;
  border-radius: 14px;
  cursor: pointer;
}

.tool.on {
  color: var(--outline);
  background: var(--accent);
  border-color: var(--outline);
  box-shadow: 2px 2px 0 var(--outline);
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 6, 30, 0.55);
}

.card {
  width: min(100%, 420px);
  max-height: 100%;
  overflow-y: auto;
  touch-action: pan-y;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--text);
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 22px;
  box-shadow: 6px 6px 0 var(--outline);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: var(--accent);
}

h3 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--muted);
}

section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field span {
  font-size: 13px;
  font-weight: 900;
  color: var(--muted);
}

input {
  width: 100%;
  padding: 10px 12px;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid var(--line);
  border-radius: 12px;
  user-select: text;
  -webkit-user-select: text;
  resize: none;
}

.note {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--muted);
}

.ghost {
  padding: 11px 14px;
  font-size: 15px;
  font-weight: 900;
  border: 3px solid var(--line);
  border-radius: 14px;
  cursor: pointer;
}

.ghost {
  color: var(--text);
  background: transparent;
}

.link {
  align-self: flex-start;
  padding: 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--muted);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(max(18px, env(safe-area-inset-bottom)) + 92px);
  z-index: 40;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 14px;
  pointer-events: none;
}

/* Transitions: modal, error list, toast */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}
.modal-enter-active .card,
.modal-leave-active .card {
  transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .card,
.modal-leave-to .card {
  transform: translateY(16px) scale(0.97);
}

.drop-enter-active,
.drop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .card,
  .modal-leave-active .card,
  .drop-enter-active,
  .drop-leave-active,
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>