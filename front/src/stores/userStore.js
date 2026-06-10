import { defineStore } from 'pinia'
import { DEV_USERS, findDevUser } from '../config/devUsers'

export const useUserStore = defineStore('user', {
  state: () => ({
    activeUserId: DEV_USERS[0].id,
  }),

  getters: {
    devUsers: () => DEV_USERS,

    currentUser(state) {
      return findDevUser(state.activeUserId) || DEV_USERS[0]
    },

    actor(state) {
      const user = findDevUser(state.activeUserId) || DEV_USERS[0]
      return { id: user.id, name: user.name }
    },
  },

  actions: {
    switchUser(userId) {
      if (!findDevUser(userId)) return
      this.activeUserId = userId
    },
  },

  persist: true,
})
