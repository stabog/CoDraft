<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  comments: { type: Array, default: () => [] },
  submittedDrafts: { type: Array, default: () => [] },
  selectedRange: { type: Object, default: null },
  headVersionId: { type: String, default: '' },
  canComment: { type: Boolean, default: true },
  isOwner: { type: Boolean, default: false },
})

const emit = defineEmits([
  'add-comment',
  'add-reply',
  'resolve-comment',
  'reopen-comment',
])

const commentBody = ref('')
const replies = ref({})

const headComments = computed(() =>
  props.comments.filter((item) => item.targetVersionId === props.headVersionId),
)

const feed = computed(() => {
  const items = [
    ...props.submittedDrafts.map((draft) => ({
      kind: 'submitted-draft',
      createdAt: draft.updatedAt,
      data: draft,
    })),
    ...headComments.value.map((comment) => ({
      kind: 'comment',
      createdAt: comment.createdAt,
      data: comment,
    })),
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

function resolutionLabel(comment) {
  if (comment.status !== 'resolved') return ''
  return comment.resolution === 'rejected' ? 'Отклонено' : 'Учтено'
}
</script>

<template>
  <section class="review-panel">
    <form v-if="canComment && selectedRange" class="inline-form" @submit.prevent="submitComment">
      <p class="quote">"{{ selectedRange.anchor.quotedText }}"</p>
      <textarea v-model="commentBody" placeholder="Комментарий к фрагменту" />
      <button type="submit" :disabled="!commentBody.trim()">Добавить комментарий</button>
    </form>

    <div v-else-if="canComment" class="hint">
      Выделите фрагмент: включите кисть в тулбаре или удерживайте Alt при выделении.
    </div>

    <div v-if="isOwner && submittedDrafts.length" class="hint owner-hint">
      Отправленные черновики — перенесите нужное в свой редактор вручную.
    </div>

    <div v-if="feed.length" class="feed">
      <article
        v-for="item in feed"
        :key="`${item.kind}-${item.data.id}`"
        class="feed-item"
        :class="[item.kind, item.data.status]"
      >
        <template v-if="item.kind === 'submitted-draft'">
          <div class="meta">
            <span class="badge">Черновик</span>
            <strong>{{ item.data.author.name }}</strong>
            <span>отправлен · {{ new Date(item.data.updatedAt).toLocaleString() }}</span>
          </div>
          <p v-if="item.data.needsRebase" class="stale">Устарел относительно канона</p>
          <p class="summary">{{ item.data.title }}</p>
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

          <div v-if="item.data.status === 'open' && isOwner" class="row-actions">
            <button type="button" @click="emit('resolve-comment', item.data.id, 'acknowledged')">Учтено</button>
            <button type="button" class="ghost" @click="emit('resolve-comment', item.data.id, 'rejected')">
              Отклонить
            </button>
          </div>
          <button
            v-else-if="item.data.status === 'resolved' && isOwner"
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
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.hint,
.meta span {
  color: var(--text-muted);
}

.hint {
  line-height: 1.45;
  margin: 0;
  padding: 12px;
}

.owner-hint {
  border-bottom: 1px solid var(--background-modifier-border);
  font-size: 12px;
}

.inline-form {
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 12px;
}

.quote,
blockquote {
  background: var(--background-primary);
  border-left: 2px solid var(--interactive-accent);
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.35;
  margin: 0 0 8px;
  padding: 8px 10px;
}

.feed-item.submitted-draft blockquote {
  border-left-color: var(--color-green);
}

textarea {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  color: var(--text-normal);
  display: block;
  font-size: 13px;
  min-height: 64px;
  padding: 8px;
  resize: vertical;
  width: 100%;
}

button {
  font-size: 12px;
  margin-top: 8px;
  min-height: 30px;
}

button.ghost {
  background: transparent;
  color: var(--text-muted);
  margin-top: 0;
}

.feed-item {
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 12px;
}

.feed-item.resolved {
  opacity: 0.55;
}

.meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.meta strong {
  color: var(--text-normal);
  font-size: 13px;
}

.badge {
  background: rgba(61, 214, 140, 0.15);
  border-radius: 3px;
  color: var(--color-green);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  text-transform: uppercase;
}

.badge.comment {
  background: rgba(127, 109, 242, 0.15);
  color: var(--interactive-accent-hover);
}

.summary,
.body,
.stale {
  color: var(--text-normal);
  font-size: 13px;
  line-height: 1.5;
  margin: 6px 0;
}

.stale {
  color: var(--color-orange);
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.replies {
  display: grid;
  gap: 6px;
  margin: 8px 0;
}

.reply {
  background: var(--background-primary);
  border-radius: 4px;
  padding: 8px;
}

.reply strong {
  color: var(--text-normal);
  font-size: 12px;
}

.reply p {
  color: var(--text-muted);
  font-size: 13px;
  margin: 4px 0 0;
}

.reply-form {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 36px;
  margin-top: 8px;
}

.reply-form input {
  background: var(--background-primary);
  font-size: 13px;
  min-height: 30px;
  padding: 0 8px;
}

.reply-form button {
  margin-top: 0;
  padding: 0;
}
</style>
