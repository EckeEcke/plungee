<script setup lang="ts">
import type { Medal } from '../game/medals'

withDefaults(defineProps<{ medal: Medal; size?: number }>(), { size: 22 })

const COLORS: Record<Medal, { fill: string; shade: string }> = {
  gold: { fill: '#FFC400', shade: '#C98F00' },
  silver: { fill: '#D5DCE6', shade: '#8E9AAD' },
  bronze: { fill: '#D98A4B', shade: '#9A5A26' },
}
const LABELS: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }
</script>

<template>
  <svg viewBox="0 0 24 24" :width="size" :height="size" role="img" :aria-label="LABELS[medal]">
    <path d="M7 1.5 L11 10 L8 11 L4.5 3 Z" fill="#FF5FA2" stroke="#1E1647" stroke-width="1.4" stroke-linejoin="round" />
    <path d="M17 1.5 L13 10 L16 11 L19.5 3 Z" fill="#3A86FF" stroke="#1E1647" stroke-width="1.4" stroke-linejoin="round" />
    <circle cx="12" cy="15" r="7" :fill="COLORS[medal].fill" stroke="#1E1647" stroke-width="1.8" />
    <circle cx="12" cy="15" r="4" fill="none" :stroke="COLORS[medal].shade" stroke-width="1.6" />
  </svg>
</template>
