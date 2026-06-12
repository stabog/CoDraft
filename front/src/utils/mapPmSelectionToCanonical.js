import { editorViewCtx } from '@milkdown/core'
import { getMarkdown } from '@milkdown/utils'
import { fromEditorMarkdown } from './markdownLineBreaks.js'
import { locatePlainTextInContent } from './locatePlainTextInContent.js'
import { resolveLineContext } from './resolveLineContext.js'

/**
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @returns {string}
 */
export function getCanonicalContentFromEditor(ctx) {
  return fromEditorMarkdown(getMarkdown()(ctx))
}

/**
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
function serializePmRangeToCanonical(ctx, from, to) {
  return fromEditorMarkdown(getMarkdown({ from, to })(ctx))
}

/**
 * @param {string} markdownSlice
 * @param {string} plainText
 */
function anchorSliceMatchesPlain(markdownSlice, plainText) {
  const plain = plainText.trim()
  if (!plain || !markdownSlice) return false

  const fromMd = markdownSlice
    .replace(/[#*_`~\[\]()>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const normPlain = plain.replace(/\s+/g, ' ').trim()

  if (fromMd === normPlain) return true

  const shorter = Math.min(fromMd.length, normPlain.length)
  const longer = Math.max(fromMd.length, normPlain.length)
  if (shorter === 0) return false

  if (fromMd.includes(normPlain) || normPlain.includes(fromMd)) {
    return shorter / longer >= 0.9
  }

  return false
}

/**
 * @param {string} canonicalContent
 * @param {string} plainText
 * @param {number} anchorFrom
 * @param {number} anchorTo
 * @param {number} hintFrom
 */
function ensureAnchorsMatchPlain(canonicalContent, plainText, anchorFrom, anchorTo, hintFrom) {
  const slice = canonicalContent.slice(anchorFrom, anchorTo)
  if (anchorSliceMatchesPlain(slice, plainText)) {
    return { anchorFrom, anchorTo }
  }

  const located = locatePlainTextInContent(
    canonicalContent,
    plainText,
    anchorFrom >= 0 ? anchorFrom : hintFrom,
  )
  if (!located) {
    return { anchorFrom, anchorTo }
  }

  return { anchorFrom: located.anchorFrom, anchorTo: located.anchorTo }
}

/**
 * @param {import('@milkdown/ctx').Ctx} ctx
 * @param {import('@milkdown/prose/state').Selection} selection
 * @param {string} canonicalContent
 * @returns {{
 *   anchorFrom: number,
 *   anchorTo: number,
 *   plainText: string,
 *   focusMarkdown: string,
 *   contextFrom: number,
 *   contextTo: number,
 *   contextText: string,
 *   focusText: string,
 *   lineStart: number,
 *   lineEnd: number,
 * } | null}
 */
export function mapPmSelectionToCanonical(ctx, selection, canonicalContent) {
  const from = selection.from
  const to = selection.to

  if (from === to) return null

  const view = ctx.get(editorViewCtx)
  const plainText = view.state.doc.textBetween(from, to, '\n\n', '\n')
  if (!plainText.trim()) return null

  const docSize = view.state.doc.content.size
  const hintFrom =
    docSize > 0 ? Math.floor((Math.min(from, to) / docSize) * canonicalContent.length) : 0

  let anchorFrom = -1
  let anchorTo = -1

  try {
    const prefix = serializePmRangeToCanonical(ctx, 0, from)
    const through = serializePmRangeToCanonical(ctx, 0, to)

    if (through.length > prefix.length) {
      const focusMarkdown = through.slice(prefix.length)
      const plainLength = plainText.trim().length
      const sliceLength = focusMarkdown.trim().length

      if (!plainLength || sliceLength >= plainLength * 0.4) {
        anchorFrom = prefix.length
        anchorTo = through.length
      }
    }
  } catch (error) {
    console.warn('Не удалось сопоставить выделение через сериализатор Milkdown', error)
  }

  if (anchorFrom < 0) {
    const located = locatePlainTextInContent(canonicalContent, plainText, hintFrom)
    if (!located) return null

    anchorFrom = located.anchorFrom
    anchorTo = located.anchorTo
  } else {
    const verified = ensureAnchorsMatchPlain(
      canonicalContent,
      plainText,
      anchorFrom,
      anchorTo,
      hintFrom,
    )
    anchorFrom = verified.anchorFrom
    anchorTo = verified.anchorTo
  }

  const lineContext = resolveLineContext(canonicalContent, anchorFrom, anchorTo)
  if (!lineContext) return null

  const focusText = canonicalContent.slice(anchorFrom, anchorTo)
  const { focusText: _lineFocus, ...lineContextRest } = lineContext

  return {
    anchorFrom,
    anchorTo,
    plainText,
    focusMarkdown: focusText,
    focusText,
    ...lineContextRest,
  }
}
