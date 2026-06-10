<script setup>
import { ref } from 'vue'

defineProps({
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
  if (!commentBody.value.trim()) return
  emit('add-comment', commentBody.value.trim())
  commentBody.value = ''
}

function submitReply(commentId) {
  const body = replies.value[commentId]?.trim()
  if (!body) return

  emit('add-reply', commentId, {
    body,
    authorName,
  })
  replies.value[commentId] = ''
}
</script>

<template>
  <section class="panel comments-panel">
    <div class="pane-heading">
      <h2>Комментарии</h2>
      <span>{{ comments.length }}</span>
    </div>

    <form class="comment-form" @submit.prevent="submitComment">
      <p v-if="selectedRange" class="selection-quote">"{{ selectedRange.anchorText }}"</p>
      <p v-else class="muted">Выделите текст в редакторе, чтобы оставить комментарий.</p>
      <textarea v-model="commentBody" placeholder="Комментарий"></textarea>
      <button type="submit" :disabled="!selectedRange || !commentBody.trim()">Добавить</button>
    </form>

    <div class="comment-list">
      <article v-for="comment in comments" :key="comment.id" class="comment-item" :class="comment.status">
        <div class="comment-meta">
          <strong>{{ comment.authorName }}</strong>
          <span>{{ new Date(comment.createdAt).toLocaleString() }}</span>
        </div>
        <blockquote>{{ comment.anchorText }}</blockquote>
        <p>{{ comment.body }}</p>

        <div v-if="comment.replies.length" class="reply-list">
          <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
            <strong>{{ reply.authorName || authorName }}</strong>
            <span>{{ new Date(reply.createdAt).toLocaleString() }}</span>
            <p>{{ reply.body }}</p>
          </div>
        </div>

        <form class="reply-form" @submit.prevent="submitReply(comment.id)">
          <input v-model="replies[comment.id]" type="text" placeholder="Ответить" />
          <button type="submit">↵</button>
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
  </section>
</template>
