import { editorViewCtx } from '@milkdown/core'
import { getMarkdown } from '@milkdown/utils'
import { fromEditorMarkdown } from './markdownLineBreaks.js'

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
