# API sketch (owner hub)

Контракт `documentsApi` для local- и HTTP-адаптера. См. [domain-model.md](./domain-model.md).

**Actor:** `{ id, name }` из `userStore` (пока без auth).

---

## Принципы

1. Один интерфейс для local / HTTP.
2. `capabilities` в `DocumentDetail` — UI не дублирует правила owner hub.
3. Версии immutable.
4. Diff на клиенте.
5. Ошибки: `{ code, message }`.

---

## DTO

### UserRef

`{ id: string, name: string }`

### Draft

`{ title, content, updatedAt, updatedBy: UserRef }`

### Capabilities

```ts
{
  canEditDraft: boolean
  canFixVersion: boolean
  canSubmitEdit: boolean
  canApplyEdit: boolean
  canComment: boolean
}
```

### DocumentSummary

`{ id, title, excerpt, ownerId, ownerName, headVersionNumber, asyncWorkflow, updatedAt, createdAt }`

### DocumentDetail

`{ id, createdBy, owner, collaborationMode, asyncWorkflow, headVersionId, headVersionNumber, draft, capabilities, createdAt }`

### Version

```ts
{
  id, documentId, parentVersionId, number,
  author: UserRef, title, content, summary,
  incorporatedEditIds: string[],
  createdAt
}
```

### Edit

```ts
{
  id, documentId, baseVersionId,
  author: UserRef,
  scope: 'document' | 'range',
  summary,
  status: 'pending' | 'applied' | 'rejected' | 'superseded',
  createdAt,
  // scope === 'document'
  title?: string,
  content?: string,
  // scope === 'range'
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

`edits` по умолчанию: `pending` к `headVersionId`.

---

## Методы

### Документы

| Метод | Описание |
|-------|----------|
| `listDocuments(actor?)` | Список summary |
| `createDocument(actor, { title?, content? })` | Document + v1 + draft |
| `getDocument(documentId, actor)` | DocumentDetail |
| `getEditorBundle(documentId, actor)` | EditorBundle |

### Draft

| Метод | Описание |
|-------|----------|
| `updateDraft(documentId, actor, { title?, content? })` | Только owner |

### Версии

| Метод | Описание |
|-------|----------|
| `listVersions(documentId, actor)` | number desc |
| `getVersion(documentId, versionId, actor)` | |
| `fixVersion(documentId, actor, { summary, incorporatedEditIds? })` | Снимок draft → vN+1 |
| `restoreVersionToDraft(documentId, versionId, actor)` | Owner, без новой версии |

### Правки (Edit)

| Метод | Описание |
|-------|----------|
| `listEdits(documentId, actor, filter?)` | `baseVersionId`, `status` |
| `submitEdit(documentId, actor, input)` | Не owner |
| `applyEdit(documentId, editId, actor)` | Owner; document → весь draft, range → фрагмент |
| `rejectEdit(documentId, editId, actor)` | Owner; `pending` → `rejected` |
| `withdrawEdit(documentId, editId, actor)` | Автор; `pending` → `rejected` |

**submitEdit input:**

```ts
{
  baseVersionId: string
  scope: 'document' | 'range'
  summary: string
  title?: string
  content?: string
  anchor?: CommentAnchor
  suggestedText?: string
}
```

### Комментарии

| Метод | Описание |
|-------|----------|
| `listComments(documentId, actor, { targetVersionId? })` | |
| `addComment(documentId, actor, { targetVersionId, anchor, body })` | |
| `addCommentReply(commentId, actor, { body })` | |
| `resolveComment(commentId, actor, { resolution })` | `acknowledged` \| `rejected` |
| `reopenComment(commentId, actor)` | → `open`, `resolution: null` |

---

## Коды ошибок

`NOT_FOUND` | `FORBIDDEN` | `VALIDATION` | `CONFLICT`

---

## HTTP (черновик)

| POST | `/documents/:id/edits` |
| POST | `/documents/:id/edits/:eid/apply` |
| POST | `/documents/:id/edits/:eid/reject` |

Proposals → **edits** в путях.

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

Storage: `codraft.state.v2`
