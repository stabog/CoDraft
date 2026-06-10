import { defineStore } from 'pinia'
import { documentsApi } from '../api/documentsApi'

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    documents: [],
    currentDocument: null,
    versions: [],
    comments: [],
    loading: false,
    saving: false,
    error: '',
  }),

  actions: {
    async loadDocuments() {
      this.loading = true
      this.error = ''
      try {
        this.documents = await documentsApi.list()
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },

    async createDocument(payload) {
      const document = await documentsApi.create(payload)
      await this.loadDocuments()
      return document
    },

    async loadDocument(id) {
      this.loading = true
      this.error = ''
      try {
        const [document, versions, comments] = await Promise.all([
          documentsApi.get(id),
          documentsApi.listVersions(id),
          documentsApi.listComments(id),
        ])

        this.currentDocument = document
        this.versions = versions
        this.comments = comments
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },

    async saveDocument(id, payload) {
      this.saving = true
      try {
        this.currentDocument = await documentsApi.update(id, payload)
        const [documents, versions] = await Promise.all([
          documentsApi.list(),
          documentsApi.listVersions(id),
        ])
        this.documents = documents
        this.versions = versions
      } finally {
        this.saving = false
      }
    },

    async restoreVersion(documentId, versionId, payload) {
      this.currentDocument = await documentsApi.restoreVersion(documentId, versionId, payload)
      this.versions = await documentsApi.listVersions(documentId)
    },

    async addComment(documentId, payload) {
      const comment = await documentsApi.addComment(documentId, payload)
      this.comments = [comment, ...this.comments]
    },

    async addReply(commentId, payload) {
      const updated = await documentsApi.addReply(commentId, payload)
      this.comments = this.comments.map((item) => (item.id === commentId ? updated : item))
    },

    async setCommentStatus(commentId, status) {
      const updated = await documentsApi.setCommentStatus(commentId, status)
      this.comments = this.comments.map((item) => (item.id === commentId ? updated : item))
    },
  },
})
