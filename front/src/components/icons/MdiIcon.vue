<script setup>
defineProps({
  path: {
    type: String,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 16,
  },
})
</script>

<template>
  <svg
    class="mdi-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path :d="path" />
  </svg>
</template>

<style scoped>
.mdi-icon {
  display: block;
  flex-shrink: 0;
}
</style>
