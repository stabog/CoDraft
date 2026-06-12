import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export const anchorHighlightKey = new PluginKey('codraft-anchor-highlight')

const ANCHOR_CLASS = 'codraft-committed-anchor'

/**
 * @param {() => { pmFrom: number, pmTo: number } | null} getPmRange
 * @param {() => void} requestAnchorSync
 */
export function createAnchorHighlightPlugin(getPmRange, requestAnchorSync) {
  return new Plugin({
    key: anchorHighlightKey,
    state: {
      init() {
        return DecorationSet.empty
      },
      apply(tr, decorationSet) {
        const meta = tr.getMeta(anchorHighlightKey)
        if (meta?.refresh) {
          return buildDecorations(tr.doc, getPmRange())
        }

        if (tr.docChanged) {
          requestAnchorSync()
        }

        return decorationSet.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        const set = anchorHighlightKey.getState(state)
        const range = getPmRange()
        if (!range) return DecorationSet.empty
        if (!set || set.find().length === 0) {
          return buildDecorations(state.doc, range)
        }
        return set
      },
    },
  })
}

/**
 * @param {import('@milkdown/prose/model').Node} doc
 * @param {{ pmFrom: number, pmTo: number } | null} range
 */
function buildDecorations(doc, range) {
  if (!range) return DecorationSet.empty

  const from = Math.max(1, Math.min(range.pmFrom, doc.content.size))
  const to = Math.max(from, Math.min(range.pmTo, doc.content.size))
  if (to <= from) return DecorationSet.empty

  return DecorationSet.create(doc, [
    Decoration.inline(from, to, { class: ANCHOR_CLASS }),
  ])
}

/**
 * @param {import('@milkdown/prose/view').EditorView} view
 */
export function refreshAnchorHighlight(view) {
  const tr = view.state.tr.setMeta(anchorHighlightKey, { refresh: true })
  view.dispatch(tr)
}
