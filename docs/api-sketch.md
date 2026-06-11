# API sketch

Контракт `documentsApi`. См. [domain-model.md](./domain-model.md), [decisions.md](./decisions.md#хранение).

**Actor:** `{ id, name }`. LLM — `llm:…`.

### Прототип vs целевое

| Целевое | Прототип `front/` |
|---------|-------------------|
| `canonicalVersionId` | `headVersionId` |
| `versionNumber` | `headVersionNumber` / `number` |
| `workflow` / `ownerHub` | `asyncWorkflow` / `owner_hub` |
| `turnActorId` | — |
| `Version.kind` draft/published | `document.draft`, `actorDrafts`, отдельные published |
| `submitted` на draft | `submitEdit` → `edits[]` |
| `publish` | `fixVersion` |
| `sessionHolderId` | `activeEditorId` |

---

## Принципы

1. Три сущности persistence: **documents**, **versions**, **comments**.
2. Черновик = `version` с `kind: draft`; канон = `kind: published`.
3. **Publish** = promote draft-строки (без copy).
4. `capabilities` с сервера.
5. Diff на клиенте.

---

## DTO

### UserRef

`{ id, name }`

### Version

```ts
{
  id, documentId,
  kind: 'published' | 'draft',
  authorId: UserRef,
  title, content,
  createdAt, updatedAt,
  // published only:
  versionNumber?: number,
  summary?: string,
  // draft only:
  parentVersionId?: string,
  draftRole?: 'session' | 'personal',
  submitted?: boolean,
  needsRebase?: boolean,
}
```

### DocumentSummary

`{ id, title, excerpt, ownerId, ownerName, versionNumber, workflow, updatedAt, createdAt }`

### DocumentDetail

```ts
{
  id, title, createdBy, ownerId,
  collaborationMode, workflow,
  canonicalVersionId, versionNumber,
  activeDraft?,              // projection: session или owner personal
  sessionHolderId?,           // round/handoff
  turnActorId?,               // handoff
  capabilities,
  createdAt, updatedAt,
}
```

### EffectiveContent

`{ title, content, source: 'draft' | 'canonical', canonicalVersionId, versionNumber }`

### Comment

Без изменений: `targetVersionId` → **published** only.

### EditorBundle

```ts
{
  document: DocumentDetail,
  publishedVersions: Version[],   // kind=published, versionNumber desc
  draftVersions: Version[],       // kind=draft (фильтр по правам)
  comments: Comment[],
}
```

Прототип: `versions` + `edits` — legacy.

### Capabilities

**round / handoff:** `canEditDraft`, `canPublish`, `canTakeSession`, `canComment`; `canSubmitDraft: false`.

**ownerHub:** + `canSubmitDraft` (участник); owner: `canPublish`, `canViewSubmittedDrafts`.

---

## Методы

### Документы

| Метод | Описание |
|-------|----------|
| `listDocuments` | Из `documents` (title, versionNumber) |
| `createDocument` | Document + published v1 |
| `getDocument` / `getEditorBundle` | |

### Session draft (round / handoff)

| Метод | Описание |
|-------|----------|
| `acquireSession` | Создать/занять `kind=draft`, `draftRole=session` от canonical |
| `updateVersion` | Autosave draft; sync `document.title` |
| `releaseSession` | Удалить/сбросить session draft |

Прототип: `acquireEditLock`, `updateDraft`, `releaseEditLock`.

### Personal draft (ownerHub)

| Метод | Описание |
|-------|----------|
| `getOrCreatePersonalDraft` | `kind=draft`, `draftRole=personal`, `parentVersionId=canonical` |
| `updateVersion` | Autosave своего draft |
| `submitDraft` | `submitted := true` (без copy) |
| `unsubmitDraft` | `submitted := false` (опционально) |
| `rebaseDraft` | `parentVersionId := canonical`, content от canonical |

Прототип: `updateActorDraft`, `submitActorEdit`.

### Публикация

| Метод | Описание |
|-------|----------|
| `publish` | **Promote** draft → `published`, новый `versionNumber`, update document |

Параметры: `{ summary? }`. Handoff: `{ turnActorId?: string }` («Сохранить и передать»).

Прототип: `fixVersion`. **Нет** `applyEdit` / `rejectEdit`.

### История

| Метод | Описание |
|-------|----------|
| `listPublishedVersions` | `kind=published` |
| `getVersion` | |
| `restoreToSession` | round/handoff: session draft с текстом выбранной published |

### Комментарии

`listComments`, `addComment`, … — к `targetVersionId` (published).

---

## Storage

**Целевое:** `documents`, `versions`, `comments`.

**Прототип:** `codraft.state.v5` — см. [прототип](./decisions.md#прототип-front).
