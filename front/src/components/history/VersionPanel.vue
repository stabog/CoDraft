<script setup>
defineProps({
  versions: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['restore'])
</script>

<template>
  <section class="panel versions-panel">
    <div class="pane-heading">
      <h2>История</h2>
      <span>{{ versions.length }}</span>
    </div>

    <div class="version-list">
      <article v-for="version in versions" :key="version.id" class="version-item">
        <strong>{{ version.summary }}</strong>
        <span>{{ version.authorName }} · {{ new Date(version.createdAt).toLocaleString() }}</span>
        <button type="button" class="ghost-button" @click="$emit('restore', version.id)">Восстановить</button>
      </article>
    </div>
  </section>
</template>
