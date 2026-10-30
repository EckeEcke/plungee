<script setup lang="ts">
import { computed } from 'vue'
import type { Theme } from '../game/theme'

/**
 * Gemeinsamer Rahmen für Unterseiten (Kampagne, Weekly, Community, Charakter): Verlauf, auf breiten Bildschirmen
 * die Deko links und rechts und in der Mitte ein Container (max. 1000 px) mit seitlichen Linien, in dem auch die Kopfzeile sitzt.
 * Der Inhalt kommt in den Slot und füllt die Höhe (flex: 1).
 */
const props = defineProps<{ theme: Theme }>()

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--highlight': props.theme.ui.highlight,
  '--muted': props.theme.ui.muted,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
  '--line': props.theme.ui.line,
  '--c0': props.theme.decor[0],
  '--c1': props.theme.decor[1],
  '--c2': props.theme.decor[2],
  '--c3': props.theme.decor[3],
  '--decor-shadow': `color-mix(in srgb, ${props.theme.decorShadow} ${Math.round(props.theme.decorShadowAlpha * 100)}%, ${props.theme.bgTop})`,
}))
</script>

<template>
  <div class="page" :style="cssVars">
    <!-- Deko wie auf der Startseite, nur auf breiten Bildschirmen und nur an den Seiten sichtbar -->
    <svg class="decor" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <polygon points="150,120 230,260 70,260" fill="color-mix(in srgb, var(--c0) 50%, var(--bg1))" />
      <circle cx="1440" cy="170" r="52" fill="none" stroke="color-mix(in srgb, var(--c2) 50%, var(--bg1))" stroke-width="14" />
      <path d="M1230 420 q20 -30 40 0 t40 0 t40 0 t40 0" fill="none" stroke="color-mix(in srgb, var(--c1) 60%, var(--bg1))" stroke-width="14" stroke-linecap="round" />
      <path d="M90 520 l28 -34 l28 34 l28 -34 l28 34 l28 -34" fill="none" stroke="color-mix(in srgb, var(--c3) 55%, var(--bg1))" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
      <g fill="color-mix(in srgb, var(--c2) 55%, var(--bg1))">
        <circle cx="1380" cy="640" r="8" /><circle cx="1412" cy="640" r="8" /><circle cx="1444" cy="640" r="8" />
        <circle cx="1380" cy="672" r="8" /><circle cx="1412" cy="672" r="8" /><circle cx="1444" cy="672" r="8" />
      </g>
      <polygon points="190,690 270,750 190,810" fill="color-mix(in srgb, var(--c1) 50%, var(--bg1))" />
      <rect x="1250" y="740" width="64" height="64" rx="14" fill="color-mix(in srgb, var(--c0) 45%, var(--bg1))" transform="rotate(14 1282 772)" />
      <path d="M110 80 v50 M85 105 h50" stroke="color-mix(in srgb, var(--c3) 50%, var(--bg1))" stroke-width="14" stroke-linecap="round" />
      <circle cx="120" cy="330" r="14" fill="color-mix(in srgb, var(--c1) 50%, var(--bg1))" />
    </svg>

    <div class="shell">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  color: var(--text);
}

.shell {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.decor {
  display: none;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* Neo-Brutal: harter Schatten, die Formen sind deckend */
  filter: drop-shadow(5px 5px 0 var(--decor-shadow));
}

@media (min-width: 600px) {
  .shell {
    width: min(100%, 1000px);
    border-inline: 3px solid var(--line);
    background: color-mix(in srgb, var(--bg1) 86%, transparent);
  }

  .decor {
    display: block;
  }
}
</style>