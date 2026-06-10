const STORAGE_KEY = 'codraft.documents.v1'

const now = () => new Date().toISOString()
const clone = (value) => JSON.parse(JSON.stringify(value))
const makeId = () => crypto.randomUUID()

const sampleMarkdown = `# Product brief

CoDraft is a small collaborative Markdown workspace.

## Goals

- Keep every meaningful edit in the version history.
- Let reviewers comment on exact text fragments.
- Make the future PHP API easy to plug in.
`

function seedState() {
  const createdAt = now()
  const documentId = makeId()

  return {
    documents: [
      {
        id: documentId,
        title: 'Product brief',
        content: sampleMarkdown,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    versions: [
      {
        id: makeId(),
        documentId,
        title: 'Product brief',
        content: sampleMarkdown,
        authorName: 'System',
        summary: 'Initial draft',
        createdAt,
      },
    ],
    comments: [],
  }
}

function readState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const state = seedState()
    writeState(state)
    return state
  }

  try {
    return JSON.parse(raw)
  } catch {
    const state = seedState()
    writeState(state)
    return state
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function asSummary(document) {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.content.replace(/[#>*_`-]/g, '').trim().slice(0, 160),
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
  }
}

function getDocumentComments(state, documentId) {
  return state.comments.filter((item) => item.documentId === documentId)
}

function createVersion(state, document, authorName) {
  const createdAt = now()
  const versionNumber = state.versions.filter((item) => item.documentId === document.id).length + 1
  const commentsSnapshot = clone(getDocumentComments(state, document.id))

  const version = {
    id: makeId(),
    documentId: document.id,
    title: document.title,
    content: document.content,
    authorName,
    summary: `Версия ${versionNumber}`,
    commentsSnapshot,
    createdAt,
  }

  state.versions.unshift(version)
  return version
}

export const localDocumentsApi = {
  async list() {
    const state = readState()
    return clone(state.documents.map(asSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  },

  async get(id) {
    const state = readState()
    const document = state.documents.find((item) => item.id === id)
    if (!document) {
      throw new Error('Document not found')
    }

    return clone(document)
  },

  async create({ title, content = '', authorName }) {
    const state = readState()
    const timestamp = now()
    const document = {
      id: makeId(),
      title: title?.trim() || 'Untitled document',
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    state.documents.unshift(document)
    writeState(state)

    return clone(document)
  },

  async update(id, { title, content }) {
    const state = readState()
    const document = state.documents.find((item) => item.id === id)
    if (!document) {
      throw new Error('Document not found')
    }

    const nextTitle = title?.trim() || 'Untitled document'
    document.title = nextTitle
    document.content = content
    document.updatedAt = now()

    writeState(state)
    return clone(document)
  },

  async createVersion(documentId, { title, content, authorName }) {
    const state = readState()
    const document = state.documents.find((item) => item.id === documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    document.title = title?.trim() || 'Untitled document'
    document.content = content
    document.updatedAt = now()

    const version = createVersion(state, document, authorName)
    writeState(state)
    return clone(version)
  },

  async listVersions(documentId) {
    const state = readState()
    return clone(state.versions.filter((item) => item.documentId === documentId))
  },

  async restoreVersion(documentId, versionId, { authorName }) {
    const state = readState()
    const document = state.documents.find((item) => item.id === documentId)
    const version = state.versions.find((item) => item.id === versionId && item.documentId === documentId)
    if (!document || !version) {
      throw new Error('Version not found')
    }

    document.title = version.title
    document.content = version.content
    document.updatedAt = now()
    writeState(state)

    return clone(document)
  },

  async listComments(documentId) {
    const state = readState()
    return clone(state.comments.filter((item) => item.documentId === documentId))
  },

  async addComment(documentId, payload) {
    const state = readState()
    const comment = {
      id: makeId(),
      documentId,
      anchorText: payload.anchorText,
      anchorFrom: payload.anchorFrom,
      anchorTo: payload.anchorTo,
      body: payload.body,
      authorName: payload.authorName,
      status: 'open',
      replies: [],
      createdAt: now(),
      resolvedAt: null,
    }

    state.comments.unshift(comment)
    writeState(state)
    return clone(comment)
  },

  async addReply(commentId, payload) {
    const state = readState()
    const comment = state.comments.find((item) => item.id === commentId)
    if (!comment) {
      throw new Error('Comment not found')
    }

    comment.replies.push({
      id: makeId(),
      body: payload.body,
      authorName: payload.authorName,
      createdAt: now(),
    })
    writeState(state)
    return clone(comment)
  },

  async setCommentStatus(commentId, status) {
    const state = readState()
    const comment = state.comments.find((item) => item.id === commentId)
    if (!comment) {
      throw new Error('Comment not found')
    }

    comment.status = status
    comment.resolvedAt = status === 'resolved' ? now() : null
    writeState(state)
    return clone(comment)
  },
}
