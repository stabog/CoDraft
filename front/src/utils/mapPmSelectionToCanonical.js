import { editorViewCtx } from '@milkdown/core'
import { getMarkdown } from '@milkdown/utils'
import { fromEditorMarkdown } from './markdownLineBreaks.js'
import { anchorDebug, anchorDebugWarn } from './anchorDebug.js'
import { locatePlainRangeInMarkdown, toComparablePlain } from './markdownPlainAlignment.js'
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
  const plain = plainText.trim().replace(/\s+/g, ' ')
  if (!plain || !markdownSlice) return false
  return toComparablePlain(markdownSlice) === plain
}

/**
 * @param {string} canonicalContent
 * @param {string} plainText
 * @param {number} hintFrom
 */
function resolveAnchorsFromPlain(canonicalContent, plainText, hintFrom) {
  const aligned = locatePlainRangeInMarkdown(canonicalContent, plainText, hintFrom)
  if (aligned) {
    return { anchorFrom: aligned.anchorFrom, anchorTo: aligned.anchorTo }
  }

  const located = locatePlainTextInContent(canonicalContent, plainText, hintFrom)
  if (!located) return null

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
  if (!plainText.trim()) {
    anchorDebugWarn('mapPm:fail', 'empty plainText', { from, to })
    return null
  }

  const docSize = view.state.doc.content.size
  const hintFrom =
    docSize > 0 ? Math.floor((Math.min(from, to) / docSize) * canonicalContent.length) : 0

  let anchorFrom = -1
  let anchorTo = -1
  let serializerHint = hintFrom
  /** @type {{ anchorFrom: number, anchorTo: number } | null} */
  let serializerCandidates = null

  try {
    const prefix = serializePmRangeToCanonical(ctx, 0, from)
    const through = serializePmRangeToCanonical(ctx, 0, to)

    if (through.length > prefix.length) {
      const focusMarkdown = through.slice(prefix.length)
      const plainLength = plainText.trim().length
      const sliceLength = focusMarkdown.trim().length

      if (!plainLength || sliceLength >= plainLength * 0.4) {
        const candidateFrom = prefix.length
        const candidateTo = through.length
        const slice = canonicalContent.slice(candidateFrom, candidateTo)

        if (anchorSliceMatchesPlain(slice, plainText)) {
          anchorFrom = candidateFrom
          anchorTo = candidateTo
        } else {
          serializerHint = candidateFrom
          serializerCandidates = { anchorFrom: candidateFrom, anchorTo: candidateTo }
        }
      }
    }
  } catch (error) {
    console.warn('Не удалось сопоставить выделение через сериализатор Milkdown', error)
  }

  let mappingSource = 'serializer'

  if (anchorFrom < 0) {
    mappingSource = 'plain-alignment'
    const resolved = resolveAnchorsFromPlain(canonicalContent, plainText, serializerHint)
    if (resolved) {
      anchorFrom = resolved.anchorFrom
      anchorTo = resolved.anchorTo
    } else if (serializerCandidates) {
      mappingSource = 'serializer-fallback'
      anchorFrom = serializerCandidates.anchorFrom
      anchorTo = serializerCandidates.anchorTo
      anchorDebug('mapPm:serializer-fallback', {
        anchorFrom,
        anchorTo,
        plainTextPreview: plainText.slice(0, 80),
      })
    } else {
      anchorDebugWarn('mapPm:fail', 'resolveAnchorsFromPlain returned null', {
        plainTextPreview: plainText.slice(0, 80),
        serializerHint,
        canonicalLength: canonicalContent.length,
      })
      return null
    }
  }

  const lineContext = resolveLineContext(canonicalContent, anchorFrom, anchorTo)
  if (!lineContext) {
    anchorDebugWarn('mapPm:fail', 'resolveLineContext returned null', { anchorFrom, anchorTo })
    return null
  }

  const focusText = canonicalContent.slice(anchorFrom, anchorTo)
  anchorDebug('mapPm:success', {
    mappingSource,
    anchorFrom,
    anchorTo,
    plainTextPreview: plainText.slice(0, 80),
    focusTextPreview: focusText.slice(0, 80),
    contextLines: `${lineContext.lineStart}-${lineContext.lineEnd}`,
  })

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
