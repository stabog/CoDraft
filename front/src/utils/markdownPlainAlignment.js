/**
 * Строит plain-представление markdown и карту смещений plain → markdown.
 * Синтаксис inline (`code`, **bold**, *italic*) в plain не попадает.
 *
 * @param {string} markdown
 * @returns {{ plain: string, plainToMdStart: number[] }}
 */
export function buildPlainMarkdownMap(markdown) {
  const plainToMdStart = []
  let plain = ''
  let i = 0

  const emit = (mdIndex) => {
    plainToMdStart.push(mdIndex)
    plain += markdown[mdIndex]
  }

  while (i < markdown.length) {
    if (markdown.startsWith('**', i)) {
      const close = markdown.indexOf('**', i + 2)
      if (close === -1) {
        emit(i)
        i += 1
        continue
      }
      for (let j = i + 2; j < close; j += 1) {
        emit(j)
      }
      i = close + 2
      continue
    }

    if (markdown[i] === '`') {
      const close = markdown.indexOf('`', i + 1)
      if (close === -1) {
        emit(i)
        i += 1
        continue
      }
      for (let j = i + 1; j < close; j += 1) {
        emit(j)
      }
      i = close + 1
      continue
    }

    if (markdown[i] === '*' || markdown[i] === '_') {
      const marker = markdown[i]
      const close = markdown.indexOf(marker, i + 1)
      if (close === -1) {
        emit(i)
        i += 1
        continue
      }
      for (let j = i + 1; j < close; j += 1) {
        emit(j)
      }
      i = close + 1
      continue
    }

    emit(i)
    i += 1
  }

  return { plain, plainToMdStart }
}

/**
 * @param {number[]} plainToMdStart
 * @param {number} hintMd
 */
function mdHintToPlainHint(plainToMdStart, hintMd) {
  if (!plainToMdStart.length) return 0

  let lo = 0
  let hi = plainToMdStart.length

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (plainToMdStart[mid] < hintMd) lo = mid + 1
    else hi = mid
  }

  return Math.max(0, lo - 1)
}

/**
 * @param {string} markdown
 * @param {number} mdStart
 */
function expandMdStart(markdown, mdStart) {
  let from = mdStart

  while (from > 0) {
    if (markdown[from - 1] === '`') {
      from -= 1
      continue
    }
    if (from >= 2 && markdown.slice(from - 2, from) === '**') {
      from -= 2
      continue
    }
    if (markdown[from - 1] === '*' || markdown[from - 1] === '_') {
      from -= 1
      continue
    }
    break
  }

  return from
}

/**
 * @param {string} markdown
 * @param {number} plainEnd
 * @param {number[]} plainToMdStart
 */
function expandMdEnd(markdown, plainEnd, plainToMdStart) {
  if (plainEnd <= 0) return plainToMdStart[0] ?? 0

  let to = plainToMdStart[plainEnd - 1] + 1

  while (to < markdown.length) {
    if (markdown[to] === '`') {
      return to + 1
    }
    if (markdown.startsWith('**', to)) {
      return to + 2
    }
    if (markdown[to] === '*' || markdown[to] === '_') {
      to += 1
      continue
    }
    break
  }

  return to
}

/**
 * @param {string} markdown
 * @param {string} plainText
 */
export function toComparablePlain(markdown) {
  const { plain } = buildPlainMarkdownMap(markdown)
  return plain.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} content
 * @param {string} plainText
 * @param {number} [hintFrom=0]
 * @returns {{ anchorFrom: number, anchorTo: number, markdownSlice: string } | null}
 */
export function locatePlainRangeInMarkdown(content, plainText, hintFrom = 0) {
  const needle = plainText.trim()
  if (!needle) return null

  const { plain, plainToMdStart } = buildPlainMarkdownMap(content)
  if (!plain) return null

  const hintPlain = mdHintToPlainHint(plainToMdStart, hintFrom)
  let bestStart = -1

  let searchFrom = 0
  while (searchFrom <= plain.length) {
    const index = plain.indexOf(needle, searchFrom)
    if (index < 0) break

    if (
      bestStart < 0 ||
      Math.abs(index - hintPlain) < Math.abs(bestStart - hintPlain)
    ) {
      bestStart = index
    }

    searchFrom = index + 1
  }

  if (bestStart < 0) return null

  const plainEnd = bestStart + needle.length
  const mdStart = plainToMdStart[bestStart]
  const anchorFrom = expandMdStart(content, mdStart)
  const anchorTo = expandMdEnd(content, plainEnd, plainToMdStart)

  if (anchorTo <= anchorFrom) return null

  return {
    anchorFrom,
    anchorTo,
    markdownSlice: content.slice(anchorFrom, anchorTo),
  }
}
