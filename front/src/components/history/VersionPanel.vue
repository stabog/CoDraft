<script setup>
defineProps({
  versions: {
    type: Array,
    default: () => [],
  },
  canRestore: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['restore'])
</script>

<template>
  <section class="versions-panel">
    <div class="pane-heading">
      <h2>История</h2>
      <span>{{ versions.length }}</span>
    </div>

    <p v-if="!versions.length" class="empty-state">Пока нет зафиксированных версий.</p>

    <div v-else class="version-list">
      <article v-for="version in versions" :key="version.id" class="version-item">
        <strong>v{{ version.number }} — {{ version.summary || 'Версия' }}</strong>
        <span>{{ version.author.name }} · {{ new Date(version.createdAt).toLocaleString() }}</span>
        <span v-if="version.incorporatedEditIds?.length">
          Учтено правок: {{ version.incorporatedEditIds.length }}
        </span>
        <button v-if="canRestore" type="button" class="ghost-button" @click="$emit('restore', version.id)">
          Восстановить в черновик
        </button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.versions-panel {
  background: #ffffff;
}

.pane-heading {
  align-items: center;
  border-bottom: 1px solid #e1e5eb;
  display: flex;
  justify-content: space-between;
  min-height: 60px;
  padding: 0 18px;
}

.pane-heading h2 {
  font-size: 13px;
  letter-spacing: 0.04em;
  margin: 0;
  text-transform: uppercase;
}

.pane-heading span,
.version-item span,
.empty-state {
  color: #667085;
}

.empty-state {
  line-height: 1.45;
  margin: 0;
  padding: 18px;
}

.version-list {
  max-height: calc(100vh - 260px);
  overflow: auto;
}

.version-item {
  border-bottom: 1px solid #e1e5eb;
  display: grid;
  gap: 8px;
  padding: 18px;
}

.ghost-button {
  background: transparent;
  color: #4f7df3;
  justify-self: start;
  padding: 0;
}

@media (max-width: 1180px) {
  .version-list {
    max-height: none;
  }
}
</style>
