<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDocumentsStore } from '../../stores/documentsStore'
import { useUserStore } from '../../stores/userStore'

const route = useRoute()
const router = useRouter()
const documentsStore = useDocumentsStore()
const userStore = useUserStore()
const newTitle = ref('')
const creating = ref(false)

onMounted(() => {
  documentsStore.loadDocuments(userStore.actor)
})

watch(
  () => userStore.activeUserId,
  () => documentsStore.loadDocuments(userStore.actor),
)

async function createDocument() {
  if (creating.value) return
  creating.value = true
  try {
    const title = newTitle.value.trim() || 'Без названия'
    const document = await documentsStore.createDocument(userStore.actor, {
      title,
      content: '\n\n',
    })
    newTitle.value = ''
    router.push({ name: 'editor', params: { id: document.id } })
  } finally {
    creating.value = false
  }
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
}
</script>

<template>
  <section class="file-explorer">
    <header class="explorer-header">
      <span>Документы</span>
      <span v-if="documentsStore.documents.length" class="count">{{ documentsStore.documents.length }}</span>
    </header>

    <form class="create-form" @submit.prevent="createDocument">
      <input v-model="newTitle" type="text" placeholder="Новый документ..." />
      <button type="submit" :disabled="creating" title="Создать">+</button>
    </form>

    <p v-if="documentsStore.loading" class="explorer-state">Загрузка...</p>
    <p v-else-if="documentsStore.error" class="explorer-state error">{{ documentsStore.error }}</p>

    <nav v-else class="file-list">
      <RouterLink
        v-for="document in documentsStore.documents"
        :key="document.id"
        class="file-item"
        :class="{ active: route.params.id === document.id }"
        :to="{ name: 'editor', params: { id: document.id } }"
      >
        <span class="file-title">{{ document.title || 'Без названия' }}</span>
        <span class="file-meta">v{{ document.headVersionNumber }} · {{ formatDate(document.updatedAt) }}</span>
      </RouterLink>
      <p v-if="!documentsStore.documents.length" class="explorer-state">Пока нет документов</p>
    </nav>
  </section>
</template>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.explorer-header {
  align-items: center;
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  display: flex;
  font-size: 11px;
  font-weight: 700;
  justify-content: space-between;
  letter-spacing: 0.06em;
  min-height: 36px;
  padding: 0 12px;
  text-transform: uppercase;
}

.count {
  color: var(--text-faint);
  font-weight: 600;
}

.create-form {
  border-bottom: 1px solid var(--background-modifier-border);
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 32px;
  padding: 8px;
}

.create-form input {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  font-size: 13px;
  min-height: 30px;
  padding: 4px 8px;
}

.create-form button {
  min-height: 30px;
  padding: 0;
}

.file-list {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
}

.file-item {
  border-left: 2px solid transparent;
  display: grid;
  gap: 2px;
  padding: 6px 12px 6px 10px;
  transition: background 0.1s ease;
}

.file-item:hover {
  background: var(--background-modifier-hover);
}

.file-item.active {
  background: var(--background-modifier-active);
  border-left-color: var(--interactive-accent);
}

.file-title {
  color: var(--text-normal);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  color: var(--text-faint);
  font-size: 11px;
}

.explorer-state {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
  padding: 12px;
}
</style>
