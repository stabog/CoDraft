<script setup>
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

const props = defineProps({
  editor: {
    type: Object,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

function run(command, payload) {
  if (!props.editor || props.disabled) return
  if (payload === undefined) {
    props.editor.action(callCommand(command.key))
    return
  }
  props.editor.action(callCommand(command.key, payload))
}
</script>

<template>
  <div class="editor-toolbar" role="toolbar" aria-label="Форматирование">
    <div class="toolbar-group">
      <button type="button" class="toolbar-btn" title="Отменить" :disabled="disabled" @mousedown.prevent @click="run(undoCommand)">
        ↶
      </button>
      <button type="button" class="toolbar-btn" title="Повторить" :disabled="disabled" @mousedown.prevent @click="run(redoCommand)">
        ↷
      </button>
    </div>

    <span class="toolbar-sep" aria-hidden="true" />

    <div class="toolbar-group">
      <button type="button" class="toolbar-btn" title="Параграф" :disabled="disabled" @mousedown.prevent @click="run(turnIntoTextCommand)">
        P
      </button>
      <button type="button" class="toolbar-btn" title="Заголовок 1" :disabled="disabled" @mousedown.prevent @click="run(wrapInHeadingCommand, 1)">
        H1
      </button>
      <button type="button" class="toolbar-btn" title="Заголовок 2" :disabled="disabled" @mousedown.prevent @click="run(wrapInHeadingCommand, 2)">
        H2
      </button>
      <button type="button" class="toolbar-btn" title="Заголовок 3" :disabled="disabled" @mousedown.prevent @click="run(wrapInHeadingCommand, 3)">
        H3
      </button>
    </div>

    <span class="toolbar-sep" aria-hidden="true" />

    <div class="toolbar-group">
      <button type="button" class="toolbar-btn" title="Жирный" :disabled="disabled" @mousedown.prevent @click="run(toggleStrongCommand)">
        <strong>B</strong>
      </button>
      <button type="button" class="toolbar-btn" title="Курсив" :disabled="disabled" @mousedown.prevent @click="run(toggleEmphasisCommand)">
        <em>I</em>
      </button>
      <button type="button" class="toolbar-btn toolbar-btn-mono" title="Код" :disabled="disabled" @mousedown.prevent @click="run(toggleInlineCodeCommand)">
        &lt;/&gt;
      </button>
    </div>

    <span class="toolbar-sep" aria-hidden="true" />

    <div class="toolbar-group">
      <button type="button" class="toolbar-btn" title="Маркированный список" :disabled="disabled" @mousedown.prevent @click="run(wrapInBulletListCommand)">
        •
      </button>
      <button type="button" class="toolbar-btn" title="Нумерованный список" :disabled="disabled" @mousedown.prevent @click="run(wrapInOrderedListCommand)">
        1.
      </button>
      <button type="button" class="toolbar-btn" title="Цитата" :disabled="disabled" @mousedown.prevent @click="run(wrapInBlockquoteCommand)">
        "
      </button>
      <button type="button" class="toolbar-btn" title="Разделитель" :disabled="disabled" @mousedown.prevent @click="run(insertHrCommand)">
        ―
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
  padding: 4px 8px;
}

.toolbar-group {
  align-items: center;
  display: inline-flex;
  gap: 2px;
}

.toolbar-sep {
  background: var(--background-modifier-border);
  height: 20px;
  margin: 0 2px;
  width: 1px;
}

.toolbar-btn {
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  height: 28px;
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

.toolbar-btn strong,
.toolbar-btn em {
  font-size: 12px;
  font-style: italic;
  font-weight: 800;
}

.toolbar-btn-mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}
</style>
