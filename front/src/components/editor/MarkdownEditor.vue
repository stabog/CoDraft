<script setup>
import { ref } from 'vue'

const model = defineModel({ type: String, default: '' })
defineProps({
  selectedRange: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['selection-change'])
const textarea = ref(null)

function updateSelection() {
  const element = textarea.value
  if (!element) return

  const anchorFrom = element.selectionStart
  const anchorTo = element.selectionEnd
  const anchorText = model.value.slice(anchorFrom, anchorTo)

  if (!anchorText.trim()) {
    emit('selection-change', null)
    return
  }

  emit('selection-change', {
    anchorFrom,
    anchorTo,
    anchorText,
    text: anchorText,
  })
}
</script>

<template>
  <section class="markdown-editor">
    <div class="pane-heading">
      <h2>Markdown</h2>
      <span v-if="selectedRange">Выбрано: {{ selectedRange.anchorText.length }} симв.</span>
    </div>
    <textarea
      ref="textarea"
      v-model="model"
      class="markdown-input"
      spellcheck="true"
      @mouseup="updateSelection"
      @keyup="updateSelection"
      @select="updateSelection"
    ></textarea>
  </section>
</template>

<style scoped>
.markdown-editor {
  background: #ffffff;
}

.pane-heading {
  align-items: center;
  border-bottom: 1px solid #e1e5eb;
  display: flex;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 16px;
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

.markdown-input {
  border: 0;
  color: #1f2937;
  display: block;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 15px;
  line-height: 1.7;
  min-height: calc(100vh - 294px);
  outline: none;
  padding: 24px;
  resize: vertical;
  width: 100%;
}

@media (max-width: 720px) {
  .markdown-input {
    min-height: 430px;
  }
}
</style>
