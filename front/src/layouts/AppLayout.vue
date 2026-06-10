<script setup>
import { useUserStore } from '../stores/userStore'

const userStore = useUserStore()

function onUserChange(event) {
  userStore.switchUser(event.target.value)
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" :to="{ name: 'documents' }">
        <span class="brand-mark">C</span>
        <span>CoDraft</span>
      </RouterLink>

      <div class="dev-user-switcher">
        <label class="user-field" for="dev-user-select">
          <span>Участник</span>
          <select
            id="dev-user-select"
            class="user-select"
            :value="userStore.activeUserId"
            @change="onUserChange"
          >
            <option v-for="user in userStore.devUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
        </label>
        <p class="user-hint" title="Стабильный id для owner hub">dev · {{ userStore.currentUser.id.slice(0, 8) }}…</p>
      </div>
    </header>

    <main class="main">
      <RouterView :key="userStore.activeUserId" />
    </main>
  </div>
</template>
