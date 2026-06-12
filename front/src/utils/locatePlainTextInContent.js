import { locatePlainRangeInMarkdown } from './markdownPlainAlignment.js'

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} content
 * @param {string} plainText
 * @param {number} [hintFrom=0]
 * @returns {{ anchorFrom: number, anchorTo: number, markdownSlice: string } | null}
 */
export function locatePlainTextInContent(content, plainText, hintFrom = 0) {
  const aligned = locatePlainRangeInMarkdown(content, plainText, hintFrom)
  if (aligned) return aligned

  const trimmed = plainText.trim()
  if (!trimmed) return null

  const candidates = new Set([trimmed])
  const withoutNumber = trimmed.replace(/^\d+\.\s+/, '')
  if (withoutNumber !== trimmed) {
    candidates.add(withoutNumber)
  }

  const sortedCandidates = [...candidates].sort((a, b) => b.length - a.length)

  let bestMatch = null

  for (const needle of sortedCandidates) {
    let searchFrom = 0

    while (searchFrom < content.length) {
      const index = content.indexOf(needle, searchFrom)
      if (index < 0) break

      const match = {
        anchorFrom: index,
        anchorTo: index + needle.length,
        markdownSlice: content.slice(index, index + needle.length),
        needleLength: needle.length,
      }

      const isBetter =
        !bestMatch ||
        needle.length > bestMatch.needleLength ||
        (needle.length === bestMatch.needleLength &&
          Math.abs(match.anchorFrom - hintFrom) < Math.abs(bestMatch.anchorFrom - hintFrom))

      if (isBetter) {
        bestMatch = match
      }

      searchFrom = index + 1
    }
  }

  if (bestMatch) {
    const { needleLength: _needleLength, ...match } = bestMatch
    return match
  }

  const normalizedNeedle = collapseWhitespace(trimmed)
  if (!normalizedNeedle) return null

  const windowSize = Math.max(normalizedNeedle.length * 3, normalizedNeedle.length + 40)
  const searchStart = Math.max(0, hintFrom - windowSize)
  const searchEnd = Math.min(content.length, hintFrom + windowSize)
  const local = content.slice(searchStart, searchEnd)
  const normalizedLocal = collapseWhitespace(local)
  const normalizedIndex = normalizedLocal.indexOf(normalizedNeedle)

  if (normalizedIndex < 0) return null

  const roughStart = searchStart + Math.max(0, normalizedIndex - 8)
  const roughEnd = Math.min(content.length, roughStart + trimmed.length + 32)
  const roughSlice = content.slice(roughStart, roughEnd)
  const exactNeedle = withoutNumber !== trimmed ? withoutNumber : trimmed
  const exactIndex = roughSlice.indexOf(exactNeedle)

  if (exactIndex < 0) return null

  const anchorFrom = roughStart + exactIndex
  return {
    anchorFrom,
    anchorTo: anchorFrom + exactNeedle.length,
    markdownSlice: content.slice(anchorFrom, anchorFrom + exactNeedle.length),
  }
}
