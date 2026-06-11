import { diffArrays } from 'diff'
import {
  getLineKind,
  isBlockLevelLine,
  isTableBlock,
  normalizeBlocksForDiff,
  splitMarkdownIntoBlocks,
} from './markdownBlocks'
import { normalizeMarkdownForDiff } from './markdownLineBreaks'
import { renderMarkdownBlock, renderMarkdownSegment } from './markdownRender'
import { renderTableDiffHtml } from './tableDiff'
import {
  buildWordChangeSegments,
  wordSimilarity,
  WORD_SIMILARITY_THRESHOLD,
} from './wordDiff'

export { WORD_SIMILARITY_THRESHOLD, wordSimilarity, buildWordChangeSegments }

export function splitContentLines(text) {
  const normalized = (text ?? '').replace(/\r\n/g, '\n')
  if (normalized === '') return []
  return normalized.split('\n')
}

function wrapHighlightedSegment(html, className) {
  return `<span class="${className} diff-highlight">${html}</span>`
}

function buildSegmentDiffHtml(leftLine, rightLine, side) {
  const segments = buildWordChangeSegments(leftLine, rightLine)
  const chunks = []

  for (const segment of segments) {
    if (segment.type === 'unchanged') {
      chunks.push(renderMarkdownSegment(segment.text))
      continue
    }

    const content = side === 'left' ? segment.removed : segment.added
    if (!content) continue

    const className = side === 'left' ? 'diff-word-removed' : 'diff-word-added'
    chunks.push(wrapHighlightedSegment(renderMarkdownSegment(content), className))
  }

  if (!chunks.length) {
    return '<p class="diff-empty-line">&nbsp;</p>'
  }

  return `<div class="diff-segment-line">${chunks.join(' ')}</div>`
}

function renderStructuralLineSide(leftLine, rightLine, side) {
  const line = side === 'left' ? leftLine : rightLine
  const html = renderMarkdownBlock(line)

  if (leftLine === rightLine) return html

  const className = side === 'left' ? 'diff-line-removed' : 'diff-line-added'
  return `<div class="${className}">${html}</div>`
}

function makeStructuralLineRow(leftLine, rightLine) {
  return {
    left: { type: 'modified', html: renderStructuralLineSide(leftLine, rightLine, 'left') },
    right: { type: 'modified', html: renderStructuralLineSide(leftLine, rightLine, 'right') },
  }
}

function shouldUseStructuralLineDiff(leftLine, rightLine) {
  if (getLineKind(leftLine) !== getLineKind(rightLine)) return true
  if (isBlockLevelLine(leftLine) || isBlockLevelLine(rightLine)) return true
  return false
}

function makeModifiedLineRow(leftLine, rightLine) {
  if (shouldUseStructuralLineDiff(leftLine, rightLine)) {
    return makeStructuralLineRow(leftLine, rightLine)
  }

  return {
    left: { type: 'modified', html: buildSegmentDiffHtml(leftLine, rightLine, 'left') },
    right: { type: 'modified', html: buildSegmentDiffHtml(leftLine, rightLine, 'right') },
  }
}

function makeModifiedTableBlockRow(leftBlock, rightBlock) {
  return {
    left: {
      type: 'modified',
      html: renderTableDiffHtml(leftBlock, rightBlock, 'left'),
    },
    right: {
      type: 'modified',
      html: renderTableDiffHtml(leftBlock, rightBlock, 'right'),
    },
  }
}

function makeRemovedRow(text) {
  return {
    left: { type: 'removed', text },
    right: { type: 'placeholder' },
  }
}

function makeAddedRow(text) {
  return {
    left: { type: 'placeholder' },
    right: { type: 'added', text },
  }
}

function makeUnchangedRow(text) {
  return {
    left: { type: 'unchanged', text },
    right: { type: 'unchanged', text },
  }
}

function pairTwoLines(leftLine, rightLine) {
  if (leftLine === rightLine) {
    return makeUnchangedRow(leftLine)
  }

  if (wordSimilarity(leftLine, rightLine) > WORD_SIMILARITY_THRESHOLD) {
    return makeModifiedLineRow(leftLine, rightLine)
  }

  return [makeRemovedRow(leftLine), makeAddedRow(rightLine)]
}

function pairReplacedLines(removedLines, addedLines) {
  const parts = diffArrays(removedLines, addedLines)
  const rows = []

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex]
    const next = parts[partIndex + 1]

    if (!part.removed && !part.added) {
      for (const line of part.value) {
        rows.push(makeUnchangedRow(line))
      }
      continue
    }

    if (part.removed && next?.added) {
      const pairCount = Math.max(part.count, next.count)

      for (let index = 0; index < pairCount; index += 1) {
        const leftLine = part.value[index]
        const rightLine = next.value[index]

        if (leftLine === undefined) {
          rows.push(makeAddedRow(rightLine))
          continue
        }

        if (rightLine === undefined) {
          rows.push(makeRemovedRow(leftLine))
          continue
        }

        const paired = pairTwoLines(leftLine, rightLine)
        if (Array.isArray(paired)) {
          rows.push(...paired)
        } else {
          rows.push(paired)
        }
      }

      partIndex += 1
      continue
    }

    if (part.removed) {
      for (const line of part.value) {
        rows.push(makeRemovedRow(line))
      }
      continue
    }

    if (part.added) {
      for (const line of part.value) {
        rows.push(makeAddedRow(line))
      }
    }
  }

  return rows
}

function pairTwoBlocks(leftBlock, rightBlock) {
  if (leftBlock === rightBlock) {
    return [makeUnchangedRow(leftBlock)]
  }

  if (isTableBlock(leftBlock) && isTableBlock(rightBlock)) {
    return [makeModifiedTableBlockRow(leftBlock, rightBlock)]
  }

  if (wordSimilarity(leftBlock, rightBlock) > WORD_SIMILARITY_THRESHOLD) {
    return pairReplacedLines(splitContentLines(leftBlock), splitContentLines(rightBlock))
  }

  return [makeRemovedRow(leftBlock), makeAddedRow(rightBlock)]
}

function pairReplacedBlocks(removedBlocks, addedBlocks) {
  const parts = diffArrays(removedBlocks, addedBlocks)
  const rows = []

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex]
    const next = parts[partIndex + 1]

    if (!part.removed && !part.added) {
      for (const block of part.value) {
        rows.push(makeUnchangedRow(block))
      }
      continue
    }

    if (part.removed && next?.added) {
      const pairCount = Math.max(part.count, next.count)

      for (let index = 0; index < pairCount; index += 1) {
        const leftBlock = part.value[index]
        const rightBlock = next.value[index]

        if (leftBlock === undefined) {
          rows.push(makeAddedRow(rightBlock))
          continue
        }

        if (rightBlock === undefined) {
          rows.push(makeRemovedRow(leftBlock))
          continue
        }

        rows.push(...pairTwoBlocks(leftBlock, rightBlock))
      }

      partIndex += 1
      continue
    }

    if (part.removed) {
      for (const block of part.value) {
        rows.push(makeRemovedRow(block))
      }
      continue
    }

    if (part.added) {
      for (const block of part.value) {
        rows.push(makeAddedRow(block))
      }
    }
  }

  return rows
}

function pushSinglePartRows(rows, part) {
  for (const block of part.value) {
    if (part.added) {
      rows.push(makeAddedRow(block))
    } else if (part.removed) {
      rows.push(makeRemovedRow(block))
    } else {
      rows.push(makeUnchangedRow(block))
    }
  }
}

function splitBlocksForDiff(text) {
  return normalizeBlocksForDiff(
    splitMarkdownIntoBlocks(normalizeMarkdownForDiff(text)),
  )
}

/**
 * Выравнивает две версии по markdown-блокам; таблицы и абзацы не рвутся построчно.
 */
export function buildAlignedDiffRows(leftText, rightText) {
  const parts = diffArrays(splitBlocksForDiff(leftText), splitBlocksForDiff(rightText))
  const rows = []

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    const next = parts[index + 1]

    if (part.removed && next?.added) {
      rows.push(...pairReplacedBlocks(part.value, next.value))
      index += 1
      continue
    }

    pushSinglePartRows(rows, part)
  }

  return rows
}
