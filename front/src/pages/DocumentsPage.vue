<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDocumentsStore } from '../stores/documentsStore'
import { useUserStore } from '../stores/userStore'

const router = useRouter()
const documentsStore = useDocumentsStore()
const userStore = useUserStore()
const title = ref('')

onMounted(() => {
  documentsStore.loadDocuments()
})

async function createDocument() {
  const document = await documentsStore.createDocument({
    title: title.value,
    content: `# ${title.value || 'Untitled document'}\n\nStart writing here.\n`,
    authorName: userStore.name,
  })

  title.value = ''
  router.push({ name: 'editor', params: { id: document.id } })
}
</script>

<template>
  <section class="documents-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Workspace</p>
        <h1>Документы</h1>
      </div>
      <form class="create-form" @submit.prevent="createDocument">
        <input v-model="title" type="text" placeholder="Название документа" />
        <button type="submit">Создать</button>
      </form>
    </div>

    <p v-if="documentsStore.loading" class="muted">Загружаем документы...</p>
    <p v-else-if="documentsStore.error" class="error">{{ documentsStore.error }}</p>

    <div v-else class="document-grid">
      <RouterLink
        v-for="document in documentsStore.documents"
        :key="document.id"
        class="document-card"
        :to="{ name: 'editor', params: { id: document.id } }"
      >
        <h2>{{ document.title }}</h2>
        <p>{{ document.excerpt || 'Пустой документ' }}</p>
        <span>Обновлен {{ new Date(document.updatedAt).toLocaleString() }}</span>
      </RouterLink>
    </div>
  </section>
</template>
