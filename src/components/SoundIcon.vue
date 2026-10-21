<script setup lang="ts">
withDefaults(defineProps<{ kind?: 'sound' | 'music'; on?: boolean; size?: number }>(), {
  kind: 'sound',
  on: true,
  size: 18,
})
</script>

<template>
  <svg viewBox="0 0 24 24" :width="size" :height="size" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="kind === 'sound'">
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      <template v-if="on">
        <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
        <path d="M18 7a7 7 0 0 1 0 10" />
      </template>
      <template v-else>
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      </template>
    </template>
    <template v-else>
      <path d="M9 17V6l9-2v11" />
      <circle cx="6.5" cy="17" r="2.5" fill="currentColor" />
      <circle cx="15.5" cy="15" r="2.5" fill="currentColor" />
      <path v-if="!on" d="M3 3l18 18" />
    </template>
  </svg>
</template>
