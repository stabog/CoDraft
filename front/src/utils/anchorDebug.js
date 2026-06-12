const ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ANCHOR_DEBUG === 'true'

/**
 * @param {string} step
 * @param {Record<string, unknown>} [data]
 */
export function anchorDebug(step, data = {}) {
  if (!ENABLED) return
  console.log(`[codraft:anchor] ${step}`, data)
}

/**
 * @param {string} step
 * @param {unknown} error
 * @param {Record<string, unknown>} [data]
 */
export function anchorDebugWarn(step, error, data = {}) {
  if (!ENABLED) return
  console.warn(`[codraft:anchor] ${step}`, { ...data, error })
}
