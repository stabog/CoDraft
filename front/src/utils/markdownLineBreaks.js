/**
 * CommonMark/Milkdown: одиночный \n внутри абзаца не даёт переноса в WYSIWYG.
 * Для согласованности исходника и визуального режима одиночные переводы строк
 * превращаем в hard break (два пробела перед \n).
 * GFM-таблицы не разбиваем на блоки — одна строка = один ряд.
 */

import { isTableBlock, splitMarkdownIntoBlocks } from './markdownBlocks.js'
import { normalizeGfmTableCells } from './normalizeGfmTableCells.js'

const HTML_BREAK_RE = /<br\s*\/?>/gi

export function normalizeHtmlLineBreaks(markdown) {
  if (!markdown) return ''
  return markdown.replace(HTML_BREAK_RE, '\n')
}

/** Нормализация перед diff: br-теги и лишние пустые строки. */
export function normalizeMarkdownForDiff(markdown) {
  if (!markdown) return ''
  return normalizeHtmlLineBreaks(markdown).replace(/\n{3,}/g, '\n\n')
}

function hardBreakParagraphBlock(block) {
  return block.replace(/\n/g, '  \n')
}

export function toEditorMarkdown(markdown) {
  if (!markdown) return ''

  const normalized = normalizeHtmlLineBreaks(markdown)
  const blocks = splitMarkdownIntoBlocks(normalized)

  return blocks
    .map((block) => (isTableBlock(block) ? block : hardBreakParagraphBlock(block)))
    .join('\n\n')
}

export function fromEditorMarkdown(markdown) {
  if (!markdown) return ''

  const withoutHardBreaks = normalizeHtmlLineBreaks(markdown)
    .replace(/ {2}\n/g, '\n')
    .replace(/\\\n/g, '\n')

  return normalizeGfmTableCells(withoutHardBreaks)
}

/** Markdown для preview/diff: как в Milkdown, с рабочими переносами строк. */
export function prepareMarkdownForRender(markdown) {
  return toEditorMarkdown(markdown)
}
