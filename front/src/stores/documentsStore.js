import { defineStore } from 'pinia'
import { documentsApi } from '../api/documentsApi'

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    documents: [],
    currentDocument: null,
    versions: [],
    edits: [],
    comments: [],
    headSnapshot: null,
    actorDraft: null,
    loading: false,
    saving: false,
    error: '',
  }),

  getters: {
    capabilities: (state) => state.currentDocument?.capabilities ?? null,
    headVersion: (state) => state.versions[0] ?? null,
    canEditDraft: (state) => state.currentDocument?.capabilities?.canEditDraft ?? false,
    isCurrentActor: (state) => state.currentDocument?.capabilities?.isCurrentActor ?? false,
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

    async loadEditorBundle(documentId, actor) {
      this.loading = true
      this.error = ''
      try {
        const bundle = await documentsApi.getEditorBundle(documentId, actor)
        this.currentDocument = bundle.document
        this.versions = bundle.versions
        this.edits = bundle.edits
        this.comments = bundle.comments
        this.headSnapshot = bundle.head ?? null
        this.actorDraft = bundle.actorDraft ?? null
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
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

    async submitActorEdit(documentId, actor, payload) {
      const edit = await documentsApi.submitActorEdit(documentId, actor, payload)
      this.edits = [edit, ...this.edits.filter((item) => item.id !== edit.id)]
      return edit
    },

    async fixVersion(documentId, actor, payload) {
      const result = await documentsApi.fixVersion(documentId, actor, payload)
      this.currentDocument = result.document
      this.versions = await documentsApi.listVersions(documentId, actor)
      this.edits = await documentsApi.listEdits(documentId, actor, {
        baseVersionId: result.document.headVersionId,
        status: 'pending',
      })
      const bundle = await documentsApi.getEditorBundle(documentId, actor)
      this.headSnapshot = bundle.head
      this.actorDraft = bundle.actorDraft
      return result.version
    },

    async restoreVersionToDraft(documentId, versionId, actor) {
      this.currentDocument = await documentsApi.restoreVersionToDraft(documentId, versionId, actor)
    },

    async submitEdit(documentId, actor, payload) {
      const edit = await documentsApi.submitEdit(documentId, actor, payload)
      this.edits = [edit, ...this.edits.filter((item) => item.id !== edit.id)]
      return edit
    },

    async applyEdit(documentId, editId, actor) {
      const result = await documentsApi.applyEdit(documentId, editId, actor)
      this.currentDocument = result.document
      this.edits = this.edits.map((item) => (item.id === editId ? result.edit : item))
      return result
    },

    async rejectEdit(documentId, editId, actor) {
      const edit = await documentsApi.rejectEdit(documentId, editId, actor)
      this.edits = this.edits.map((item) => (item.id === editId ? edit : item))
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
