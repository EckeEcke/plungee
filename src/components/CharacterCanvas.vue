<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { drawCharacter, type CharacterColors, type CharacterPose } from '../game/character'
import type { Look } from '../game/look'

const props = withDefaults(
  defineProps<{
    colors: CharacterColors
    look: Look
    /** Kantenlänge in CSS-Pixeln */
    size: number
    animate?: boolean
  }>(),
  { animate: true },
)

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0
let t0 = 0

function poseAt(t: number): CharacterPose {
  // Ruhig: schaut langsam hin und her, blinzelt etwa alle dreieinhalb Sekunden
  const w = Math.sin(t * 0.8)
  return { face: w * 0.5, ox: w * 0.9, oy: Math.cos(t * 0.5) * 0.4, fall: 0, stun: false, blink: t % 3.5 > 3.38 }
}

function draw(t: number): void {
  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  const dpr = window.devicePixelRatio || 1
  const px = Math.round(props.size * dpr)
  if (c.width !== px) {
    c.width = px
    c.height = px
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  // Figur ist 12 Einheiten breit, außen etwas Luft für Schatten und Brauen
  const s = (c.width / 16) * 1
  ctx.setTransform(s, 0, 0, s, c.width / 2, c.width * 0.88)
  drawCharacter(ctx, props.colors, props.look, poseAt(t))
}

function loop(now: number): void {
  draw((now - t0) / 1000)
  raf = requestAnimationFrame(loop)
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function start(): void {
  cancelAnimationFrame(raf)
  if (props.animate && !reducedMotion()) {
    t0 = performance.now()
    raf = requestAnimationFrame(loop)
  } else {
    draw(0)
  }
}

onMounted(start)
onBeforeUnmount(() => cancelAnimationFrame(raf))
watch(
  () => [props.animate, props.size],
  start,
)
// Ohne Dauerschleife (Animation aus) bei jeder Änderung neu zeichnen
watch(
  () => [props.colors, props.look.color, props.look.eyes],
  () => {
    if (!props.animate || reducedMotion()) draw(0)
  },
  { deep: true },
)
</script>

<template>
  <canvas ref="canvas" class="chr" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true" />
</template>

<style scoped>
.chr {
  display: block;
}
</style>
