import { Plugin } from '@milkdown/prose/state'
import { Fragment, Slice } from '@milkdown/prose/model'
import {
  analyzePastedTableHtml,
  normalizePastedTableHtml,
} from './normalizePastedTableHtml.js'
import { markTablePaste, reportTablePaste } from './tablePasteDebug.js'

const TABLE_CELL_TYPES = new Set(['table_cell', 'table_header'])

/**
 * @param {import('@milkdown/prose/model').Node} cell
 * @param {import('@milkdown/prose/model').Schema} schema
 */
function flattenTableCell(cell, schema) {
  const paragraphs = []
  let onlyParagraphs = true

  cell.forEach((child) => {
    if (child.type.name === 'paragraph') paragraphs.push(child)
    else onlyParagraphs = false
  })

  if (!onlyParagraphs || paragraphs.length <= 1) return cell

  const inline = []
  const hardbreak = schema.nodes.hardbreak
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) {
      if (hardbreak) inline.push(hardbreak.create())
      else inline.push(schema.text('\n'))
    }
    paragraph.forEach((child) => inline.push(child))
  })

  const merged = schema.nodes.paragraph.create(null, Fragment.from(inline))
  return cell.copy(Fragment.from([merged]))
}

/**
 * @param {import('@milkdown/prose/model').Node} table
 * @param {import('@milkdown/prose/model').Schema} schema
 */
function flattenTableNode(table, schema) {
  const rows = []
  table.forEach((row) => {
    const cells = []
    row.forEach((cell) => {
      cells.push(TABLE_CELL_TYPES.has(cell.type.name) ? flattenTableCell(cell, schema) : cell)
    })
    rows.push(row.copy(Fragment.from(cells)))
  })
  return table.copy(Fragment.from(rows))
}

/**
 * @param {Fragment} fragment
 * @param {import('@milkdown/prose/model').Schema} schema
 */
function flattenFragment(fragment, schema) {
  const nodes = []
  fragment.forEach((node) => {
    if (node.type.name === 'table') nodes.push(flattenTableNode(node, schema))
    else if (node.content.size) nodes.push(node.copy(flattenFragment(node.content, schema)))
    else nodes.push(node)
  })
  return Fragment.from(nodes)
}

/**
 * @param {Slice} slice
 * @param {import('@milkdown/prose/model').Schema} schema
 */
export function flattenTableCellsInSlice(slice, schema) {
  return new Slice(flattenFragment(slice.content, schema), slice.openStart, slice.openEnd)
}

/**
 * @param {Slice} slice
 * @returns {{ colCount: number | null, paragraphCounts: number[] }}
 */
export function analyzeTableSlice(slice) {
  let colCount = null
  /** @type {number[]} */
  const paragraphCounts = []

  slice.content.descendants((node) => {
    if (node.type.name === 'table_row' && colCount == null) {
      let cells = 0
      node.forEach(() => {
        cells += 1
      })
      colCount = cells
    }
    if (TABLE_CELL_TYPES.has(node.type.name)) {
      let count = 0
      node.forEach((child) => {
        if (child.type.name === 'paragraph') count += 1
      })
      paragraphCounts.push(count)
    }
  })

  return { colCount, paragraphCounts }
}

export function createTablePastePlugin() {
  return new Plugin({
    props: {
      handleDOMEvents: {
        paste: () => {
          markTablePaste()
          return false
        },
      },
      transformPastedHTML(html) {
        const normalized = normalizePastedTableHtml(html)
        reportTablePaste('html', analyzePastedTableHtml(normalized))
        return normalized
      },
      transformPasted(slice, view) {
        const flattened = flattenTableCellsInSlice(slice, view.state.schema)
        reportTablePaste('pm', analyzeTableSlice(flattened))
        return flattened
      },
    },
  })
}
