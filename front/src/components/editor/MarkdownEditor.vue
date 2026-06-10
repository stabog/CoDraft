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
  <section class="editor-pane">
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
