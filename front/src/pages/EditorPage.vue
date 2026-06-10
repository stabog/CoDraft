<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownEditor from '../components/editor/MarkdownEditor.vue'
import VisualEditor from '../components/editor/VisualEditor.vue'
import ReviewPanel from '../components/review/ReviewPanel.vue'
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
const sideTab = ref('review')
const selectedRange = ref(null)
const saveTimer = ref(null)
const lastSavedContent = ref('')
const lastSavedTitle = ref('')
const ready = ref(false)

const capabilities = computed(() => documentsStore.capabilities)
const headVersion = computed(() => documentsStore.headVersion)
const canEdit = computed(() => capabilities.value?.canEditDraft ?? false)

const hasChangesSinceVersion = computed(() => {
  if (!headVersion.value) return Boolean(draft.title.trim() || draft.content.trim())
  return headVersion.value.title !== draft.title || headVersion.value.content !== draft.content
})

onMounted(async () => {
  await documentsStore.loadEditorBundle(route.params.id, userStore.actor)
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
  const doc = documentsStore.currentDocument
  if (!doc?.draft) return
  draft.title = doc.draft.title
  draft.content = doc.draft.content
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

function scheduleSave() {
  if (!ready.value || !canEdit.value) return

  clearTimeout(saveTimer.value)
  if (draft.title === lastSavedTitle.value && draft.content === lastSavedContent.value) return

  saveTimer.value = setTimeout(async () => {
    await documentsStore.updateDraft(route.params.id, userStore.actor, {
      title: draft.title,
      content: draft.content,
    })
    lastSavedTitle.value = draft.title
    lastSavedContent.value = draft.content
  }, 900)
}

async function fixVersion() {
  if (!canEdit.value) return

  const summary = window.prompt('Кратко опишите, что изменилось в этой версии:')
  if (!summary?.trim()) return

  clearTimeout(saveTimer.value)
  await documentsStore.updateDraft(route.params.id, userStore.actor, {
    title: draft.title,
    content: draft.content,
  })
  await documentsStore.fixVersion(route.params.id, userStore.actor, { summary: summary.trim() })
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

function handleSelection(range) {
  if (!range) {
    selectedRange.value = null
    return
  }

  selectedRange.value = {
    anchorFrom: range.anchorFrom,
    anchorTo: range.anchorTo,
    anchorText: range.anchorText,
    anchor: {
      from: range.anchorFrom,
      to: range.anchorTo,
      quotedText: range.anchorText,
    },
  }
}

async function addComment(body) {
  if (!selectedRange.value?.anchor || !headVersion.value) return

  await documentsStore.addComment(route.params.id, userStore.actor, {
    targetVersionId: headVersion.value.id,
    anchor: selectedRange.value.anchor,
    body,
  })
  selectedRange.value = null
}

async function submitEdit(payload) {
  if (!headVersion.value) return

  await documentsStore.submitEdit(route.params.id, userStore.actor, {
    baseVersionId: headVersion.value.id,
    ...payload,
  })
}

async function applyEdit(editId) {
  await documentsStore.applyEdit(route.params.id, editId, userStore.actor)
  syncDraftFromStore()
}

async function restoreVersion(versionId) {
  await documentsStore.restoreVersionToDraft(route.params.id, versionId, userStore.actor)
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
      <div v-if="!canEdit" class="role-banner">
        Вы смотрите документ как участник: можно комментировать и предлагать правки. Редактирует владелец.
      </div>

      <div class="editor-toolbar">
        <input v-model="draft.title" class="title-input" type="text" :readonly="!canEdit" />
        <div class="version-actions">
          <div class="save-state">
            <span v-if="canEdit && documentsStore.saving">Сохраняем черновик...</span>
            <span v-else-if="canEdit">Черновик сохранён</span>
            <span v-else>Черновик владельца</span>
            <span class="dot">·</span>
            <span>v{{ documentsStore.currentDocument?.headVersionNumber }}</span>
            <span class="dot">·</span>
            <span>{{ hasChangesSinceVersion ? 'Есть изменения после версии' : 'Версия актуальна' }}</span>
          </div>
          <button v-if="canEdit" type="button" :disabled="!hasChangesSinceVersion" @click="fixVersion">
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
            :readonly="!canEdit"
            @selection-change="handleSelection"
          />
          <MarkdownEditor
            v-else
            v-model="draft.content"
            :readonly="!canEdit"
            :selected-range="selectedRange"
            @selection-change="handleSelection"
          />
        </section>

        <aside class="workspace-sidebar">
          <div class="tabbar">
            <button type="button" :class="{ active: sideTab === 'review' }" @click="sideTab = 'review'">
              Замечания
            </button>
            <button type="button" :class="{ active: sideTab === 'history' }" @click="sideTab = 'history'">
              История
            </button>
          </div>

          <ReviewPanel
            v-if="sideTab === 'review'"
            :comments="documentsStore.comments"
            :edits="documentsStore.edits"
            :selected-range="selectedRange"
            :head-version-id="headVersion?.id"
            :can-comment="capabilities?.canComment"
            :can-submit-edit="capabilities?.canSubmitEdit"
            :can-apply-edit="capabilities?.canApplyEdit"
            :draft-title="draft.title"
            :draft-content="draft.content"
            @add-comment="addComment"
            @add-reply="(id, body) => documentsStore.addReply(id, userStore.actor, { body })"
            @resolve-comment="(id, resolution) => documentsStore.resolveComment(id, userStore.actor, resolution)"
            @reopen-comment="(id) => documentsStore.reopenComment(id, userStore.actor)"
            @submit-edit="submitEdit"
            @apply-edit="applyEdit"
            @reject-edit="(id) => documentsStore.rejectEdit(route.params.id, id, userStore.actor)"
          />
          <VersionPanel
            v-else
            :versions="documentsStore.versions"
            :can-restore="canEdit"
            @restore="restoreVersion"
          />
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

.role-banner {
  background: #eff4ff;
  border: 1px solid #c7d7fe;
  border-radius: 8px;
  color: #3538cd;
  margin-bottom: 14px;
  padding: 12px 16px;
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

.title-input:read-only {
  background: #f8fafc;
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
