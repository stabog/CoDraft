import {
  isTableRow,
  isTableSeparator,
  parseTableRowCells,
} from './markdownBlocks.js'

/**
 * Экранирует неэкранированные | внутри ячейки.
 *
 * @param {string} text
 */
export function escapeTableCellPipes(text) {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '|' && (i === 0 || text[i - 1] !== '\\')) out += '\\|'
    else out += text[i]
  }
  return out
}

/**
 * Переносы внутри ячейки → <br> для канонического markdown.
 *
 * @param {string} cell
 */
export function normalizeTableCellContent(cell) {
  return escapeTableCellPipes(
    cell.replace(/\r\n/g, '\n').replace(/\n+/g, '<br>'),
  )
}

/**
 * @param {string} line
 */
export function normalizeGfmTableRow(line) {
  const cells = parseTableRowCells(line)
  if (!cells.length) return line
  return `| ${cells.map(normalizeTableCellContent).join(' | ')} |`
}

/**
 * Нормализует только содержимое ячеек GFM-таблиц (без склейки строк/столбцов).
 *
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeGfmTableCells(markdown) {
  if (!markdown) return ''

  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      out.push(normalizeGfmTableRow(line))
      out.push(lines[index + 1])
      index += 2
      while (index < lines.length && isTableRow(lines[index])) {
        out.push(normalizeGfmTableRow(lines[index]))
        index += 1
      }
      continue
    }

    out.push(line)
    index += 1
  }

  return out.join('\n')
}

/**
 * @param {string} markdown
 * @returns {{ colCount: number | null, rowCount: number, cellsWithNewlines: number }}
 */
export function analyzeGfmTableMarkdown(markdown) {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  let colCount = null
  let rowCount = 0
  let cellsWithNewlines = 0
  let inTable = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      inTable = true
      colCount = parseTableRowCells(line).length
      rowCount = 1
      index += 1
      continue
    }

    if (inTable && isTableRow(line)) {
      rowCount += 1
      parseTableRowCells(line).forEach((cell) => {
        if (/\n|<br\s*\/?>/i.test(cell)) cellsWithNewlines += 1
      })
      continue
    }

    if (inTable) inTable = false
  }

  return { colCount, rowCount, cellsWithNewlines }
}
