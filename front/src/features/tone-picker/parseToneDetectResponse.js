import { cloneDefaultToneAxes } from './toneAxes.js'

const AXIS_KEYS = ['formal', 'positive', 'simple']

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function clampToneValue(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(10, Math.round(num)))
}

/**
 * @param {string} raw
 * @returns {{ formal: number, positive: number, simple: number } | null}
 */
export function parseToneDetectValues(raw) {
  if (!raw) return null

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const formal = clampToneValue(parsed?.formal)
    const positive = clampToneValue(parsed?.positive)
    const simple = clampToneValue(parsed?.simple)

    if (formal == null || positive == null || simple == null) return null

    return { formal, positive, simple }
  } catch {
    if (typeof raw !== 'string') return null

    const formal = clampToneValue(raw.match(/"formal"\s*:\s*(-?\d+)/)?.[1])
    const positive = clampToneValue(raw.match(/"positive"\s*:\s*(-?\d+)/)?.[1])
    const simple = clampToneValue(raw.match(/"simple"\s*:\s*(-?\d+)/)?.[1])

    if (formal == null || positive == null || simple == null) return null

    return { formal, positive, simple }
  }
}

/**
 * @param {string} raw
 * @returns {import('./toneAxes.js').ToneAxis[] | null}
 */
export function parseToneDetectResponse(raw) {
  const values = parseToneDetectValues(raw)
  if (!values) return null

  return cloneDefaultToneAxes().map((axis, index) => ({
    ...axis,
    value: values[AXIS_KEYS[index]],
  }))
}
