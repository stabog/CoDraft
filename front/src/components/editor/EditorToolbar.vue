<script setup>
import { ref } from 'vue'
import {
  mdiCheck,
  mdiCodeTags,
  mdiContentCopy,
  mdiEyeOutline,
  mdiFormatBold,
  mdiFormatHeader1,
  mdiFormatHeader2,
  mdiFormatHeader3,
  mdiFormatItalic,
  mdiFormatListBulleted,
  mdiFormatListNumbered,
  mdiFormatParagraph,
  mdiFormatQuoteClose,
  mdiLanguageMarkdown,
  mdiMarker,
  mdiMarkerCancel,
  mdiMinus,
  mdiRedo,
  mdiUndo,
} from '@mdi/js'
import { redoCommand, undoCommand } from '@milkdown/plugin-history'
import {
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark'
import { callCommand } from '@milkdown/utils'
import MdiIcon from '../icons/MdiIcon.vue'

const props = defineProps({
  editor: {
    type: Object,
    default: null,
  },
  sourceOpen: {
    type: Boolean,
    default: false,
  },
  showFormatting: {
    type: Boolean,
    default: false,
  },
  copyText: {
    type: String,
    default: '',
  },
  showAnchorTools: {
    type: Boolean,
    default: false,
  },
  brushActive: {
    type: Boolean,
    default: false,
  },
  hasAnchor: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggle-source', 'toggle-brush', 'clear-anchor'])

const copyDone = ref(false)
let copyTimer = null

function run(command, payload) {
  if (!props.editor || !props.showFormatting) return
  if (payload === undefined) {
    props.editor.action(callCommand(command.key))
    return
  }
  props.editor.action(callCommand(command.key, payload))
}

async function copyDocument() {
  const text = props.copyText || ''
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    copyDone.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copyDone.value = false
    }, 1500)
  } catch {
    window.alert('Не удалось скопировать в буфер обмена')
  }
}
</script>

<template>
  <div class="editor-toolbar" role="toolbar" aria-label="Панель редактора">
    <template v-if="showFormatting">
      <div class="toolbar-group">
        <button type="button" class="toolbar-btn" title="Отменить" @mousedown.prevent @click="run(undoCommand)">
          <MdiIcon :path="mdiUndo" />
        </button>
        <button type="button" class="toolbar-btn" title="Повторить" @mousedown.prevent @click="run(redoCommand)">
          <MdiIcon :path="mdiRedo" />
        </button>
      </div>

      <span class="toolbar-sep" aria-hidden="true" />

      <div class="toolbar-group">
        <button type="button" class="toolbar-btn" title="Параграф" @mousedown.prevent @click="run(turnIntoTextCommand)">
          <MdiIcon :path="mdiFormatParagraph" />
        </button>
        <button type="button" class="toolbar-btn" title="Заголовок 1" @mousedown.prevent @click="run(wrapInHeadingCommand, 1)">
          <MdiIcon :path="mdiFormatHeader1" />
        </button>
        <button type="button" class="toolbar-btn" title="Заголовок 2" @mousedown.prevent @click="run(wrapInHeadingCommand, 2)">
          <MdiIcon :path="mdiFormatHeader2" />
        </button>
        <button type="button" class="toolbar-btn" title="Заголовок 3" @mousedown.prevent @click="run(wrapInHeadingCommand, 3)">
          <MdiIcon :path="mdiFormatHeader3" />
        </button>
      </div>

      <span class="toolbar-sep" aria-hidden="true" />

      <div class="toolbar-group">
        <button type="button" class="toolbar-btn" title="Жирный" @mousedown.prevent @click="run(toggleStrongCommand)">
          <MdiIcon :path="mdiFormatBold" />
        </button>
        <button type="button" class="toolbar-btn" title="Курсив" @mousedown.prevent @click="run(toggleEmphasisCommand)">
          <MdiIcon :path="mdiFormatItalic" />
        </button>
        <button type="button" class="toolbar-btn" title="Код" @mousedown.prevent @click="run(toggleInlineCodeCommand)">
          <MdiIcon :path="mdiCodeTags" />
        </button>
      </div>

      <span class="toolbar-sep" aria-hidden="true" />

      <div class="toolbar-group">
        <button type="button" class="toolbar-btn" title="Маркированный список" @mousedown.prevent @click="run(wrapInBulletListCommand)">
          <MdiIcon :path="mdiFormatListBulleted" />
        </button>
        <button type="button" class="toolbar-btn" title="Нумерованный список" @mousedown.prevent @click="run(wrapInOrderedListCommand)">
          <MdiIcon :path="mdiFormatListNumbered" />
        </button>
        <button type="button" class="toolbar-btn" title="Цитата" @mousedown.prevent @click="run(wrapInBlockquoteCommand)">
          <MdiIcon :path="mdiFormatQuoteClose" />
        </button>
        <button type="button" class="toolbar-btn" title="Разделитель" @mousedown.prevent @click="run(insertHrCommand)">
          <MdiIcon :path="mdiMinus" />
        </button>
      </div>
    </template>

    <template v-if="showAnchorTools">
      <span v-if="showFormatting" class="toolbar-sep" aria-hidden="true" />

      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn toolbar-btn-brush"
          :class="{ active: brushActive }"
          title="Якорь: выделение для комментария или ИИ (или Alt+выделение)"
          @mousedown.prevent
          @click="$emit('toggle-brush')"
        >
          <MdiIcon :path="mdiMarker" />
        </button>
        <button
          v-if="hasAnchor"
          type="button"
          class="toolbar-btn toolbar-btn-clear-anchor"
          title="Снять якорь"
          @mousedown.prevent
          @click="$emit('clear-anchor')"
        >
          <MdiIcon :path="mdiMarkerCancel" />
        </button>
      </div>
    </template>

    <span class="toolbar-spacer" aria-hidden="true" />

    <div class="toolbar-group toolbar-group-right">
      <button
        type="button"
        class="toolbar-btn toolbar-btn-source"
        :class="{ active: sourceOpen }"
        :title="sourceOpen ? 'Вернуться к визуальному редактору' : 'Показать исходник Markdown'"
        @mousedown.prevent
        @click="$emit('toggle-source')"
      >
        <MdiIcon :path="sourceOpen ? mdiEyeOutline : mdiLanguageMarkdown" />
      </button>

      <button
        type="button"
        class="toolbar-btn toolbar-btn-copy"
        :title="copyDone ? 'Скопировано' : 'Копировать документ'"
        :disabled="!copyText"
        @click="copyDocument"
      >
        <MdiIcon :path="copyDone ? mdiCheck : mdiContentCopy" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-toolbar {
  align-items: center;
  background: var(--background-secondary-alt);
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 37px;
  padding: 4px 8px;
}

.toolbar-group {
  align-items: center;
  display: inline-flex;
  gap: 2px;
}

.toolbar-group-right {
  flex-shrink: 0;
}

.toolbar-sep {
  background: var(--background-modifier-border);
  height: 20px;
  margin: 0 2px;
  width: 1px;
}

.toolbar-spacer {
  flex: 1;
  min-width: 8px;
}

.toolbar-btn {
  align-items: center;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  display: inline-flex;
  height: 28px;
  justify-content: center;
  min-width: 28px;
  padding: 0 6px;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.toolbar-btn:disabled {
  opacity: 0.35;
}

.toolbar-btn-source {
  color: var(--text-faint);
}

.toolbar-btn-source.active,
.toolbar-btn-brush.active {
  background: var(--background-modifier-active);
  color: var(--interactive-accent);
}

.toolbar-btn-clear-anchor {
  color: var(--interactive-accent);
}
</style>
