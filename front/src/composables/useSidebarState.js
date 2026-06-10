import { ref, watch } from 'vue'

function readFlag(key, defaultOpen = true) {
  const stored = localStorage.getItem(key)
  if (stored === null) return defaultOpen
  return stored === 'open'
}

export function useSidebarState(key, defaultOpen = true) {
  const open = ref(readFlag(key, defaultOpen))

  watch(open, (value) => {
    localStorage.setItem(key, value ? 'open' : 'closed')
  })

  function toggle() {
    open.value = !open.value
  }

  return { open, toggle }
}
