<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
</script>

<template>
  <svg
    viewBox="0 0 16 16"
    :width="size"
    :height="size"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M3 10V7a5 5 0 0 1 10 0v3l-1.5 1V14h-7v-3L3 10Z"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <circle cx="6" cy="7" r="1" fill="currentColor" />
    <circle cx="10" cy="7" r="1" fill="currentColor" />
    <path d="m8 9-1 1.5h2z" fill="currentColor" />
    <path d="M6.5 12v2m3-2v2" stroke="currentColor" stroke-width="1.2" />
  </svg>
</template>
