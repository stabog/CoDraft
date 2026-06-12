/**
 * @param {string} content
 * @param {number} from
 * @param {number} to
 * @param {string} replacement
 * @returns {string}
 */
export function applyRangeReplacement(content, from, to, replacement) {
  if (from < 0 || to < from || to > content.length) {
    throw new Error('Invalid text range')
  }

  return content.slice(0, from) + replacement + content.slice(to)
}
