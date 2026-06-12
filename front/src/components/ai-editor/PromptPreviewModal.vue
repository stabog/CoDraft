<script setup>
defineProps({
  open: { type: Boolean, default: false },
  prompt: { type: String, default: '' },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="prompt-modal-backdrop" @click.self="emit('close')">
      <div class="prompt-modal" role="dialog" aria-labelledby="prompt-modal-title">
        <header class="prompt-modal-header">
          <h3 id="prompt-modal-title">Промпт для LLM</h3>
          <button type="button" class="ghost close-btn" @click="emit('close')">Закрыть</button>
        </header>
        <pre class="prompt-modal-body">{{ prompt }}</pre>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.prompt-modal-backdrop {
  align-items: center;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 100;
}

.prompt-modal {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 640px);
  max-width: 640px;
  width: 100%;
}

.prompt-modal-header {
  align-items: center;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px 16px;
}

.prompt-modal-header h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  font-size: 12px;
  margin: 0;
  min-height: 28px;
  padding: 0 10px;
}

.prompt-modal-body {
  color: var(--text-muted);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  overflow: auto;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
