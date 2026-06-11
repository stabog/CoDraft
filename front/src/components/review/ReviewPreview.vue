<script setup>
import { computed } from 'vue'
import VisualEditor from '../editor/VisualEditor.vue'

const props = defineProps({
  headTitle: { type: String, default: '' },
  headContent: { type: String, default: '' },
  headVersionNumber: { type: Number, default: 0 },
  submittedDrafts: { type: Array, default: () => [] },
})

const sortedDrafts = computed(() =>
  [...props.submittedDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)
</script>

<template>
  <section class="review-preview">
    <header class="preview-header">
      <h2>Просмотр правок</h2>
      <p class="muted">
        Версия v{{ headVersionNumber }} (канон). Отправленные черновики участников — только для чтения.
      </p>
    </header>

    <div v-if="sortedDrafts.length" class="edit-list">
      <article v-for="draft in sortedDrafts" :key="draft.id" class="edit-card">
        <div class="edit-meta">
          <strong>{{ draft.author.name }}</strong>
          <span>{{ new Date(draft.updatedAt).toLocaleString() }}</span>
        </div>
        <p class="summary">{{ draft.title }}</p>
        <div class="draft-body">
          <VisualEditor :model-value="draft.content" readonly />
        </div>
      </article>
    </div>
    <p v-else class="muted empty-edits">Нет отправленных черновиков к этой версии.</p>

    <div class="head-preview">
      <h3 class="head-label">Канон v{{ headVersionNumber }}</h3>
      <VisualEditor :model-value="headContent" readonly />
    </div>
  </section>
</template>

<style scoped>
.review-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.preview-header {
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 16px 32px 12px;
}

.preview-header h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
}

.muted {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.edit-list {
  border-bottom: 1px solid var(--background-modifier-border);
  display: grid;
  gap: 0;
}

.edit-card {
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 12px 32px;
}

.edit-meta {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.edit-meta span {
  color: var(--text-muted);
  font-size: 12px;
}

.summary {
  font-size: 13px;
  margin: 0 0 8px;
}

.draft-body {
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  max-height: 240px;
  overflow: auto;
}

.empty-edits {
  padding: 12px 32px;
}

.head-preview {
  flex: 1;
  min-height: 0;
}

.head-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  margin: 0;
  padding: 12px 32px 0;
  text-transform: uppercase;
}

@media (max-width: 720px) {
  .preview-header,
  .edit-card,
  .empty-edits {
    padding-left: 16px;
    padding-right: 16px;
  }

  .head-label {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
