<script setup lang="ts">
import PageShell from './PageShell.vue'
import { computed } from 'vue'
import { themeById, type Theme } from '../game/theme'
import { applyLook, COLORS, DEFAULT_LOOK, EYES, look } from '../game/look'
import CharacterCanvas from './CharacterCanvas.vue'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: [] }>()

/**
 * props.theme enthält die gewählte Körperfarbe schon (App.vue wendet sie an). Die Farbfelder brauchen aber
 * das Theme ohne Auswahl, sonst zeigt „Pink“ immer die aktuell gewählte Farbe und setzt beim Klick auf Pink zurück.
 */
const base = computed(() => themeById(props.theme.id))

/** Vorschau: Basis-Theme mit der gewählten Farbe, genau wie im Spiel */
const themed = computed(() => applyLook(base.value, look))

function swatch(id: string): { background: string } {
  const c = COLORS.find((o) => o.id === id)!
  const body = c.body ?? base.value.player
  const shade = c.shade ?? base.value.playerShade
  return { background: `linear-gradient(180deg, ${body} 65%, ${shade} 65%)` }
}

function reset(): void {
  Object.assign(look, DEFAULT_LOOK)
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
        <section class="stage">
          <CharacterCanvas :colors="themed" :look="look" :size="168" />
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
          <div class="chips" role="radiogroup" aria-label="Eyes">
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
        </section>

        <button class="reset" type="button" @click="reset">Reset to default</button>
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

.stage,
.opts {
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 4px 4px 0 var(--outline);
  padding: 14px 16px;
}

.stage {
  display: grid;
  justify-items: center;
  gap: 10px;
}

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

.reset {
  justify-self: center;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  padding: 8px 18px;
  color: var(--muted);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 999px;
}
</style>