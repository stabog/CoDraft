/**
 * Ищет вхождение подстроки, ближайшее к hint.
 *
 * @param {string} haystack
 * @param {string} needle
 * @param {number} hint
 * @returns {number}
 */
function findNearestIndex(haystack, needle, hint) {
  if (!needle) return hint
  let best = -1
  let bestDist = Infinity
  let start = 0

  while (start <= haystack.length) {
    const index = haystack.indexOf(needle, start)
    if (index < 0) break
    const dist = Math.abs(index - hint)
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
    start = index + 1
  }

  return best
}

/**
 * Ищет суффикс справа от minFrom, ближайший к hint.
 *
 * @param {string} haystack
 * @param {string} suffix
 * @param {number} minFrom
 * @param {number} hint
 * @returns {number}
 */
function findNearestSuffixIndex(haystack, suffix, minFrom, hint) {
  if (!suffix) return haystack.length
  let best = -1
  let bestDist = Infinity
  let end = haystack.length

  while (end >= minFrom) {
    const index = haystack.lastIndexOf(suffix, end)
    if (index < minFrom) break
    const dist = Math.abs(index - hint)
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
    end = index - 1
  }

  return best
}

/**
 * Пересчитывает focus внутри контекста после AI-патча.
 *
 * LLM переписывает весь context, но обычно сохраняет текст до и после фокуса
 * (например «| Тема | » и « |» в строке таблицы). Левую границу фиксируем по
 * префиксу, правую — по суффиксу; между ними лежит новая формулировка.
 *
 * @param {string} oldContext
 * @param {string} newContext
 * @param {number} focusFrom
 * @param {number} focusTo
 * @returns {{ focusFrom: number, focusTo: number }}
 */
export function relocateFocusInPatchedContext(oldContext, newContext, focusFrom, focusTo) {
  const oldLen = oldContext.length
  const newLen = newContext.length
  const from = Math.max(0, Math.min(focusFrom, oldLen))
  const to = Math.max(from, Math.min(focusTo, oldLen))
  const prefix = oldContext.slice(0, from)
  const suffix = oldContext.slice(to)
  const lengthDelta = newLen - oldLen

  let newFrom = from
  let newTo = to

  if (prefix.length > 0) {
    const prefixIndex = findNearestIndex(newContext, prefix, from)
    if (prefixIndex !== -1) {
      newFrom = prefixIndex + prefix.length
    }
  } else {
    newFrom = 0
  }

  if (suffix.length > 0) {
    const suffixIndex = findNearestSuffixIndex(newContext, suffix, newFrom, to + lengthDelta)
    if (suffixIndex !== -1 && suffixIndex >= newFrom) {
      newTo = suffixIndex
    } else {
      newTo = Math.min(newLen, to + lengthDelta)
    }
  } else {
    newTo = Math.min(newLen, to + lengthDelta)
  }

  if (newTo <= newFrom) {
    newFrom = Math.min(from, Math.max(0, newLen - 1))
    newTo = Math.min(newLen, Math.max(newFrom + 1, to + lengthDelta))
  }

  if (newTo <= newFrom) {
    return { focusFrom: 0, focusTo: newLen }
  }

  return { focusFrom: newFrom, focusTo: newTo }
}

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
  const oldContextText = String(selection.contextText ?? '')

  const { focusFrom, focusTo } = relocateFocusInPatchedContext(
    oldContextText,
    newContextText,
    selection.focusFrom ?? 0,
    selection.focusTo ?? oldContextText.length,
  )

  const focusText = newContextText.slice(focusFrom, focusTo)
  const anchorFrom = contextFrom + focusFrom
  const anchorTo = contextFrom + focusTo
  const lineStart = selection.lineStart
  const lineCount = newContextText === '' ? 1 : newContextText.split('\n').length

  const { pmFrom: _pmFrom, pmTo: _pmTo, ...rest } = selection

  return {
    ...rest,
    anchorSessionId: selection.anchorSessionId,
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

/**
 * @param {{ pmFrom: number, pmTo: number }} anchorPm
 * @param {{ from: number, to: number }} selection
 * @returns {{ from: number, to: number }}
 */
export function mergePmSelectionWithAnchor(anchorPm, selection) {
  return {
    from: Math.min(anchorPm.pmFrom, anchorPm.pmTo, selection.from, selection.to),
    to: Math.max(anchorPm.pmFrom, anchorPm.pmTo, selection.from, selection.to),
  }
}

/**
 * @param {{ anchorFrom: number, anchorTo: number }} anchor
 * @param {number} start
 * @param {number} end
 * @returns {{ anchorFrom: number, anchorTo: number }}
 */
export function mergeCanonicalSelectionWithAnchor(anchor, start, end) {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return {
    anchorFrom: Math.min(anchor.anchorFrom, lo),
    anchorTo: Math.max(anchor.anchorTo, hi),
  }
}
