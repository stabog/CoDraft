import { computed } from 'vue'

function countWords(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export function useEditorDocumentStatus({
  draft,
  documentsStore,
  headVersion,
  isRound,
  isOwnerHub,
  isActiveEditor,
  canTakeLock,
  canEditActorDraft,
  isWritable,
  capabilities,
  actorDraftMeta,
  hasChangesSinceVersion,
  hasUnsubmittedChanges,
  activeEditor,
}) {
  const wordCount = computed(() => countWords(`${draft.title} ${draft.content}`))
  const charCount = computed(() => (draft.title + draft.content).length)

  const statusText = computed(() => {
    const v = headVersion.value?.number ?? 0

    if (documentsStore.saving) return 'Сохранение…'

    if (isRound.value) {
      if (isActiveEditor.value) {
        if (hasChangesSinceVersion.value) {
          return `v${v} · редактируете · можно сохранить v${v + 1}`
        }
        return `v${v} · редактируете`
      }
      if (activeEditor.value) return `v${v} · правит ${activeEditor.value.name}`
      return `v${v} · можно редактировать`
    }

    if (canEditActorDraft.value) {
      if (actorDraftMeta.value?.needsRebase) return `v${v} · личный черновик устарел`
      if (actorDraftMeta.value?.submitted && hasUnsubmittedChanges.value) {
        return `v${v} · отправлено · есть новые правки`
      }
      if (actorDraftMeta.value?.submitted) return `v${v} · отправлено на рассмотрение`
      if (hasUnsubmittedChanges.value) return `v${v} · личный черновик · не отправлен`
      return `v${v} · личный черновик`
    }

    if (isOwnerHub.value && capabilities.value?.canEditDraft) {
      return hasChangesSinceVersion.value ? `v${v} · канон · есть изменения` : `v${v} · канон`
    }

    if (!isWritable.value) return `v${v} · просмотр`
    return `v${v} · черновик`
  })

  const readonlyHint = computed(() => {
    if (isWritable.value) return ''

    if (isRound.value && canTakeLock.value) return ''
    if (isRound.value && activeEditor.value) {
      return `${activeEditor.value.name} редактирует. Вы можете комментировать выделенный фрагмент.`
    }
    if (isOwnerHub.value) {
      return 'Только просмотр. Выделите текст, чтобы оставить комментарий к версии.'
    }
    return 'Только просмотр'
  })

  const editModeTitle = computed(() => {
    if (isRound.value && canTakeLock.value) return 'Начать редактирование'
    if (isRound.value && isActiveEditor.value) {
      return 'Отменить правки и вернуться к опубликованной версии'
    }
    if (isRound.value && activeEditor.value) return `Правит ${activeEditor.value.name}`
    return 'Режим просмотра'
  })

  const editModeLabel = computed(() => {
    if (isRound.value && canTakeLock.value) return 'Редактировать'
    if (isRound.value && isActiveEditor.value) return 'Отменить'
    if (isRound.value && activeEditor.value) return 'Только просмотр'
    return 'Редактировать'
  })

  return {
    wordCount,
    charCount,
    statusText,
    readonlyHint,
    editModeTitle,
    editModeLabel,
  }
}
