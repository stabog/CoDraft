/**
 * @param {string} content
 * @param {number} selectionFrom
 * @param {number} selectionTo
 * @returns {{
 *   contextFrom: number,
 *   contextTo: number,
 *   contextText: string,
 *   focusFrom: number,
 *   focusTo: number,
 *   focusText: string,
 *   lineStart: number,
 *   lineEnd: number,
 * } | null}
 */
export function resolveLineContext(content, selectionFrom, selectionTo) {
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

  return {
    contextFrom,
    contextTo,
    contextText,
    focusFrom: from - contextFrom,
    focusTo: to - contextFrom,
    focusText: text.slice(from, to),
    lineStart,
    lineEnd: lineStart + lineCount - 1,
  }
}
