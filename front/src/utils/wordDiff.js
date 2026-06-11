import { diffArrays } from 'diff'

export const WORD_SIMILARITY_THRESHOLD = 0.5

function splitWords(line) {
  if (!line) return []
  return line.split(' ').filter((word) => word.length > 0)
}

/** Доля общих слов относительно более длинной строки. */
export function wordSimilarity(left, right) {
  const wordsA = splitWords(left)
  const wordsB = splitWords(right)

  if (!wordsA.length && !wordsB.length) return 1
  if (!wordsA.length || !wordsB.length) return 0

  const setB = new Set(wordsB)
  let common = 0
  for (const word of wordsA) {
    if (setB.has(word)) common += 1
  }

  return common / Math.max(wordsA.length, wordsB.length)
}

function wordsToText(words) {
  return words.join(' ')
}

/**
 * Сегменты строки: неизменённый текст или пара (удалено ↔ добавлено).
 */
export function buildWordChangeSegments(leftLine, rightLine) {
  const parts = diffArrays(splitWords(leftLine), splitWords(rightLine))
  const segments = []

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]

    if (!part.added && !part.removed) {
      const text = wordsToText(part.value)
      if (text) segments.push({ type: 'unchanged', text })
      continue
    }

    let removedWords = []
    let addedWords = []

    if (part.removed) {
      removedWords = [...part.value]
      const next = parts[index + 1]
      if (next?.added) {
        addedWords = [...next.value]
        index += 1
      }
    } else if (part.added) {
      addedWords = [...part.value]
    }

    segments.push({
      type: 'change',
      removed: wordsToText(removedWords),
      added: wordsToText(addedWords),
    })
  }

  return segments
}
