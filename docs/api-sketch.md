# API sketch

Контракт `documentsApi` для local- и HTTP-адаптера. См. [domain-model.md](./domain-model.md).

**Actor:** `{ id, name }` из `userStore` (пока без auth). LLM — актор с id вроде `llm:…`.

---

## Принципы

1. Один интерфейс для local / HTTP.
2. `capabilities` в `DocumentDetail` — UI не дублирует правила подрежима.
3. Версии immutable.
4. Diff на клиенте.
5. Ошибки: `{ code, message }`.
6. **Round (по умолчанию):** `updateDraft` с захватом lock; `fixVersion` завершает раунд.

---

## DTO

### UserRef

`{ id: string, name: string }`

### Draft

`{ title, content, updatedAt, updatedBy: UserRef }`

### Capabilities (round)

```ts
{
  canEditDraft: boolean      // активный редактор или между раундами
  canFixVersion: boolean     // держит lock
  canComment: boolean
  canSubmitEdit: false       // round
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
  draft,
  activeEditorId: UserRef | null,   // round
  currentActorId?: string,          // handoff
  capabilities,
  createdAt
}
```

### EffectiveContent (для LLM / read)

`{ title, content, source: 'draft' | 'head', headVersionId, headVersionNumber }`

Вычисляется: draft, если `draft.content !== head.content` (или title); иначе head.

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

### Draft (round)

| Метод | Описание |
|-------|----------|
| `updateDraft(documentId, actor, { title?, content? })` | Round: захват `activeEditorId` при `null`; правки только при своём lock. `CONFLICT`, если lock у другого |
| `releaseEditLock(documentId, actor)` | Опционально: сброс lock без fixVersion (отмена раунда) |

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
| `fixVersion(documentId, actor, { summary, incorporatedEditIds? })` | Снимок draft → vN+1; round: `activeEditorId = null` |
| `restoreVersionToDraft(documentId, versionId, actor)` | Без новой версии; round: захват lock |

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
| `handoff(documentId, actor, { to, summary })` | fixVersion + смена `currentActorId` |

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
| Завершить раунд | `fixVersion` |

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

Storage: `codraft.state.v3` (прототип); целевой default `asyncWorkflow: 'round'`.
