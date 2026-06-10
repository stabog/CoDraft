<script setup>
import { mdiClose, mdiDockRight, mdiLockClock, mdiPencil } from '@mdi/js'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import VisualEditor from '../components/editor/VisualEditor.vue'
import MdiIcon from '../components/icons/MdiIcon.vue'
import ReviewPanel from '../components/review/ReviewPanel.vue'
import ReviewPreview from '../components/review/ReviewPreview.vue'
import VersionPanel from '../components/history/VersionPanel.vue'
import { useEditorDocumentStatus } from '../composables/useEditorDocumentStatus'
import { useSidebarState } from '../composables/useSidebarState'
import { useDocumentsStore } from '../stores/documentsStore'
import { useUserStore } from '../stores/userStore'
import { hasWorkingChanges } from '../utils/markdownDiff'

const route = useRoute()
const documentsStore = useDocumentsStore()
const userStore = useUserStore()
const { open: rightOpen, toggle: toggleRight } = useSidebarState('codraft-sidebar-right', true)

const draft = reactive({
  title: '',
  content: '',
})
const workspaceMode = ref('edit')
const sourceOpen = ref(false)
const sideTab = ref('review')
const selectedRange = ref(null)
const saveTimer = ref(null)
const lastSavedContent = ref('')
const lastSavedTitle = ref('')
const ready = ref(false)
const submitSummary = ref('')
const showSubmitForm = ref(false)

const capabilities = computed(() => documentsStore.capabilities)
const headVersion = computed(() => documentsStore.headVersion)
const headSnapshot = computed(() => documentsStore.headSnapshot)
const isRound = computed(() => documentsStore.isRound)
const isOwnerHub = computed(() => documentsStore.isOwnerHub)
const isActiveEditor = computed(() => documentsStore.isActiveEditor)
const canTakeLock = computed(() => documentsStore.canTakeLock)
const canEditActorDraft = computed(() => capabilities.value?.canEditActorDraft ?? false)
const canFixVersion = computed(() => documentsStore.canFixVersion)
const actorDraftMeta = computed(() => documentsStore.actorDraft)
const activeEditor = computed(() => documentsStore.activeEditor)

const isWritable = computed(() => {
  if (isRound.value) return isActiveEditor.value
  if (isOwnerHub.value) {
    return (capabilities.value?.canEditDraft ?? false) || canEditActorDraft.value
  }
  return capabilities.value?.canEditDraft ?? false
})

const showReviewMode = computed(() => isOwnerHub.value)

const baseTitle = computed(() => headSnapshot.value?.title ?? headVersion.value?.title ?? '')
const baseContent = computed(() => headSnapshot.value?.content ?? headVersion.value?.content ?? '')

const hasChangesSinceVersion = computed(() => {
  if (!headVersion.value) return Boolean(draft.title.trim() || draft.content.trim())
  return hasWorkingChanges(baseTitle.value, baseContent.value, draft.title, draft.content)
})

const hasUnsubmittedChanges = computed(() => {
  if (!canEditActorDraft.value) return false
  return hasChangesSinceVersion.value
})

const { wordCount, charCount, statusText, readonlyHint, editModeTitle, editModeLabel } =
  useEditorDocumentStatus({
  draft,
  documentsStore,
  headVersion,
  isRound,
  isOwnerHub,
  isActiveEditor,
  canTakeLock,
  canEditActorDraft,
  isWritable,
  capabilities,
  actorDraftMeta,
  hasChangesSinceVersion,
  hasUnsubmittedChanges,
  activeEditor,
  })

const showReadonlyStrip = computed(
  () => !isWritable.value && workspaceMode.value === 'edit' && Boolean(readonlyHint.value),
)

const canEditTitle = computed(
  () => workspaceMode.value === 'edit' && isWritable.value,
)

const footerStatus = computed(() => ({
  statusText: statusText.value,
  wordCount: wordCount.value,
  charCount: charCount.value,
}))

provide('editorFooterStatus', footerStatus)

async function releaseLockForDocument(documentId) {
  try {
    await documentsStore.releaseEditLock(documentId, userStore.actor, { discardChanges: true })
  } catch {
    // lock already released
  }
}

function resetWorkspaceUi() {
  sourceOpen.value = false
  workspaceMode.value = 'edit'
  selectedRange.value = null
  showSubmitForm.value = false
  submitSummary.value = ''
}

async function openDocument(documentId) {
  clearTimeout(saveTimer.value)
  await documentsStore.loadEditorBundle(documentId, userStore.actor)
  syncDraftFromStore()
}

onMounted(async () => {
  await openDocument(route.params.id)
  ready.value = true
})

watch(
  () => route.params.id,
  async (nextId, prevId) => {
    if (!prevId || nextId === prevId) return

    const hadRoundLock =
      ready.value && documentsStore.isRound && documentsStore.isActiveEditor

    if (hadRoundLock) {
      await releaseLockForDocument(prevId)
    }

    resetWorkspaceUi()
    await openDocument(nextId)
  },
)

onBeforeUnmount(async () => {
  clearTimeout(saveTimer.value)
  if (!ready.value || !isRound.value || !isActiveEditor.value) return

  await releaseLockForDocument(route.params.id)
})

watch(
  () => [draft.title, draft.content],
  () => scheduleSave(),
)

watch(workspaceMode, (mode) => {
  if (mode === 'review') sourceOpen.value = false
})

function syncDraftFromStore() {
  const doc = documentsStore.currentDocument
  if (!doc) return

  if (isRound.value && doc.draft) {
    draft.title = doc.draft.title
    draft.content = doc.draft.content
  } else if (doc.capabilities?.canEditDraft && doc.draft) {
    draft.title = doc.draft.title
    draft.content = doc.draft.content
  } else if (documentsStore.actorDraft) {
    draft.title = documentsStore.actorDraft.title
    draft.content = documentsStore.actorDraft.content
  } else if (doc.draft) {
    draft.title = doc.draft.title
    draft.content = doc.draft.content
  } else if (headSnapshot.value) {
    draft.title = headSnapshot.value.title
    draft.content = headSnapshot.value.content
  }

  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

function scheduleSave() {
  if (!ready.value || !isWritable.value) return

  clearTimeout(saveTimer.value)
  if (draft.title === lastSavedTitle.value && draft.content === lastSavedContent.value) return

  saveTimer.value = setTimeout(async () => {
    if (isRound.value || (isOwnerHub.value && capabilities.value?.canEditDraft)) {
      await documentsStore.updateDraft(route.params.id, userStore.actor, {
        title: draft.title,
        content: draft.content,
      })
    } else if (canEditActorDraft.value) {
      await documentsStore.updateActorDraft(route.params.id, userStore.actor, {
        title: draft.title,
        content: draft.content,
      })
    }
    lastSavedTitle.value = draft.title
    lastSavedContent.value = draft.content
  }, 900)
}

async function startRoundEditing() {
  await documentsStore.acquireEditLock(route.params.id, userStore.actor)
  syncDraftFromStore()
}

async function releaseRoundLock() {
  if (!hasChangesSinceVersion.value) {
    await documentsStore.releaseEditLock(route.params.id, userStore.actor, { discardChanges: true })
    syncDraftFromStore()
    sourceOpen.value = false
    return
  }

  const confirmed = window.confirm(
    'Отменить правки? Несохранённые изменения будут потеряны, документ останется на текущей версии.',
  )
  if (!confirmed) return

  await documentsStore.releaseEditLock(route.params.id, userStore.actor, { discardChanges: true })
  syncDraftFromStore()
  sourceOpen.value = false
}

async function fixVersion() {
  if (!canFixVersion.value) return

  clearTimeout(saveTimer.value)
  if (isWritable.value) {
    await documentsStore.updateDraft(route.params.id, userStore.actor, {
      title: draft.title,
      content: draft.content,
    })
  }
  await documentsStore.fixVersion(route.params.id, userStore.actor, {})
  syncDraftFromStore()
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

async function rebaseActorDraft() {
  const confirmed = window.confirm(
    'Пересоздать черновик от текущей версии? Несохранённые в черновике правки будут заменены текстом v' +
      (headVersion.value?.number ?? '') +
      '.',
  )
  if (!confirmed) return

  await documentsStore.rebaseActorDraft(route.params.id, userStore.actor)
  syncDraftFromStore()
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

async function submitActorEdit() {
  if (!submitSummary.value.trim()) return

  clearTimeout(saveTimer.value)
  await documentsStore.updateActorDraft(route.params.id, userStore.actor, {
    title: draft.title,
    content: draft.content,
  })

  try {
    await documentsStore.submitActorEdit(route.params.id, userStore.actor, {
      summary: submitSummary.value.trim(),
    })
    submitSummary.value = ''
    showSubmitForm.value = false
    syncDraftFromStore()
    lastSavedTitle.value = draft.title
    lastSavedContent.value = draft.content
  } catch (error) {
    window.alert(error.message || 'Не удалось отправить правки')
  }
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

async function applyEdit(editId) {
  await documentsStore.applyEdit(route.params.id, editId, userStore.actor)
  syncDraftFromStore()
}

async function restoreVersion(versionId) {
  await documentsStore.restoreVersionToDraft(route.params.id, versionId, userStore.actor)
  syncDraftFromStore()
  workspaceMode.value = 'edit'
  sourceOpen.value = false
  await nextTick()
}
</script>

<template>
  <section class="editor-page">
    <div v-if="documentsStore.loading || !ready" class="editor-state muted">Открываем документ...</div>
    <div v-else-if="documentsStore.error" class="editor-state error">{{ documentsStore.error }}</div>

    <template v-else>
      <div v-if="actorDraftMeta?.needsRebase" class="alert-banner">
        <span>Опубликована новая версия. Ваш черновик привязан к старому head.</span>
        <button type="button" class="secondary compact" @click="rebaseActorDraft">
          Пересоздать от v{{ headVersion?.number }}
        </button>
      </div>

      <div class="editor-workspace">
        <div class="editor-main">
          <header class="editor-chrome">
            <nav class="breadcrumb" aria-label="Путь к документу">
              <span class="breadcrumb-muted">Документы</span>
              <span class="breadcrumb-sep">/</span>
              <input
                v-model="draft.title"
                class="breadcrumb-title-input"
                type="text"
                placeholder="Без названия"
                :readonly="!canEditTitle"
                aria-label="Название документа"
              />
            </nav>

            <div class="chrome-actions">
              <div v-if="showReviewMode" class="mode-switch">
                <button type="button" :class="{ active: workspaceMode === 'edit' }" @click="workspaceMode = 'edit'">
                  Редактор
                </button>
                <button type="button" :class="{ active: workspaceMode === 'review' }" @click="workspaceMode = 'review'">
                  Правки
                </button>
              </div>

              <button
                v-if="canFixVersion"
                type="button"
                class="compact save-btn"
                :class="{ secondary: !hasChangesSinceVersion }"
                :disabled="!hasChangesSinceVersion"
                :title="
                  hasChangesSinceVersion
                    ? `Сохранить как v${(headVersion?.number ?? 0) + 1}`
                    : 'Нет изменений для сохранения'
                "
                @click="fixVersion"
              >
                Сохранить
              </button>

              <button
                v-if="canEditActorDraft && workspaceMode === 'edit'"
                type="button"
                class="secondary compact submit-btn"
                :disabled="!hasUnsubmittedChanges || actorDraftMeta?.needsRebase"
                @click="showSubmitForm = !showSubmitForm"
              >
                Отправить
              </button>

              <button
                v-if="isRound && canTakeLock"
                type="button"
                class="mode-btn"
                :title="editModeTitle"
                @click="startRoundEditing"
              >
                <MdiIcon :path="mdiPencil" :size="14" />
                <span>{{ editModeLabel }}</span>
              </button>

              <button
                v-else-if="isRound && isActiveEditor"
                type="button"
                class="mode-btn mode-btn-cancel"
                :title="editModeTitle"
                @click="releaseRoundLock"
              >
                <MdiIcon :path="mdiClose" :size="14" />
                <span>{{ editModeLabel }}</span>
              </button>

              <button
                v-else-if="isRound && activeEditor"
                type="button"
                class="mode-btn muted"
                :title="editModeTitle"
                disabled
              >
                <MdiIcon :path="mdiLockClock" :size="14" />
                <span>{{ editModeLabel }}</span>
              </button>

              <button
                type="button"
                class="icon-btn"
                :class="{ active: rightOpen }"
                title="Замечания и история"
                @click="toggleRight"
              >
                <MdiIcon :path="mdiDockRight" />
              </button>
            </div>
          </header>

          <form
            v-if="showSubmitForm && canEditActorDraft"
            class="submit-form"
            @submit.prevent="submitActorEdit"
          >
            <textarea v-model="submitSummary" placeholder="Кратко: что изменили и зачем" />
            <div class="submit-form-actions">
              <button type="submit" :disabled="!submitSummary.trim() || !hasUnsubmittedChanges">
                Подтвердить отправку
              </button>
              <button type="button" class="ghost" @click="showSubmitForm = false">Отмена</button>
            </div>
          </form>

          <div class="editor-canvas" :class="{ 'is-readonly': !isWritable && workspaceMode === 'edit' }">
            <div v-if="showReadonlyStrip" class="readonly-strip">
              <span>{{ readonlyHint }}</span>
            </div>

            <ReviewPreview
              v-if="workspaceMode === 'review'"
              :head-title="headSnapshot?.title ?? ''"
              :head-content="headSnapshot?.content ?? ''"
              :head-version-number="headVersion?.number ?? 0"
              :edits="documentsStore.edits"
            />
            <VisualEditor
              v-else
              v-model="draft.content"
              v-model:source-open="sourceOpen"
              :document-title="draft.title"
              :readonly="!isWritable"
              @selection-change="handleSelection"
            />
          </div>
        </div>

        <aside class="sidebar-right" :class="{ collapsed: !rightOpen }">
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
            :can-submit-edit="false"
            :can-apply-edit="capabilities?.canApplyEdit"
            @add-comment="addComment"
            @add-reply="(id, body) => documentsStore.addReply(id, userStore.actor, { body })"
            @resolve-comment="(id, resolution) => documentsStore.resolveComment(id, userStore.actor, resolution)"
            @reopen-comment="(id) => documentsStore.reopenComment(id, userStore.actor)"
            @apply-edit="applyEdit"
            @reject-edit="(id) => documentsStore.rejectEdit(route.params.id, id, userStore.actor)"
          />
          <VersionPanel
            v-else
            :versions="documentsStore.versions"
            :can-restore="isWritable || canTakeLock"
            @restore="restoreVersion"
          />
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.editor-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.editor-state {
  margin: 24px;
}

.alert-banner {
  align-items: center;
  background: rgba(255, 165, 0, 0.12);
  border-bottom: 1px solid rgba(255, 165, 0, 0.35);
  color: var(--color-orange);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 12px;
  justify-content: space-between;
  padding: 6px 16px;
}

.compact {
  font-size: 12px;
  min-height: 28px;
  padding: 0 10px;
}

.editor-workspace {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr auto;
  min-height: 0;
}

.editor-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.editor-chrome {
  align-items: center;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 16px 0 24px;
}

.breadcrumb {
  align-items: center;
  color: var(--text-muted);
  display: flex;
  font-size: 12px;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.breadcrumb-muted {
  color: var(--text-faint);
  flex-shrink: 0;
}

.breadcrumb-sep {
  color: var(--text-faint);
  flex-shrink: 0;
}

.breadcrumb-title-input {
  background: transparent;
  border: 0;
  border-radius: 3px;
  color: var(--text-normal);
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  min-width: 120px;
  outline: none;
  padding: 2px 6px;
}

.breadcrumb-title-input::placeholder {
  color: var(--text-faint);
  font-weight: 500;
}

.breadcrumb-title-input:not(:read-only):hover,
.breadcrumb-title-input:not(:read-only):focus {
  background: var(--background-modifier-hover);
}

.breadcrumb-title-input:read-only {
  color: var(--text-muted);
  cursor: default;
  font-weight: 500;
}

.chrome-actions {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.mode-switch {
  display: flex;
  gap: 2px;
}

.mode-switch button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  margin: 0;
  min-height: 28px;
  padding: 0 8px;
}

.mode-switch button:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.mode-switch button.active {
  background: var(--background-modifier-active);
  border-color: var(--background-modifier-border);
  color: var(--text-normal);
}

.submit-btn {
  border: 1px solid rgba(61, 214, 140, 0.35);
  color: var(--color-green);
}

.save-btn:not(.secondary):not(:disabled) {
  font-weight: 600;
}

.icon-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-muted);
  display: inline-flex;
  height: 28px;
  justify-content: center;
  margin: 0;
  min-height: 28px;
  padding: 0;
  width: 28px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.icon-btn.active {
  background: rgba(61, 214, 140, 0.15);
  border-color: rgba(61, 214, 140, 0.35);
  color: var(--color-green);
}

.icon-btn.muted {
  opacity: 0.7;
}

.mode-btn {
  align-items: center;
  background: transparent;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  color: var(--text-muted);
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
  margin: 0;
  min-height: 28px;
  padding: 0 10px;
}

.mode-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.mode-btn-cancel {
  border-color: var(--background-modifier-border);
  color: var(--text-muted);
}

.mode-btn-cancel:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.mode-btn.muted:disabled {
  cursor: default;
  opacity: 0.85;
}

.mode-btn-mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}

.submit-form {
  border-bottom: 1px solid var(--background-modifier-border);
  display: grid;
  gap: 8px;
  padding: 12px 32px;
}

.submit-form textarea {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  color: var(--text-normal);
  font-size: 13px;
  min-height: 56px;
  padding: 8px;
  resize: vertical;
  width: 100%;
}

.submit-form-actions {
  display: flex;
  gap: 8px;
}

.submit-form-actions button {
  font-size: 12px;
  margin: 0;
  min-height: 30px;
}

.submit-form-actions button.ghost {
  background: transparent;
  color: var(--text-muted);
}

.editor-canvas {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.editor-canvas.is-readonly :deep(.markdown-input) {
  cursor: default;
}

.readonly-strip {
  align-items: center;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 12px;
  justify-content: space-between;
  padding: 6px 32px;
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.sidebar-right {
  background: var(--background-secondary);
  border-left: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  transition: width 0.15s ease, opacity 0.15s ease;
  width: var(--right-sidebar-width);
}

.sidebar-right.collapsed {
  border-left: 0;
  opacity: 0;
  pointer-events: none;
  width: 0;
}

@media (max-width: 720px) {
  .editor-chrome {
    padding: 0 12px;
  }

  .readonly-strip,
  .submit-form {
    padding-left: 16px;
    padding-right: 16px;
  }

  .sidebar-right:not(.collapsed) {
    bottom: 0;
    position: absolute;
    right: 0;
    top: 0;
    z-index: 10;
  }
}
</style>
