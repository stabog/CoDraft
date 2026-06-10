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
    <p v-if="!versions.length" class="empty-state">Пока нет зафиксированных версий.</p>

    <div v-else class="version-list">
      <article v-for="version in versions" :key="version.id" class="version-item">
        <strong>v{{ version.number }} — {{ version.summary || 'Версия' }}</strong>
        <span>{{ version.author.name }} · {{ new Date(version.createdAt).toLocaleString() }}</span>
        <span v-if="version.incorporatedEditIds?.length">
          Учтено правок: {{ version.incorporatedEditIds.length }}
        </span>
        <button v-if="canRestore" type="button" class="ghost" @click="$emit('restore', version.id)">
          Восстановить в черновик
        </button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.versions-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.version-item span,
.empty-state {
  color: var(--text-muted);
}

.empty-state {
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
  padding: 12px;
}

.version-item {
  border-bottom: 1px solid var(--background-modifier-border);
  display: grid;
  gap: 4px;
  padding: 12px;
}

.version-item strong {
  color: var(--text-normal);
  font-size: 13px;
}

.version-item span {
  font-size: 12px;
}

.version-item button {
  font-size: 12px;
  justify-self: start;
  margin-top: 4px;
  min-height: 28px;
  padding: 0 8px;
}
</style>
