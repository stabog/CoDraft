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

    if (match.markdownSlice.trim() === trimmed) {
      return match
    }

    const expanded = expandMatchToPlainText(content, match.anchorFrom, trimmed)
    return expanded ?? match
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

/**
 * @param {string} content
 * @param {number} startIndex
 * @param {string} plainText
 * @returns {{ anchorFrom: number, anchorTo: number, markdownSlice: string } | null}
 */
function expandMatchToPlainText(content, startIndex, plainText) {
  const lines = plainText.split('\n').map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return null

  let cursor = startIndex
  let matched = 0

  for (const line of lines) {
    const index = content.indexOf(line, cursor)
    if (index < 0) return null
    if (matched === 0) cursor = index
    matched += 1
    cursor = index + line.length
  }

  const anchorFrom = content.indexOf(lines[0], startIndex)
  if (anchorFrom < 0) return null

  const lastLine = lines[lines.length - 1]
  const lastIndex = content.indexOf(lastLine, anchorFrom)
  if (lastIndex < 0) return null

  const anchorTo = lastIndex + lastLine.length
  return {
    anchorFrom,
    anchorTo,
    markdownSlice: content.slice(anchorFrom, anchorTo),
  }
}
