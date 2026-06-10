# API sketch

Контракт `documentsApi` для local- и HTTP-адаптера. См. [domain-model.md](./domain-model.md), [ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования).

**Actor:** `{ id, name }` из `userStore` (пока без auth). LLM — актор с id вроде `llm:…`.

> **Прототип `front/`:** DTO ниже частично отражает целевую модель через `document.draft`, `activeEditorId`, `actorDrafts`. При выравнивании: session draft и per-actor drafts — из таблицы `drafts`; `activeEditorId` → держатель session draft; `currentActorId` — только handoff.

---

## Принципы

1. Один интерфейс для local / HTTP.
2. `capabilities` в `DocumentDetail` — UI не дублирует правила подрежима.
3. Версии immutable; **«Сохранить»** = `fixVersion` (новая version).
4. Diff на клиенте.
5. Ошибки: `{ code, message }`.
6. **Round / handoff:** один session draft; занять / освободить; autosave в draft, не в version.
7. **Owner hub:** draft per actor; submit → submission (`Edit` в DTO).

---

## DTO

### UserRef

`{ id: string, name: string }`

### Draft (DTO / projection)

В API по-прежнему отдаётся как вложенный объект для удобства UI. В persistence — строка в `drafts`:

`{ id?, baseVersionId, actorId, title, content, updatedAt, updatedBy?: UserRef, needsRebase?: boolean }`

- **Session draft** (round/handoff): один на документ; `actorId` = держатель сессии.
- **Owner hub:** отдельный draft на актора; owner — канон в работе.

### Capabilities (round)

```ts
{
  canEditDraft: boolean      // round/handoff: session draft свободен или actor — держатель
  canFixVersion: boolean     // держатель session draft
  canTakeLock: boolean       // round: session draft свободен
  canComment: boolean
  canSubmitEdit: false       // round / handoff
  canApplyEdit: false
}
```

При `owner_hub` — дополнительно `canSubmitEdit`, `canApplyEdit` по правилам owner hub.

### DocumentSummary

`{ id, title, excerpt, ownerId, ownerName, headVersionNumber, asyncWorkflow, updatedAt, createdAt }`

### DocumentDetail

```ts
{
  id, createdBy, owner,
  collaborationMode,
  asyncWorkflow,              // 'round' | 'handoff' | 'owner_hub'
  headVersionId, headVersionNumber,
  draft,                            // session draft (round/handoff) или draft owner'а (hub)
  sessionHolderId?: UserRef | null, // целевое: держатель session draft; прототип: activeEditorId
  activeEditorId?: UserRef | null,  // прототип round; → sessionHolderId
  currentActorId?: string,          // handoff only
  capabilities,
  createdAt
}
```

### EffectiveContent (для LLM / read)

`{ title, content, source: 'draft' | 'head', headVersionId, headVersionNumber }`

Вычисляется:

- **round / handoff:** session draft занят и `draft ≠ head` → draft; иначе head.
- **owner hub:** draft owner'а `≠ head` → draft owner'а; иначе head (личные draft'ы участников не входят в effective content).

### Version

```ts
{
  id, documentId, parentVersionId, number,
  author: UserRef, title, content, summary,
  incorporatedEditIds: string[],
  createdAt,
  handoff?: { to: UserRef }    // handoff
}
```

### Edit (owner hub)

```ts
{
  id, documentId, baseVersionId,
  author: UserRef,
  scope: 'document' | 'range',
  summary,
  status: 'pending' | 'applied' | 'rejected' | 'superseded',
  createdAt,
  title?: string,
  content?: string,
  anchor?: CommentAnchor,
  suggestedText?: string
}
```

### CommentAnchor

`{ from: number, to: number, quotedText: string }`

### Comment

```ts
{
  id, documentId, targetVersionId,
  author: UserRef,
  anchor: CommentAnchor,
  body,
  status: 'open' | 'resolved' | 'outdated',
  resolution: 'acknowledged' | 'rejected' | null,
  replies: CommentReply[],
  createdAt, resolvedAt
}
```

### EditorBundle

`{ document: DocumentDetail, versions: Version[], edits: Edit[], comments: Comment[] }`

`edits` — пустой или отсутствует в round; в owner hub — `pending` к `headVersionId`.

---

## Методы

### Документы

| Метод | Описание |
|-------|----------|
| `listDocuments(actor?)` | Список summary |
| `createDocument(actor, { title?, content?, asyncWorkflow? })` | Document + v1 + draft; default `asyncWorkflow: 'round'` |
| `getDocument(documentId, actor)` | DocumentDetail |
| `getEditorBundle(documentId, actor)` | EditorBundle |
| `getEffectiveContent(documentId, actor)` | EffectiveContent для LLM |

### Session draft (round / handoff)

| Метод | Описание |
|-------|----------|
| `acquireEditLock(documentId, actor)` | Занять session draft от head. Round: если свободен. Handoff: только `currentActorId`. `CONFLICT`, если занят |
| `updateDraft(documentId, actor, { title?, content? })` | Autosave в session draft; только держатель |
| `releaseEditLock(documentId, actor, { discardChanges? })` | Освободить session draft; по умолчанию `discardChanges: true` — content = head |

### Draft (owner hub)

| Метод | Описание |
|-------|----------|
| `updateDraft(documentId, actor, …)` | Только owner (канонический draft) |
| `updateActorDraft(documentId, actor, …)` | Участник — свой fork |
| `submitActorEdit(…)` / `submitEdit(…)` | Fork → Edit |

### Версии

| Метод | Описание |
|-------|----------|
| `listVersions(documentId, actor)` | number desc |
| `getVersion(documentId, versionId, actor)` | |
| `fixVersion(documentId, actor, { summary?, incorporatedEditIds? })` | Session draft или draft owner'а → vN+1; round/handoff: освободить session draft |
| `restoreVersionToDraft(documentId, versionId, actor)` | Без новой version; round/handoff: занять session draft с текстом version |

### Правки (Edit, owner hub)

| Метод | Описание |
|-------|----------|
| `listEdits(documentId, actor, filter?)` | |
| `submitEdit(documentId, actor, input)` | Не owner |
| `applyEdit(documentId, editId, actor)` | Owner |
| `rejectEdit(documentId, editId, actor)` | Owner |
| `withdrawEdit(documentId, editId, actor)` | Автор |

### Handoff (расширение)

| Метод | Описание |
|-------|----------|
| `handoff(documentId, actor, { to, summary })` | `fixVersion` + `currentActorId := to` («Сохранить и передать») |

### Комментарии

| Метод | Описание |
|-------|----------|
| `listComments(documentId, actor, { targetVersionId? })` | |
| `addComment(documentId, actor, { targetVersionId, anchor, body })` | |
| `addCommentReply(commentId, actor, { body })` | |
| `resolveComment(commentId, actor, { resolution })` | |
| `reopenComment(commentId, actor)` | |

---

## LLM tools (ориентир)

| Tool | API |
|------|-----|
| Текущее состояние | `getEffectiveContent` |
| История | `listVersions` |
| Конкретная версия | `getVersion` |
| Правка | `updateDraft` (при своём lock) |
| Сохранить (UI) / завершить раунд | `fixVersion` |
| Редактировать (UI) | `acquireEditLock` |

---

## Коды ошибок

`NOT_FOUND` | `FORBIDDEN` | `VALIDATION` | `CONFLICT` (lock занят другим актором)

---

## HTTP (черновик)

| POST | `/documents/:id/draft` |
| POST | `/documents/:id/versions` |
| POST | `/documents/:id/edits` |
| POST | `/documents/:id/edits/:eid/apply` |

---

## Маппинг legacy API

| Было | Стало |
|------|--------|
| `list` | `listDocuments` |
| `create` | `createDocument` |
| `update` | `updateDraft` |
| `createVersion` | `fixVersion` |
| `restoreVersion` | `restoreVersionToDraft` |
| `proposal` | `edit` |

Storage (прототип): `codraft.state.v4` — `document.draft`, `actorDrafts`, `activeEditorId`.  
Целевой persistence: `documents`, `versions`, `drafts`, `submissions`, `comments` ([ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)).
