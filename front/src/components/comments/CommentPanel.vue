<script setup>
import { ref } from 'vue'

const props = defineProps({
  comments: {
    type: Array,
    default: () => [],
  },
  selectedRange: {
    type: Object,
    default: null,
  },
  authorName: {
    type: String,
    default: 'Гость',
  },
})

const emit = defineEmits(['add-comment', 'add-reply', 'set-status'])
const commentBody = ref('')
const replies = ref({})

function submitComment() {
  if (!props.selectedRange || !commentBody.value.trim()) return
  emit('add-comment', commentBody.value.trim())
  commentBody.value = ''
}

function submitReply(commentId) {
  const body = replies.value[commentId]?.trim()
  if (!body) return

  emit('add-reply', commentId, {
    body,
    authorName: props.authorName,
  })
  replies.value[commentId] = ''
}
</script>

<template>
  <section class="comments-panel">
    <div class="pane-heading">
      <h2>Комментарии</h2>
      <span>{{ comments.length }}</span>
    </div>

    <form v-if="selectedRange" class="comment-form" @submit.prevent="submitComment">
      <p class="selection-quote">"{{ selectedRange.anchorText }}"</p>
      <textarea v-model="commentBody" placeholder="Комментарий"></textarea>
      <button type="submit" :disabled="!commentBody.trim()">Добавить</button>
    </form>

    <div v-else class="comment-hint">
      Выделите текст в документе, чтобы добавить комментарий.
    </div>

    <div v-if="comments.length" class="comment-list">
      <article v-for="comment in comments" :key="comment.id" class="comment-item" :class="comment.status">
        <div class="comment-meta">
          <strong>{{ comment.authorName }}</strong>
          <span>{{ new Date(comment.createdAt).toLocaleString() }}</span>
        </div>
        <blockquote>{{ comment.anchorText }}</blockquote>
        <p class="comment-body">{{ comment.body }}</p>

        <div v-if="comment.replies.length" class="reply-list">
          <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
            <strong>{{ reply.authorName || authorName }}</strong>
            <span>{{ new Date(reply.createdAt).toLocaleString() }}</span>
            <p>{{ reply.body }}</p>
          </div>
        </div>

        <form class="reply-form" @submit.prevent="submitReply(comment.id)">
          <input v-model="replies[comment.id]" type="text" placeholder="Ответить" />
          <button type="submit" aria-label="Отправить ответ">↵</button>
        </form>

        <button
          class="ghost-button"
          type="button"
          @click="emit('set-status', comment.id, comment.status === 'resolved' ? 'open' : 'resolved')"
        >
          {{ comment.status === 'resolved' ? 'Открыть снова' : 'Закрыть' }}
        </button>
      </article>
    </div>

    <p v-else class="empty-state">Комментариев пока нет.</p>
  </section>
</template>

<style scoped>
.comments-panel {
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

.pane-heading span {
  color: #667085;
}

.comment-form {
  border-bottom: 1px solid #e1e5eb;
  padding: 16px 18px;
}

.comment-hint,
.empty-state {
  color: #667085;
  line-height: 1.45;
  margin: 0;
  padding: 18px;
}

.selection-quote,
.comment-item blockquote {
  background: #f4f6fa;
  border-left: 3px solid #4f7df3;
  color: #667085;
  line-height: 1.35;
  margin: 0 0 12px;
  padding: 10px 12px;
}

.comment-form textarea {
  border: 1px solid #cfd6e2;
  border-radius: 8px;
  display: block;
  min-height: 86px;
  padding: 12px;
  resize: vertical;
  width: 100%;
}

.comment-form button {
  background: #4f7df3;
  border-radius: 8px;
  margin-top: 10px;
  min-height: 44px;
  width: 100%;
}

.comment-list {
  max-height: calc(100vh - 340px);
  overflow: auto;
}

.comment-item {
  border-bottom: 1px solid #e1e5eb;
  padding: 18px;
}

.comment-item.resolved {
  opacity: 0.58;
}

.comment-meta,
.reply-item {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.comment-meta span,
.reply-item span {
  color: #98a2b3;
}

.comment-body {
  color: #344054;
  line-height: 1.5;
  margin: 10px 0;
}

.reply-list {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.reply-item {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
}

.reply-item p {
  flex-basis: 100%;
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
  min-height: 44px;
  padding: 0 12px;
}

.reply-form button {
  background: #4f7df3;
  border-radius: 8px;
  padding: 0;
}

.ghost-button {
  background: transparent;
  color: #4f7df3;
  margin-top: 12px;
  padding: 0;
}

@media (max-width: 1180px) {
  .comment-list {
    max-height: none;
  }
}
</style>
