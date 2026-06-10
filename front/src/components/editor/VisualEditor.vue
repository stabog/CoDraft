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
  background: #eef1f5;
  min-height: calc(100vh - 242px);
  overflow: auto;
  padding: 28px;
}

.milkdown-editor {
  margin: 0 auto;
  max-width: 860px;
}

.milkdown-editor :deep(.milkdown) {
  background: #ffffff;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.06);
  min-height: calc(100vh - 300px);
}

.milkdown-editor :deep(.editor) {
  min-height: calc(100vh - 300px);
  padding: 48px 58px;
}

.milkdown-editor :deep(.ProseMirror) {
  color: #1f2937;
  font-size: 16px;
  line-height: 1.72;
  min-height: calc(100vh - 396px);
  outline: none;
}

.milkdown-editor :deep(.ProseMirror h1) {
  font-size: 34px;
  line-height: 1.15;
  margin: 0 0 22px;
}

.milkdown-editor :deep(.ProseMirror h2) {
  font-size: 24px;
  line-height: 1.25;
  margin: 28px 0 14px;
}

.milkdown-editor :deep(.ProseMirror p) {
  margin: 0 0 14px;
}

.milkdown-editor :deep(.ProseMirror ul),
.milkdown-editor :deep(.ProseMirror ol) {
  margin: 0 0 16px;
  padding-left: 24px;
}

@media (max-width: 720px) {
  .visual-editor-shell {
    min-height: 460px;
    padding: 12px;
  }

  .milkdown-editor :deep(.editor) {
    min-height: 430px;
    padding: 26px 22px;
  }
}
</style>
