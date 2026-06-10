# Доменная модель (async)

## Обзор

```
Document
  ├── headVersion     последняя зафиксированная версия
  ├── draft           текущая рабочая копия (title + content)
  ├── versions[]      immutable, линейная main-линия
  ├── edits[]         правки (owner hub)
  └── comments[]      замечания к версии (обсуждение)
```

**Замечания** в продукте — два смысла:

| Смысл | Сущность | Действие owner |
|-------|----------|----------------|
| **Правка** | `Edit` | Применить к draft или отклонить |
| **Комментарий** | `Comment` | Учесть при редактировании или отклонить (`resolution`) |

Единая панель «Ревью» в UI — проекция `Edit[]` + `Comment[]`, не отдельная сущность в хранилище.

## Document

| Поле | Описание |
|------|----------|
| `id` | Идентификатор |
| `createdBy` | `UserRef` |
| `ownerId` | Владелец (owner hub) |
| `collaborationMode` | `async` \| `live` (пока только async) |
| `asyncWorkflow` | `handoff` \| `owner_hub` (MVP: `owner_hub`) |
| `headVersionId` | Tip main-линии |
| `draft` | `{ title, content, updatedAt, updatedBy }` |
| `currentActorId` | Только handoff; в MVP не используется |

При создании документа сразу создаётся **v1**, draft = содержимое v1.

## Version (canonical, immutable)

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `parentVersionId` | `null` для v1 |
| `number` | 1, 2, 3… |
| `author` | `UserRef` |
| `title`, `content` | Полный снимок |
| `summary` | Что сделано в раунде |
| `incorporatedEditIds` | Какие правки учтены при фиксации |
| `createdAt` | |
| `handoff` | Зарезервировано для handoff |

**Фиксация** = снимок draft + метаданные. Draft после фиксации не меняется.

## Edit (правка)

Параллельные правки не попадают в main как sibling-версии.

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `baseVersionId` | От какой версии отталкивались |
| `author` | `UserRef` |
| `scope` | `document` \| `range` |
| `summary` | Пояснение автора |
| `status` | `pending` \| `applied` \| `rejected` \| `superseded` |
| `createdAt` | |

**scope = document** — полная правка:

| Поле | Описание |
|------|----------|
| `title` | |
| `content` | |

**scope = range** — правка фрагмента:

| Поле | Описание |
|------|----------|
| `anchor` | `{ from, to, quotedText }` в тексте base-версии |
| `suggestedText` | Замена фрагмента |

**Статусы:**

| Статус | Смысл |
|--------|--------|
| `pending` | Ждёт решения owner |
| `applied` | Owner применил к draft |
| `rejected` | Owner отклонил |
| `superseded` | Раунд закрыт новой версией |

При `fixVersion` pending/applied/rejected edits с `baseVersionId = head` → `superseded` (кроме явно указанных в `incorporatedEditIds` — они уже учтены в summary раунда).

## Comment (комментарий)

Привязан к **версии**, якорь — в тексте этой версии.

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `targetVersionId` | |
| `author` | `UserRef` |
| `anchor` | `{ from, to, quotedText }` |
| `body` | |
| `status` | `open` \| `resolved` \| `outdated` |
| `resolution` | `acknowledged` \| `rejected` — только при `resolved` |
| `replies[]` | |
| `createdAt`, `resolvedAt` | |

Комментарий не применяется к тексту автоматически.

## Права (owner hub, MVP)

| Действие | owner | остальные |
|----------|-------|-----------|
| Редактировать draft | да | нет |
| Зафиксировать версию | да | нет |
| Отправить правку (`submitEdit`) | нет | да |
| Применить / отклонить правку | да | нет |
| Комментировать | да | да |
| Resolve комментария | да | автор (MVP: все) |

Capabilities: `canEditDraft`, `canFixVersion`, `canSubmitEdit`, `canApplyEdit`, `canComment`.

## Diff

Полные снимки в версиях; diff вычисляется на клиенте (`parent → child`, `head ↔ edit`, `draft ↔ head`).

## Инварианты

1. v1 создаётся сместе с документом.
2. Версии immutable, линейная main.
3. Canonical version создаёт только owner (hub).
4. `Comment.targetVersionId` обязателен.
5. `Edit.baseVersionId` обязателен.
6. `Edit.scope = document` → есть `title` + `content`; `range` → `anchor` + `suggestedText`.

## Контракт API

[api-sketch.md](./api-sketch.md)
