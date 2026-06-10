import { apiError } from './apiError'

const STORAGE_KEY = 'codraft.state.v2'
const LEGACY_KEY = 'codraft.documents.v1'

const now = () => new Date().toISOString()
const clone = (value) => JSON.parse(JSON.stringify(value))
const makeId = () => crypto.randomUUID()

function userRef(actor) {
  return { id: actor.id, name: actor.name }
}

function emptyState() {
  return { documents: [], versions: [], edits: [], comments: [] }
}

function migrateLegacy(raw) {
  const state = emptyState()
  const actor = { id: 'legacy', name: 'System' }

  for (const old of raw.documents || []) {
    const documentId = old.id
    const versionId = makeId()
    const createdAt = old.createdAt || now()
    const author = userRef(actor)
    const title = old.title || 'Untitled document'
    const content = old.content || ''

    state.documents.push({
      id: documentId,
      createdBy: author,
      ownerId: actor.id,
      collaborationMode: 'async',
      asyncWorkflow: 'owner_hub',
      headVersionId: versionId,
      draft: {
        title,
        content,
        updatedAt: old.updatedAt || createdAt,
        updatedBy: author,
      },
      createdAt,
    })

    const oldVersions = (raw.versions || []).filter((item) => item.documentId === documentId)
  const sorted = oldVersions.length
      ? [...oldVersions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      : []

    if (sorted.length) {
      let parentId = null
      sorted.forEach((item, index) => {
        const id = item.id || makeId()
        state.versions.push({
          id,
          documentId,
          parentVersionId: parentId,
          number: index + 1,
          author: { id: item.authorName || actor.id, name: item.authorName || actor.name },
          title: item.title || title,
          content: item.content || content,
          summary: item.summary || `Версия ${index + 1}`,
          incorporatedEditIds: [],
          createdAt: item.createdAt || createdAt,
        })
        parentId = id
      })
      const head = state.versions.filter((v) => v.documentId === documentId).at(-1)
      const doc = state.documents.find((d) => d.id === documentId)
      doc.headVersionId = head.id
    } else {
      state.versions.push({
        id: versionId,
        documentId,
        parentVersionId: null,
        number: 1,
        author,
        title,
        content,
        summary: 'Создание документа',
        incorporatedEditIds: [],
        createdAt,
      })
    }
  }

  for (const old of raw.comments || []) {
    const doc = state.documents.find((d) => d.id === old.documentId)
    if (!doc) continue
    state.comments.push({
      id: old.id || makeId(),
      documentId: old.documentId,
      targetVersionId: doc.headVersionId,
      author: { id: old.authorName || 'guest', name: old.authorName || 'Гость' },
      anchor: {
        from: old.anchorFrom ?? 0,
        to: old.anchorTo ?? 0,
        quotedText: old.anchorText || '',
      },
      body: old.body || '',
      status: old.status === 'resolved' ? 'resolved' : 'open',
      resolution: old.status === 'resolved' ? 'acknowledged' : null,
      replies: (old.replies || []).map((reply) => ({
        id: reply.id || makeId(),
        author: { id: reply.authorName || 'guest', name: reply.authorName || 'Гость' },
        body: reply.body,
        createdAt: reply.createdAt || now(),
      })),
      createdAt: old.createdAt || now(),
      resolvedAt: old.resolvedAt || null,
    })
  }

  return state
}

function readState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      const state = emptyState()
      writeState(state)
      return state
    }
  }

  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy) {
    try {
      const state = migrateLegacy(JSON.parse(legacy))
      writeState(state)
      return state
    } catch {
      /* fall through */
    }
  }

  const state = emptyState()
  writeState(state)
  return state
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function getDocumentRecord(state, documentId) {
  const document = state.documents.find((item) => item.id === documentId)
  if (!document) throw apiError('NOT_FOUND', 'Document not found')
  return document
}

function getVersionRecord(state, documentId, versionId) {
  const version = state.versions.find((item) => item.id === versionId && item.documentId === documentId)
  if (!version) throw apiError('NOT_FOUND', 'Version not found')
  return version
}

function getEditRecord(state, documentId, editId) {
  const edit = state.edits.find((item) => item.id === editId && item.documentId === documentId)
  if (!edit) throw apiError('NOT_FOUND', 'Edit not found')
  return edit
}

function getCommentRecord(state, commentId) {
  const comment = state.comments.find((item) => item.id === commentId)
  if (!comment) throw apiError('NOT_FOUND', 'Comment not found')
  return comment
}

function getHeadVersion(state, document) {
  return getVersionRecord(state, document.id, document.headVersionId)
}

function capabilities(document, actor) {
  const isOwner = document.ownerId === actor.id
  return {
    canEditDraft: isOwner,
    canFixVersion: isOwner,
    canSubmitEdit: !isOwner,
    canApplyEdit: isOwner,
    canComment: true,
  }
}

function asExcerpt(content) {
  return content.replace(/[#>*_`-]/g, '').trim().slice(0, 160)
}

function toSummary(document, state) {
  const head = getHeadVersion(state, document)
  return {
    id: document.id,
    title: document.draft.title,
    excerpt: asExcerpt(document.draft.content),
    ownerId: document.ownerId,
    ownerName: document.createdBy.name,
    headVersionNumber: head.number,
    asyncWorkflow: document.asyncWorkflow,
    updatedAt: document.draft.updatedAt,
    createdAt: document.createdAt,
  }
}

function toDocumentDetail(document, state, actor) {
  const head = getHeadVersion(state, document)
  return {
    id: document.id,
    createdBy: clone(document.createdBy),
    owner: clone(document.createdBy),
    collaborationMode: document.collaborationMode,
    asyncWorkflow: document.asyncWorkflow,
    headVersionId: document.headVersionId,
    headVersionNumber: head.number,
    draft: clone(document.draft),
    capabilities: capabilities(document, actor),
    createdAt: document.createdAt,
  }
}

function assertCapability(document, actor, key) {
  if (!capabilities(document, actor)[key]) {
    throw apiError('FORBIDDEN', 'Action not allowed')
  }
}

function supersedeEditsForHead(state, document, incorporatedEditIds = []) {
  const incorporated = new Set(incorporatedEditIds)
  for (const edit of state.edits) {
    if (edit.documentId !== document.id) continue
    if (edit.baseVersionId !== document.headVersionId) continue
    if (incorporated.has(edit.id)) continue
    if (edit.status === 'pending' || edit.status === 'applied') {
      edit.status = 'superseded'
    }
  }
}

export const localDocumentsApi = {
  async listDocuments() {
    const state = readState()
    return clone(
      state.documents
        .map((document) => toSummary(document, state))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  },

  async createDocument(actor, input = {}) {
    const state = readState()
    const timestamp = now()
    const author = userRef(actor)
    const title = input.title?.trim() || 'Untitled document'
    const content = input.content ?? `# ${title}\n\n`
    const documentId = makeId()
    const versionId = makeId()

    const document = {
      id: documentId,
      createdBy: author,
      ownerId: actor.id,
      collaborationMode: 'async',
      asyncWorkflow: 'owner_hub',
      headVersionId: versionId,
      draft: {
        title,
        content,
        updatedAt: timestamp,
        updatedBy: author,
      },
      createdAt: timestamp,
    }

    const version = {
      id: versionId,
      documentId,
      parentVersionId: null,
      number: 1,
      author,
      title,
      content,
      summary: 'Создание документа',
      incorporatedEditIds: [],
      createdAt: timestamp,
    }

    state.documents.unshift(document)
    state.versions.push(version)
    writeState(state)

    return clone(toDocumentDetail(document, state, actor))
  },

  async getDocument(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    return clone(toDocumentDetail(document, state, actor))
  },

  async getEditorBundle(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    const versions = state.versions
      .filter((item) => item.documentId === documentId)
      .sort((a, b) => b.number - a.number)
    const edits = state.edits
      .filter(
        (item) =>
          item.documentId === documentId &&
          item.baseVersionId === document.headVersionId &&
          item.status === 'pending',
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const comments = state.comments
      .filter((item) => item.documentId === documentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return clone({
      document: toDocumentDetail(document, state, actor),
      versions,
      edits,
      comments,
    })
  },

  async updateDraft(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditDraft')

    if (input.title !== undefined) {
      document.draft.title = input.title?.trim() || 'Untitled document'
    }
    if (input.content !== undefined) {
      document.draft.content = input.content
    }
    document.draft.updatedAt = now()
    document.draft.updatedBy = userRef(actor)

    writeState(state)
    return clone(toDocumentDetail(document, state, actor))
  },

  async listVersions(documentId) {
    const state = readState()
    getDocumentRecord(state, documentId)
    return clone(
      state.versions
        .filter((item) => item.documentId === documentId)
        .sort((a, b) => b.number - a.number),
    )
  },

  async getVersion(documentId, versionId) {
    const state = readState()
    return clone(getVersionRecord(state, documentId, versionId))
  },

  async fixVersion(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canFixVersion')

    const summary = input.summary?.trim()
    if (!summary) throw apiError('VALIDATION', 'Summary is required')

    const head = getHeadVersion(state, document)
    const incorporatedEditIds = input.incorporatedEditIds || []
    const versionId = makeId()
    const timestamp = now()

    const version = {
      id: versionId,
      documentId,
      parentVersionId: head.id,
      number: head.number + 1,
      author: userRef(actor),
      title: document.draft.title,
      content: document.draft.content,
      summary,
      incorporatedEditIds: [...incorporatedEditIds],
      createdAt: timestamp,
    }

    state.versions.push(version)
    document.headVersionId = versionId
    supersedeEditsForHead(state, document, incorporatedEditIds)

    writeState(state)
    return clone({
      version,
      document: toDocumentDetail(document, state, actor),
    })
  },

  async restoreVersionToDraft(documentId, versionId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditDraft')
    const version = getVersionRecord(state, documentId, versionId)

    document.draft.title = version.title
    document.draft.content = version.content
    document.draft.updatedAt = now()
    document.draft.updatedBy = userRef(actor)

    writeState(state)
    return clone(toDocumentDetail(document, state, actor))
  },

  async listEdits(documentId, actor, filter = {}) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    let items = state.edits.filter((item) => item.documentId === documentId)
    if (filter.baseVersionId) {
      items = items.filter((item) => item.baseVersionId === filter.baseVersionId)
    } else if (filter.status === 'pending') {
      items = items.filter((item) => item.baseVersionId === document.headVersionId)
    }
    if (filter.status) {
      items = items.filter((item) => item.status === filter.status)
    }
    return clone(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  },

  async submitEdit(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canSubmitEdit')

    getVersionRecord(state, documentId, input.baseVersionId)

    const summary = input.summary?.trim()
    if (!summary) throw apiError('VALIDATION', 'Summary is required')

    if (input.scope === 'document') {
      if (!input.content?.trim()) throw apiError('VALIDATION', 'Content is required for document edit')
    } else if (input.scope === 'range') {
      if (!input.anchor?.quotedText?.trim()) throw apiError('VALIDATION', 'Anchor is required for range edit')
      if (input.suggestedText === undefined) throw apiError('VALIDATION', 'Suggested text is required')
    } else {
      throw apiError('VALIDATION', 'Invalid edit scope')
    }

    const edit = {
      id: makeId(),
      documentId,
      baseVersionId: input.baseVersionId,
      author: userRef(actor),
      scope: input.scope,
      summary,
      status: 'pending',
      createdAt: now(),
    }

    if (input.scope === 'document') {
      edit.title = input.title?.trim() || document.draft.title
      edit.content = input.content
    } else {
      edit.anchor = clone(input.anchor)
      edit.suggestedText = input.suggestedText
    }

    state.edits.unshift(edit)
    writeState(state)
    return clone(edit)
  },

  async applyEdit(documentId, editId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canApplyEdit')
    const edit = getEditRecord(state, documentId, editId)

    if (edit.status !== 'pending') throw apiError('VALIDATION', 'Edit is not pending')

    if (edit.scope === 'document') {
      document.draft.title = edit.title
      document.draft.content = edit.content
    } else {
      const base = getVersionRecord(state, documentId, edit.baseVersionId)
      const { from, to, quotedText } = edit.anchor
      const slice = document.draft.content.slice(from, to)
      if (slice !== quotedText && base.content.slice(from, to) !== quotedText) {
        throw apiError('VALIDATION', 'Anchor no longer matches draft')
      }
      document.draft.content =
        document.draft.content.slice(0, from) + edit.suggestedText + document.draft.content.slice(to)
    }

    document.draft.updatedAt = now()
    document.draft.updatedBy = userRef(actor)
    edit.status = 'applied'

    writeState(state)
    return clone({
      edit,
      document: toDocumentDetail(document, state, actor),
    })
  },

  async rejectEdit(documentId, editId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canApplyEdit')
    const edit = getEditRecord(state, documentId, editId)

    if (edit.status !== 'pending') throw apiError('VALIDATION', 'Edit is not pending')

    edit.status = 'rejected'
    writeState(state)
    return clone(edit)
  },

  async withdrawEdit(documentId, editId, actor) {
    const state = readState()
    getDocumentRecord(state, documentId)
    const edit = getEditRecord(state, documentId, editId)

    if (edit.author.id !== actor.id) throw apiError('FORBIDDEN', 'Only author can withdraw')
    if (edit.status !== 'pending') throw apiError('VALIDATION', 'Edit is not pending')

    edit.status = 'rejected'
    writeState(state)
    return clone(edit)
  },

  async listComments(documentId, actor, filter = {}) {
    const state = readState()
    getDocumentRecord(state, documentId)
    let items = state.comments.filter((item) => item.documentId === documentId)
    if (filter.targetVersionId) {
      items = items.filter((item) => item.targetVersionId === filter.targetVersionId)
    }
    return clone(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  },

  async addComment(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canComment')
    getVersionRecord(state, documentId, input.targetVersionId)

    const comment = {
      id: makeId(),
      documentId,
      targetVersionId: input.targetVersionId,
      author: userRef(actor),
      anchor: clone(input.anchor),
      body: input.body,
      status: 'open',
      resolution: null,
      replies: [],
      createdAt: now(),
      resolvedAt: null,
    }

    state.comments.unshift(comment)
    writeState(state)
    return clone(comment)
  },

  async addCommentReply(commentId, actor, input) {
    const state = readState()
    const comment = getCommentRecord(state, commentId)

    comment.replies.push({
      id: makeId(),
      author: userRef(actor),
      body: input.body,
      createdAt: now(),
    })
    writeState(state)
    return clone(comment)
  },

  async resolveComment(commentId, actor, input) {
    const state = readState()
    const comment = getCommentRecord(state, commentId)
    assertCapability(getDocumentRecord(state, comment.documentId), actor, 'canComment')

    if (!['acknowledged', 'rejected'].includes(input.resolution)) {
      throw apiError('VALIDATION', 'Invalid resolution')
    }

    comment.status = 'resolved'
    comment.resolution = input.resolution
    comment.resolvedAt = now()
    writeState(state)
    return clone(comment)
  },

  async reopenComment(commentId, actor) {
    const state = readState()
    const comment = getCommentRecord(state, commentId)
    assertCapability(getDocumentRecord(state, comment.documentId), actor, 'canComment')

    comment.status = 'open'
    comment.resolution = null
    comment.resolvedAt = null
    writeState(state)
    return clone(comment)
  },
}
