<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CommentPanel from '../components/comments/CommentPanel.vue'
import MarkdownEditor from '../components/editor/MarkdownEditor.vue'
import VisualEditor from '../components/editor/VisualEditor.vue'
import VersionPanel from '../components/history/VersionPanel.vue'
import { useDocumentsStore } from '../stores/documentsStore'
import { useUserStore } from '../stores/userStore'

const route = useRoute()
const documentsStore = useDocumentsStore()
const userStore = useUserStore()

const draft = reactive({
  title: '',
  content: '',
})
const mainTab = ref('visual')
const sideTab = ref('comments')
const selectedRange = ref(null)
const saveTimer = ref(null)
const lastSavedContent = ref('')
const lastSavedTitle = ref('')

const latestVersion = computed(() => documentsStore.versions[0] || null)
const hasChangesSinceVersion = computed(() => {
  if (!latestVersion.value) return Boolean(draft.title.trim() || draft.content.trim())
  return latestVersion.value.title !== draft.title || latestVersion.value.content !== draft.content
})

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
  }, 900)
}

async function createVersion() {
  clearTimeout(saveTimer.value)
  await documentsStore.createVersion(route.params.id, {
    title: draft.title,
    content: draft.content,
    authorName: userStore.name,
  })
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

function handleSelection(range) {
  selectedRange.value = range
}

async function addComment(body) {
  if (!selectedRange.value?.text?.trim()) return

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
  mainTab.value = 'visual'
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
        <div class="version-actions">
          <div class="save-state">
            <span v-if="documentsStore.saving">Сохраняем черновик...</span>
            <span v-else>Черновик сохранен</span>
            <span class="dot">·</span>
            <span>{{ hasChangesSinceVersion ? 'Есть изменения после версии' : 'Версия актуальна' }}</span>
          </div>
          <button type="button" :disabled="!hasChangesSinceVersion" @click="createVersion">
            Зафиксировать версию
          </button>
        </div>
      </div>

      <div class="editor-layout">
        <section class="workspace-column">
          <div class="tabbar">
            <button type="button" :class="{ active: mainTab === 'visual' }" @click="mainTab = 'visual'">
              Visual
            </button>
            <button type="button" :class="{ active: mainTab === 'markdown' }" @click="mainTab = 'markdown'">
              Markdown
            </button>
          </div>

          <VisualEditor
            v-if="mainTab === 'visual'"
            v-model="draft.content"
            @selection-change="handleSelection"
          />
          <MarkdownEditor
            v-else
            v-model="draft.content"
            :selected-range="selectedRange"
            @selection-change="handleSelection"
          />
        </section>

        <aside class="side-pane workspace-sidebar">
          <div class="tabbar">
            <button type="button" :class="{ active: sideTab === 'comments' }" @click="sideTab = 'comments'">
              Комментарии
            </button>
            <button type="button" :class="{ active: sideTab === 'history' }" @click="sideTab = 'history'">
              История
            </button>
          </div>

          <CommentPanel
            v-if="sideTab === 'comments'"
            :comments="documentsStore.comments"
            :selected-range="selectedRange"
            :author-name="userStore.name"
            @add-comment="addComment"
            @add-reply="documentsStore.addReply"
            @set-status="documentsStore.setCommentStatus"
          />
          <VersionPanel v-else :versions="documentsStore.versions" @restore="restoreVersion" />
        </aside>
      </div>
    </template>
  </section>
</template>
