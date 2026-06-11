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
  turnActor,
}) {
  const wordCount = computed(() => countWords(`${draft.title} ${draft.content}`))
  const charCount = computed(() => (draft.title + draft.content).length)

  const statusText = computed(() => {
    const v = headVersion.value?.number ?? 0
    const versionLabel = v > 0 ? `v${v}` : 'черновик'
    const nextVersionLabel = v > 0 ? `v${v + 1}` : 'v1'

    if (documentsStore.saving) return 'Сохранение…'

    if (isRound.value) {
      if (isActiveEditor.value) {
        if (hasChangesSinceVersion.value) {
          return `${versionLabel} · редактируете · можно сохранить ${nextVersionLabel}`
        }
        return `${versionLabel} · редактируете`
      }
      if (activeEditor.value) return `${versionLabel} · правит ${activeEditor.value.name}`
      if (turnActor?.value) return `${versionLabel} · ход ${turnActor.value.name}`
      return `${versionLabel} · можно редактировать`
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
      if (v === 0) {
        return hasChangesSinceVersion.value
          ? `${versionLabel} · можно зафиксировать ${nextVersionLabel}`
          : versionLabel
      }
      return hasChangesSinceVersion.value ? `${versionLabel} · канон · есть изменения` : `${versionLabel} · канон`
    }

    if (!isWritable.value) return `${versionLabel} · просмотр`
    return versionLabel
  })

  const readonlyHint = computed(() => {
    if (isWritable.value || isRound.value) return ''

    if (isOwnerHub.value) {
      return 'Только просмотр. Выделите текст, чтобы оставить комментарий к версии.'
    }
    return 'Только просмотр'
  })

  const editModeTitle = computed(() => {
    if (isRound.value && canTakeLock.value) {
      return turnActor?.value ? 'Ваш ход — начать редактирование' : 'Начать редактирование'
    }
    return 'Начать редактирование'
  })

  const editModeLabel = computed(() => 'Редактировать')

  return {
    wordCount,
    charCount,
    statusText,
    readonlyHint,
    editModeTitle,
    editModeLabel,
  }
}
