const ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_TABLE_PASTE_DEBUG === 'true'

let lastPasteAt = 0

export function markTablePaste() {
  lastPasteAt = performance.now()
}

export function shouldReportTablePasteMarkdown() {
  return ENABLED && performance.now() - lastPasteAt < 800
}

/**
 * @param {string} stage
 * @param {Record<string, unknown>} data
 */
export function reportTablePaste(stage, data = {}) {
  if (!ENABLED) return
  console.log(`[codraft:table-paste] paste:report:${stage}`, data)
}
