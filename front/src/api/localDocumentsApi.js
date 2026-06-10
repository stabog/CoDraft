import { apiError } from './apiError'
import { mergeDemoIntoState } from '../mocks/demoDecisionsDocument'

const STORAGE_KEY = 'codraft.state.v3'
const LEGACY_V2_KEY = 'codraft.state.v2'
const LEGACY_KEY = 'codraft.documents.v1'

const now = () => new Date().toISOString()
const clone = (value) => JSON.parse(JSON.stringify(value))
const makeId = () => crypto.randomUUID()

function userRef(actor) {
  return { id: actor.id, name: actor.name }
}

function emptyState() {
  return { documents: [], versions: [], edits: [], comments: [], actorDrafts: [] }
}

function normalizeState(state) {
  let changed = false

  if (!state.actorDrafts) {
    state.actorDrafts = []
    changed = true
  }

  for (const document of state.documents || []) {
    if (!document.currentActorId) {
      document.currentActorId = document.ownerId
      changed = true
    }
    if (!document.asyncWorkflow || document.asyncWorkflow === 'owner_hub') {
      document.asyncWorkflow = 'handoff'
      changed = true
    }
  }

  return { state, changed }
}

function isHandoffWorkflow(document) {
  return document.asyncWorkflow === 'handoff'
}

function isCurrentActor(document, actor) {
  return document.currentActorId === actor.id
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
      asyncWorkflow: 'handoff',
      headVersionId: versionId,
      currentActorId: actor.id,
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
  let state

  let normalizedChanged = false

  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = normalizeState(JSON.parse(raw))
      state = parsed.state
      normalizedChanged = parsed.changed
    } catch {
      state = emptyState()
    }
  } else {
    const legacyV2 = localStorage.getItem(LEGACY_V2_KEY)
    if (legacyV2) {
      try {
        const parsed = normalizeState(JSON.parse(legacyV2))
        state = parsed.state
        normalizedChanged = true
      } catch {
        state = emptyState()
      }
    } else {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        try {
          const parsed = normalizeState(migrateLegacy(JSON.parse(legacy)))
          state = parsed.state
          normalizedChanged = true
        } catch {
          state = emptyState()
        }
      } else {
        state = emptyState()
      }
    }
  }

  const { state: nextState, changed: demoChanged } = mergeDemoIntoState(state)
  if (normalizedChanged || demoChanged) {
    writeState(nextState)
  }

  return nextState
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

  if (isHandoffWorkflow(document)) {
    const hasTurn = isCurrentActor(document, actor)
    return {
      canEditDraft: hasTurn,
      canEditActorDraft: !hasTurn,
      canFixVersion: hasTurn,
      canSubmitEdit: !hasTurn,
      canApplyEdit: hasTurn,
      canComment: true,
      canViewReview: true,
      isCurrentActor: hasTurn,
      isOwner,
    }
  }

  return {
    canEditDraft: isOwner,
    canEditActorDraft: !isOwner,
    canFixVersion: isOwner,
    canSubmitEdit: !isOwner,
    canApplyEdit: isOwner,
    canComment: true,
    canViewReview: true,
    isCurrentActor: false,
    isOwner,
  }
}

function findActorDraft(state, documentId, userId) {
  return state.actorDrafts.find((item) => item.documentId === documentId && item.userId === userId)
}

function getActorDraftRecord(state, documentId, userId) {
  const draft = findActorDraft(state, documentId, userId)
  if (!draft) throw apiError('NOT_FOUND', 'Actor draft not found')
  return draft
}

function getOrCreateActorDraft(state, document, actor) {
  const head = getHeadVersion(state, document)
  let actorDraft = findActorDraft(state, document.id, actor.id)

  if (!actorDraft) {
    actorDraft = {
      documentId: document.id,
      userId: actor.id,
      baseVersionId: document.headVersionId,
      title: head.title,
      content: head.content,
      updatedAt: now(),
      needsRebase: false,
    }
    state.actorDrafts.push(actorDraft)
    return actorDraft
  }

  if (actorDraft.baseVersionId !== document.headVersionId && !actorDraft.needsRebase) {
    actorDraft.needsRebase = true
  }

  return actorDraft
}

function markActorDraftsStale(state, document, oldHeadVersionId) {
  for (const actorDraft of state.actorDrafts) {
    if (actorDraft.documentId !== document.id) continue
    if (actorDraft.baseVersionId !== oldHeadVersionId) continue
    actorDraft.needsRebase = true
  }
}

function replaceRangeInContent(content, anchor, suggestedText, baseContent) {
  const { from, to, quotedText } = anchor
  if (content.slice(from, to) === quotedText) {
    return content.slice(0, from) + suggestedText + content.slice(to)
  }

  const index = content.indexOf(quotedText)
  if (index >= 0) {
    return content.slice(0, index) + suggestedText + content.slice(index + quotedText.length)
  }

  if (baseContent.slice(from, to) === quotedText) {
    throw apiError('VALIDATION', 'Anchor no longer matches draft')
  }

  throw apiError('VALIDATION', 'Anchor not found in draft')
}

function toActorDraftDto(actorDraft) {
  return clone({
    baseVersionId: actorDraft.baseVersionId,
    title: actorDraft.title,
    content: actorDraft.content,
    updatedAt: actorDraft.updatedAt,
    needsRebase: Boolean(actorDraft.needsRebase),
  })
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
    currentActorId: document.currentActorId,
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
      asyncWorkflow: 'handoff',
      headVersionId: versionId,
      currentActorId: actor.id,
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

    const head = getHeadVersion(state, document)
    const caps = capabilities(document, actor)
    const actorDraft = caps.canEditDraft ? null : getOrCreateActorDraft(state, document, actor)

    if (actorDraft) {
      writeState(state)
    }

    return clone({
      document: toDocumentDetail(document, state, actor),
      versions,
      edits,
      comments,
      head: {
        id: head.id,
        number: head.number,
        title: head.title,
        content: head.content,
      },
      actorDraft: actorDraft ? toActorDraftDto(actorDraft) : null,
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

  async updateActorDraft(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditActorDraft')

    const actorDraft = getOrCreateActorDraft(state, document, actor)

    if (input.title !== undefined) {
      actorDraft.title = input.title?.trim() || 'Untitled document'
    }
    if (input.content !== undefined) {
      actorDraft.content = input.content
    }
    actorDraft.updatedAt = now()

    writeState(state)
    return toActorDraftDto(actorDraft)
  },

  async rebaseActorDraft(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditActorDraft')

    const head = getHeadVersion(state, document)
    let actorDraft = findActorDraft(state, document.id, actor.id)

    if (!actorDraft) {
      actorDraft = getOrCreateActorDraft(state, document, actor)
    } else {
      actorDraft.baseVersionId = document.headVersionId
      actorDraft.title = head.title
      actorDraft.content = head.content
      actorDraft.needsRebase = false
      actorDraft.updatedAt = now()
    }

    writeState(state)
    return toActorDraftDto(actorDraft)
  },

  async submitActorEdit(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canSubmitEdit')

    const actorDraft = getActorDraftRecord(state, documentId, actor.id)
    const head = getHeadVersion(state, document)

    if (actorDraft.baseVersionId !== document.headVersionId) {
      throw apiError('VALIDATION', 'Draft is outdated; rebase from current version first')
    }

    const summary = input.summary?.trim()
    if (!summary) throw apiError('VALIDATION', 'Summary is required')

    if (actorDraft.title === head.title && actorDraft.content === head.content) {
      throw apiError('VALIDATION', 'No changes to submit')
    }

    const edit = {
      id: makeId(),
      documentId,
      baseVersionId: document.headVersionId,
      author: userRef(actor),
      scope: 'document',
      summary,
      status: 'pending',
      createdAt: now(),
      title: actorDraft.title,
      content: actorDraft.content,
    }

    state.edits.unshift(edit)

    actorDraft.title = head.title
    actorDraft.content = head.content
    actorDraft.needsRebase = false
    actorDraft.updatedAt = now()

    writeState(state)
    return clone(edit)
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
    const oldHeadVersionId = document.headVersionId
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
    markActorDraftsStale(state, document, oldHeadVersionId)

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
      document.draft.content = replaceRangeInContent(
        document.draft.content,
        edit.anchor,
        edit.suggestedText,
        base.content,
      )
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
