<script setup lang="ts">
import PageShell from './PageShell.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { themeById, type Theme } from '../game/theme'
import { applyLook, COLORS, DEFAULT_LOOK, EYES, look, PATTERN_COLORS, PATTERNS, randomLook } from '../game/look'
import CharacterCanvas from './CharacterCanvas.vue'
import { loadName, nameProblem, saveName } from '../online/api'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: [] }>()

// Player name

const playerName = ref(loadName())
const nameError = computed(() => nameProblem(playerName.value))

function onNameInput(event: Event): void {
  playerName.value = (event.target as HTMLInputElement).value.slice(0, 16)

  if (!nameError.value) {
    saveName(playerName.value)
  }
}

/**
 * props.theme enthält die gewählte Körperfarbe schon (App.vue wendet sie an). Die Farbfelder brauchen aber
 * das Theme ohne Auswahl, sonst zeigt „Pink“ immer die aktuell gewählte Farbe und setzt beim Klick auf Pink zurück.
 */
const base = computed(() => themeById(props.theme.id))

/** Vorschau: Basis-Theme mit der gewählten Farbe, genau wie im Spiel */
const themed = computed(() => applyLook(base.value, look))

const previewSize = ref(96)
function resizePreviews(): void {
  previewSize.value = window.innerWidth >= 800 && window.innerHeight >= 500 ? 168 : 96
}
onMounted(() => {
  resizePreviews()
  window.addEventListener('resize', resizePreviews)
})
onBeforeUnmount(() => window.removeEventListener('resize', resizePreviews))

function swatch(id: string): { background: string } {
  const c = COLORS.find((o) => o.id === id)!
  const body = c.body ?? base.value.player
  const shade = c.shade ?? base.value.playerShade
  return { background: `linear-gradient(180deg, ${body} 65%, ${shade} 65%)` }
}

/** Farbfeld für die Musterfarbe; „Dark“ folgt der Konturfarbe des Themes */
function patternSwatch(hex: string | null): { background: string } {
  return { background: hex ?? base.value.outline }
}

function reset(): void {
  Object.assign(look, DEFAULT_LOOK)
}

function randomize(): void {
  Object.assign(look, randomLook(Math.random, { ...look }))
}

</script>

<template>
  <PageShell :theme="theme">
  <div class="chr-page">
    <header class="top">
      <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
      <div class="title">
        <b>Character</b>
        <small>Make it yours</small>
      </div>
    </header>

    <div class="scroll">
      <div class="col">
          <section class="name-panel">
            <label class="player-name">
              <span>PLAYER NAME</span>

              <input
                type="text"
                maxlength="16"
                placeholder="Your name"
                autocomplete="nickname"
                :value="playerName"
                @input="onNameInput"
              />
            </label>

            <p
              v-if="nameError"
              class="name-error"
              role="alert"
            >
              {{ nameError }}
            </p>
          </section>


        <section class="stage">
          <div class="preview-tools">
          <button class="preview-action randomize" type="button" aria-label="Randomize" title="Randomize" @click="randomize">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <g fill="currentColor" stroke="none">
                <circle cx="7.5" cy="7.5" r="1.4" />
                <circle cx="16.5" cy="7.5" r="1.4" />
                <circle cx="12" cy="12" r="1.4" />
                <circle cx="7.5" cy="16.5" r="1.4" />
                <circle cx="16.5" cy="16.5" r="1.4" />
              </g>
            </svg>
          </button>
          <button class="preview-action reset" type="button" aria-label="Reset to default" title="Reset to default" @click="reset">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 10a8 8 0 1 1 1.5 7M4 4v6h6" />
            </svg>
          </button>
          </div>
          <div class="character-preview">
            <CharacterCanvas :colors="themed" :look="look" :size="previewSize" />
          </div>
        </section>

        <section class="opts">
          <h3>Color</h3>
          <div class="swatches" role="radiogroup" aria-label="Color">
            <button
              v-for="c in COLORS"
              :key="c.id"
              type="button"
              role="radio"
              class="sw"
              :class="{ on: look.color === c.id }"
              :aria-checked="look.color === c.id"
              :aria-label="c.label"
              :title="c.label"
              :style="swatch(c.id)"
              @click="look.color = c.id"
            />
          </div>

          <h3>Eyes</h3>
          <div class="choices" role="radiogroup" aria-label="Eyes">
            <button
              v-for="o in EYES"
              :key="o.id"
              type="button"
              role="radio"
              :class="{ on: look.eyes === o.id }"
              class="choice"
              :aria-label="o.label"
              :aria-checked="look.eyes === o.id"
              @click="look.eyes = o.id"
            >
              <CharacterCanvas :colors="themed" :look="{ ...look, eyes: o.id, pattern: 'none' }" :size="56" :animate="false" />
              <span>{{ o.label }}</span>
            </button>
          </div>

          <h3>Pattern</h3>
          <div class="choices" role="radiogroup" aria-label="Pattern">
            <button
              v-for="o in PATTERNS"
              :key="o.id"
              type="button"
              role="radio"
              :class="{ on: look.pattern === o.id }"
              class="choice"
              :aria-label="o.label"
              :aria-checked="look.pattern === o.id"
              @click="look.pattern = o.id"
            >
              <CharacterCanvas :colors="themed" :look="{ ...look, pattern: o.id }" :size="56" :animate="false" />
              <span>{{ o.label }}</span>
            </button>
          </div>

          <h3 :class="{ disabled: look.pattern === 'none' }">Pattern color</h3>
          <div
            class="swatches pattern-swatches"
            role="radiogroup"
            aria-label="Pattern color"
            :aria-disabled="look.pattern === 'none'"
          >
            <button
              v-for="c in PATTERN_COLORS"
              :key="c.id"
              type="button"
              role="radio"
              class="sw"
              :class="{ on: look.patternColor === c.id }"
              :aria-checked="look.patternColor === c.id"
              :aria-label="c.label"
              :title="c.label"
              :style="patternSwatch(c.hex)"
              :disabled="look.pattern === 'none'"
              @click="look.patternColor = c.id"
            />
          </div>
        </section>

      </div>
    </div>
  </div>
  </PageShell>
</template>

<style scoped>
.chr-page {
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
  width: 44px;
  height: 44px;
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
  width: min(100%, 960px);
  margin: 0 auto;
  display: grid;
  gap: 14px;
}

.name-panel,
.stage,
.opts {
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 4px 4px 0 var(--outline);
  padding: 14px 16px;
}

.name-panel { grid-column: 1 / -1; }

.player-name {
  display: grid;
  gap: 6px;
  width: min(100%, 300px);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
  color: var(--muted);
}

.player-name input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 5px 8px;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 10px;
}

.name-error {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
}


.stage {
  position: sticky;
  top: 0;
  z-index: 2;
  align-self: start;
  background: var(--bg1);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  justify-items: center;
  gap: 6px 10px;
  padding: 10px;
}

.preview-tools { grid-column: 2; grid-row: 1; align-self: start; display: flex; flex-direction: column; gap: 6px; }
.character-preview { grid-column: 1; grid-row: 1; }
.opts { min-width: 0; }

h3 {
  margin: 14px 0 8px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--muted);
}

h3:first-child {
  margin-top: 0;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* Immer sichtbar, auch bei "None"; die Buttons sind dann disabled. */
.pattern-swatches {
  min-height: 40px;
}

.sw {
  width: 44px;
  height: 44px;
  cursor: pointer;
  border: 3px solid var(--line);
  border-radius: 12px;
}

.sw.on {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
}

.choice {
  min-width: 0;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  padding: 6px 4px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 12px;
}

.choice span { min-height: 28px; display: grid; place-items: center; text-align: center; overflow-wrap: anywhere; }

.choice.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--panel));
  box-shadow: inset 0 0 0 1px var(--accent);
}

.choice:focus-visible, .sw:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }

.preview-action {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 9px;
  cursor: pointer;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 12px;
}
.preview-action svg { width: 22px; height: 22px; }
.preview-action:hover { background: var(--accent); color: var(--outline); }
.preview-action:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
h3.disabled { opacity: 0.35; }
.sw:disabled { opacity: 0.55; cursor: not-allowed; }
@media (min-width: 800px) {
  .col { grid-template-columns: 250px minmax(0, 1fr); align-items: start; }
}

@media (min-width: 800px) and (min-height: 500px) {
  .stage { grid-template-columns: minmax(0, 1fr); padding: 14px 16px; gap: 12px; }
  .preview-tools { grid-column: 1; grid-row: 1; flex-direction: row; justify-self: end; }
  .character-preview { grid-column: 1; grid-row: 2; }
}
</style>
