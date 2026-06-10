<script setup>
import { ref } from 'vue'

const model = defineModel({ type: String, default: '' })
defineProps({
  selectedRange: {
    type: Object,
    default: null,
  },
  readonly: {
    type: Boolean,
    default: false,
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
    <div v-if="selectedRange" class="selection-hint">
      Выбрано: {{ selectedRange.anchorText.length }} симв.
    </div>
    <textarea
      ref="textarea"
      v-model="model"
      class="markdown-input"
      spellcheck="true"
      :readonly="readonly"
      @mouseup="updateSelection"
      @keyup="updateSelection"
      @select="updateSelection"
    ></textarea>
  </section>
</template>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.selection-hint {
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-faint);
  font-size: 11px;
  padding: 4px 32px;
}

.markdown-input {
  background: transparent;
  border: 0;
  color: var(--text-normal);
  flex: 1;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  line-height: 1.7;
  min-height: 0;
  outline: none;
  padding: 8px 32px 32px;
  resize: none;
  width: 100%;
}

@media (max-width: 720px) {
  .markdown-input,
  .selection-hint {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
