<script setup lang="ts">
import type { ToolId } from '../editor/brush'

defineProps<{ tool: ToolId }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="tool === 'select'">
      <path d="M6 4 L18 12 L12.5 13.2 L9.5 19 Z" fill="currentColor" />
    </template>
    <template v-else-if="tool === 'tile'">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" />
    </template>
    <template v-else-if="tool === 'erase'">
      <path d="M5 15 L13 6 L19 11 L12 19 H8 Z" />
      <path d="M9 12 L15 17" />
    </template>
    <template v-else-if="tool === 'spring'">
      <path d="M7 20 H17 M8 17 L16 14 L8 11 L16 8" />
      <path d="M6 5 H18" />
    </template>
    <template v-else-if="tool === 'spikes'">
      <path d="M3 19 L8 7 L12 19 L16 7 L21 19 Z" fill="currentColor" />
    </template>
    <template v-else-if="tool === 'laser'">
      <rect x="3" y="8" width="6" height="8" rx="2" fill="currentColor" />
      <path d="M12 12 H21" stroke-dasharray="2 3" />
    </template>
    <template v-else-if="tool === 'hammer'">
      <path d="M12 3 V13" />
      <circle cx="12" cy="17" r="4.5" fill="currentColor" />
    </template>
    <template v-else-if="tool === 'saw'">
      <path d="M3 20 H21" stroke-dasharray="2 3" />
      <path
        d="M12 4 L13.6 7 L16.9 6.2 L16.6 9.6 L19.8 10.8 L17.4 13.2 L19.2 16.1 L15.8 16.4 L14.8 19.6 L12 17.8 L9.2 19.6 L8.2 16.4 L4.8 16.1 L6.6 13.2 L4.2 10.8 L7.4 9.6 L7.1 6.2 L10.4 7 Z"
        fill="currentColor"
        transform="translate(0 -3) scale(1)"
      />
    </template>
    <template v-else-if="tool === 'checkpoint'">
      <path d="M7 21 V4" />
      <path d="M7 5 L19 9 L7 13 Z" fill="currentColor" />
    </template>
    <template v-else-if="tool === 'spawn'">
      <rect x="5" y="6" width="14" height="14" rx="4.5" />
      <circle cx="9.5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="14.5" cy="12" r="1.4" fill="currentColor" />
      <path d="M12 2 V4" />
    </template>
    <template v-else-if="tool === 'goal'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7 L13.4 10.6 L17 12 L13.4 13.4 L12 17 L10.6 13.4 L7 12 L10.6 10.6 Z" fill="currentColor" />
    </template>
  </svg>
</template>
