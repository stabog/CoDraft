# Доменная модель (async)

## Обзор

```
Document
  ├── headVersion     последняя зафиксированная версия
  ├── draft           текущая рабочая копия (title + content)
  ├── versions[]      immutable, линейная main-линия
  ├── proposals[]     предложения правок (owner hub)
  └── comments[]      к конкретной версии
```

## Document

| Поле | Описание |
|------|----------|
| `id` | Идентификатор |
| `createdBy` | Создатель |
| `ownerId` | Владелец (для owner hub; может совпадать с создателем) |
| `collaborationMode` | `async` \| `live` (пока только async) |
| `asyncWorkflow` | `handoff` \| `owner_hub` |
| `headVersionId` | Tip main-линии |
| `draft` | `{ title, content, updatedAt, updatedBy }` |
| `currentActorId` | У кого ход (только handoff) |

При создании документа сразу создаётся **v1** (начальная версия), draft = содержимое v1.

## Version (canonical, immutable)

Версии только **добавляются**, не изменяются. Main-линия линейная: `parentVersionId` → предыдущая (для v1 — null).

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `parentVersionId` | Предыдущая версия в main |
| `number` | Порядковый номер (1, 2, 3…) |
| `authorId`, `authorName` | Кто зафиксировал |
| `title`, `content` | Полный снимок |
| `summary` | «Что сделано в этом раунде» |
| `createdAt` | |
| `handoff` | Только handoff: `{ toUserId, note? }` |
| `incorporatedProposalIds` | Только owner hub: какие proposals учтены в v2 |

**Фиксация версии** = снимок draft + метаданные. Текст draft после фиксации не меняется.

## Proposal (owner hub)

Параллельные правки **не** попадают в main как sibling-версии. Contributors отправляют предложения.

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `baseVersionId` | От какой версии отталкивались |
| `authorId`, `authorName` | |
| `title`, `content` | Полный предложенный текст |
| `summary` | Пояснение автора |
| `status` | `pending` \| `withdrawn` \| `superseded` |
| `createdAt` | |

При фиксации owner новой версии proposals к старому base → `superseded`.

## Comment

Комментарии привязаны к **версии**, не к draft. Якорь — позиция в тексте **этой** версии (immutable контекст).

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `targetVersionId` | К какой версии относится |
| `authorId`, `authorName` | |
| `anchor` | `{ from, to, quotedText }` |
| `body` | |
| `status` | `open` \| `resolved` \| `outdated` |
| `replies[]` | |
| `createdAt`, `resolvedAt` | |

Комментарии не переносятся между версиями — остаются историческим фактом ревью этой версии.

## Права (MVP)

### Handoff

| Действие | currentActor | Остальные |
|----------|--------------|-----------|
| Редактировать draft | да | нет |
| Зафиксировать версию + передать ход | да | нет |
| Комментировать версии | да | да |
| Просмотр draft | да | да (read-only) |

### Owner hub

| Действие | owner | Остальные |
|----------|-------|-----------|
| Редактировать draft | да | нет |
| Зафиксировать версию | да | нет |
| Отправить proposal | — | да |
| Комментировать версии | да | да |
| Просмотр head | да | да |

Позже: capability `canComment` без `canEdit` (comment-only).

## Diff

- Хранить полные снимки версий; diff **вычислять** при просмотре.
- Типичные сравнения: `parent → child`, `head ↔ proposal`, `draft ↔ head` (незафиксированные правки).

## Инварианты

1. v1 создаётся вместе с документом.
2. Версии в main неизменяемы.
3. Только уполномоченный участник создаёт canonical version (actor в handoff, owner в hub).
4. Комментарий всегда имеет `targetVersionId`.
5. Proposal всегда имеет `baseVersionId`.

## Связь с прототипом

Текущий `localDocumentsApi.js` — упрощённый зачаток: один draft, версии без parent/handoff/proposals, комментарии на документ без `targetVersionId`. См. [decisions.md](./decisions.md).
