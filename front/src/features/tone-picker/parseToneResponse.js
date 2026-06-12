/**
 * @param {string} raw
 * @returns {string | null}
 */
export function parseToneResponse(raw) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.context === 'string' && parsed.context.length >= 0) {
      return parsed.context
    }
    if (typeof parsed?.sentence === 'string' && parsed.sentence.trim()) {
      return parsed.sentence.trim()
    }
  } catch {
    const contextMatch = raw.match(/"context"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (contextMatch?.[1]) {
      try {
        return JSON.parse(`"${contextMatch[1]}"`)
      } catch {
        return contextMatch[1]
      }
    }

    const sentenceMatch = raw.match(/"sentence"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (sentenceMatch?.[1]) {
      try {
        return JSON.parse(`"${sentenceMatch[1]}"`)
      } catch {
        return sentenceMatch[1]
      }
    }
  }

  return null
}
