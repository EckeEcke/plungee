<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
  title: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    class="ghost-toggle"
    :class="{ on: modelValue }"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :title="title"
    @click="emit('update:modelValue', !modelValue)"
  >
    <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
      <path
        d="M3 14V7a5 5 0 0 1 10 0v7l-2-1.6L9 14l-1-1.6L7 14l-2-1.6z"
        fill="currentColor"
      />
      <circle cx="6" cy="7" r="1.1" :fill="modelValue ? 'var(--accent)' : 'var(--bg2)'" />
      <circle cx="10" cy="7" r="1.1" :fill="modelValue ? 'var(--accent)' : 'var(--bg2)'" />
    </svg>
    {{ label }}
  </button>
</template>

<style scoped>
.ghost-toggle {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  color: var(--muted);
  background: var(--bg2);
  border: 3px solid var(--line);
  border-radius: 999px;
}

.ghost-toggle.on {
  color: var(--outline);
  background: var(--accent);
}
</style>
