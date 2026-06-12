<script setup>
import { mdiDockRight, mdiLockClock, mdiPencil } from '@mdi/js'
import { computed, nextTick, onMounted, provide, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import VisualEditor from '../components/editor/VisualEditor.vue'
import MdiIcon from '../components/icons/MdiIcon.vue'
import AiEditorPanel from '../components/ai-editor/AiEditorPanel.vue'
import ReviewPanel from '../components/review/ReviewPanel.vue'
import ReviewPreview from '../components/review/ReviewPreview.vue'
import VersionCompareWorkspace from '../components/history/VersionCompareWorkspace.vue'
import VersionPanel from '../components/history/VersionPanel.vue'
import { useEditorDocumentStatus } from '../composables/useEditorDocumentStatus'
import { useSidebarState } from '../composables/useSidebarState'
import { useDocumentsStore } from '../stores/documentsStore'
import { useUserStore } from '../stores/userStore'
import { applyContextPatch } from '../utils/applyContextPatch.js'
import { updateAnchorAfterContextPatch } from '../utils/editorAnchor.js'
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
const brushActive = ref(false)
const visualEditorRef = ref(null)
const saveTimer = ref(null)
const lastSavedContent = ref('')
const lastSavedTitle = ref('')
const ready = ref(false)

const capabilities = computed(() => documentsStore.capabilities)
const headVersion = computed(() => documentsStore.headVersion)
const headSnapshot = computed(() => documentsStore.headSnapshot)
const isRound = computed(() => documentsStore.isRound)
const isOwnerHub = computed(() => documentsStore.isOwnerHub)
const isActiveEditor = computed(() => documentsStore.isActiveEditor)
const canTakeLock = computed(() => documentsStore.canTakeLock)
const canEditActorDraft = computed(() => capabilities.value?.canEditActorDraft ?? false)
const canFixVersion = computed(() => documentsStore.canFixVersion)
const canCloseSession = computed(() => documentsStore.canCloseSession)
const actorDraftMeta = computed(() => documentsStore.actorDraft)
const activeEditor = computed(() => documentsStore.activeEditor)
const turnActor = computed(() => documentsStore.turnActor)
const passTurnOpen = ref(false)

const isWritable = computed(() => {
  if (isRound.value) return isActiveEditor.value
  if (isOwnerHub.value) {
    return (capabilities.value?.canEditDraft ?? false) || canEditActorDraft.value
  }
  return capabilities.value?.canEditDraft ?? false
})

const showReviewMode = computed(() => isOwnerHub.value)

const canCompareVersions = computed(() => documentsStore.versions.length >= 2)

const baseTitle = computed(() => headSnapshot.value?.title ?? headVersion.value?.title ?? '')
const baseContent = computed(() => headSnapshot.value?.content ?? headVersion.value?.content ?? '')

const hasChangesSinceVersion = computed(() =>
  hasWorkingChanges(baseTitle.value, baseContent.value, draft.title, draft.content),
)

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
  turnActor,
  })

const showReadonlyStrip = computed(
  () =>
    !isRound.value &&
    !isWritable.value &&
    workspaceMode.value === 'edit' &&
    Boolean(readonlyHint.value),
)

const roundForeignEditor = computed(
  () => isRound.value && activeEditor.value && !isActiveEditor.value,
)

const roundWaitingTurn = computed(
  () => isRound.value && !isActiveEditor.value && !activeEditor.value && Boolean(turnActor.value),
)

const canEditTitle = computed(
  () => workspaceMode.value === 'edit' && isWritable.value,
)

const showAnchorTools = computed(() => {
  const canComment = capabilities.value?.canComment ?? false
  if (workspaceMode.value === 'review') return canComment
  if (workspaceMode.value === 'edit') return canComment || isWritable.value
  return false
})

const footerStatus = computed(() => ({
  statusText: statusText.value,
  wordCount: wordCount.value,
  charCount: charCount.value,
}))

provide('editorFooterStatus', footerStatus)

function resetWorkspaceUi() {
  sourceOpen.value = false
  workspaceMode.value = 'edit'
  selectedRange.value = null
  brushActive.value = false
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
    resetWorkspaceUi()
    await openDocument(nextId)
  },
)

watch(
  () => [draft.title, draft.content],
  () => scheduleSave(),
)

watch(workspaceMode, (mode) => {
  if (mode === 'review' || mode === 'compare') {
    sourceOpen.value = false
    if (sideTab.value === 'ai') sideTab.value = 'review'
  }
})

watch(sideTab, () => {
  visualEditorRef.value?.refreshAnchorDecoration()
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

function startCompare() {
  workspaceMode.value = 'compare'
}

function closeCompare() {
  workspaceMode.value = 'edit'
}

async function flushDraftSave() {
  clearTimeout(saveTimer.value)
  if (!isWritable.value) return
  await documentsStore.updateDraft(route.params.id, userStore.actor, {
    title: draft.title,
    content: draft.content,
  })
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

async function publishVersion() {
  if (!canFixVersion.value) return
  await flushDraftSave()
  await documentsStore.fixVersion(route.params.id, userStore.actor, {})
  syncDraftFromStore()
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

async function closeSession(passTo = null) {
  if (!canCloseSession.value) return
  clearTimeout(saveTimer.value)
  if (hasChangesSinceVersion.value) {
    await flushDraftSave()
  }
  await documentsStore.closeSession(route.params.id, userStore.actor, { passTo })
  passTurnOpen.value = false
  syncDraftFromStore()
  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
  sourceOpen.value = false
}

const passTurnCandidates = computed(() =>
  userStore.devUsers.filter((user) => user.id !== userStore.actor.id),
)

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

async function submitActorDraft() {
  clearTimeout(saveTimer.value)
  await documentsStore.updateActorDraft(route.params.id, userStore.actor, {
    title: draft.title,
    content: draft.content,
  })

  try {
    await documentsStore.submitDraft(route.params.id, userStore.actor)
    syncDraftFromStore()
    lastSavedTitle.value = draft.title
    lastSavedContent.value = draft.content
  } catch (error) {
    window.alert(error.message || 'Не удалось отправить черновик')
  }
}

function handleSelection(range) {
  selectedRange.value = range ?? null
}

function handleAiApplyReplacement({ selection, newContextText }) {
  try {
    const cursor = selection.contextFrom + newContextText.length
    draft.content = applyContextPatch(draft.content, selection, newContextText)
    selectedRange.value = updateAnchorAfterContextPatch(selection, newContextText)
    nextTick(() => {
      if (sourceOpen.value) {
        visualEditorRef.value?.setSourceCursor(cursor)
      } else {
        visualEditorRef.value?.refreshAnchorDecoration()
      }
    })
  } catch (error) {
    window.alert(error?.message || 'Не удалось заменить контекст')
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

              <template v-else-if="isRound">
                <template v-if="workspaceMode === 'compare'">
                  <button
                    type="button"
                    class="secondary compact"
                    title="Вернуться к просмотру документа"
                    @click="closeCompare"
                  >
                    Вернуться к просмотру
                  </button>
                </template>

                <template v-else-if="isActiveEditor">
                  <template v-if="hasChangesSinceVersion">
                    <button
                      type="button"
                      class="compact save-btn"
                      :title="`Сохранить как v${(headVersion?.number ?? 0) + 1}`"
                      @click="publishVersion"
                    >
                      Сохранить
                    </button>

                    <button
                      type="button"
                      class="secondary compact"
                      title="Опубликовать правки и освободить сессию для всех"
                      @click="closeSession(null)"
                    >
                      Сохранить и закрыть
                    </button>

                    <div v-if="passTurnCandidates.length" class="pass-turn">
                      <button
                        type="button"
                        class="secondary compact"
                        title="Опубликовать правки, закрыть сессию и назначить ход"
                        @click="passTurnOpen = !passTurnOpen"
                      >
                        Сохранить и передать ход
                      </button>
                      <div v-if="passTurnOpen" class="pass-turn-menu">
                        <button
                          v-for="user in passTurnCandidates"
                          :key="user.id"
                          type="button"
                          class="pass-turn-item"
                          @click="closeSession(user)"
                        >
                          {{ user.name }}
                        </button>
                      </div>
                    </div>
                  </template>

                  <button
                    v-else
                    type="button"
                    class="secondary compact"
                    title="Вернуться к просмотру документа"
                    @click="closeSession(null)"
                  >
                    Вернуться к просмотру
                  </button>
                </template>

                <template v-else-if="canTakeLock">
                  <button
                    type="button"
                    class="mode-btn"
                    :title="editModeTitle"
                    @click="startRoundEditing"
                  >
                    <MdiIcon :path="mdiPencil" :size="14" />
                    <span>Редактировать</span>
                  </button>

                  <button
                    v-if="canCompareVersions"
                    type="button"
                    class="secondary compact"
                    title="Сравнить две версии документа"
                    @click="startCompare"
                  >
                    Сравнить
                  </button>
                </template>

                <span
                  v-else-if="roundForeignEditor"
                  class="round-status-hint"
                  :title="`${activeEditor.name} редактирует документ`"
                >
                  <MdiIcon :path="mdiLockClock" :size="14" />
                  <span>Только просмотр · {{ activeEditor.name }}</span>
                </span>

                <span
                  v-else-if="roundWaitingTurn"
                  class="round-status-hint"
                  :title="`Сейчас ход ${turnActor.name}`"
                >
                  <MdiIcon :path="mdiLockClock" :size="14" />
                  <span>Ход {{ turnActor.name }}</span>
                </span>
              </template>

              <button
                v-else-if="canFixVersion"
                type="button"
                class="compact save-btn"
                :class="{ secondary: !hasChangesSinceVersion }"
                :disabled="!hasChangesSinceVersion"
                :title="
                  hasChangesSinceVersion
                    ? `Сохранить как v${(headVersion?.number ?? 0) + 1}`
                    : 'Нет изменений для сохранения'
                "
                @click="publishVersion"
              >
                Сохранить
              </button>

              <button
                v-if="canEditActorDraft && workspaceMode === 'edit'"
                type="button"
                class="secondary compact submit-btn"
                :disabled="!hasUnsubmittedChanges || actorDraftMeta?.needsRebase"
                @click="submitActorDraft"
              >
                Отправить
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

          <div class="editor-canvas" :class="{ 'is-readonly': !isWritable && workspaceMode === 'edit' }">
            <div v-if="showReadonlyStrip" class="readonly-strip">
              <span>{{ readonlyHint }}</span>
            </div>

            <ReviewPreview
              v-if="workspaceMode === 'review'"
              :head-title="headSnapshot?.title ?? ''"
              :head-content="headSnapshot?.content ?? ''"
              :head-version-number="headVersion?.number ?? 0"
              :submitted-drafts="documentsStore.submittedDrafts"
              :committed-anchor="selectedRange"
              :show-anchor-tools="showAnchorTools"
              v-model:brush-active="brushActive"
              @selection-change="handleSelection"
            />
            <VersionCompareWorkspace
              v-else-if="workspaceMode === 'compare'"
              :versions="documentsStore.versions"
            />
            <VisualEditor
              v-else
              ref="visualEditorRef"
              v-model="draft.content"
              v-model:source-open="sourceOpen"
              v-model:brush-active="brushActive"
              :document-title="draft.title"
              :readonly="!isWritable"
              :committed-anchor="selectedRange"
              :show-anchor-tools="showAnchorTools"
              @selection-change="handleSelection"
            />
          </div>
        </div>

        <aside class="sidebar-right" :class="{ collapsed: !rightOpen }">
          <div class="tabbar">
            <button type="button" :class="{ active: sideTab === 'review' }" @click="sideTab = 'review'">
              Замечания
            </button>
            <button
              v-if="workspaceMode === 'edit'"
              type="button"
              :class="{ active: sideTab === 'ai' }"
              @click="sideTab = 'ai'"
            >
              ИИ редактор
            </button>
            <button type="button" :class="{ active: sideTab === 'history' }" @click="sideTab = 'history'">
              История
            </button>
          </div>

          <ReviewPanel
            v-if="sideTab === 'review'"
            :comments="documentsStore.comments"
            :submitted-drafts="documentsStore.submittedDrafts"
            :selected-range="selectedRange"
            :head-version-id="headVersion?.id"
            :can-comment="capabilities?.canComment"
            :is-owner="capabilities?.isOwner"
            @add-comment="addComment"
            @add-reply="(id, body) => documentsStore.addReply(id, userStore.actor, { body })"
            @resolve-comment="(id, resolution) => documentsStore.resolveComment(id, userStore.actor, resolution)"
            @reopen-comment="(id) => documentsStore.reopenComment(id, userStore.actor)"
          />
          <AiEditorPanel
            v-else-if="sideTab === 'ai'"
            :selected-range="selectedRange"
            :is-writable="isWritable"
            @apply-replacement="handleAiApplyReplacement"
          />
          <VersionPanel
            v-else-if="sideTab === 'history'"
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

.round-status-hint {
  align-items: center;
  color: var(--text-muted);
  display: inline-flex;
  font-size: 12px;
  gap: 6px;
  padding: 0 4px;
  white-space: nowrap;
}

.pass-turn {
  position: relative;
}

.pass-turn-menu {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: grid;
  min-width: 140px;
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
}

.pass-turn-item {
  background: transparent;
  border: 0;
  color: var(--text-normal);
  font-size: 12px;
  margin: 0;
  min-height: 32px;
  padding: 0 12px;
  text-align: left;
}

.pass-turn-item:hover {
  background: var(--background-modifier-hover);
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
