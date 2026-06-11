# Доменная модель (async)

Persistence: **`documents`**, **`versions`**, **`comments`**.

- **Canonical** — `version` с `kind: published` (tip линии — `document.canonicalVersionId`).
- **Draft** — `version` с `kind: draft` (mutable до **promote**).
- Публикация в канон — **promote** draft-строки (без copy).

Решения: [decisions.md](./decisions.md). API: [api-sketch.md](./api-sketch.md). Потоки: [async-workflows.md](./async-workflows.md).

## Иерархия

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
| `title` | Имя документа; денорм. для списка и дерева |
| `createdBy` | `UserRef` — кто создал (не меняется) |
| `ownerId` | Ответственный; в **ownerHub** — кто публикует канон |
| `collaborationMode` | `async` \| `live` |
| `workflow` | `round` \| `ownerHub` |
| `canonicalVersionId` | Tip опубликованной линии |
| `versionNumber` | Денорм. номер canonical (отображение «v3») |
| `sessionHolderId` | **round:** кто держит session draft (`null` — между сессиями) |
| `turnActorId` | **round:** кому разрешён следующий заход (`null` — любой участник) |
| `turnSetBy` | Кто последним назначил очередь при закрытии сессии |
| `turnSetAt` | Когда назначена очередь |
| `updatedAt` | Денорм. последняя активность |
| `createdAt` | |

### Синхронизация `title`

| Событие | Правило |
|---------|---------|
| Создание | `document.title` := title из первой published v1 |
| Autosave session draft | `document.title` := title из session draft |
| Autosave personal draft | `document.title` := title из personal draft owner'а |
| `publish` | `document.title` := title из promote'd version |

Список документов отдаёт `document.title` без join к `versions`.

---

## Version

Одна таблица. Набор полей зависит от `kind`.

### Общие поля

| Поле | Описание |
|------|----------|
| `id` | |
| `documentId` | |
| `kind` | `published` \| `draft` |
| `authorId` | `UserRef` — владелец строки |
| `title` | Markdown |
| `content` | Markdown |
| `createdAt` | |
| `updatedAt` | У `draft` — autosave; у `published` = `createdAt` |

### `kind: published`

| Поле | Описание |
|------|----------|
| `versionNumber` | 1, 2, 3… линейный канон |
| `summary` | Опционально |

Immutable после promote. `parentVersionId` не хранится; предыдущая published — `versionNumber − 1`.

### `kind: draft`

| Поле | Описание |
|------|----------|
| `parentVersionId` | Canonical, от которого fork (обязателен) |
| `draftRole` | `session` \| `personal` |
| `submitted` | Только `personal` в **ownerHub** |
| `needsRebase` | Fork устарел после смены canonical |

Mutable (autosave).

### Promote (`publish`)

1. Берётся draft: **session** (round) или **personal owner'а** (ownerHub).
2. Та же строка: `kind := published`, `versionNumber`, фиксация содержимого.
3. Обновляется `document.canonicalVersionId`, `versionNumber`, `title`.
4. **round:** если сессия продолжается — новый session draft от canonical для того же `sessionHolderId`.
5. **ownerHub:** personal draft'ы на старом canonical → `needsRebase = true`.

---

## Round (включая пересылку документа)

Один **session draft** (`draftRole: session`). Пересылка — не отдельный `workflow`, а **очередь** через `turnActorId`.

### Слои

| Слой | Механизм |
|------|----------|
| Черновик | autosave в session draft |
| Сохранение | **publish** (всегда promote) |
| Закрытие сессии | **closeSession** — освобождает слот, назначает очередь |

### Действия пользователя

| UI | API | Publish | `sessionHolderId` | `turnActorId` |
|----|-----|---------|-------------------|---------------|
| **Сохранить** | `publish` | да, если draft ≠ canonical | **остаётся** держатель | без изменений |
| **Сохранить и закрыть** | `closeSession({ passTo: null })` | да, если есть правки | `null` | `null` (любой) |
| **Сохранить и передать ход** | `closeSession({ passTo })` | да, если есть правки | `null` | `passTo` |

Если при закрытии draft = canonical — **publish не вызывается**, только release и смена очереди.

После **publish** (без закрытия) держатель сохраняет слот; создаётся новый session draft от обновлённого canonical. За один «ход» допустимо несколько publish (промежуточные версии).

**Пауза (обед):** autosave, `sessionHolderId` не сбрасывается; закрытие вкладки не снимает слот, пока не вызван `closeSession`.

**Занять слот:** `acquireSession` — если `turnActorId` задан, только этот актор; если `null` — любой участник.

При `closeSession` обновляются `turnSetBy`, `turnSetAt`.

### ownerHub

| Подрежим | Черновик | `draftRole` | Кто публикует |
|----------|----------|-------------|---------------|
| **ownerHub** | один на актора | `personal` | только owner (свой draft) |

1. Canonical vN. У каждого — personal draft.
2. **submit** = `submitted: true` на той же строке.
3. Owner видит чужие draft'ы с `submitted=true`.
4. Owner собирает итог в своём personal draft.
5. Owner **publish** → vN+1.
6. У остальных: `needsRebase`; `rebase` сбрасывает `submitted`.

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
| `anchor.from` | начало фрагмента |
| `anchor.to` | конец (exclusive) |
| `anchor.quotedText` | цитата для UI |
| `body` | |
| `status` | `open` \| `resolved` \| `outdated` |
| `resolution` | `acknowledged` \| `rejected` при `resolved` |
| `replies[]` | |
| `createdAt` | |
| `resolvedAt` | |

---

## Effective content

| `workflow` | Условие | Источник |
|------------|---------|----------|
| round | `sessionHolderId` задан и session draft ≠ canonical | session draft |
| round | иначе | canonical |
| ownerHub | personal draft owner'а ≠ canonical | personal draft owner'а |
| ownerHub | иначе | canonical |

---

## Права (round)

| Действие | `sessionHolderId` | Остальные |
|----------|-------------------|-----------|
| `acquireSession` | если `turnActorId` совпадает или `null` | иначе нет |
| Редактировать | держатель | read |
| `publish` | держатель | нет |
| `closeSession` | держатель | нет |
| Comment | все с правом | |

## Права (ownerHub)

| Действие | owner | участник |
|----------|-------|----------|
| Свой personal draft | да | да (свой) |
| `publish` | да | нет |
| `submit` | нет | да |
| Видеть submitted чужих | да | нет |
| Comment | да | да |

---

## Diff

| Сравнение | Назначение |
|-----------|------------|
| `published[N−1]` ↔ `published[N]` | история канона |
| canonical ↔ session / personal draft | рабочие изменения |
| draft owner'а ↔ submitted personal draft | ревью в ownerHub |

---

## Инварианты

1. Три таблицы: `documents`, `versions`, `comments`.
2. При создании: `kind=published`, `versionNumber=1`.
3. `published` immutable; `draft` mutable до promote.
4. У `draft` есть `parentVersionId` на canonical (текущий или устаревший).
5. round: не более одного session draft.
6. `acquireSession`: только если `turnActorId` = актор или `turnActorId` = `null`.
7. `publish` (round) не меняет `turnActorId` и не снимает `sessionHolderId`.
8. `closeSession` снимает `sessionHolderId`; задаёт `turnActorId` и `turnSetBy` / `turnSetAt`.
9. ownerHub: publish canonical — только owner.
10. Comment только к `published`.
