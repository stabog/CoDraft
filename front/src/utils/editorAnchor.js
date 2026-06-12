/**
 * Обновляет якорь после успешного AI-патча контекста (для повторных правок).
 *
 * @param {Record<string, unknown>} selection
 * @param {string} newContextText
 * @returns {Record<string, unknown>}
 */
export function updateAnchorAfterContextPatch(selection, newContextText) {
  const contextFrom = selection.contextFrom
  const contextTo = contextFrom + newContextText.length

  let focusFrom = selection.focusFrom ?? 0
  let focusTo = selection.focusTo ?? newContextText.length

  if (focusFrom > newContextText.length) focusFrom = 0
  if (focusTo > newContextText.length) focusTo = newContextText.length
  if (focusTo <= focusFrom) {
    focusFrom = 0
    focusTo = newContextText.length
  }

  const focusText = newContextText.slice(focusFrom, focusTo)
  const anchorFrom = contextFrom + focusFrom
  const anchorTo = contextFrom + focusTo
  const lineStart = selection.lineStart
  const lineCount = newContextText === '' ? 1 : newContextText.split('\n').length

  const { pmFrom: _pmFrom, pmTo: _pmTo, ...rest } = selection

  return {
    ...rest,
    revision: (selection.revision ?? 0) + 1,
    contextFrom,
    contextTo,
    contextText: newContextText,
    focusFrom,
    focusTo,
    focusText,
    anchorFrom,
    anchorTo,
    anchorText: focusText,
    text: focusText,
    lineEnd: lineStart + lineCount - 1,
    anchor: {
      from: anchorFrom,
      to: anchorTo,
      quotedText: focusText,
    },
  }
}

/**
 * @param {number} pos
 * @param {{ anchorFrom: number, anchorTo: number }} anchor
 */
export function isCanonicalPosInsideAnchor(pos, anchor) {
  return pos >= anchor.anchorFrom && pos < anchor.anchorTo
}

/**
 * @param {number} pos
 * @param {{ pmFrom: number, pmTo: number }} anchor
 */
export function isPmPosInsideAnchor(pos, anchor) {
  return pos >= anchor.pmFrom && pos < anchor.pmTo
}
