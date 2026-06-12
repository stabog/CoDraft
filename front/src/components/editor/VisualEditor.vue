<script setup>
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, prosePluginsCtx, rootCtx } from '@milkdown/core'
import { Plugin } from '@milkdown/prose/state'
import { TextSelection } from '@milkdown/prose/state'
import { clipboard } from '@milkdown/plugin-clipboard'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { getMarkdown } from '@milkdown/utils'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  anchorHighlightKey,
  createAnchorHighlightPlugin,
  refreshAnchorHighlight,
} from '../../utils/anchorHighlightPlugin.js'
import { isCanonicalPosInsideAnchor } from '../../utils/editorAnchor.js'
import { buildEditorSelection } from '../../utils/editorSelection.js'
import {
  getCanonicalContentFromEditor,
  mapPmSelectionToCanonical,
} from '../../utils/mapPmSelectionToCanonical.js'
import { resolvePmRangeFromCanonical } from '../../utils/resolvePmRangeFromCanonical.js'
import { fromEditorMarkdown, toEditorMarkdown } from '../../utils/markdownLineBreaks'
import EditorToolbar from './EditorToolbar.vue'

const model = defineModel({ type: String, default: '' })
const sourceOpen = defineModel('sourceOpen', { type: Boolean, default: false })
const brushActive = defineModel('brushActive', { type: Boolean, default: false })

const props = defineProps({
  readonly: {
    type: Boolean,
    default: false,
  },
  documentTitle: {
    type: String,
    default: '',
  },
  committedAnchor: {
    type: Object,
    default: null,
  },
  showAnchorTools: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['selection-change'])

const root = ref(null)
const sourceInput = ref(null)
const editor = ref(null)
const applyingExternalChange = ref(false)
const lastEditorMarkdown = ref('')
const pmHighlightRange = ref(null)

const showFormatting = computed(() => !props.readonly && !sourceOpen.value)

const copyText = computed(() => {
  const title = props.documentTitle?.trim()
  const content = model.value || ''
  if (!title) return content
  if (!content) return `# ${title}`
  return `# ${title}\n\n${content}`
})

function readEditorMarkdown() {
  if (!editor.value) return model.value || ''
  let markdown = ''
  editor.value.action((ctx) => {
    markdown = getMarkdown()(ctx)
  })
  return markdown
}

function shouldSkipExternalSync(markdown) {
  const editorMarkdown = toEditorMarkdown(markdown)
  if (editorMarkdown === lastEditorMarkdown.value) return true
  const current = readEditorMarkdown()
  if (current === editorMarkdown) {
    lastEditorMarkdown.value = editorMarkdown
    return true
  }
  return false
}

function applyMarkdown(markdown) {
  if (!editor.value) return

  const editorMarkdown = toEditorMarkdown(markdown || '')

  editor.value.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const parser = ctx.get(parserCtx)
    const doc = parser(editorMarkdown)
    if (!doc || view.state.doc.eq(doc)) {
      lastEditorMarkdown.value = editorMarkdown
      return
    }

    applyingExternalChange.value = true
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content))
    lastEditorMarkdown.value = editorMarkdown
    queueMicrotask(() => {
      applyingExternalChange.value = false
      syncPmHighlightFromAnchor()
    })
  })
}

function openSource() {
  const markdown = fromEditorMarkdown(readEditorMarkdown())
  if (markdown !== model.value) {
    model.value = markdown
  }
  sourceOpen.value = true
}

function toggleSource() {
  if (sourceOpen.value) {
    sourceOpen.value = false
    return
  }
  openSource()
}

function shouldCommitAnchor(altKey) {
  if (!props.showAnchorTools) return false
  return brushActive.value || altKey
}

function clearAnchor() {
  pmHighlightRange.value = null
  emit('selection-change', null)
  if (editor.value && !sourceOpen.value) {
    editor.value.action((ctx) => {
      refreshAnchorHighlight(ctx.get(editorViewCtx))
    })
  }
}

function commitVisualAnchor(ctx, pmSelection) {
  if (pmSelection.from === pmSelection.to) return

  const canonicalContent = getCanonicalContentFromEditor(ctx)
  const mapped = mapPmSelectionToCanonical(ctx, pmSelection, canonicalContent)
  if (!mapped) {
    clearAnchor()
    return
  }

  const editorSelection = buildEditorSelection(
    canonicalContent,
    mapped.anchorFrom,
    mapped.anchorTo,
    'visual',
    {
      displayText: mapped.plainText,
      focusMarkdown: mapped.focusMarkdown,
      contextFrom: mapped.contextFrom,
      contextTo: mapped.contextTo,
      contextText: mapped.contextText,
      focusText: mapped.focusText,
      lineStart: mapped.lineStart,
      lineEnd: mapped.lineEnd,
      pmFrom: pmSelection.from,
      pmTo: pmSelection.to,
    },
  )
  if (!editorSelection) {
    clearAnchor()
    return
  }

  pmHighlightRange.value = { pmFrom: pmSelection.from, pmTo: pmSelection.to }
  emit('selection-change', editorSelection)

  const view = ctx.get(editorViewCtx)
  const collapsePos = Math.min(pmSelection.to, view.state.doc.content.size)
  const tr = view.state.tr
    .setSelection(TextSelection.create(view.state.doc, collapsePos))
    .setMeta(anchorHighlightKey, { refresh: true })
  view.dispatch(tr)
}

function isInsideCommittedAnchorPm(ctx, pmPos) {
  const anchor = props.committedAnchor
  if (!anchor) return false

  if (anchor.anchorFrom == null || anchor.anchorTo == null) return false

  const resolved = resolvePmRangeFromCanonical(ctx, anchor.anchorFrom, anchor.anchorTo)
  if (!resolved) return false

  return pmPos >= resolved.pmFrom && pmPos < resolved.pmTo
}

function handleVisualSelectionSettled(view, ctx, altKey) {
  const { selection } = view.state
  const commitIntent = shouldCommitAnchor(altKey)

  if (!selection.empty) {
    if (commitIntent) {
      commitVisualAnchor(ctx, selection)
    }
    return
  }

  if (!props.committedAnchor || !brushActive.value) return

  if (!isInsideCommittedAnchorPm(ctx, selection.from)) {
    clearAnchor()
  }
}

let sourcePointerAltKey = false

function onSourcePointerDown(event) {
  sourcePointerAltKey = event.altKey
}

function resizeSourceInput() {
  const element = sourceInput.value
  if (!element || !sourceOpen.value) return

  element.style.height = '0'
  const minHeight = element.parentElement?.clientHeight ?? 200
  element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
}

function handleSourcePointer(event) {
  const element = sourceInput.value
  if (!element) return

  const altKey = sourcePointerAltKey || event.altKey
  const start = element.selectionStart
  const end = element.selectionEnd
  const commitIntent = shouldCommitAnchor(altKey)

  if (start !== end) {
    if (!commitIntent) return

    const selection = buildEditorSelection(model.value, start, end, 'source')
    if (!selection) {
      clearAnchor()
      return
    }
    emit('selection-change', selection)
    nextTick(() => {
      element.setSelectionRange(end, end)
    })
    return
  }

  if (!props.committedAnchor || !brushActive.value) return

  if (!isCanonicalPosInsideAnchor(start, props.committedAnchor)) {
    clearAnchor()
  }
}

function syncPmHighlightFromAnchor() {
  if (!editor.value || sourceOpen.value) return

  editor.value.action((ctx) => {
    const anchor = props.committedAnchor
    if (!anchor || anchor.source !== 'visual' || anchor.anchorFrom == null || anchor.anchorTo == null) {
      pmHighlightRange.value = null
    } else {
      pmHighlightRange.value = resolvePmRangeFromCanonical(ctx, anchor.anchorFrom, anchor.anchorTo)
    }

    refreshAnchorHighlight(ctx.get(editorViewCtx))
  })
}

function attachEditorPlugins(ctx) {
  let pointerSelecting = false
  let selectionAltKey = false

  const anchorPlugin = createAnchorHighlightPlugin(
    () => pmHighlightRange.value,
    () => queueMicrotask(() => syncPmHighlightFromAnchor()),
  )

  const selectionPlugin = new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (_view, event) => {
          pointerSelecting = true
          selectionAltKey = event.altKey
          return false
        },
        mouseup: (view, event) => {
          pointerSelecting = false
          const altKey = selectionAltKey || event.altKey
          requestAnimationFrame(() => {
            handleVisualSelectionSettled(view, ctx, altKey)
          })
          return false
        },
        keyup: (view, event) => {
          if (pointerSelecting) return false
          handleVisualSelectionSettled(view, ctx, event.altKey)
          return false
        },
      },
    },
  })

  ctx.update(prosePluginsCtx, (plugins) => plugins.concat(anchorPlugin, selectionPlugin))
}

function onEscapeKey(event) {
  if (event.key !== 'Escape') return
  if (props.committedAnchor) {
    event.preventDefault()
    clearAnchor()
  }
}

function setSourceCursor(position) {
  const element = sourceInput.value
  if (!element || !sourceOpen.value) return

  const cursor = Math.max(0, Math.min(position, model.value.length))
  nextTick(() => {
    element.focus()
    element.setSelectionRange(cursor, cursor)
  })
}

defineExpose({
  setSourceCursor,
  refreshAnchorDecoration: syncPmHighlightFromAnchor,
})

onMounted(async () => {
  window.addEventListener('keydown', onEscapeKey)

  editor.value = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root.value)
      ctx.set(defaultValueCtx, toEditorMarkdown(model.value || ''))
      attachEditorPlugins(ctx)

      ctx
        .get(listenerCtx)
        .markdownUpdated((_, markdown) => {
          if (applyingExternalChange.value || sourceOpen.value) return
          const normalized = fromEditorMarkdown(markdown)
          lastEditorMarkdown.value = toEditorMarkdown(normalized)
          if (normalized !== model.value) {
            model.value = normalized
          }
        })
    })
    .use(nord)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(listener)
    .create()

  applyMarkdown(model.value)
  lastEditorMarkdown.value = readEditorMarkdown() || toEditorMarkdown(model.value || '')
  setEditable(!props.readonly)
  syncPmHighlightFromAnchor()
})

onBeforeUnmount(async () => {
  window.removeEventListener('keydown', onEscapeKey)
  if (editor.value) {
    await editor.value.destroy()
  }
})

watch(
  () => props.committedAnchor,
  () => {
    syncPmHighlightFromAnchor()
  },
  { deep: true },
)

watch(
  () => model.value,
  (markdown) => {
    if (sourceOpen.value) {
      nextTick(() => resizeSourceInput())
      return
    }
    if (!editor.value || applyingExternalChange.value) return
    if (shouldSkipExternalSync(markdown)) return
    applyMarkdown(markdown)
  },
)

watch(
  () => props.readonly,
  (value) => setEditable(!value),
)

watch(sourceOpen, (open, wasOpen) => {
  if (open === wasOpen) return

  if (open) {
    const markdown = fromEditorMarkdown(readEditorMarkdown())
    if (markdown !== model.value) {
      model.value = markdown
    }
    nextTick(() => resizeSourceInput())
    return
  }

  applyMarkdown(model.value)
  lastEditorMarkdown.value = toEditorMarkdown(model.value)
  nextTick(() => syncPmHighlightFromAnchor())
})

function setEditable(editable) {
  if (!editor.value) return
  editor.value.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    view.setProps({ editable: () => editable })
  })
}
</script>

<template>
  <section class="visual-editor-shell" :class="{ 'is-readonly': readonly, 'is-source': sourceOpen }">
    <EditorToolbar
      :editor="editor"
      :source-open="sourceOpen"
      :show-formatting="showFormatting"
      :show-anchor-tools="showAnchorTools"
      :brush-active="brushActive"
      :has-anchor="Boolean(committedAnchor)"
      :copy-text="copyText"
      @toggle-source="toggleSource"
      @toggle-brush="brushActive = !brushActive"
      @clear-anchor="clearAnchor"
    />

    <div v-if="sourceOpen" class="editor-content-scroll">
      <div class="source-editor">
        <textarea
          ref="sourceInput"
          v-model="model"
          class="source-input"
          spellcheck="false"
          :readonly="readonly"
          @mousedown="onSourcePointerDown"
          @mouseup="handleSourcePointer"
          @keyup="handleSourcePointer"
          @input="resizeSourceInput"
        />
      </div>
    </div>

    <div v-show="!sourceOpen" class="editor-content-scroll">
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

.visual-editor-shell.is-readonly :deep(.ProseMirror) {
  cursor: default;
}

.editor-content-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 32px 32px;
}

.source-editor,
.milkdown-editor {
  display: block;
  margin: 0 auto;
  max-width: 720px;
  min-height: 100%;
  width: 100%;
}

.source-input {
  background: transparent;
  border: 0;
  color: var(--text-normal);
  display: block;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.72;
  min-height: 200px;
  outline: none;
  overflow: hidden;
  padding: 0;
  resize: none;
  width: 100%;
}

.source-input:read-only {
  cursor: default;
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

.milkdown-editor :deep(.codraft-committed-anchor) {
  background: color-mix(in srgb, var(--interactive-accent) 22%, transparent);
  border-radius: 2px;
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
  .editor-content-scroll {
    padding: 8px 16px 24px;
  }
}
</style>
