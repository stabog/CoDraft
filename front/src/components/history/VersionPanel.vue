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

    <p v-if="!versions.length" class="empty-state">Пока нет зафиксированных версий.</p>

    <div v-else class="version-list">
      <article v-for="version in versions" :key="version.id" class="version-item">
        <strong>{{ version.summary || 'Версия' }}</strong>
        <span>{{ version.authorName }} · {{ new Date(version.createdAt).toLocaleString() }}</span>
        <span>{{ version.commentsSnapshot?.length || 0 }} комментариев в снимке</span>
        <button type="button" class="ghost-button" @click="$emit('restore', version.id)">Восстановить в черновик</button>
      </article>
    </div>
  </section>
</template>
