const BLOCK_SELECTORS = ':scope > p, :scope > div'

/**
 * В <td>/<th> склеивает несколько блочных потомков в один поток с <br>.
 *
 * @param {string} html
 * @returns {string}
 */
export function normalizePastedTableHtml(html) {
  if (!html?.trim()) return html ?? ''

  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('td, th').forEach((cell) => flattenTableCellElement(cell))
  return doc.body.innerHTML
}

/**
 * @param {HTMLElement} cell
 */
function flattenTableCellElement(cell) {
  const blocks = [...cell.querySelectorAll(BLOCK_SELECTORS)]
  if (blocks.length <= 1) return

  const parts = []
  blocks.forEach((block, index) => {
    const text = block.innerHTML.trim()
    if (!text) return
    if (index > 0 && parts.length > 0) parts.push('<br>')
    parts.push(text)
  })

  if (!parts.length) {
    cell.innerHTML = ''
    return
  }

  cell.innerHTML = parts.join('')
}

/**
 * @param {string} html
 * @returns {{ colCount: number | null, multiParagraphCells: number }}
 */
export function analyzePastedTableHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return { colCount: null, multiParagraphCells: 0 }

  const firstRow = table.querySelector('tr')
  const colCount = firstRow ? firstRow.querySelectorAll('td, th').length : null
  let multiParagraphCells = 0

  table.querySelectorAll('td, th').forEach((cell) => {
    const blocks = cell.querySelectorAll(BLOCK_SELECTORS)
    if (blocks.length > 1) multiParagraphCells += 1
  })

  return { colCount, multiParagraphCells }
}
