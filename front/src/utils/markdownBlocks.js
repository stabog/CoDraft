function splitContentLines(text) {
  const normalized = (text ?? '').replace(/\r\n/g, '\n')
  if (normalized === '') return []
  return normalized.split('\n')
}

export function isTableRow(line) {
  const trimmed = (line ?? '').trim()
  return trimmed.startsWith('|') && trimmed.includes('|', 1)
}

export function isTableSeparator(line) {
  const trimmed = (line ?? '').trim()
  return /^\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(trimmed)
}

export function getLineKind(line) {
  const trimmed = (line ?? '').trim()
  const heading = trimmed.match(/^(#{1,6})\s/)
  if (heading) return `heading-${heading[1].length}`
  if (/^[-*+]\s/.test(trimmed)) return 'list'
  if (/^\d+\.\s/.test(trimmed)) return 'ordered-list'
  if (/^>\s/.test(trimmed)) return 'blockquote'
  if (trimmed.startsWith('```')) return 'code'
  return 'paragraph'
}

export function isBlockLevelLine(line) {
  return getLineKind(line) !== 'paragraph'
}

export function isTableBlock(text) {
  const lines = splitContentLines(text)
  return lines.length >= 2 && isTableRow(lines[0]) && isTableSeparator(lines[1])
}

export function parseTableRowCells(line) {
  const trimmed = (line ?? '').trim()
  if (!isTableRow(trimmed)) return []

  const inner = trimmed.replace(/^\|/, '').replace(/\|\s*$/, '')
  const cells = []
  let current = ''
  let escaped = false

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]

    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\') {
      current += char
      escaped = true
      continue
    }

    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

export function parseTableBlock(text) {
  const lines = splitContentLines(text)
  if (lines.length < 2) {
    return { header: '', separator: '', bodyRows: [] }
  }

  return {
    header: lines[0],
    separator: lines[1],
    bodyRows: lines.slice(2),
  }
}

export function splitMarkdownIntoBlocks(text) {
  const lines = splitContentLines(text)
  const blocks = []
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    if (lines[index].trim().startsWith('```')) {
      const start = index
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(lines.slice(start, index).join('\n'))
      continue
    }

    if (isTableRow(lines[index]) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const start = index
      index += 2
      while (index < lines.length && isTableRow(lines[index])) {
        index += 1
      }
      blocks.push(lines.slice(start, index).join('\n'))
      continue
    }

    const start = index
    while (index < lines.length) {
      if (!lines[index].trim()) break
      if (lines[index].trim().startsWith('```')) break
      if (isTableRow(lines[index]) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
        break
      }
      index += 1
    }
    blocks.push(lines.slice(start, index).join('\n'))
  }

  return blocks
}
