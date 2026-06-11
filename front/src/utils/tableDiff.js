import { diffArrays } from 'diff'
import { parseTableBlock, parseTableRowCells } from './markdownBlocks'
import { renderMarkdownInline, renderMarkdownSegment } from './markdownRender'
import { buildWordChangeSegments } from './wordDiff'

function rowKey(cells) {
  return (cells[0] ?? '').replace(/^`+|`+$/g, '').trim()
}

function parseBodyRowEntries(bodyRows) {
  return bodyRows.map((line) => {
    const cells = parseTableRowCells(line)
    return { line, cells, key: rowKey(cells) }
  })
}

/**
 * Выравнивает строки таблицы по ключу первой колонки (обычно имя метода).
 */
function alignTableRowsByKey(leftRows, rightRows) {
  const leftEntries = parseBodyRowEntries(leftRows)
  const rightEntries = parseBodyRowEntries(rightRows)
  const parts = diffArrays(
    leftEntries.map((entry) => entry.key),
    rightEntries.map((entry) => entry.key),
  )

  const aligned = []
  let leftIndex = 0
  let rightIndex = 0

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex]
    const next = parts[partIndex + 1]

    if (!part.removed && !part.added) {
      for (let index = 0; index < part.count; index += 1) {
        aligned.push({
          type: 'matched',
          leftEntry: leftEntries[leftIndex],
          rightEntry: rightEntries[rightIndex],
        })
        leftIndex += 1
        rightIndex += 1
      }
      continue
    }

    if (part.removed && next?.added) {
      const pairCount = Math.max(part.count, next.count)

      for (let index = 0; index < pairCount; index += 1) {
        const leftEntry = index < part.count ? leftEntries[leftIndex++] : undefined
        const rightEntry = index < next.count ? rightEntries[rightIndex++] : undefined

        if (leftEntry && rightEntry) {
          aligned.push({ type: 'matched', leftEntry, rightEntry })
        } else if (leftEntry) {
          aligned.push({ type: 'removed', leftEntry })
        } else if (rightEntry) {
          aligned.push({ type: 'added', rightEntry })
        }
      }

      partIndex += 1
      continue
    }

    if (part.removed) {
      for (let index = 0; index < part.count; index += 1) {
        aligned.push({ type: 'removed', leftEntry: leftEntries[leftIndex] })
        leftIndex += 1
      }
      continue
    }

    if (part.added) {
      for (let index = 0; index < part.count; index += 1) {
        aligned.push({ type: 'added', rightEntry: rightEntries[rightIndex] })
        rightIndex += 1
      }
    }
  }

  return aligned
}

function wrapHighlightedInline(html, className) {
  return `<span class="${className} diff-highlight">${html}</span>`
}

function renderCellWordDiff(leftCell, rightCell, side) {
  const segments = buildWordChangeSegments(leftCell, rightCell)
  const chunks = []

  for (const segment of segments) {
    if (segment.type === 'unchanged') {
      chunks.push(renderMarkdownInline(segment.text))
      continue
    }

    const content = side === 'left' ? segment.removed : segment.added
    if (!content) continue

    const className = side === 'left' ? 'diff-word-removed' : 'diff-word-added'
    chunks.push(wrapHighlightedInline(renderMarkdownSegment(content), className))
  }

  return chunks.join(' ') || '&nbsp;'
}

function renderComparedCell(leftCell, rightCell, side, tag = 'td') {
  if (leftCell === rightCell) {
    return `<${tag}>${renderMarkdownInline(leftCell)}</${tag}>`
  }

  return `<${tag} class="diff-cell-changed">${renderCellWordDiff(leftCell, rightCell, side)}</${tag}>`
}

function renderFullCell(cell, className, tag = 'td') {
  const classAttr = className ? ` class="${className}"` : ''
  return `<${tag}${classAttr}>${renderMarkdownInline(cell)}</${tag}>`
}

function renderComparedRow(leftCells, rightCells, side) {
  const colCount = Math.max(leftCells.length, rightCells.length, 1)
  const cells = []

  for (let index = 0; index < colCount; index += 1) {
    const leftCell = leftCells[index] ?? ''
    const rightCell = rightCells[index] ?? ''
    cells.push(renderComparedCell(leftCell, rightCell, side))
  }

  return `<tr>${cells.join('')}</tr>`
}

function renderSpacerRow(colCount) {
  const cells = Array.from({ length: colCount }, () => '<td class="diff-table-row-spacer">&nbsp;</td>')
  return `<tr>${cells.join('')}</tr>`
}

function renderRemovedRow(leftCells, side) {
  if (side === 'left') {
    const cells = leftCells.map((cell) => renderFullCell(cell, 'diff-cell-removed'))
    return `<tr>${cells.join('')}</tr>`
  }

  return renderSpacerRow(Math.max(leftCells.length, 1))
}

function renderAddedRow(rightCells, side, colCount) {
  if (side === 'right') {
    const cells = rightCells.map((cell) => renderFullCell(cell, 'diff-cell-added'))
    return `<tr>${cells.join('')}</tr>`
  }

  return renderSpacerRow(colCount)
}

function renderHeaderRow(leftCells, rightCells, side) {
  const colCount = Math.max(leftCells.length, rightCells.length, 1)
  const cells = []

  for (let index = 0; index < colCount; index += 1) {
    const leftCell = leftCells[index] ?? ''
    const rightCell = rightCells[index] ?? ''
    cells.push(renderComparedCell(leftCell, rightCell, side, 'th'))
  }

  return `<thead><tr>${cells.join('')}</tr></thead>`
}

function renderAlignedTableRow(row, side, colCount) {
  if (row.type === 'matched') {
    return renderComparedRow(row.leftEntry.cells, row.rightEntry.cells, side)
  }

  if (row.type === 'removed') {
    return renderRemovedRow(row.leftEntry.cells, side)
  }

  return renderAddedRow(row.rightEntry.cells, side, colCount)
}

export function renderTableDiffHtml(leftBlock, rightBlock, side) {
  const left = parseTableBlock(leftBlock)
  const right = parseTableBlock(rightBlock)
  const leftHeaderCells = parseTableRowCells(left.header)
  const rightHeaderCells = parseTableRowCells(right.header)
  const colCount = Math.max(leftHeaderCells.length, rightHeaderCells.length, 1)
  const alignedRows = alignTableRowsByKey(left.bodyRows, right.bodyRows)

  const thead = renderHeaderRow(leftHeaderCells, rightHeaderCells, side)
  const tbody = alignedRows.map((row) => renderAlignedTableRow(row, side, colCount)).join('')

  return `<table class="diff-table">${thead}<tbody>${tbody}</tbody></table>`
}
