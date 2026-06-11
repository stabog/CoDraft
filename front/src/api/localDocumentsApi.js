import { apiError } from './apiError'
import { DEMO_DOCUMENT_ID, mergeDemoIntoState } from '../mocks/demoDecisionsDocument'
import {
  ROLE_PERSONAL,
  ROLE_SESSION,
  createDraftVersion,
  createPublishedVersion,
  emptyState,
  getCanonicalVersion,
  getPersonalDraft,
  getSessionDraft,
  listPersonalDrafts,
  listPublishedVersions,
  listSubmittedDrafts,
  markDraftsStale,
  migrateV4ToV5,
  promoteDraft,
  syncDocumentFromDraft,
  syncDocumentFromVersion,
  toDraftProjection,
  toPersonalDraftDto,
  toPublishedDto,
  toSubmittedDraftDto,
} from './versionModel'

const STORAGE_KEY = 'codraft.state.v5'
const LEGACY_V4_KEY = 'codraft.state.v4'
const LEGACY_V3_KEY = 'codraft.state.v3'
const LEGACY_V2_KEY = 'codraft.state.v2'
const LEGACY_KEY = 'codraft.documents.v1'
const DEFAULT_WORKFLOW = 'round'

const now = () => new Date().toISOString()
const clone = (value) => JSON.parse(JSON.stringify(value))
const makeId = () => crypto.randomUUID()

function userRef(actor) {
  return { id: actor.id, name: actor.name }
}

function isRoundWorkflow(document) {
  return document.asyncWorkflow === 'round'
}

function isOwnerHubWorkflow(document) {
  return document.asyncWorkflow === 'owner_hub'
}

function isHandoffWorkflow(document) {
  return document.asyncWorkflow === 'handoff'
}

function getActiveEditorUserId(document) {
  const editor = document.activeEditorId
  if (!editor) return null
  return typeof editor === 'string' ? editor : editor.id
}

function documentNeedsOwnerHub(state, document) {
  const canonical = getCanonicalVersion(state, document)
  if (!canonical) return false

  return listPersonalDrafts(state, document.id, { parentVersionId: canonical.id }).some(
    (draft) => draft.submitted,
  )
}

function normalizeDocuments(state) {
  let changed = false

  for (const document of state.documents || []) {
    if (document.id === DEMO_DOCUMENT_ID) {
      if (document.asyncWorkflow !== 'owner_hub') {
        document.asyncWorkflow = 'owner_hub'
        changed = true
      }
    } else if (documentNeedsOwnerHub(state, document)) {
      if (document.asyncWorkflow !== 'owner_hub') {
        document.asyncWorkflow = 'owner_hub'
        changed = true
      }
    } else if (document.asyncWorkflow !== 'round' && document.asyncWorkflow !== 'handoff') {
      document.asyncWorkflow = 'round'
      changed = true
    } else if (document.asyncWorkflow === 'handoff') {
      document.asyncWorkflow = 'round'
      changed = true
    }

    if (isRoundWorkflow(document) && document.activeEditorId === undefined) {
      document.activeEditorId = null
      changed = true
    }
  }

  return changed
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
      asyncWorkflow: DEFAULT_WORKFLOW,
      headVersionId: versionId,
      versionNumber: 1,
      activeEditorId: null,
      title,
      updatedAt: old.updatedAt || createdAt,
      createdAt,
    })

    const oldVersions = (raw.versions || []).filter((item) => item.documentId === documentId)
    const sorted = oldVersions.length
      ? [...oldVersions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      : []

    if (sorted.length) {
      sorted.forEach((item, index) => {
        const id = item.id || makeId()
        state.versions.push(
          createPublishedVersion({
            id,
            documentId,
            author: { id: item.authorName || actor.id, name: item.authorName || actor.name },
            title: item.title || title,
            content: item.content || content,
            versionNumber: index + 1,
            summary: item.summary || `Версия ${index + 1}`,
            createdAt: item.createdAt || createdAt,
          }),
        )
      })
      const head = listPublishedVersions(state, documentId)[0]
      const doc = state.documents.find((item) => item.id === documentId)
      doc.headVersionId = head.id
      doc.versionNumber = head.versionNumber
    } else {
      state.versions.push(
        createPublishedVersion({
          id: versionId,
          documentId,
          author,
          title,
          content,
          versionNumber: 1,
          summary: 'Создание документа',
          createdAt,
        }),
      )
    }
  }

  for (const old of raw.comments || []) {
    const doc = state.documents.find((item) => item.id === old.documentId)
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

  const rawV5 = localStorage.getItem(STORAGE_KEY)
  if (rawV5) {
    try {
      state = JSON.parse(rawV5)
      if (normalizeDocuments(state)) normalizedChanged = true
    } catch {
      state = emptyState()
    }
  } else {
    const rawV4 = localStorage.getItem(LEGACY_V4_KEY)
    if (rawV4) {
      try {
        state = migrateV4ToV5(JSON.parse(rawV4))
        normalizedChanged = true
      } catch {
        state = emptyState()
      }
    } else {
      const legacyV3 = localStorage.getItem(LEGACY_V3_KEY)
      if (legacyV3) {
        try {
          state = migrateV4ToV5(JSON.parse(legacyV3))
          normalizedChanged = true
        } catch {
          state = emptyState()
        }
      } else {
        const legacyV2 = localStorage.getItem(LEGACY_V2_KEY)
        if (legacyV2) {
          try {
            state = migrateV4ToV5(JSON.parse(legacyV2))
            normalizedChanged = true
          } catch {
            state = emptyState()
          }
        } else {
          const legacy = localStorage.getItem(LEGACY_KEY)
          if (legacy) {
            try {
              state = migrateLegacy(JSON.parse(legacy))
              normalizedChanged = true
            } catch {
              state = emptyState()
            }
          } else {
            state = emptyState()
          }
        }
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
  const version = state.versions.find(
    (item) => item.id === versionId && item.documentId === documentId,
  )
  if (!version) throw apiError('NOT_FOUND', 'Version not found')
  return version
}

function getCommentRecord(state, commentId) {
  const comment = state.comments.find((item) => item.id === commentId)
  if (!comment) throw apiError('NOT_FOUND', 'Comment not found')
  return comment
}

function getHeadVersion(state, document) {
  return getCanonicalVersion(state, document)
}

function ensureRoundEditLock(document, actor) {
  const lockUserId = getActiveEditorUserId(document)
  if (lockUserId && lockUserId !== actor.id) {
    throw apiError('CONFLICT', 'Document is being edited by another participant')
  }
  if (!lockUserId) {
    document.activeEditorId = userRef(actor)
  }
}

function getOrCreateSessionDraft(state, document, actor) {
  const head = getHeadVersion(state, document)
  let sessionDraft = getSessionDraft(state, document.id)

  if (!sessionDraft) {
    sessionDraft = createDraftVersion({
      id: makeId(),
      documentId: document.id,
      author: userRef(actor),
      title: head.title,
      content: head.content,
      parentVersionId: head.id,
      draftRole: ROLE_SESSION,
      createdAt: now(),
    })
    state.versions.push(sessionDraft)
  }

  if (sessionDraft.parentVersionId !== head.id && !sessionDraft.needsRebase) {
    sessionDraft.needsRebase = true
  }

  return sessionDraft
}

function getOrCreatePersonalDraft(state, document, actor) {
  const head = getHeadVersion(state, document)
  let personalDraft = getPersonalDraft(state, document.id, actor.id)

  if (!personalDraft) {
    personalDraft = createDraftVersion({
      id: makeId(),
      documentId: document.id,
      author: userRef(actor),
      title: head.title,
      content: head.content,
      parentVersionId: head.id,
      draftRole: ROLE_PERSONAL,
      createdAt: now(),
    })
    state.versions.push(personalDraft)
    return personalDraft
  }

  if (personalDraft.parentVersionId !== head.id && !personalDraft.needsRebase) {
    personalDraft.needsRebase = true
  }

  return personalDraft
}

function getOwnerPersonalDraft(state, document) {
  return getPersonalDraft(state, document.id, document.ownerId)
}

function getOrCreateOwnerPersonalDraft(state, document) {
  const owner = document.createdBy?.id === document.ownerId
    ? document.createdBy
    : { id: document.ownerId, name: document.createdBy?.name ?? 'Owner' }
  return getOrCreatePersonalDraft(state, document, owner)
}

function syncSessionDraftToHead(state, document, actor) {
  const head = getHeadVersion(state, document)
  const sessionDraft = getSessionDraft(state, document.id)
  if (!sessionDraft) return

  sessionDraft.title = head.title
  sessionDraft.content = head.content
  sessionDraft.parentVersionId = head.id
  sessionDraft.needsRebase = false
  sessionDraft.updatedAt = now()
  sessionDraft.author = userRef(actor)
  syncDocumentFromDraft(document, sessionDraft)
}

function getDraftProjection(state, document, actor) {
  if (isOwnerHubWorkflow(document)) {
    if (document.ownerId === actor.id) {
      const ownerDraft = getOrCreateOwnerPersonalDraft(state, document)
      return toDraftProjection(ownerDraft, actor)
    }
    const head = getHeadVersion(state, document)
    return toDraftProjection(head, head.author)
  }

  const sessionDraft = getSessionDraft(state, document.id)
  if (sessionDraft) {
    return toDraftProjection(sessionDraft, sessionDraft.author)
  }

  const head = getHeadVersion(state, document)
  return toDraftProjection(head, head.author)
}

function capabilitiesRound(document, actor) {
  const lockUserId = getActiveEditorUserId(document)
  const hasLock = lockUserId === actor.id
  const lockFree = !lockUserId

  return {
    canEditDraft: lockFree || hasLock,
    canTakeLock: lockFree,
    canEditActorDraft: false,
    canFixVersion: hasLock,
    canSubmitDraft: false,
    canSubmitEdit: false,
    canApplyEdit: false,
    canComment: true,
    canViewReview: false,
    isActiveEditor: hasLock,
    isOwner: document.ownerId === actor.id,
  }
}

function capabilitiesOwnerHub(document, actor) {
  const isOwner = document.ownerId === actor.id

  return {
    canEditDraft: isOwner,
    canTakeLock: false,
    canEditActorDraft: !isOwner,
    canFixVersion: isOwner,
    canSubmitDraft: !isOwner,
    canSubmitEdit: !isOwner,
    canApplyEdit: false,
    canComment: true,
    canViewReview: true,
    isActiveEditor: isOwner,
    isOwner,
  }
}

function capabilities(document, actor) {
  if (isRoundWorkflow(document)) return capabilitiesRound(document, actor)
  if (isOwnerHubWorkflow(document)) return capabilitiesOwnerHub(document, actor)
  if (isHandoffWorkflow(document)) {
    const hasTurn = document.currentActorId === actor.id
    return {
      canEditDraft: hasTurn,
      canTakeLock: false,
      canEditActorDraft: false,
      canFixVersion: hasTurn,
      canSubmitDraft: false,
      canSubmitEdit: false,
      canApplyEdit: false,
      canComment: true,
      canViewReview: false,
      isActiveEditor: hasTurn,
      isOwner: document.ownerId === actor.id,
    }
  }
  return capabilitiesRound(document, actor)
}

function asExcerpt(content) {
  return content.replace(/[#>*_`-]/g, '').trim().slice(0, 160)
}

function toSummary(document, state) {
  const head = getHeadVersion(state, document)
  return {
    id: document.id,
    title: document.title,
    excerpt: asExcerpt(head.content),
    ownerId: document.ownerId,
    ownerName: document.createdBy.name,
    headVersionNumber: head.versionNumber,
    asyncWorkflow: document.asyncWorkflow,
    updatedAt: document.updatedAt,
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
    activeEditorId: document.activeEditorId ? clone(document.activeEditorId) : null,
    currentActorId: document.currentActorId,
    headVersionId: document.headVersionId,
    headVersionNumber: head.versionNumber,
    draft: clone(getDraftProjection(state, document, actor)),
    capabilities: capabilities(document, actor),
    createdAt: document.createdAt,
  }
}

function assertCapability(document, actor, key) {
  if (!capabilities(document, actor)[key]) {
    throw apiError('FORBIDDEN', 'Action not allowed')
  }
}

function getWritableDraft(state, document, actor) {
  if (isOwnerHubWorkflow(document)) {
    if (document.ownerId === actor.id) {
      return getOrCreateOwnerPersonalDraft(state, document, actor)
    }
    return getOrCreatePersonalDraft(state, document, actor)
  }

  return getOrCreateSessionDraft(state, document, actor)
}

function publishDraft(state, document, actor, input = {}) {
  const head = getHeadVersion(state, document)
  const oldCanonicalId = document.headVersionId

  let draft
  if (isOwnerHubWorkflow(document)) {
    draft =
      getOwnerPersonalDraft(state, document) ??
      getOrCreateOwnerPersonalDraft(state, document)
  } else {
    draft = getSessionDraft(state, document.id)
    if (!draft) throw apiError('VALIDATION', 'Session draft not found')
  }

  const nextNumber = head.versionNumber + 1
  const summary = input.summary?.trim() || `Версия ${nextNumber}`

  promoteDraft(draft, { versionNumber: nextNumber, summary })
  draft.updatedAt = now()

  document.headVersionId = draft.id
  syncDocumentFromVersion(document, draft)
  markDraftsStale(state, document.id, oldCanonicalId)

  if (isRoundWorkflow(document)) {
    document.activeEditorId = null
  }

  return draft
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
    const workflow = input.asyncWorkflow || DEFAULT_WORKFLOW

    const document = {
      id: documentId,
      createdBy: author,
      ownerId: actor.id,
      collaborationMode: 'async',
      asyncWorkflow: workflow,
      headVersionId: versionId,
      versionNumber: 1,
      activeEditorId: null,
      currentActorId: workflow === 'handoff' ? actor.id : undefined,
      title,
      updatedAt: timestamp,
      createdAt: timestamp,
    }

    state.documents.unshift(document)
    state.versions.push(
      createPublishedVersion({
        id: versionId,
        documentId,
        author,
        title,
        content,
        versionNumber: 1,
        summary: 'Создание документа',
        createdAt: timestamp,
      }),
    )

    if (isOwnerHubWorkflow(document)) {
      state.versions.push(
        createDraftVersion({
          id: makeId(),
          documentId,
          author,
          title,
          content,
          parentVersionId: versionId,
          draftRole: ROLE_PERSONAL,
          createdAt: timestamp,
        }),
      )
    }

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
    const versions = listPublishedVersions(state, documentId).map((item) => toPublishedDto(item))
    const comments = state.comments
      .filter((item) => item.documentId === documentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const head = getHeadVersion(state, document)
    const caps = capabilities(document, actor)
    let actorDraft = null

    if (caps.canEditActorDraft) {
      actorDraft = getOrCreatePersonalDraft(state, document, actor)
      writeState(state)
    }

    const submittedDrafts = caps.canViewReview && document.ownerId === actor.id
      ? listSubmittedDrafts(state, document, actor).map((item) => toSubmittedDraftDto(item))
      : []

    return clone({
      document: toDocumentDetail(document, state, actor),
      versions,
      submittedDrafts,
      edits: [],
      comments,
      head: {
        id: head.id,
        number: head.versionNumber,
        title: head.title,
        content: head.content,
      },
      actorDraft: actorDraft ? toPersonalDraftDto(actorDraft) : null,
    })
  },

  async acquireEditLock(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    if (!isRoundWorkflow(document)) {
      throw apiError('VALIDATION', 'Edit lock is only used in round workflow')
    }
    ensureRoundEditLock(document, actor)
    getOrCreateSessionDraft(state, document, actor)
    syncSessionDraftToHead(state, document, actor)
    writeState(state)
    return clone(toDocumentDetail(document, state, actor))
  },

  async releaseEditLock(documentId, actor, input = {}) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    if (!isRoundWorkflow(document)) {
      throw apiError('VALIDATION', 'Edit lock is only used in round workflow')
    }
    const lockUserId = getActiveEditorUserId(document)
    if (!lockUserId || lockUserId !== actor.id) {
      throw apiError('FORBIDDEN', 'You do not hold the edit lock')
    }

    const discardChanges = input.discardChanges !== false
    if (discardChanges) {
      syncSessionDraftToHead(state, document, actor)
      const sessionDraft = getSessionDraft(state, document.id)
      if (sessionDraft) {
        const index = state.versions.findIndex((item) => item.id === sessionDraft.id)
        if (index >= 0) state.versions.splice(index, 1)
      }
    }

    document.activeEditorId = null
    writeState(state)
    return clone(toDocumentDetail(document, state, actor))
  },

  async getEffectiveContent(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    const head = getHeadVersion(state, document)

    if (isOwnerHubWorkflow(document) && document.ownerId === actor.id) {
      const ownerDraft = getOwnerPersonalDraft(state, document)
      if (
        ownerDraft &&
        (ownerDraft.title !== head.title || ownerDraft.content !== head.content)
      ) {
        return clone({
          title: ownerDraft.title,
          content: ownerDraft.content,
          source: 'draft',
          headVersionId: head.id,
          headVersionNumber: head.versionNumber,
        })
      }
    } else if (!isOwnerHubWorkflow(document)) {
      const sessionDraft = getSessionDraft(state, document.id)
      if (
        sessionDraft &&
        (sessionDraft.title !== head.title || sessionDraft.content !== head.content)
      ) {
        return clone({
          title: sessionDraft.title,
          content: sessionDraft.content,
          source: 'draft',
          headVersionId: head.id,
          headVersionNumber: head.versionNumber,
        })
      }
    } else {
      const personalDraft = getPersonalDraft(state, document.id, actor.id)
      if (
        personalDraft &&
        (personalDraft.title !== head.title || personalDraft.content !== head.content)
      ) {
        return clone({
          title: personalDraft.title,
          content: personalDraft.content,
          source: 'draft',
          headVersionId: head.id,
          headVersionNumber: head.versionNumber,
        })
      }
    }

    return clone({
      title: head.title,
      content: head.content,
      source: 'head',
      headVersionId: head.id,
      headVersionNumber: head.versionNumber,
    })
  },

  async updateDraft(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditDraft')

    if (isRoundWorkflow(document)) {
      ensureRoundEditLock(document, actor)
    }

    const draft = getWritableDraft(state, document, actor)

    if (input.title !== undefined) {
      draft.title = input.title?.trim() || 'Untitled document'
    }
    if (input.content !== undefined) {
      draft.content = input.content
    }
    draft.updatedAt = now()
    draft.author = userRef(actor)
    syncDocumentFromDraft(document, draft)

    writeState(state)
    return clone(toDocumentDetail(document, state, actor))
  },

  async updateActorDraft(documentId, actor, input) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditActorDraft')

    const actorDraft = getOrCreatePersonalDraft(state, document, actor)

    if (input.title !== undefined) {
      actorDraft.title = input.title?.trim() || 'Untitled document'
    }
    if (input.content !== undefined) {
      actorDraft.content = input.content
    }
    actorDraft.updatedAt = now()

    writeState(state)
    return toPersonalDraftDto(actorDraft)
  },

  async rebaseActorDraft(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canEditActorDraft')

    const head = getHeadVersion(state, document)
    let actorDraft = getPersonalDraft(state, document.id, actor.id)

    if (!actorDraft) {
      actorDraft = getOrCreatePersonalDraft(state, document, actor)
    } else {
      actorDraft.parentVersionId = document.headVersionId
      actorDraft.title = head.title
      actorDraft.content = head.content
      actorDraft.needsRebase = false
      actorDraft.submitted = false
      actorDraft.updatedAt = now()
    }

    writeState(state)
    return toPersonalDraftDto(actorDraft)
  },

  async submitDraft(documentId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canSubmitDraft')

    const actorDraft = getPersonalDraft(state, document.id, actor.id)
    const head = getHeadVersion(state, document)

    if (!actorDraft) throw apiError('NOT_FOUND', 'Actor draft not found')

    if (actorDraft.parentVersionId !== document.headVersionId) {
      throw apiError('VALIDATION', 'Draft is outdated; rebase from current version first')
    }

    if (actorDraft.title === head.title && actorDraft.content === head.content) {
      throw apiError('VALIDATION', 'No changes to submit')
    }

    actorDraft.submitted = true
    actorDraft.updatedAt = now()

    writeState(state)
    return toPersonalDraftDto(actorDraft)
  },

  async submitActorEdit(documentId, actor, input = {}) {
    await this.submitDraft(documentId, actor)
    const state = readState()
    const draft = getPersonalDraft(state, documentId, actor.id)
    return clone({
      id: draft.id,
      documentId,
      baseVersionId: draft.parentVersionId,
      author: clone(draft.author),
      scope: 'document',
      summary: input.summary?.trim() || 'Отправленный черновик',
      status: 'pending',
      title: draft.title,
      content: draft.content,
      createdAt: draft.updatedAt,
    })
  },

  async listVersions(documentId) {
    const state = readState()
    getDocumentRecord(state, documentId)
    return clone(listPublishedVersions(state, documentId).map((item) => toPublishedDto(item)))
  },

  async getVersion(documentId, versionId) {
    const state = readState()
    const version = getVersionRecord(state, documentId, versionId)
    return clone(toPublishedDto(version))
  },

  async publish(documentId, actor, input = {}) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    assertCapability(document, actor, 'canFixVersion')
    const version = publishDraft(state, document, actor, input)
    writeState(state)
    return clone({
      version: toPublishedDto(version),
      document: toDocumentDetail(document, state, actor),
    })
  },

  async fixVersion(documentId, actor, input = {}) {
    return this.publish(documentId, actor, input)
  },

  async restoreVersionToDraft(documentId, versionId, actor) {
    const state = readState()
    const document = getDocumentRecord(state, documentId)
    const version = getVersionRecord(state, documentId, versionId)

    if (isRoundWorkflow(document)) {
      const lockUserId = getActiveEditorUserId(document)
      if (lockUserId && lockUserId !== actor.id) {
        throw apiError('CONFLICT', 'Document is being edited by another participant')
      }
      document.activeEditorId = userRef(actor)
    } else {
      assertCapability(document, actor, 'canEditDraft')
    }

    const draft = getWritableDraft(state, document, actor)
    draft.title = version.title
    draft.content = version.content
    draft.parentVersionId = document.headVersionId
    draft.needsRebase = false
    draft.updatedAt = now()
    draft.author = userRef(actor)
    syncDocumentFromDraft(document, draft)

    writeState(state)
    return clone(toDocumentDetail(document, state, actor))
  },

  async listEdits() {
    return []
  },

  async submitEdit() {
    throw apiError('VALIDATION', 'Use submitDraft in owner hub workflow')
  },

  async applyEdit() {
    throw apiError('VALIDATION', 'Apply is not supported; merge manually in owner draft')
  },

  async rejectEdit() {
    throw apiError('VALIDATION', 'Reject is not supported; ignore submitted draft')
  },

  async withdrawEdit() {
    throw apiError('VALIDATION', 'Withdraw is not supported; edit personal draft')
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
