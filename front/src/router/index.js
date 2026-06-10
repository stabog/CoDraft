import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import DocumentsPage from '../pages/DocumentsPage.vue'
import EditorPage from '../pages/EditorPage.vue'

const routes = [
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', name: 'documents', component: DocumentsPage },
      { path: 'documents/:id', name: 'editor', component: EditorPage, props: true },
    ],
  },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
