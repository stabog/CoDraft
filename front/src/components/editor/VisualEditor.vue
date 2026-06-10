<script setup>
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx } from '@milkdown/core'
import { clipboard } from '@milkdown/plugin-clipboard'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { nord } from '@milkdown/theme-nord'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const model = defineModel({ type: String, default: '' })
const emit = defineEmits(['selection-change'])

const root = ref(null)
const editor = ref(null)
const applyingExternalChange = ref(false)

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
})

onBeforeUnmount(async () => {
  if (editor.value) {
    await editor.value.destroy()
  }
})

watch(
  () => model.value,
  (markdown) => {
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
  },
)
</script>

<template>
  <section class="visual-editor-shell">
    <div ref="root" class="milkdown-editor"></div>
  </section>
</template>
