import { resolveLineContext } from './resolveLineContext.js'

function createAnchorSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `anchor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * @param {string} content
 * @param {number} selectionFrom
 * @param {number} selectionTo
 * @param {'source' | 'visual'} source
 * @param {{
 *   displayText?: string,
 *   focusMarkdown?: string,
 *   contextFrom?: number,
 *   contextTo?: number,
 *   contextText?: string,
 *   focusText?: string,
 *   lineStart?: number,
 *   lineEnd?: number,
 *   beforeText?: string,
 *   afterText?: string,
 *   pmFrom?: number,
 *   pmTo?: number,
 *   revision?: number,
 *   anchorSessionId?: string,
 * }} [options]
 * @returns {Record<string, unknown> | null}
 */
export function buildEditorSelection(content, selectionFrom, selectionTo, source, options = {}) {
  const anchorSessionId = options.anchorSessionId ?? createAnchorSessionId()
  const anchorFrom = Math.min(selectionFrom, selectionTo)
  const anchorTo = Math.max(selectionFrom, selectionTo)
  const markdownSlice = content.slice(anchorFrom, anchorTo)
  const displayText = options.displayText ?? markdownSlice

  if (!displayText.trim() && !markdownSlice.trim()) return null

  if (options.contextText != null && options.focusText != null) {
    return {
      anchorFrom,
      anchorTo,
      anchorText: displayText,
      text: displayText,
      source,
      anchor: {
        from: anchorFrom,
        to: anchorTo,
        quotedText: displayText,
      },
      contextFrom: options.contextFrom,
      contextTo: options.contextTo,
      contextText: options.contextText,
      focusFrom: anchorFrom - options.contextFrom,
      focusTo: anchorTo - options.contextFrom,
      focusText: options.focusText,
      lineStart: options.lineStart,
      lineEnd: options.lineEnd,
      beforeText: options.beforeText ?? '',
      afterText: options.afterText ?? '',
      pmFrom: options.pmFrom,
      pmTo: options.pmTo,
      revision: options.revision ?? 0,
      anchorSessionId,
    }
  }

  const context = resolveLineContext(content, anchorFrom, anchorTo)
  if (!context) return null

  const focusText = options.focusMarkdown ?? context.focusText

  return {
    anchorFrom,
    anchorTo,
    anchorText: displayText,
    text: displayText,
    source,
    anchor: {
      from: anchorFrom,
      to: anchorTo,
      quotedText: displayText,
    },
    ...context,
    focusText,
    pmFrom: options.pmFrom,
    pmTo: options.pmTo,
    revision: options.revision ?? 0,
    anchorSessionId,
  }
}
