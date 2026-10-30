
<script setup lang="ts">
import PageShell from './PageShell.vue'
import { computed, ref } from 'vue'
import { themeById, type Theme } from '../game/theme'
import {
  applyLook,
  COLORS,
  DEFAULT_LOOK,
  EYES,
  look,
  PATTERN_COLORS,
  PATTERNS,
  randomLook,
} from '../game/look'
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
 * Die Farbfelder verwenden das Basis-Theme, damit sie unabhängig
 * von der aktuell gewählten Körperfarbe korrekt dargestellt werden.
 */
const base = computed(() => themeById(props.theme.id))

/** Vorschau mit der aktuell gewählten Farbe und dem Look. */
const themed = computed(() => applyLook(base.value, look))

function swatch(id: string): { background: string } {
  const c = COLORS.find(o => o.id === id)!
  const body = c.body ?? base.value.player
  const shade = c.shade ?? base.value.playerShade

  return {
    background: `linear-gradient(180deg, ${body} 65%, ${shade} 65%)`,
  }
}

/** Die Musterfarbe "Dark" folgt der Konturfarbe des Themes. */
function patternSwatch(hex: string | null): { background: string } {
  return {
    background: hex ?? base.value.outline,
  }
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
        <button
          class="ib"
          type="button"
          aria-label="Back to menu"
          @click="emit('exit')"
        >
          ←
        </button>

        <div class="title">
          <b>Character</b>
          <small>Make it yours</small>
        </div>
      </header>

      <div class="scroll">
        <div class="col">
          <!-- Player name -->

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

          <!-- Character preview -->

          <section class="stage">
            <div class="character-preview">
              <CharacterCanvas
                :colors="themed"
                :look="look"
                :size="168"
              />
            </div>
          </section>

          <!-- Character options -->

          <section class="opts">
            <h3>Color</h3>

            <div
              class="swatches"
              role="radiogroup"
              aria-label="Color"
            >
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

            <div
              class="chips"
              role="radiogroup"
              aria-label="Eyes"
            >
              <button
                v-for="o in EYES"
                :key="o.id"
                type="button"
                role="radio"
                :class="{ on: look.eyes === o.id }"
                :aria-checked="look.eyes === o.id"
                @click="look.eyes = o.id"
              >
                {{ o.label }}
              </button>
            </div>

            <h3>Pattern</h3>

            <div
              class="chips"
              role="radiogroup"
              aria-label="Pattern"
            >
              <button
                v-for="o in PATTERNS"
                :key="o.id"
                type="button"
                role="radio"
                :class="{ on: look.pattern === o.id }"
                :aria-checked="look.pattern === o.id"
                @click="look.pattern = o.id"
              >
                {{ o.label }}
              </button>
            </div>

            <h3 :class="{ disabled: look.pattern === 'none' }">
              Pattern color
            </h3>

            <div
              class="swatches"
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

          <!-- Actions -->

          <div class="actions">
            <button
              class="reset"
              type="button"
              @click="randomize"
            >
              🎲 Randomize
            </button>

            <button
              class="reset"
              type="button"
              @click="reset"
            >
              Reset to default
            </button>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
/* Layout */

.chr-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Header */

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

/* Scroll container */

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

/* Panels */

.name-panel,
.stage,
.opts {
  padding: 14px 16px;
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 4px 4px 0 var(--outline);
}

/* Player name */

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

/* Character preview */

.stage {
  display: grid;
  justify-items: center;
}

.character-preview {
  width: 168px;
  height: 168px;
}

/* Option headings */

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

h3.disabled {
  opacity: 0.35;
}

/* Color swatches */

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sw {
  width: 40px;
  height: 40px;
  cursor: pointer;
  border: 3px solid var(--line);
  border-radius: 12px;
}

.sw.on {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.sw:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Eye and pattern selection */

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chips button {
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  padding: 7px 14px;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 999px;
}

.chips button.on {
  color: var(--outline);
  background: var(--accent);
  border-color: var(--outline);
}

/* Actions */

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.reset {
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  padding: 8px 18px;
  color: var(--text);
  background: var(--panel);
  border: 2px solid var(--line);
  border-radius: 999px;
}

/* Mobile: compact sticky preview */

@media (max-width: 599px) {
  .stage {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 10px 16px;
  }

  .character-preview {
    width: 96px;
    height: 96px;
  }

  .character-preview :deep(canvas) {
    transform: scale(0.57142857);
    transform-origin: top left;
  }
}
</style>
