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
| `workflow` | `round` \| `handoff` \| `ownerHub` |
| `canonicalVersionId` | Tip опубликованной линии |
| `versionNumber` | Денорм. номер canonical (отображение «v3») |
| `turnActorId` | Только **handoff** — чей ход |
| `updatedAt` | Денорм. последняя активность |
| `createdAt` | |

### Синхронизация `title`

| Событие | Правило |
|---------|---------|
| Создание | `document.title` := title из первой published v1 |
| Autosave draft | `document.title` := title из активного draft |
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

Immutable после promote. `parentVersionId` не хранится; предыдущая published в том же документе — `versionNumber − 1`.

### `kind: draft`

| Поле | Описание |
|------|----------|
| `parentVersionId` | Canonical, от которого fork (обязателен) |
| `draftRole` | `session` \| `personal` |
| `submitted` | Только `personal` в **ownerHub**: участник отметил готовность к просмотру |
| `needsRebase` | Fork устарел после смены canonical |

Mutable (autosave). Очередь handoff — только `document.turnActorId`, не поля version.

### Promote (`publish`)

Единственный способ опубликовать новую canonical version:

1. Берётся draft: session (round/handoff) или personal owner'а (ownerHub).
2. Та же строка: `kind := published`, присваивается `versionNumber`, содержимое фиксируется.
3. Обновляется document:

   | Поле | Значение |
   |------|----------|
   | `canonicalVersionId` | id этой version |
   | `versionNumber` | новый номер |
   | `title` | title из version |
4. **round/handoff:** создаётся новый session draft от нового canonical (или слот свободен до следующей сессии).
5. **ownerHub:** personal draft'ы с `parentVersionId` на прежний canonical → `needsRebase = true`.

---

## Draft по подрежимам

| Подрежим | Черновик | `draftRole` | Кто публикует |
|----------|----------|-------------|---------------|
| **round** | один на документ | `session` | держатель session draft |
| **handoff** | один на документ | `session` | актор с `turnActorId` |
| **handoff** | — | — | при передаче: `turnActorId := получатель` |
| **ownerHub** | один на актора | `personal` | только owner (свой draft) |

### ownerHub — цикл

1. Canonical vN. У каждого актора — personal draft (`parentVersionId = canonical`).
2. Участник правит свой draft; **submit** = `submitted: true` на той же строке.
3. Owner видит personal draft'ы других с `submitted=true` (текст может меняться до publish owner'а).
4. Owner собирает итог в своём personal draft (изменения участников + учёт **Comment** к published).
5. Owner **publish** → promote своего draft → vN+1.
6. У остальных: `needsRebase` или новый fork от vN+1.

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

Что считается «текущим текстом документа» для чтения (UI, LLM):

| Подрежим | Условие | Источник |
|----------|---------|----------|
| round | session draft есть и ≠ canonical | session draft |
| round | иначе | canonical |
| handoff | session draft есть и ≠ canonical | session draft |
| handoff | иначе | canonical |
| ownerHub | personal draft owner'а ≠ canonical | personal draft owner'а |
| ownerHub | иначе | canonical |

Чужие personal draft'ы в effective content не входят.

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
| Видеть submitted чужих | да | нет |
| Comment | да | да |

---

## Diff

Вычисляется на клиенте, не хранится:

| Сравнение | Назначение |
|-----------|------------|
| `published[N−1]` ↔ `published[N]` | история канона |
| canonical ↔ активный draft | рабочие изменения |
| draft owner'а ↔ submitted personal draft | ревью в ownerHub |

---

## Инварианты

1. Три таблицы: `documents`, `versions`, `comments`.
2. При создании документа: `kind=published`, `versionNumber=1`.
3. `published` immutable; `draft` mutable до promote.
4. У каждого `draft` есть `parentVersionId` на canonical (текущий или устаревший).
5. У `published` есть `versionNumber`; `parentVersionId` отсутствует.
6. round/handoff: не более одного session draft на документ.
7. handoff: занять session draft может только `turnActorId`.
8. ownerHub: publish canonical — только owner.
9. После publish owner'а: draft'ы на старом canonical помечаются `needsRebase`.
10. Comment привязан только к `published`.
