<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownIt from 'markdown-it'
import CommentPanel from '../components/comments/CommentPanel.vue'
import MarkdownEditor from '../components/editor/MarkdownEditor.vue'
import VersionPanel from '../components/history/VersionPanel.vue'
import { useDocumentsStore } from '../stores/documentsStore'
import { useUserStore } from '../stores/userStore'

const route = useRoute()
const documentsStore = useDocumentsStore()
const userStore = useUserStore()
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true })

const draft = reactive({
  title: '',
  content: '',
})
const selectedRange = ref(null)
const saveTimer = ref(null)
const lastSavedContent = ref('')
const lastSavedTitle = ref('')

const renderedContent = computed(() => markdown.render(draft.content || ''))
const hasSelection = computed(() => selectedRange.value?.text?.trim())

onMounted(async () => {
  await documentsStore.loadDocument(route.params.id)
  syncDraftFromStore()
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer.value)
})

watch(
  () => [draft.title, draft.content],
  () => scheduleSave(),
)

function syncDraftFromStore() {
  if (!documentsStore.currentDocument) return
  draft.title = documentsStore.currentDocument.title
  draft.content = documentsStore.currentDocument.content
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

function scheduleSave() {
  clearTimeout(saveTimer.value)
  if (draft.title === lastSavedTitle.value && draft.content === lastSavedContent.value) return

  saveTimer.value = setTimeout(async () => {
    await documentsStore.saveDocument(route.params.id, {
      title: draft.title,
      content: draft.content,
      authorName: userStore.name,
    })
    lastSavedTitle.value = draft.title
    lastSavedContent.value = draft.content
  }, 700)
}

function handleSelection(range) {
  selectedRange.value = range
}

async function addComment(body) {
  if (!hasSelection.value) return

  await documentsStore.addComment(route.params.id, {
    ...selectedRange.value,
    body,
    authorName: userStore.name,
  })
  selectedRange.value = null
}

async function restoreVersion(versionId) {
  await documentsStore.restoreVersion(route.params.id, versionId, { authorName: userStore.name })
  syncDraftFromStore()
  await nextTick()
}
</script>

<template>
  <section class="editor-page">
    <div v-if="documentsStore.loading" class="muted">Открываем документ...</div>
    <div v-else-if="documentsStore.error" class="error">{{ documentsStore.error }}</div>

    <template v-else>
      <div class="editor-toolbar">
        <input v-model="draft.title" class="title-input" type="text" />
        <div class="save-state">
          <span v-if="documentsStore.saving">Сохраняем...</span>
          <span v-else>Все правки сохранены</span>
        </div>
      </div>

      <div class="editor-layout">
        <MarkdownEditor
          v-model="draft.content"
          :selected-range="selectedRange"
          @selection-change="handleSelection"
        />

        <section class="preview-pane">
          <div class="pane-heading">
            <h2>Preview</h2>
          </div>
          <article class="markdown-preview" v-html="renderedContent"></article>
        </section>

        <aside class="side-pane">
          <CommentPanel
            :comments="documentsStore.comments"
            :selected-range="selectedRange"
            :author-name="userStore.name"
            @add-comment="addComment"
            @add-reply="documentsStore.addReply"
            @set-status="documentsStore.setCommentStatus"
          />
          <VersionPanel :versions="documentsStore.versions" @restore="restoreVersion" />
        </aside>
      </div>
    </template>
  </section>
</template>
