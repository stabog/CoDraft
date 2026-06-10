<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownEditor from '../components/editor/MarkdownEditor.vue'
import VisualEditor from '../components/editor/VisualEditor.vue'
import ReviewPanel from '../components/review/ReviewPanel.vue'
import VersionPanel from '../components/history/VersionPanel.vue'
import { useSidebarState } from '../composables/useSidebarState'
import { useDocumentsStore } from '../stores/documentsStore'
import { useUserStore } from '../stores/userStore'

const route = useRoute()
const documentsStore = useDocumentsStore()
const userStore = useUserStore()
const { open: rightOpen, toggle: toggleRight } = useSidebarState('codraft-sidebar-right', true)

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

const saveStatus = computed(() => {
  if (!canEdit.value) return 'Черновик владельца'
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
    <div v-if="documentsStore.loading || !ready" class="editor-state muted">Открываем документ...</div>
    <div v-else-if="documentsStore.error" class="editor-state error">{{ documentsStore.error }}</div>

    <template v-else>
      <div v-if="!canEdit" class="role-banner">
        Вы смотрите документ как участник: можно комментировать и предлагать правки. Редактирует владелец.
      </div>

      <div class="editor-workspace">
        <div class="editor-main">
          <header class="editor-header">
            <input
              v-model="draft.title"
              class="inline-title"
              type="text"
              placeholder="Без названия"
              :readonly="!canEdit"
            />
            <div class="editor-actions">
              <span class="version-badge">v{{ documentsStore.currentDocument?.headVersionNumber }}</span>
              <span
                class="change-badge"
                :class="{ dirty: hasChangesSinceVersion }"
              >
                {{ hasChangesSinceVersion ? 'Есть изменения' : 'Актуально' }}
              </span>
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

          <div class="tabbar editor-tabs">
            <button type="button" :class="{ active: mainTab === 'visual' }" @click="mainTab = 'visual'">
              Visual
            </button>
            <button type="button" :class="{ active: mainTab === 'markdown' }" @click="mainTab = 'markdown'">
              Markdown
            </button>
            <span class="save-indicator">{{ saveStatus }}</span>
          </div>

          <div class="editor-body">
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

.fix-btn {
  font-size: 12px;
  min-height: 28px;
  padding: 0 10px;
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
    flex-wrap: wrap;
    padding-top: 0;
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
