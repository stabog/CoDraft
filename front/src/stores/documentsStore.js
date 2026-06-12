import { defineStore } from 'pinia'
import { documentsApi } from '../api/documentsApi'

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    documents: [],
    currentDocument: null,
    versions: [],
    submittedDrafts: [],
    comments: [],
    headSnapshot: null,
    actorDraft: null,
    loading: false,
    bundleLoading: false,
    saving: false,
    error: '',
  }),

  getters: {
    capabilities: (state) => state.currentDocument?.capabilities ?? null,
    headVersion: (state) => state.versions[0] ?? null,
    canEditDraft: (state) => state.currentDocument?.capabilities?.canEditDraft ?? false,
    canTakeLock: (state) => state.currentDocument?.capabilities?.canTakeLock ?? false,
    isActiveEditor: (state) => state.currentDocument?.capabilities?.isActiveEditor ?? false,
    asyncWorkflow: (state) => state.currentDocument?.asyncWorkflow ?? 'round',
    isRound: (state) => state.currentDocument?.asyncWorkflow === 'round',
    isOwnerHub: (state) => state.currentDocument?.asyncWorkflow === 'owner_hub',
    activeEditor: (state) =>
      state.currentDocument?.sessionHolderId ??
      state.currentDocument?.activeEditorId ??
      null,
    turnActor: (state) => state.currentDocument?.turnActorId ?? null,
    canFixVersion: (state) => state.currentDocument?.capabilities?.canFixVersion ?? false,
    canCloseSession: (state) => state.currentDocument?.capabilities?.canCloseSession ?? false,
  },

  actions: {
    actorFrom(userStore) {
      return userStore.actor
    },

    async loadDocuments(actor) {
      this.loading = true
      this.error = ''
      try {
        this.documents = await documentsApi.listDocuments(actor)
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },

    async createDocument(actor, payload) {
      const document = await documentsApi.createDocument(actor, payload)
      await this.loadDocuments(actor)
      return document
    },

    clearEditorContext() {
      this.currentDocument = null
      this.versions = []
      this.submittedDrafts = []
      this.comments = []
      this.headSnapshot = null
      this.actorDraft = null
      this.error = ''
    },

    async loadEditorBundle(documentId, actor) {
      this.bundleLoading = true
      this.error = ''
      try {
        const bundle = await documentsApi.getEditorBundle(documentId, actor)
        this.currentDocument = bundle.document
        this.versions = bundle.versions
        this.submittedDrafts = bundle.submittedDrafts ?? []
        this.comments = bundle.comments
        this.headSnapshot = bundle.head ?? null
        this.actorDraft = bundle.actorDraft ?? null
      } catch (error) {
        this.error = error.message
      } finally {
        this.bundleLoading = false
      }
    },

    async updateDraft(documentId, actor, payload) {
      this.saving = true
      try {
        this.currentDocument = await documentsApi.updateDraft(documentId, actor, payload)
        this.documents = await documentsApi.listDocuments(actor)
      } finally {
        this.saving = false
      }
    },

    async acquireEditLock(documentId, actor) {
      this.currentDocument = await documentsApi.acquireEditLock(documentId, actor)
    },

    async releaseEditLock(documentId, actor, payload = {}) {
      this.currentDocument = await documentsApi.releaseEditLock(documentId, actor, payload)
    },

    async closeSession(documentId, actor, payload = {}) {
      await documentsApi.closeSession(documentId, actor, payload)
      const bundle = await documentsApi.getEditorBundle(documentId, actor)
      this.currentDocument = bundle.document
      this.versions = bundle.versions
      this.submittedDrafts = bundle.submittedDrafts ?? []
      this.comments = bundle.comments
      this.headSnapshot = bundle.head ?? null
      this.actorDraft = bundle.actorDraft ?? null
    },

    async updateActorDraft(documentId, actor, payload) {
      this.saving = true
      try {
        this.actorDraft = await documentsApi.updateActorDraft(documentId, actor, payload)
      } finally {
        this.saving = false
      }
    },

    async rebaseActorDraft(documentId, actor) {
      this.actorDraft = await documentsApi.rebaseActorDraft(documentId, actor)
    },

    async submitDraft(documentId, actor) {
      this.actorDraft = await documentsApi.submitDraft(documentId, actor)
      const bundle = await documentsApi.getEditorBundle(documentId, actor)
      this.submittedDrafts = bundle.submittedDrafts ?? []
      this.currentDocument = bundle.document
      return this.actorDraft
    },

    async submitActorEdit(documentId, actor) {
      return this.submitDraft(documentId, actor)
    },

    async fixVersion(documentId, actor, payload) {
      const result = await documentsApi.fixVersion(documentId, actor, payload)
      this.currentDocument = result.document
      this.versions = await documentsApi.listVersions(documentId, actor)
      const bundle = await documentsApi.getEditorBundle(documentId, actor)
      this.headSnapshot = bundle.head
      this.actorDraft = bundle.actorDraft
      this.submittedDrafts = bundle.submittedDrafts ?? []
      return result.version
    },

    async restoreVersionToDraft(documentId, versionId, actor) {
      this.currentDocument = await documentsApi.restoreVersionToDraft(documentId, versionId, actor)
    },

    async addComment(documentId, actor, payload) {
      const comment = await documentsApi.addComment(documentId, actor, payload)
      this.comments = [comment, ...this.comments]
    },

    async addReply(commentId, actor, payload) {
      const updated = await documentsApi.addCommentReply(commentId, actor, payload)
      this.comments = this.comments.map((item) => (item.id === commentId ? updated : item))
    },

    async resolveComment(commentId, actor, resolution) {
      const updated = await documentsApi.resolveComment(commentId, actor, { resolution })
      this.comments = this.comments.map((item) => (item.id === commentId ? updated : item))
    },

    async reopenComment(commentId, actor) {
      const updated = await documentsApi.reopenComment(commentId, actor)
      this.comments = this.comments.map((item) => (item.id === commentId ? updated : item))
    },
  },
})
