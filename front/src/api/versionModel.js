export const KIND_PUBLISHED = 'published'
export const KIND_DRAFT = 'draft'
export const ROLE_SESSION = 'session'
export const ROLE_PERSONAL = 'personal'

export function emptyState() {
  return { documents: [], versions: [], comments: [] }
}

export function isPublished(version) {
  return version?.kind === KIND_PUBLISHED
}

export function isDraft(version) {
  return version?.kind === KIND_DRAFT
}

export function normalizePublishedVersion(version) {
  if (version.kind === KIND_PUBLISHED) {
    if (version.versionNumber == null && version.number != null) {
      version.versionNumber = version.number
    }
    return version
  }

  return {
    id: version.id,
    documentId: version.documentId,
    kind: KIND_PUBLISHED,
    author: version.author,
    title: version.title,
    content: version.content,
    versionNumber: version.number ?? version.versionNumber ?? 1,
    summary: version.summary ?? 'Версия',
    createdAt: version.createdAt,
    updatedAt: version.updatedAt ?? version.createdAt,
  }
}

export function getCanonicalVersion(state, document) {
  const version = state.versions.find(
    (item) => item.id === document.headVersionId && item.documentId === document.id,
  )
  if (!version) return null
  return isPublished(version) ? version : null
}

export function listPublishedVersions(state, documentId) {
  return state.versions
    .filter((item) => item.documentId === documentId && isPublished(item))
    .sort((a, b) => b.versionNumber - a.versionNumber)
}

export function getSessionDraft(state, documentId) {
  return state.versions.find(
    (item) =>
      item.documentId === documentId && isDraft(item) && item.draftRole === ROLE_SESSION,
  )
}

export function getPersonalDraft(state, documentId, userId) {
  return state.versions.find(
    (item) =>
      item.documentId === documentId &&
      isDraft(item) &&
      item.draftRole === ROLE_PERSONAL &&
      item.author.id === userId,
  )
}

/** Черновик до первой published-версии (`parentVersionId === null`). */
export function getBootstrapDraft(state, documentId) {
  return state.versions.find(
    (item) =>
      item.documentId === documentId && isDraft(item) && item.parentVersionId == null,
  )
}

export function listPersonalDrafts(state, documentId, { parentVersionId } = {}) {
  return state.versions.filter((item) => {
    if (item.documentId !== documentId) return false
    if (!isDraft(item) || item.draftRole !== ROLE_PERSONAL) return false
    if (parentVersionId && item.parentVersionId !== parentVersionId) return false
    return true
  })
}

export function listSubmittedDrafts(state, document, actor) {
  const canonical = getCanonicalVersion(state, document)
  if (!canonical) return []

  return listPersonalDrafts(state, document.id, { parentVersionId: canonical.id })
    .filter((draft) => draft.submitted && draft.author.id !== actor.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function createPublishedVersion({
  id,
  documentId,
  author,
  title,
  content,
  versionNumber,
  summary,
  createdAt,
}) {
  const timestamp = createdAt
  return {
    id,
    documentId,
    kind: KIND_PUBLISHED,
    author,
    title,
    content,
    versionNumber,
    summary,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createDraftVersion({
  id,
  documentId,
  author,
  title,
  content,
  parentVersionId,
  draftRole,
  submitted = false,
  needsRebase = false,
  createdAt,
}) {
  const timestamp = createdAt
  return {
    id,
    documentId,
    kind: KIND_DRAFT,
    author,
    title,
    content,
    parentVersionId,
    draftRole,
    submitted,
    needsRebase,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function syncDocumentFromVersion(document, version) {
  document.title = version.title
  document.versionNumber = version.versionNumber
  document.updatedAt = version.updatedAt ?? version.createdAt
}

export function syncDocumentFromDraft(document, draft) {
  document.title = draft.title
  document.updatedAt = draft.updatedAt
}

export function markDraftsStale(state, documentId, oldCanonicalId) {
  for (const version of state.versions) {
    if (version.documentId !== documentId) continue
    if (!isDraft(version)) continue
    if (version.parentVersionId !== oldCanonicalId) continue
    version.needsRebase = true
  }
}

export function getContentBaseline(state, document) {
  const head = getCanonicalVersion(state, document)
  if (head) {
    return { title: head.title, content: head.content, versionId: head.id }
  }

  const bootstrap = getBootstrapDraft(state, document.id)
  if (bootstrap) {
    return { title: bootstrap.title, content: bootstrap.content, versionId: null }
  }

  return {
    title: document.title,
    content: `# ${document.title}\n\n`,
    versionId: null,
  }
}

export function draftDiffersFromHead(state, document, draft) {
  if (!draft) return false

  const baseline = getContentBaseline(state, document)
  return draft.title !== baseline.title || draft.content !== baseline.content
}

export function promoteDraft(draft, { versionNumber, summary }) {
  draft.kind = KIND_PUBLISHED
  draft.versionNumber = versionNumber
  draft.summary = summary
  delete draft.parentVersionId
  delete draft.draftRole
  delete draft.submitted
  delete draft.needsRebase
}

export function toDraftProjection(draft, updatedBy) {
  return {
    title: draft.title,
    content: draft.content,
    updatedAt: draft.updatedAt,
    updatedBy: updatedBy ?? draft.author,
  }
}

export function toPublishedDto(version) {
  return {
    id: version.id,
    documentId: version.documentId,
    kind: KIND_PUBLISHED,
    number: version.versionNumber,
    versionNumber: version.versionNumber,
    author: version.author,
    title: version.title,
    content: version.content,
    summary: version.summary,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}

export function toPersonalDraftDto(draft) {
  return {
    id: draft.id,
    baseVersionId: draft.parentVersionId,
    parentVersionId: draft.parentVersionId,
    title: draft.title,
    content: draft.content,
    updatedAt: draft.updatedAt,
    submitted: Boolean(draft.submitted),
    needsRebase: Boolean(draft.needsRebase),
    author: draft.author,
  }
}

export function toSubmittedDraftDto(draft) {
  return {
    id: draft.id,
    documentId: draft.documentId,
    author: draft.author,
    title: draft.title,
    content: draft.content,
    parentVersionId: draft.parentVersionId,
    updatedAt: draft.updatedAt,
    needsRebase: Boolean(draft.needsRebase),
  }
}

export function migrateV4ToV5(v4) {
  const state = emptyState()

  for (const oldDoc of v4.documents || []) {
    const headVersion = (v4.versions || []).find((item) => item.id === oldDoc.headVersionId)
    const versionNumber = headVersion?.number ?? 1

    state.documents.push({
      id: oldDoc.id,
      createdBy: oldDoc.createdBy,
      ownerId: oldDoc.ownerId,
      collaborationMode: oldDoc.collaborationMode ?? 'async',
      asyncWorkflow: oldDoc.asyncWorkflow ?? 'round',
      headVersionId: oldDoc.headVersionId,
      versionNumber,
      activeEditorId: oldDoc.activeEditorId ?? null,
      turnActorId: oldDoc.turnActorId ?? null,
      turnSetBy: oldDoc.turnSetBy ?? null,
      turnSetAt: oldDoc.turnSetAt ?? null,
      currentActorId: oldDoc.currentActorId,
      title: oldDoc.draft?.title ?? headVersion?.title ?? 'Untitled document',
      updatedAt: oldDoc.draft?.updatedAt ?? oldDoc.createdAt,
      createdAt: oldDoc.createdAt,
    })
  }

  for (const oldVersion of v4.versions || []) {
    state.versions.push(normalizePublishedVersion({ ...oldVersion }))
  }

  for (const oldDoc of v4.documents || []) {
    const head = getCanonicalVersion(state, oldDoc)
    if (!head || !oldDoc.draft) continue

    const isOwnerHub = oldDoc.asyncWorkflow === 'owner_hub'
    const isRoundLike =
      oldDoc.asyncWorkflow === 'round' || oldDoc.asyncWorkflow === 'handoff'

    if (isOwnerHub && oldDoc.draft) {
      state.versions.push(
        createDraftVersion({
          id: crypto.randomUUID(),
          documentId: oldDoc.id,
          author: oldDoc.createdBy,
          title: oldDoc.draft.title,
          content: oldDoc.draft.content,
          parentVersionId: head.id,
          draftRole: ROLE_PERSONAL,
          createdAt: oldDoc.draft.updatedAt ?? oldDoc.createdAt,
        }),
      )
    }

    if (isRoundLike && getSessionDraft(state, oldDoc.id) == null) {
      const differs =
        oldDoc.draft.title !== head.title || oldDoc.draft.content !== head.content
      if (differs || oldDoc.activeEditorId) {
        state.versions.push(
          createDraftVersion({
            id: crypto.randomUUID(),
            documentId: oldDoc.id,
            author: oldDoc.draft.updatedBy ?? oldDoc.createdBy,
            title: oldDoc.draft.title,
            content: oldDoc.draft.content,
            parentVersionId: head.id,
            draftRole: ROLE_SESSION,
            createdAt: oldDoc.draft.updatedAt ?? oldDoc.createdAt,
          }),
        )
      }
    }
  }

  for (const oldActorDraft of v4.actorDrafts || []) {
    const document = state.documents.find((item) => item.id === oldActorDraft.documentId)
    if (!document) continue

    const parentVersionId = oldActorDraft.baseVersionId ?? document.headVersionId
    const existing = getPersonalDraft(state, oldActorDraft.documentId, oldActorDraft.userId)

    if (existing) {
      existing.title = oldActorDraft.title
      existing.content = oldActorDraft.content
      existing.parentVersionId = parentVersionId
      existing.needsRebase = Boolean(oldActorDraft.needsRebase)
      existing.updatedAt = oldActorDraft.updatedAt
      continue
    }

    const author =
      state.versions.find((item) => item.author?.id === oldActorDraft.userId)?.author ?? {
        id: oldActorDraft.userId,
        name: oldActorDraft.userId,
      }

    state.versions.push(
      createDraftVersion({
        id: crypto.randomUUID(),
        documentId: oldActorDraft.documentId,
        author,
        title: oldActorDraft.title,
        content: oldActorDraft.content,
        parentVersionId,
        draftRole: ROLE_PERSONAL,
        needsRebase: Boolean(oldActorDraft.needsRebase),
        createdAt: oldActorDraft.updatedAt,
      }),
    )
  }

  for (const edit of v4.edits || []) {
    if (edit.status !== 'pending') continue
    if (edit.scope !== 'document') continue

    const draft = getPersonalDraft(state, edit.documentId, edit.author.id)
    if (!draft) continue

    draft.title = edit.title ?? draft.title
    draft.content = edit.content ?? draft.content
    draft.submitted = true
    draft.parentVersionId = edit.baseVersionId
    draft.updatedAt = edit.createdAt ?? draft.updatedAt
  }

  state.comments = v4.comments || []
  return state
}
