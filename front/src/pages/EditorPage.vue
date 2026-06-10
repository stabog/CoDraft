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
const ready = ref(false)

const latestVersion = computed(() => documentsStore.versions[0] || null)
const hasChangesSinceVersion = computed(() => {
  if (!latestVersion.value) return Boolean(draft.title.trim() || draft.content.trim())
  return latestVersion.value.title !== draft.title || latestVersion.value.content !== draft.content
})

onMounted(async () => {
  await documentsStore.loadDocument(route.params.id)
  syncDraftFromStore()
  ready.value = true
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
  if (!ready.value) return

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
    <div v-if="documentsStore.loading || !ready" class="muted">Открываем документ...</div>
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

        <aside class="workspace-sidebar">
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

<style scoped>
:global(.main) {
  max-width: none;
  padding: 36px clamp(18px, 4vw, 80px);
}

.editor-page {
  min-width: 0;
}

.editor-toolbar {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(320px, 700px) minmax(360px, 1fr);
  margin-bottom: 18px;
}

.title-input {
  background: #ffffff;
  border: 1px solid #d7dce5;
  border-radius: 8px;
  color: #0f172a;
  font-size: 28px;
  font-weight: 800;
  min-height: 62px;
  padding: 12px 16px;
  width: 100%;
}

.version-actions {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: flex-end;
  min-width: 0;
}

.save-state {
  color: #667085;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.dot {
  color: #98a2b3;
}

.version-actions button {
  background: #4f7df3;
  border-radius: 8px;
  box-shadow: 0 8px 18px rgba(79, 125, 243, 0.2);
  color: #ffffff;
  flex: 0 0 auto;
  min-height: 52px;
  padding: 0 20px;
}

.version-actions button:disabled {
  box-shadow: none;
}

.editor-layout {
  align-items: stretch;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) 450px;
}

.workspace-column,
.workspace-sidebar {
  background: #ffffff;
  border: 1px solid #e1e5eb;
  border-radius: 8px;
  min-width: 0;
  overflow: hidden;
}

.workspace-sidebar {
  align-self: start;
}

.tabbar {
  align-items: center;
  background: #f8fafc;
  border-bottom: 1px solid #e1e5eb;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 10px;
}

.tabbar button {
  background: transparent;
  border-radius: 7px;
  color: #344054;
  min-height: 42px;
  padding: 0 14px;
}

.tabbar button.active {
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #cfd6e2;
  color: #0f172a;
}

@media (max-width: 1180px) {
  :global(.main) {
    padding: 24px 18px;
  }

  .editor-toolbar,
  .editor-layout {
    grid-template-columns: 1fr;
  }

  .version-actions {
    justify-content: space-between;
  }
}

@media (max-width: 720px) {
  .editor-toolbar {
    gap: 12px;
  }

  .title-input {
    font-size: 24px;
    min-height: 50px;
  }

  .version-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .save-state {
    justify-content: flex-start;
  }

  .version-actions button {
    width: 100%;
  }

  .editor-layout {
    gap: 14px;
  }
}
</style>
