<script setup>
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx } from '@milkdown/core'
import { clipboard } from '@milkdown/plugin-clipboard'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { nord } from '@milkdown/theme-nord'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const model = defineModel({ type: String, default: '' })
const props = defineProps({
  readonly: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['selection-change'])

const root = ref(null)
const editor = ref(null)
const applyingExternalChange = ref(false)

function applyMarkdown(markdown) {
  if (!editor.value) return

  editor.value.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const parser = ctx.get(parserCtx)
    const doc = parser(markdown || '')
    if (!doc || view.state.doc.eq(doc)) return

    applyingExternalChange.value = true
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content))
    queueMicrotask(() => {
      applyingExternalChange.value = false
    })
  })
}

onMounted(async () => {
  editor.value = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root.value)
      ctx.set(defaultValueCtx, model.value || '')
      ctx
        .get(listenerCtx)
        .markdownUpdated((_, markdown) => {
          if (applyingExternalChange.value || markdown === model.value) return
          model.value = markdown
        })
        .selectionUpdated((_, selection) => {
          const slice = selection.content().content
          const selectedText = slice.textBetween(0, slice.size, '\n')
          const anchorText = selectedText.trim()

          if (!anchorText) {
            emit('selection-change', null)
            return
          }

          const anchorFrom = model.value.indexOf(anchorText)
          emit('selection-change', {
            anchorFrom: anchorFrom >= 0 ? anchorFrom : 0,
            anchorTo: anchorFrom >= 0 ? anchorFrom + anchorText.length : anchorText.length,
            anchorText,
            text: anchorText,
          })
        })
    })
    .use(nord)
    .use(commonmark)
    .use(history)
    .use(clipboard)
    .use(listener)
    .create()

  applyMarkdown(model.value)
  setEditable(!props.readonly)
})

onBeforeUnmount(async () => {
  if (editor.value) {
    await editor.value.destroy()
  }
})

watch(
  () => model.value,
  (markdown) => applyMarkdown(markdown),
)

watch(
  () => props.readonly,
  (value) => setEditable(!value),
)

function setEditable(editable) {
  if (!editor.value) return
  editor.value.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    view.setProps({ editable: () => editable })
  })
}
</script>

<template>
  <section class="visual-editor-shell">
    <div ref="root" class="milkdown-editor"></div>
  </section>
</template>

<style scoped>
.visual-editor-shell {
  height: 100%;
  overflow: auto;
  padding: 8px 32px 32px;
}

.milkdown-editor {
  margin: 0 auto;
  max-width: 720px;
}

.milkdown-editor :deep(.milkdown) {
  background: transparent;
}

.milkdown-editor :deep(.editor) {
  min-height: 200px;
  padding: 0;
}

.milkdown-editor :deep(.ProseMirror) {
  color: var(--text-normal);
  font-size: 16px;
  line-height: 1.72;
  min-height: 200px;
  outline: none;
}

.milkdown-editor :deep(.ProseMirror h1) {
  font-size: 1.6em;
  line-height: 1.2;
  margin: 24px 0 16px;
}

.milkdown-editor :deep(.ProseMirror h2) {
  font-size: 1.3em;
  line-height: 1.25;
  margin: 20px 0 12px;
}

.milkdown-editor :deep(.ProseMirror p) {
  margin: 0 0 12px;
}

.milkdown-editor :deep(.ProseMirror ul),
.milkdown-editor :deep(.ProseMirror ol) {
  margin: 0 0 14px;
  padding-left: 24px;
}

@media (max-width: 720px) {
  .visual-editor-shell {
    padding: 8px 16px 24px;
  }
}
</style>
