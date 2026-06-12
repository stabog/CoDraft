import { editorViewCtx } from '@milkdown/core'
import { getMarkdown } from '@milkdown/utils'
import { getCanonicalContentFromEditor } from './mapPmSelectionToCanonical.js'
import { fromEditorMarkdown } from './markdownLineBreaks.js'

function comparableSelectionText(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * @param {import('@milkdown/prose/view').EditorView} view
 * @param {{ pmFrom: number, pmTo: number }} range
 * @param {string} anchorText
 */
function pmRangeMatchesAnchorText(view, range, anchorText) {
  if (!range || range.pmTo <= range.pmFrom) return false
  const pmText = view.state.doc.textBetween(range.pmFrom, range.pmTo, '\n\n', '\n')
  return comparableSelectionText(pmText) === comparableSelectionText(anchorText)
}

/**
 * @param {import('@milkdown/prose/view').EditorView} view
 * @param {string} anchorText
 * @param {number} [hintPmPos]
 * @returns {{ pmFrom: number, pmTo: number } | null}
 */
function searchPmRangeByPlainText(view, anchorText, hintPmPos) {
  const target = comparableSelectionText(anchorText)
  if (!target) return null

  const doc = view.state.doc
  const size = doc.content.size
  if (size <= 1) return null

  const hint = Math.max(1, Math.min(hintPmPos ?? 1, size - 1))
  const pad = Math.max(400, target.length * 3)
  const lo = Math.max(1, hint - pad)
  const hi = Math.min(size, hint + pad)
  const maxSpan = Math.max(target.length * 2 + 40, target.length + 20)

  let best = null
  let bestDist = Infinity

  for (let from = lo; from < hi; from += 1) {
    const toLimit = Math.min(hi, from + maxSpan)
    for (let to = from + 1; to <= toLimit; to += 1) {
      const candidate = comparableSelectionText(doc.textBetween(from, to, '\n\n', '\n'))
      if (candidate !== target) continue

      const dist = Math.abs(from - hint)
      if (dist < bestDist) {
        bestDist = dist
        best = { pmFrom: from, pmTo: to }
        if (dist === 0) return best
      }
    }
  }

  return best
}

/**
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @param {number} charOffset
 * @returns {number}
 */
export function findPmPositionForCanonicalOffset(ctx, charOffset) {
  if (charOffset <= 0) return 1

  const view = ctx.get(editorViewCtx)
  const docSize = view.state.doc.content.size
  let lo = 0
  let hi = docSize

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const prefixLen = canonicalPrefixLength(ctx, mid)

    if (prefixLen < charOffset) lo = mid + 1
    else hi = mid
  }

  return Math.min(lo, docSize)
}

/**
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @param {number} pmPos
 */
function canonicalPrefixLength(ctx, pmPos) {
  return fromEditorMarkdown(getMarkdown({ from: 0, to: pmPos })(ctx)).length
}

/**
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @param {number} anchorFrom
 * @param {number} anchorTo
 * @returns {{ pmFrom: number, pmTo: number } | null}
 */
export function resolvePmRangeFromCanonical(ctx, anchorFrom, anchorTo) {
  if (anchorFrom < 0 || anchorTo <= anchorFrom) return null

  try {
    const pmFrom = findPmPositionForCanonicalOffset(ctx, anchorFrom)
    const pmTo = findPmPositionForCanonicalOffset(ctx, anchorTo)
    if (pmTo <= pmFrom) return null
    return { pmFrom, pmTo }
  } catch {
    return null
  }
}

/**
 * Возвращает PM-диапазон для подсветки якоря.
 * Для таблиц бинарный поиск по canonical-смещению может дать неверный ряд —
 * сначала используем сохранённые pmFrom/pmTo, затем проверяем текст и ищем по plain.
 *
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @param {{
 *   anchorFrom: number,
 *   anchorTo: number,
 *   anchorText?: string,
 *   text?: string,
 *   pmFrom?: number,
 *   pmTo?: number,
 * }} anchor
 * @returns {{ pmFrom: number, pmTo: number } | null}
 */
export function resolvePmHighlightRange(ctx, anchor) {
  if (!anchor || anchor.anchorFrom == null || anchor.anchorTo == null) return null
  if (anchor.anchorTo <= anchor.anchorFrom) return null

  const view = ctx.get(editorViewCtx)
  const docSize = view.state.doc.content.size
  const canonicalContent = getCanonicalContentFromEditor(ctx)
  const anchorText =
    anchor.anchorText ??
    anchor.text ??
    canonicalContent.slice(anchor.anchorFrom, anchor.anchorTo)

  if (anchor.pmFrom != null && anchor.pmTo != null && anchor.pmTo > anchor.pmFrom) {
    const stored = {
      pmFrom: Math.max(1, Math.min(anchor.pmFrom, docSize)),
      pmTo: Math.max(1, Math.min(anchor.pmTo, docSize)),
    }
    if (stored.pmTo > stored.pmFrom && pmRangeMatchesAnchorText(view, stored, anchorText)) {
      return stored
    }
  }

  const binary = resolvePmRangeFromCanonical(ctx, anchor.anchorFrom, anchor.anchorTo)
  if (binary && pmRangeMatchesAnchorText(view, binary, anchorText)) {
    return binary
  }

  const hint = binary?.pmFrom ?? findPmPositionForCanonicalOffset(ctx, anchor.anchorFrom)
  const searched = searchPmRangeByPlainText(view, anchorText, hint)
  if (searched) return searched

  return binary
}
