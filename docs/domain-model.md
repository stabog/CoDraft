# Доменная модель (async)

## Обзор

```
Document
  ├── headVersion     последняя зафиксированная версия (принятый канон)
  ├── draft           рабочая копия текущего раунда (round: shared; hub/handoff: см. ниже)
  ├── activeEditorId  round: кто держит эксклюзив на запись (null между раундами)
  ├── versions[]      immutable, линейная main-линия
  ├── edits[]         owner hub: submitted правки к baseVersionId
  └── comments[]      замечания к версии (обсуждение)
```

**head vs draft:** head — immutable vN. Draft — незавершённый раунд; автосейв не меняет head. Фиксация — `fixVersion` ([ADR-015](./decisions.md#adr-015-round--базовый-async-подрежим)).

**Effective content** (чтение, LLM): draft, если есть незафиксированные изменения; иначе head.

**Замечания** в продукте — два смысла (owner hub):

| Смысл | Сущность | Действие owner |
|-------|----------|----------------|
| **Правка** | `Edit` | Применить к draft или отклонить |
| **Комментарий** | `Comment` | Учесть при редактировании или отклонить (`resolution`) |

В **round** слой `Edit` не используется; панель «Ревью» — только `Comment[]` (и `Edit[]` при `owner_hub`).

## Document

| Поле | Описание |
|------|----------|
| `id` | Идентификатор |
| `createdBy` | `UserRef` |
| `ownerId` | Создатель / ответственный (для owner hub — арбитр) |
| `collaborationMode` | `async` \| `live` (пока только async) |
| `asyncWorkflow` | `round` \| `handoff` \| `owner_hub` (по умолчанию: **`round`**) |
| `headVersionId` | Tip main-линии |
| `draft` | `{ title, content, updatedAt, updatedBy }` — shared draft в round |
| `activeEditorId` | Round: `UserRef \| null` — эксклюзив на запись |
| `currentActorId` | Handoff: у кого ход по очереди |

При создании документа сразу создаётся **v1**, draft = содержимое v1, `activeEditorId = null`.

### Draft по подрежимам

| Подрежим | Модель draft |
|----------|----------------|
| **round** | Один **shared** `document.draft`; lock через `activeEditorId` |
| **handoff** | Личный fork от head для `currentActorId` (`actorDrafts[]`) |
| **owner_hub** | Owner — `document.draft`; участники — `actorDrafts[]` per actor |

Submit (`submitEdit` / `submitActorEdit`) — только в **owner hub**: fork → `Edit`. В round и handoff — draft → `fixVersion` ([ADR-011](./decisions.md#adr-011-head-draft-и-submit)).

### ActorDraft (handoff, owner hub)

| Поле | Описание |
|------|----------|
| `userId` / actor | Владелец черновика |
| `baseVersionId` | От какого head ответвились |
| `title`, `content` | Рабочий текст (md) |
| `updatedAt` | Автосейв |
| `needsRebase` | Fork устарел после смены head |

## Version (canonical, immutable)

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `parentVersionId` | `null` для v1 |
| `number` | 1, 2, 3… |
| `author` | `UserRef` — кто завершил раунд |
| `title`, `content` | Полный снимок |
| `summary` | Что сделано в раунде |
| `incorporatedEditIds` | Owner hub: какие правки учтены |
| `createdAt` | |
| `handoff` | Handoff: `{ to: UserRef }` при передаче хода |

**Фиксация** = снимок draft + метаданные. После `fixVersion` в round: `activeEditorId = null`, draft синхронизируется с новым head.

## Edit (правка, owner hub)

Параллельные правки не попадают в main как sibling-версии. В **round** сущность не используется.

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `baseVersionId` | От какой версии отталкивались |
| `author` | `UserRef` |
| `scope` | `document` \| `range` |
| `summary` | Пояснение автора |
| `status` | `pending` \| `applied` \| `rejected` \| `superseded` |
| `createdAt` | |

**scope = document** — `title`, `content`. **scope = range** — `anchor`, `suggestedText`.

При `fixVersion` pending edits с `baseVersionId = head` → `superseded` (кроме `incorporatedEditIds`).

## Comment (комментарий)

Привязан к **версии**, якорь — в тексте этой версии. Доступен во всех подрежимах.

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

## Права по подрежимам

### Round

| Действие | Участник с lock | Остальные | Между раундами (`activeEditorId = null`) |
|----------|-----------------|-----------|------------------------------------------|
| Редактировать draft | да | нет (read) | любой может захватить lock |
| Зафиксировать версию | да (держит lock) | нет | — |
| Комментировать | да | да | да |

Capabilities: `canEditDraft`, `canFixVersion`, `canComment`. `canSubmitEdit` / `canApplyEdit` — false.

### Owner hub

| Действие | owner | остальные |
|----------|-------|-----------|
| Редактировать draft | да | нет (fork + submit) |
| Зафиксировать версию | да | нет |
| Отправить правку (`submitEdit`) | нет | да |
| Применить / отклонить правку | да | нет |
| Комментировать | да | да |

Capabilities: `canEditDraft`, `canFixVersion`, `canSubmitEdit`, `canApplyEdit`, `canComment`.

### Handoff

| Действие | `currentActorId` | остальные |
|----------|------------------|-----------|
| Редактировать свой fork | да | нет |
| fixVersion + передать ход | да | нет |
| Комментировать | да | да |

## Diff

Полные снимки в версиях; diff на клиенте (`parent → child`, `head ↔ edit`, `draft ↔ head`, effective content ↔ head).

## Инварианты

1. v1 создаётся вместе с документом.
2. Версии immutable, линейная main.
3. **Round:** один писатель — `activeEditorId` не null во время раунда.
4. **Round:** после `fixVersion` — `activeEditorId = null`.
5. **Owner hub:** canonical version создаёт только owner.
6. `Comment.targetVersionId` обязателен.
7. `Edit` — только при `asyncWorkflow: owner_hub`; `baseVersionId` обязателен.

## Контракт API

[api-sketch.md](./api-sketch.md)
