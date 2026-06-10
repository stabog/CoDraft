/**
 * CommonMark/Milkdown: одиночный \n внутри абзаца не даёт переноса в WYSIWYG.
 * Для согласованности исходника и визуального режима одиночные переводы строк
 * превращаем в hard break (два пробела перед \n).
 */

export function toEditorMarkdown(markdown) {
  if (!markdown) return ''

  return markdown
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, '  \n'))
    .join('\n\n')
}

export function fromEditorMarkdown(markdown) {
  if (!markdown) return ''

  return markdown.replace(/ {2}\n/g, '\n').replace(/\\\n/g, '\n')
}
