import { applyRangeReplacement } from './applyRangeReplacement.js'

/**
 * @param {string} content
 * @param {{
 *   contextFrom: number,
 *   contextTo: number,
 *   contextText: string,
 * }} selection
 * @param {string} newContextText
 * @returns {string}
 */
export function applyContextPatch(content, selection, newContextText) {
  const current = content.slice(selection.contextFrom, selection.contextTo)

  if (current !== selection.contextText) {
    throw new Error('Контекст в документе изменился. Выделите фрагмент снова.')
  }

  return applyRangeReplacement(content, selection.contextFrom, selection.contextTo, newContextText)
}
