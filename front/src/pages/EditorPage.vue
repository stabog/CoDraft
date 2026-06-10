<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownEditor from '../components/editor/MarkdownEditor.vue'
import VisualEditor from '../components/editor/VisualEditor.vue'
import ReviewPanel from '../components/review/ReviewPanel.vue'
import ReviewPreview from '../components/review/ReviewPreview.vue'
import VersionPanel from '../components/history/VersionPanel.vue'
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
const mainTab = ref('visual')
const workspaceMode = ref('edit')
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
const canEdit = computed(() => documentsStore.canEditDraft)
const isCurrentActor = computed(() => documentsStore.isCurrentActor)
const isHandoff = computed(() => documentsStore.currentDocument?.asyncWorkflow === 'handoff')
const canEditActorDraft = computed(() => capabilities.value?.canEditActorDraft ?? false)
const actorDraftMeta = computed(() => documentsStore.actorDraft)

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

const saveStatus = computed(() => {
  if (canEditActorDraft.value) {
    if (actorDraftMeta.value?.needsRebase) return 'Черновик устарел'
    if (documentsStore.saving) return 'Сохраняем черновик...'
    if (hasUnsubmittedChanges.value) return 'Черновик не отправлен'
    return 'Синхронизировано с v' + (headVersion.value?.number ?? '')
  }
  if (!canEdit.value) return 'Только просмотр'
  if (documentsStore.saving) return 'Сохраняем...'
  return 'Сохранено'
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
  if (!doc) return

  if (doc.capabilities?.canEditDraft && doc.draft) {
    draft.title = doc.draft.title
    draft.content = doc.draft.content
  } else if (documentsStore.actorDraft) {
    draft.title = documentsStore.actorDraft.title
    draft.content = documentsStore.actorDraft.content
  } else if (headSnapshot.value) {
    draft.title = headSnapshot.value.title
    draft.content = headSnapshot.value.content
  }

  lastSavedTitle.value = draft.title
  lastSavedContent.value = draft.content
}

function scheduleSave() {
  if (!ready.value) return
  if (!canEdit.value && !canEditActorDraft.value) return

  clearTimeout(saveTimer.value)
  if (draft.title === lastSavedTitle.value && draft.content === lastSavedContent.value) return

  saveTimer.value = setTimeout(async () => {
    if (canEdit.value) {
      await documentsStore.updateDraft(route.params.id, userStore.actor, {
        title: draft.title,
        content: draft.content,
      })
    } else {
      await documentsStore.updateActorDraft(route.params.id, userStore.actor, {
        title: draft.title,
        content: draft.content,
      })
    }
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
  mainTab.value = 'visual'
  await nextTick()
}
</script>

<template>
  <section class="editor-page">
    <div v-if="documentsStore.loading || !ready" class="editor-state muted">Открываем документ...</div>
    <div v-else-if="documentsStore.error" class="editor-state error">{{ documentsStore.error }}</div>

    <template v-else>
      <div v-if="isCurrentActor" class="role-banner active-turn">
        <template v-if="isHandoff">
          Твой ход: правьте черновик. «Зафиксировать» публикует новую версию — ход остаётся у вас.
        </template>
        <template v-else>
          Редактируете канонический черновик. Участники отправляют правки через submit.
        </template>
      </div>
      <div v-else-if="canEditActorDraft" class="role-banner">
        Личный черновик от v{{ headVersion?.number }}. Изменения попадут в документ только после отправки.
      </div>
      <div v-else class="role-banner waiting">
        Сейчас не ваш ход. Можно комментировать и смотреть правки.
      </div>

      <div v-if="actorDraftMeta?.needsRebase" class="rebase-banner">
        <span>Опубликована новая версия. Ваш черновик привязан к старому head.</span>
        <button type="button" @click="rebaseActorDraft">Пересоздать от v{{ headVersion?.number }}</button>
      </div>

      <div class="editor-workspace">
        <div class="editor-main">
          <header class="editor-header">
            <input
              v-model="draft.title"
              class="inline-title"
              type="text"
              placeholder="Без названия"
              :readonly="workspaceMode === 'review' || (!canEdit && !canEditActorDraft)"
            />
            <div class="editor-actions">
              <span class="version-badge">v{{ documentsStore.currentDocument?.headVersionNumber }}</span>
              <span class="change-badge" :class="{ dirty: hasChangesSinceVersion }">
                {{ hasChangesSinceVersion ? 'Есть изменения' : 'Актуально' }}
              </span>
              <div class="mode-switch">
                <button
                  type="button"
                  :class="{ active: workspaceMode === 'edit' }"
                  @click="workspaceMode = 'edit'"
                >
                  Редактор
                </button>
                <button
                  type="button"
                  :class="{ active: workspaceMode === 'review' }"
                  @click="workspaceMode = 'review'"
                >
                  Правки
                </button>
              </div>
              <button
                v-if="canEdit"
                type="button"
                class="fix-btn"
                :disabled="!hasChangesSinceVersion"
                @click="fixVersion"
              >
                Зафиксировать
              </button>
              <button
                v-if="canEditActorDraft && workspaceMode === 'edit'"
                type="button"
                class="submit-btn"
                :disabled="!hasUnsubmittedChanges || actorDraftMeta?.needsRebase"
                @click="showSubmitForm = !showSubmitForm"
              >
                Отправить правки
              </button>
              <button
                type="button"
                class="ribbon-btn sidebar-toggle"
                :class="{ active: rightOpen }"
                title="Панель замечаний"
                @click="toggleRight"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11zM3 3v10h4.5V3H3zm5.5 0V13H13V3H8.5z" />
                </svg>
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

          <div v-if="workspaceMode === 'edit'" class="tabbar editor-tabs">
            <button type="button" :class="{ active: mainTab === 'visual' }" @click="mainTab = 'visual'">
              Visual
            </button>
            <button type="button" :class="{ active: mainTab === 'markdown' }" @click="mainTab = 'markdown'">
              Markdown
            </button>
            <span class="save-indicator">{{ saveStatus }}</span>
          </div>

          <div class="editor-body">
            <ReviewPreview
              v-if="workspaceMode === 'review'"
              :head-title="headSnapshot?.title ?? ''"
              :head-content="headSnapshot?.content ?? ''"
              :head-version-number="headVersion?.number ?? 0"
              :edits="documentsStore.edits"
            />
            <template v-else>
              <VisualEditor
                v-if="mainTab === 'visual'"
                v-model="draft.content"
                :readonly="!canEdit && !canEditActorDraft"
                @selection-change="handleSelection"
              />
              <MarkdownEditor
                v-else
                v-model="draft.content"
                :readonly="!canEdit && !canEditActorDraft"
                :selected-range="selectedRange"
                @selection-change="handleSelection"
              />
            </template>
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
            :can-restore="canEdit"
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

.role-banner {
  background: rgba(127, 109, 242, 0.12);
  border-bottom: 1px solid rgba(127, 109, 242, 0.3);
  color: var(--interactive-accent-hover);
  font-size: 13px;
  padding: 8px 16px;
}

.role-banner.active-turn {
  background: rgba(61, 214, 140, 0.1);
  border-bottom-color: rgba(61, 214, 140, 0.25);
  color: var(--color-green);
}

.role-banner.waiting {
  background: var(--background-secondary);
  border-bottom-color: var(--background-modifier-border);
  color: var(--text-muted);
}

.rebase-banner {
  align-items: center;
  background: rgba(255, 165, 0, 0.12);
  border-bottom: 1px solid rgba(255, 165, 0, 0.35);
  display: flex;
  flex-wrap: wrap;
  font-size: 13px;
  gap: 12px;
  justify-content: space-between;
  padding: 8px 16px;
}

.rebase-banner button {
  font-size: 12px;
  margin: 0;
  min-height: 28px;
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

.editor-header {
  align-items: flex-start;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 20px 32px 12px;
}

.inline-title {
  background: transparent;
  border: 0;
  color: var(--text-normal);
  flex: 1;
  font-size: 2em;
  font-weight: 700;
  line-height: 1.2;
  min-width: 0;
  outline: none;
  padding: 0;
}

.inline-title::placeholder {
  color: var(--text-faint);
}

.inline-title:read-only {
  cursor: default;
}

.editor-actions {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 6px;
}

.version-badge,
.change-badge {
  color: var(--text-faint);
  font-size: 12px;
  white-space: nowrap;
}

.change-badge.dirty {
  color: var(--color-orange);
}

.mode-switch {
  display: flex;
  gap: 2px;
}

.mode-switch button {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  font-size: 11px;
  margin: 0;
  min-height: 28px;
  padding: 0 8px;
}

.mode-switch button.active {
  background: var(--background-modifier-hover);
  border-color: var(--interactive-accent);
  color: var(--interactive-accent-hover);
}

.fix-btn,
.submit-btn {
  font-size: 12px;
  min-height: 28px;
  padding: 0 10px;
}

.submit-btn {
  background: rgba(61, 214, 140, 0.2);
  border-color: rgba(61, 214, 140, 0.45);
  color: var(--color-green);
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

.sidebar-toggle {
  margin-left: 4px;
}

.editor-tabs {
  position: relative;
}

.save-indicator {
  color: var(--text-faint);
  font-size: 11px;
  margin-left: auto;
  padding-right: 8px;
  white-space: nowrap;
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
  .editor-header {
    flex-direction: column;
    padding: 16px;
  }

  .editor-actions {
    padding-top: 0;
  }

  .submit-form {
    padding: 12px 16px;
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
