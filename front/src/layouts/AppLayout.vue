<script setup>
import { mdiFolderOutline } from '@mdi/js'
import { computed, inject } from 'vue'
import { useRoute } from 'vue-router'
import MdiIcon from '../components/icons/MdiIcon.vue'
import FileExplorer from '../components/workspace/FileExplorer.vue'
import { useSidebarState } from '../composables/useSidebarState'
import { useUserStore } from '../stores/userStore'

const route = useRoute()
const userStore = useUserStore()
const { open: leftOpen, toggle: toggleLeft } = useSidebarState('codraft-sidebar-left', true)
const editorFooterStatus = inject('editorFooterStatus', null)
const showDocumentStatus = computed(() => route.name === 'editor' && editorFooterStatus?.value)

function onUserChange(event) {
  userStore.switchUser(event.target.value)
}
</script>

<template>
  <div class="app-shell">
    <div class="workspace">
      <nav class="ribbon" aria-label="Панель инструментов">
        <button
          type="button"
          class="ribbon-btn"
          :class="{ active: leftOpen }"
          title="Файлы"
          @click="toggleLeft"
        >
          <MdiIcon :path="mdiFolderOutline" />
        </button>
      </nav>

      <aside class="sidebar-left" :class="{ collapsed: !leftOpen }">
        <FileExplorer />
      </aside>

      <main class="workspace-main">
        <RouterView :key="userStore.activeUserId" />
      </main>
    </div>

    <footer class="status-bar">
      <div class="status-bar-left">
        <span>CoDraft</span>
        <span class="status-dot">·</span>
        <span>{{ userStore.currentUser.name }}</span>
      </div>
      <div v-if="showDocumentStatus" class="status-bar-center">
        <span>{{ editorFooterStatus.statusText }}</span>
        <span class="status-dot">·</span>
        <span>{{ editorFooterStatus.wordCount }} слов</span>
        <span class="status-dot">·</span>
        <span>{{ editorFooterStatus.charCount }} симв.</span>
      </div>
      <div class="status-bar-right">
        <label class="dev-user-field" for="dev-user-select">
          <span>Участник</span>
          <select
            id="dev-user-select"
            class="dev-user-select"
            :value="userStore.activeUserId"
            @change="onUserChange"
          >
            <option v-for="user in userStore.devUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
        </label>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.dev-user-field {
  align-items: center;
  color: var(--text-faint);
  display: inline-flex;
  font-size: 11px;
  gap: 6px;
}

.dev-user-select {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  font-size: 11px;
  min-height: 22px;
  padding: 2px 6px;
}
</style>
