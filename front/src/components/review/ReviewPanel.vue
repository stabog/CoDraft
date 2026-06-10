<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  comments: { type: Array, default: () => [] },
  edits: { type: Array, default: () => [] },
  selectedRange: { type: Object, default: null },
  headVersionId: { type: String, default: '' },
  canComment: { type: Boolean, default: true },
  canSubmitEdit: { type: Boolean, default: false },
  canApplyEdit: { type: Boolean, default: false },
  draftTitle: { type: String, default: '' },
  draftContent: { type: String, default: '' },
})

const emit = defineEmits([
  'add-comment',
  'add-reply',
  'resolve-comment',
  'reopen-comment',
  'submit-edit',
  'apply-edit',
  'reject-edit',
])

const commentBody = ref('')
const replies = ref({})
const editSummary = ref('')
const showEditForm = ref(false)

const headComments = computed(() =>
  props.comments.filter((item) => item.targetVersionId === props.headVersionId),
)

const pendingEdits = computed(() => props.edits.filter((edit) => edit.status === 'pending'))

const feed = computed(() => {
  const items = [
    ...pendingEdits.value.map((edit) => ({ kind: 'edit', createdAt: edit.createdAt, data: edit })),
    ...headComments.value.map((comment) => ({ kind: 'comment', createdAt: comment.createdAt, data: comment })),
  ]
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})

function submitComment() {
  if (!props.selectedRange || !commentBody.value.trim()) return
  emit('add-comment', commentBody.value.trim())
  commentBody.value = ''
}

function submitReply(commentId) {
  const body = replies.value[commentId]?.trim()
  if (!body) return
  emit('add-reply', commentId, body)
  replies.value[commentId] = ''
}

function submitDocumentEdit() {
  if (!editSummary.value.trim()) return
  emit('submit-edit', {
    scope: 'document',
    summary: editSummary.value.trim(),
    title: props.draftTitle,
    content: props.draftContent,
  })
  editSummary.value = ''
  showEditForm.value = false
}

function editScopeLabel(edit) {
  return edit.scope === 'range' ? 'Правка фрагмента' : 'Правка документа'
}

function resolutionLabel(comment) {
  if (comment.status !== 'resolved') return ''
  return comment.resolution === 'rejected' ? 'Отклонено' : 'Учтено'
}
</script>

<template>
  <section class="review-panel">
    <div class="pane-heading">
      <h2>Замечания</h2>
      <span>{{ feed.length }}</span>
    </div>

    <form v-if="canComment && selectedRange" class="inline-form" @submit.prevent="submitComment">
      <p class="quote">"{{ selectedRange.anchor.quotedText }}"</p>
      <textarea v-model="commentBody" placeholder="Комментарий к фрагменту" />
      <button type="submit" :disabled="!commentBody.trim()">Добавить комментарий</button>
    </form>

    <div v-else-if="canComment" class="hint">Выделите текст, чтобы оставить комментарий.</div>

    <div v-if="canSubmitEdit" class="edit-actions">
      <button type="button" class="secondary" @click="showEditForm = !showEditForm">
        {{ showEditForm ? 'Скрыть форму' : 'Предложить правку документа' }}
      </button>
      <form v-if="showEditForm" class="inline-form" @submit.prevent="submitDocumentEdit">
        <textarea v-model="editSummary" placeholder="Что изменили и зачем" />
        <button type="submit" :disabled="!editSummary.trim()">Отправить правку</button>
      </form>
    </div>

    <div v-if="feed.length" class="feed">
      <article
        v-for="item in feed"
        :key="`${item.kind}-${item.data.id}`"
        class="feed-item"
        :class="[item.kind, item.data.status]"
      >
        <template v-if="item.kind === 'edit'">
          <div class="meta">
            <span class="badge">Правка</span>
            <strong>{{ item.data.author.name }}</strong>
            <span>{{ editScopeLabel(item.data) }} · {{ item.data.status }}</span>
          </div>
          <p class="summary">{{ item.data.summary }}</p>
          <blockquote v-if="item.data.scope === 'range'">
            {{ item.data.anchor.quotedText }}
          </blockquote>
          <p v-if="item.data.scope === 'range'" class="suggested">→ {{ item.data.suggestedText }}</p>
          <div v-if="canApplyEdit && item.data.status === 'pending'" class="row-actions">
            <button type="button" @click="emit('apply-edit', item.data.id)">Применить</button>
            <button type="button" class="ghost" @click="emit('reject-edit', item.data.id)">Отклонить</button>
          </div>
        </template>

        <template v-else>
          <div class="meta">
            <span class="badge comment">Комментарий</span>
            <strong>{{ item.data.author.name }}</strong>
            <span>{{ resolutionLabel(item.data) }}</span>
          </div>
          <blockquote>{{ item.data.anchor.quotedText }}</blockquote>
          <p class="body">{{ item.data.body }}</p>

          <div v-if="item.data.replies.length" class="replies">
            <div v-for="reply in item.data.replies" :key="reply.id" class="reply">
              <strong>{{ reply.author.name }}</strong>
              <p>{{ reply.body }}</p>
            </div>
          </div>

          <form v-if="item.data.status === 'open'" class="reply-form" @submit.prevent="submitReply(item.data.id)">
            <input v-model="replies[item.data.id]" type="text" placeholder="Ответить" />
            <button type="submit" aria-label="Ответить">↵</button>
          </form>

          <div v-if="item.data.status === 'open' && canApplyEdit" class="row-actions">
            <button type="button" @click="emit('resolve-comment', item.data.id, 'acknowledged')">Учтено</button>
            <button type="button" class="ghost" @click="emit('resolve-comment', item.data.id, 'rejected')">
              Отклонить
            </button>
          </div>
          <button
            v-else-if="item.data.status === 'resolved' && canApplyEdit"
            type="button"
            class="ghost"
            @click="emit('reopen-comment', item.data.id)"
          >
            Открыть снова
          </button>
        </template>
      </article>
    </div>

    <p v-else class="hint">Замечаний к текущей версии пока нет.</p>
  </section>
</template>

<style scoped>
.review-panel {
  background: #ffffff;
}

.pane-heading {
  align-items: center;
  border-bottom: 1px solid #e1e5eb;
  display: flex;
  justify-content: space-between;
  min-height: 60px;
  padding: 0 18px;
}

.pane-heading h2 {
  font-size: 13px;
  letter-spacing: 0.04em;
  margin: 0;
  text-transform: uppercase;
}

.pane-heading span,
.hint,
.meta span {
  color: #667085;
}

.hint {
  line-height: 1.45;
  margin: 0;
  padding: 18px;
}

.inline-form,
.edit-actions {
  border-bottom: 1px solid #e1e5eb;
  padding: 16px 18px;
}

.edit-actions {
  display: grid;
  gap: 12px;
}

.quote,
blockquote {
  background: #f4f6fa;
  border-left: 3px solid #4f7df3;
  color: #667085;
  line-height: 1.35;
  margin: 0 0 12px;
  padding: 10px 12px;
}

.feed-item.edit blockquote {
  border-left-color: #12b76a;
}

textarea {
  border: 1px solid #cfd6e2;
  border-radius: 8px;
  display: block;
  min-height: 72px;
  padding: 12px;
  resize: vertical;
  width: 100%;
}

button {
  background: #4f7df3;
  border-radius: 8px;
  color: #ffffff;
  margin-top: 10px;
  min-height: 40px;
  padding: 0 14px;
}

button.secondary {
  background: #eef2ff;
  color: #344054;
  margin-top: 0;
  width: 100%;
}

button.ghost {
  background: transparent;
  color: #4f7df3;
  margin-top: 0;
}

.feed {
  max-height: calc(100vh - 340px);
  overflow: auto;
}

.feed-item {
  border-bottom: 1px solid #e1e5eb;
  padding: 18px;
}

.feed-item.resolved,
.feed-item.applied,
.feed-item.rejected,
.feed-item.superseded {
  opacity: 0.65;
}

.meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.badge {
  background: #ecfdf3;
  border-radius: 999px;
  color: #027a48;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  text-transform: uppercase;
}

.badge.comment {
  background: #eff4ff;
  color: #3538cd;
}

.summary,
.body,
.suggested {
  color: #344054;
  line-height: 1.5;
  margin: 8px 0;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.replies {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.reply {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
}

.reply p {
  margin: 4px 0 0;
}

.reply-form {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 48px;
  margin-top: 12px;
}

.reply-form input {
  border: 1px solid #cfd6e2;
  border-radius: 8px;
  min-height: 40px;
  padding: 0 12px;
}

.reply-form button {
  margin-top: 0;
  padding: 0;
}

@media (max-width: 1180px) {
  .feed {
    max-height: none;
  }
}
</style>
