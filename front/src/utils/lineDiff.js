import { diffArrays } from 'diff'
import {
  getLineKind,
  isBlockLevelLine,
  isTableBlock,
  splitMarkdownIntoBlocks,
} from './markdownBlocks'
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

function pairReplacedLines(removedLines, addedLines) {
  const rows = []
  const maxLen = Math.max(removedLines.length, addedLines.length)

  for (let index = 0; index < maxLen; index += 1) {
    const leftLine = removedLines[index]
    const rightLine = addedLines[index]

    if (leftLine === undefined) {
      rows.push(makeAddedRow(rightLine))
      continue
    }

    if (rightLine === undefined) {
      rows.push(makeRemovedRow(leftLine))
      continue
    }

    if (wordSimilarity(leftLine, rightLine) > WORD_SIMILARITY_THRESHOLD) {
      rows.push(makeModifiedLineRow(leftLine, rightLine))
    } else {
      rows.push(makeRemovedRow(leftLine))
      rows.push(makeAddedRow(rightLine))
    }
  }

  return rows
}

function pairReplacedBlocks(removedBlocks, addedBlocks) {
  const rows = []
  const maxLen = Math.max(removedBlocks.length, addedBlocks.length)

  for (let index = 0; index < maxLen; index += 1) {
    const leftBlock = removedBlocks[index]
    const rightBlock = addedBlocks[index]

    if (leftBlock === undefined) {
      rows.push(makeAddedRow(rightBlock))
      continue
    }

    if (rightBlock === undefined) {
      rows.push(makeRemovedRow(leftBlock))
      continue
    }

    if (isTableBlock(leftBlock) && isTableBlock(rightBlock)) {
      rows.push(makeModifiedTableBlockRow(leftBlock, rightBlock))
      continue
    }

    if (wordSimilarity(leftBlock, rightBlock) > WORD_SIMILARITY_THRESHOLD) {
      rows.push(...pairReplacedLines(splitContentLines(leftBlock), splitContentLines(rightBlock)))
    } else {
      rows.push(makeRemovedRow(leftBlock))
      rows.push(makeAddedRow(rightBlock))
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

/**
 * Выравнивает две версии по markdown-блокам; таблицы и абзацы не рвутся построчно.
 */
export function buildAlignedDiffRows(leftText, rightText) {
  const parts = diffArrays(splitMarkdownIntoBlocks(leftText), splitMarkdownIntoBlocks(rightText))
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
