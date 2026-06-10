<script setup>
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx } from '@milkdown/core'
import { clipboard } from '@milkdown/plugin-clipboard'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { getMarkdown } from '@milkdown/utils'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorToolbar from './EditorToolbar.vue'

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
const lastEditorMarkdown = ref('')

function readEditorMarkdown() {
  if (!editor.value) return ''
  let markdown = ''
  editor.value.action((ctx) => {
    markdown = getMarkdown()(ctx)
  })
  return markdown
}

function shouldSkipExternalSync(markdown) {
  if (markdown === lastEditorMarkdown.value) return true
  const current = readEditorMarkdown()
  if (current === markdown) {
    lastEditorMarkdown.value = markdown
    return true
  }
  return false
}

function applyMarkdown(markdown) {
  if (!editor.value) return

  editor.value.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const parser = ctx.get(parserCtx)
    const doc = parser(markdown || '')
    if (!doc || view.state.doc.eq(doc)) {
      lastEditorMarkdown.value = markdown
      return
    }

    applyingExternalChange.value = true
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content))
    lastEditorMarkdown.value = markdown
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
          if (applyingExternalChange.value) return
          lastEditorMarkdown.value = markdown
          if (markdown !== model.value) {
            model.value = markdown
          }
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
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(listener)
    .create()

  lastEditorMarkdown.value = model.value || ''
  applyMarkdown(model.value)
  lastEditorMarkdown.value = readEditorMarkdown() || model.value || ''
  setEditable(!props.readonly)
})

onBeforeUnmount(async () => {
  if (editor.value) {
    await editor.value.destroy()
  }
})

watch(
  () => model.value,
  (markdown) => {
    if (!editor.value || applyingExternalChange.value) return
    if (shouldSkipExternalSync(markdown)) return
    applyMarkdown(markdown)
  },
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
    <EditorToolbar :editor="editor" :disabled="readonly" />
    <div class="visual-editor-scroll">
      <div ref="root" class="milkdown-editor"></div>
    </div>
  </section>
</template>

<style scoped>
.visual-editor-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.visual-editor-scroll {
  flex: 1;
  min-height: 0;
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

.milkdown-editor :deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--interactive-accent);
  color: var(--text-muted);
  margin: 0 0 14px;
  padding-left: 14px;
}

.milkdown-editor :deep(.ProseMirror code) {
  background: var(--background-secondary);
  border-radius: 3px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.9em;
  padding: 1px 4px;
}

.milkdown-editor :deep(.ProseMirror hr) {
  border: 0;
  border-top: 1px solid var(--background-modifier-border);
  margin: 20px 0;
}

.milkdown-editor :deep(.ProseMirror table) {
  border-collapse: collapse;
  margin: 0 0 16px;
  table-layout: auto;
  width: 100%;
}

.milkdown-editor :deep(.ProseMirror th),
.milkdown-editor :deep(.ProseMirror td) {
  border: 1px solid var(--background-modifier-border);
  min-width: 80px;
  padding: 6px 10px;
  vertical-align: top;
}

.milkdown-editor :deep(.ProseMirror th) {
  background: var(--background-secondary);
  font-weight: 600;
}

@media (max-width: 720px) {
  .visual-editor-scroll {
    padding: 8px 16px 24px;
  }
}
</style>
