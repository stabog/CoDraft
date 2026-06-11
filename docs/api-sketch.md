# API sketch

Контракт `documentsApi`. Модель: [domain-model.md](./domain-model.md).

**Actor:** `{ id, name }`.

---

## Принципы

1. Persistence: `documents`, `versions`, `comments`.
2. Черновик = `version` с `kind: draft`.
3. **Publish** = promote (без copy).
4. Права через `capabilities`.

---

## Document

```ts
{
  id, title, createdBy, ownerId,
  collaborationMode: 'async' | 'live',
  workflow: 'round' | 'ownerHub',
  canonicalVersionId, versionNumber,
  sessionHolderId?: UserRef | null,   // round
  turnActorId?: UserRef | null,       // round: null = любой
  turnSetBy?: UserRef | null,
  turnSetAt?: string | null,
  capabilities,
  createdAt, updatedAt,
}
```

---

## Version

```ts
{
  id, documentId, kind: 'published' | 'draft',
  authorId: UserRef, title, content,
  createdAt, updatedAt,
  versionNumber?: number,      // published
  summary?: string,
  parentVersionId?: string,  // draft
  draftRole?: 'session' | 'personal',
  submitted?: boolean,
  needsRebase?: boolean,
}
```

---

## Round — методы

| Метод | Описание |
|-------|----------|
| `acquireSession` | Занять слот; проверка `turnActorId` |
| `updateSessionDraft` | Autosave session draft |
| `publish` | Promote если draft ≠ canonical; **держатель остаётся**; новый session draft |
| `closeSession` | `{ passTo: UserRef \| null }` — publish при правках; release; `turnActorId := passTo`; `turnSetBy`, `turnSetAt` |

### Соответствие UI

| UI | Вызов |
|----|--------|
| Сохранить | `publish()` |
| Сохранить и закрыть | `closeSession({ passTo: null })` |
| Сохранить и передать ход | `closeSession({ passTo: user })` |

---

## Owner hub — методы

| Метод | Описание |
|-------|----------|
| `getOrCreatePersonalDraft` | lazy create |
| `updateVersion` | autosave personal draft |
| `submitDraft` | `submitted := true` |
| `rebaseDraft` | от canonical; `submitted := false` |
| `publish` | promote personal draft owner'а |

---

## EditorBundle

```ts
{
  document: DocumentDetail,
  publishedVersions: Version[],
  sessionDraft?: Version,           // round, если есть
  personalDraft?: Version,          // hub, свой
  submittedDrafts?: Version[],      // hub, owner inbox
  comments: Comment[],
}
```

---

## EffectiveContent

```ts
{ title, content, source: 'draft' | 'canonical', canonicalVersionId, versionNumber }
```

---

## Прототип

**Storage:** `codraft.state.v5`.

| Целевое | Сейчас в `front/` |
|---------|-------------------|
| `canonicalVersionId` | `headVersionId` |
| `workflow` | `asyncWorkflow` |
| `sessionHolderId` | `activeEditorId` |
| `turnActorId` | не реализовано |
| `closeSession` | не реализовано |
| `publish` (holder остаётся) | `fixVersion` снимает lock |
| `acquireSession` | `acquireEditLock` |

Bundle прототипа: `versions`, `actorDraft`, `submittedDrafts`, projection `document.draft` — см. [decisions#прототип](./decisions.md#прототип-front).
