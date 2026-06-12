/** Сколько строк markdown сверху/снизу patch-контекста отдавать в промпт (только для LLM). */
export const TONE_CONTEXT_PADDING_LINES = 1

/**
 * @param {string} content
 * @param {number} offset
 * @returns {number}
 */
function lineIndexAt(content, offset) {
  return content.slice(0, Math.max(0, offset)).split('\n').length - 1
}

/**
 * @param {string} content
 * @param {number} contextFrom
 * @param {number} contextTo
 * @param {number} [paddingLines]
 * @returns {{ beforeText: string, afterText: string }}
 */
export function resolveContextPadding(
  content,
  contextFrom,
  contextTo,
  paddingLines = TONE_CONTEXT_PADDING_LINES,
) {
  if (!paddingLines || paddingLines <= 0 || !content) {
    return { beforeText: '', afterText: '' }
  }

  const lines = content.split('\n')
  const startLine = lineIndexAt(content, contextFrom)
  const endLine = lineIndexAt(content, Math.max(contextFrom, contextTo - 1))
  const beforeStart = Math.max(0, startLine - paddingLines)
  const afterEnd = Math.min(lines.length - 1, endLine + paddingLines)

  return {
    beforeText: lines.slice(beforeStart, startLine).join('\n'),
    afterText: lines.slice(endLine + 1, afterEnd + 1).join('\n'),
  }
}

/**
 * @param {string} content
 * @param {number} selectionFrom
 * @param {number} selectionTo
 * @param {{ paddingLines?: number }} [options]
 * @returns {{
 *   contextFrom: number,
 *   contextTo: number,
 *   contextText: string,
 *   beforeText: string,
 *   afterText: string,
 *   focusFrom: number,
 *   focusTo: number,
 *   focusText: string,
 *   lineStart: number,
 *   lineEnd: number,
 * } | null}
 */
export function resolveLineContext(content, selectionFrom, selectionTo, options = {}) {
  const text = content ?? ''
  const from = Math.max(0, Math.min(selectionFrom, selectionTo))
  const to = Math.max(from, Math.min(selectionTo, text.length))

  if (from === to) return null

  let contextFrom = from
  while (contextFrom > 0 && text[contextFrom - 1] !== '\n') {
    contextFrom -= 1
  }

  let contextTo = to
  while (contextTo < text.length && text[contextTo] !== '\n') {
    contextTo += 1
  }

  const contextText = text.slice(contextFrom, contextTo)
  const lineStart = text.slice(0, contextFrom).split('\n').length - 1
  const lineCount = contextText === '' ? 1 : contextText.split('\n').length
  const paddingLines = options.paddingLines ?? TONE_CONTEXT_PADDING_LINES
  const { beforeText, afterText } = resolveContextPadding(
    text,
    contextFrom,
    contextTo,
    paddingLines,
  )

  return {
    contextFrom,
    contextTo,
    contextText,
    beforeText,
    afterText,
    focusFrom: from - contextFrom,
    focusTo: to - contextFrom,
    focusText: text.slice(from, to),
    lineStart,
    lineEnd: lineStart + lineCount - 1,
  }
}
