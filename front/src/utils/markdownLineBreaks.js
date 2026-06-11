/**
 * CommonMark/Milkdown: одиночный \n внутри абзаца не даёт переноса в WYSIWYG.
 * Для согласованности исходника и визуального режима одиночные переводы строк
 * превращаем в hard break (два пробела перед \n).
 */

const HTML_BREAK_RE = /<br\s*\/?>/gi

export function normalizeHtmlLineBreaks(markdown) {
  if (!markdown) return ''
  return markdown.replace(HTML_BREAK_RE, '\n')
}

export function toEditorMarkdown(markdown) {
  if (!markdown) return ''

  const normalized = normalizeHtmlLineBreaks(markdown)

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, '  \n'))
    .join('\n\n')
}

export function fromEditorMarkdown(markdown) {
  if (!markdown) return ''

  return normalizeHtmlLineBreaks(markdown)
    .replace(/ {2}\n/g, '\n')
    .replace(/\\\n/g, '\n')
}

/** Markdown для preview/diff: как в Milkdown, с рабочими переносами строк. */
export function prepareMarkdownForRender(markdown) {
  return toEditorMarkdown(markdown)
}
