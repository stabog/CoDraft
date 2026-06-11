import MarkdownIt from 'markdown-it'
import multimdTable from 'markdown-it-multimd-table'
import { prepareMarkdownForRender } from './markdownLineBreaks'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
}).use(multimdTable, {
  multiline: false,
  rowspan: false,
  headerless: false,
})

function renderPrepared(text, mode) {
  const prepared = prepareMarkdownForRender(text)
  return mode === 'inline' ? md.renderInline(prepared) : md.render(prepared)
}

export function renderMarkdownInline(text) {
  if (!text?.trim()) return '&nbsp;'
  return renderPrepared(text, 'inline')
}

export function renderMarkdownBlock(text) {
  if (!text?.trim()) {
    return '<p class="diff-empty-line">&nbsp;</p>'
  }
  return renderPrepared(text, 'block')
}

/** Сегмент строки: block или inline, чтобы склеивать части одного абзаца. */
export function renderMarkdownSegment(text) {
  if (!text?.trim()) {
    return '<span class="diff-empty-line">&nbsp;</span>'
  }

  const trimmed = text.trimStart()
  const isBlock =
    text.includes('\n') ||
    /^#{1,6}\s/.test(trimmed) ||
    /^[-*+]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    /^>\s/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^\|/.test(trimmed)

  return isBlock ? renderPrepared(text, 'block') : renderPrepared(text, 'inline')
}

export function wrapRenderedBlock(html, className) {
  return `<div class="${className}">${html}</div>`
}
