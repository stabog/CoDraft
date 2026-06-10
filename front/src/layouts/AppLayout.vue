<script setup>
import { useUserStore } from '../stores/userStore'

const userStore = useUserStore()
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" :to="{ name: 'documents' }">
        <span class="brand-mark">C</span>
        <span>CoDraft</span>
      </RouterLink>

      <label class="user-field">
        <span>Автор</span>
        <input v-model="userStore.name" type="text" autocomplete="off" />
      </label>
    </header>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>
