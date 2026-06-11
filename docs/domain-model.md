# Доменная модель (async)

Целевая persistence: **три таблицы** — `documents`, `versions`, `comments`.  
Черновики — строки `versions` с `kind: draft`. Публикация — **promote** (без copy).  
[ADR-017](./decisions.md#adr-017-черновики-как-versions-три-таблицы). Контракт: [api-sketch.md](./api-sketch.md).

## Словарь имён

| Прототип | Целевое |
|----------|---------|
| `headVersionId` | `canonicalVersionId` |
| `asyncWorkflow` | `workflow` |
| `owner_hub` | `ownerHub` |
| `currentActorId` | `turnActorId` |
| `number` | `versionNumber` |
| `Edit` | **нет** — `submitted` на draft-version |
| `submissions` | **нет** — `submitted` на draft-version |
| `actorDrafts` | personal/session **versions** |
| `drafts[]` | personal/session **versions** |

**Canonical** — опубликованная version (`kind: published`). **Draft** — mutable version (`kind: draft`).

## Иерархия (от общего к частному)

```
Document
  └── Version[]     published (канон) + draft (рабочие копии)
  └── Comment[]     только к published
```

---

## Document

| Поле | Описание |
|------|----------|
| `id` | |
| `title` | Имя «файла»; денорм. для списка/дерева |
| `createdBy` | `UserRef` — кто создал (не меняется) |
| `ownerId` | Ответственный; в **ownerHub** — кто публикует канон |
| `collaborationMode` | `async` \| `live` |
| `workflow` | `round` \| `handoff` \| `ownerHub` |
| `canonicalVersionId` | Tip опубликованной линии |
| `versionNumber` | Денорм. номер canonical (для «v3» в списке) |
| `turnActorId` | **Только handoff** — чей ход |
| `updatedAt` | Денорм. последняя активность |
| `createdAt` | |

### Синхронизация `title`

| Событие | Правило |
|---------|---------|
| Создание | `document.title` := title из первой published v1 |
| Autosave draft | `document.title` := title из активного draft |
| `publish` | `document.title` := title из promote'd version |

Список документов — **без join** к `versions` для имени.

---

## Version

Одна таблица. Поля зависят от `kind`:

### Общие поля

| Поле | Описание |
|------|----------|
| `id` | |
| `documentId` | |
| `kind` | `published` \| `draft` |
| `authorId` | `UserRef` — автор строки (единое имя везде) |
| `title` | Markdown |
| `content` | Markdown |
| `createdAt` | |
| `updatedAt` | У `draft` — autosave; у `published` = `createdAt` |

### Только `kind: published`

| Поле | Описание |
|------|----------|
| `versionNumber` | 1, 2, 3… линейный канон |
| `summary` | Опционально («Версия N», позже LLM) |

**Immutable** после создания. `parentVersionId` **не храним** — предыдущая = `versionNumber − 1` в рамках документа.

### Только `kind: draft`

| Поле | Описание |
|------|----------|
| `parentVersionId` | **Canonical**, от которого fork (обязателен) |
| `draftRole` | `session` \| `personal` |
| `submitted` | `personal` + ownerHub: участник отметил «готово к просмотру» |
| `needsRebase` | fork устарел после смены canonical |

**Mutable** (autosave). Handoff **не** в version — только `document.turnActorId`.

### Promote (публикация в канон)

Единственный способ создать новую published version:

1. Берётся draft (session или personal owner'а).
2. **Та же строка:** `kind := published`, присваивается `versionNumber`, снимок фиксируется (больше не меняется).
3. Обновляются поля document:

   | Поле | Значение |
   |------|----------|
   | `canonicalVersionId` | id promote'd version |
   | `versionNumber` | номер новой published |
   | `title` | title из promote'd version |
4. round/handoff: для следующей сессии создаётся **новый** session draft от нового canonical.
5. ownerHub: personal draft'ы с `parentVersionId` на старый canonical → `needsRebase`.

**Copy не используем** в основном потоке.

---

## Draft по подрежимам

| Подрежим | Черновик | `draftRole` | Публикация |
|----------|----------|-------------|------------|
| **round** | один на документ | `session` | держатель **promote** session draft |
| **handoff** | один на документ | `session` | `turnActorId` **promote** session draft |
| **handoff** | — | — | опционально `turnActorId := to` при «Сохранить и передать» |
| **ownerHub** | один на актора | `personal` | **только owner** **promote** свой draft |

### ownerHub — рабочий цикл

1. Canonical vN. У каждого — personal draft (`parentVersionId = canonical`).
2. Участники правят свой draft; **submit** = `submitted: true` (та же строка, без copy).
3. Owner видит **все personal draft с `submitted=true`** (живые, могут меняться до publish owner'а).
4. Owner вручную собирает итог в **своём** personal draft (правки + **Comment** к published).
5. Owner **publish** → promote своего draft → vN+1.
6. Остальные: `needsRebase` или новый fork от vN+1.

**Нет** отдельных submissions, **нет** `apply`/`reject` — отклонение = owner не переносит; можно **Comment**.

### Видимость (ownerHub)

| Кто | Видит |
|-----|--------|
| Участник | свой personal draft |
| Owner | свой personal draft |
| Owner | чужие personal draft с `submitted=true` |
| Все | published versions |
| Все | comments |

---

## Comment

Только к **`kind: published`** (`targetVersionId`).

| Поле | Описание |
|------|----------|
| `id` | |
| `documentId` | |
| `targetVersionId` | published version |
| `authorId` | `UserRef` |
| `anchor.from` | начало фрагмента в `targetVersion.content` |
| `anchor.to` | конец фрагмента (exclusive) |
| `anchor.quotedText` | цитата для UI при `outdated` |
| `body` | |
| `status` | `open` \| `resolved` \| `outdated` |
| `resolution` | `acknowledged` \| `rejected` при `resolved` |
| `replies[]` | |
| `createdAt` | |
| `resolvedAt` | |

---

## Effective content

| Подрежим | Условие | Источник |
|----------|---------|----------|
| round | session draft занят и ≠ canonical | session draft |
| round | иначе | canonical |
| handoff | session draft занят и ≠ canonical | session draft |
| handoff | иначе | canonical |
| ownerHub | personal draft owner'а ≠ canonical | personal draft owner'а |
| ownerHub | иначе | canonical |

Чужие personal draft'ы в effective content **не входят**.

---

## Права

### Round

| Действие | Держатель session draft | Остальные |
|----------|-------------------------|-----------|
| Редактировать | да | read |
| Publish | да | нет |
| Комментировать | да | да |

### Handoff

| Действие | `turnActorId` | Остальные |
|----------|---------------|-----------|
| Занять session draft | да | нет |
| Publish | да | нет |
| Передать ход | да | нет |

### Owner hub

| Действие | owner | участник |
|----------|-------|----------|
| Свой personal draft | да | да (свой) |
| Publish canonical | да | нет |
| Submit (`submitted`) | нет | да |
| Видеть submitted чужих | да (`submitted=true`) | нет |
| Comment | да | да |

---

## Diff

На клиенте:

| Сравнение | Когда |
|-----------|--------|
| `published[N−1]` ↔ `published[N]` | история канона |
| `canonical` ↔ `draft` | рабочие изменения |
| draft owner'а ↔ submitted personal draft | ревью в ownerHub |

---

## Инварианты

1. Три таблицы: `documents`, `versions`, `comments`.
2. v1 при создании: `kind=published`, `versionNumber=1`.
3. `published` immutable; `draft` mutable до promote.
4. У `draft` всегда `parentVersionId` → текущий или прошлый canonical.
5. У `published` только `versionNumber`; без `parentVersionId`.
6. round/handoff: не более одного активного session draft.
7. handoff: session draft только у `turnActorId`.
8. ownerHub: publish canonical — только owner.
9. После publish owner'а: draft'ы на старом canonical → `needsRebase` (политика B).
10. Comment только к `published`.

---

## Прототип `front/`

| Legacy (прототип) | Целевое |
|-------------------|---------|
| `document.draft` | session draft (`versions`, `kind=draft`) |
| `actorDrafts` | personal draft (`versions`, `kind=draft`) |
| `edits` | `submitted` на personal draft |
| `activeEditorId` | `sessionHolderId` |

Целевое выравнивание — [расхождение](./decisions.md#расхождение-с-прототипом-front).

[api-sketch.md](./api-sketch.md)
