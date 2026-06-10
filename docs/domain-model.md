# Доменная модель (async)

Целевая схема persistence: [ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования). Контракт API: [api-sketch.md](./api-sketch.md).

## Обзор

```
Document
  ├── headVersionId     tip main-линии (immutable versions[])
  ├── currentActorId    handoff: чей ход (null в round и owner hub)
  ├── versions[]        зафиксированные снимки (канон)
  ├── drafts[]          mutable; надстройка над base_version_id
  ├── submissions[]     owner hub: отправленные правки (API: Edit)
  └── comments[]        замечания к версии
```

**head vs draft:** head — immutable vN. Draft — рабочая копия **от** `base_version_id`; autosave не меняет head. Публикация — **`fixVersion`** → новая version ([ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)).

**Effective content** (чтение, LLM): если занят session draft (round/handoff) и текст ≠ head — session draft; в owner hub — draft owner'а vs head; иначе head.

**Замечания** в продукте — два смысла (owner hub):

| Смысл | Сущность | Действие owner |
|-------|----------|----------------|
| **Правка** | `Submission` / `Edit` | Применить к своему draft или отклонить |
| **Комментарий** | `Comment` | Учесть при редактировании или отклонить (`resolution`) |

В **round** и **handoff** слой submissions не используется.

## Document

| Поле | Описание |
|------|----------|
| `id` | Идентификатор |
| `createdBy` | `UserRef` |
| `ownerId` | Создатель / ответственный (owner hub — арбитр) |
| `collaborationMode` | `async` \| `live` (пока только async) |
| `asyncWorkflow` | `round` \| `handoff` \| `owner_hub` (по умолчанию: **`round`**) |
| `headVersionId` | Tip main-линии |
| `currentActorId` | **Только handoff:** у кого ход; кто может занять session draft |

При создании: **v1**, session draft свободен (round/handoff) или создаётся draft owner'а (hub); `currentActorId = null` (round/hub) или создатель (handoff).

> **Прототип `front/`:** черновик встроен в `document.draft`, `activeEditorId` на document в round — временная схема до выравнивания с `drafts[]`.

## Draft

Mutable копия от зафиксированной версии. Хранится в таблице/коллекции **`drafts`**, не внутри document.

| Поле | Описание |
|------|----------|
| `id` | Идентификатор |
| `documentId` | |
| `baseVersionId` | От какого head ответвились |
| `actorId` | Владелец строки (держатель сессии или участник hub) |
| `title`, `content` | Markdown |
| `updatedAt` | Autosave |
| `needsRebase` | Owner hub: fork устарел после смены head ([политика B](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)) |

### По подрежимам

| Подрежим | Draft'ы | Эксклюзив |
|----------|---------|-----------|
| **round** | **Один session draft** на документ | Кто первый занял — пишет; остальные ждут |
| **handoff** | **Тот же один session draft** | Занять может только `currentActorId` |
| **owner_hub** | **По одному на актора** (owner + участники) | Общего lock нет; параллельная работа |

**Round / handoff:** между сессиями канон = head; session draft — буфер до «Сохранить».  
**Owner hub:** owner правит свой draft; участники — свои + **submit** → submission. Round/handoff: правки → session draft → `fixVersion` без submit.

## Version (canonical, immutable)

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `parentVersionId` | `null` для v1 |
| `number` | 1, 2, 3… |
| `author` | `UserRef` — кто нажал «Сохранить» |
| `title`, `content` | Полный снимок |
| `summary` | Опционально; по умолчанию «Версия N» |
| `incorporatedEditIds` | Owner hub: учтённые submissions |
| `createdAt` | |
| `handoff` | Handoff: `{ to: UserRef }` при «Сохранить и передать» |

**Фиксация** = снимок session draft (round/handoff) или draft owner'а (hub). После `fixVersion` в round/handoff session draft освобождается и совпадает с новым head.

В будущем допускается **схлопывание** промежуточных versions при сохранении ссылок на comments и submissions.

## Submission / Edit (owner hub)

Замороженное предложение в момент submit. Живой draft участника после submit может меняться дальше.

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `baseVersionId` | От какой версии |
| `author` | `UserRef` |
| `scope` | `document` \| `range` |
| `summary` | Пояснение |
| `status` | `pending` \| `applied` \| `rejected` \| `superseded` |
| `createdAt` | |

**scope = document** — `title`, `content` (снимок). **scope = range** — `anchor`, `suggestedText`.

При `fixVersion` pending с `baseVersionId = старый head` → `superseded` (кроме incorporated).

## Comment (комментарий)

Привязан к **версии**, якорь в тексте этой версии. Во всех подрежимах.

| Поле | Описание |
|------|----------|
| `id`, `documentId` | |
| `targetVersionId` | |
| `author` | `UserRef` |
| `anchor` | `{ from, to, quotedText }` |
| `body` | |
| `status` | `open` \| `resolved` \| `outdated` |
| `resolution` | `acknowledged` \| `rejected` при `resolved` |
| `replies[]` | |
| `createdAt`, `resolvedAt` | |

## Права по подрежимам

### Round

| Действие | Держатель session draft | Остальные | Между сессиями |
|----------|-------------------------|-----------|----------------|
| Редактировать | да | нет (read) | любой может занять session draft |
| Сохранить (версию) | да | нет | — |
| Комментировать | да | да | да |

### Handoff

| Действие | `currentActorId` | Остальные |
|----------|------------------|-----------|
| Занять session draft | да | нет |
| Сохранить / Сохранить и передать | да | нет |
| Комментировать | да | да |

### Owner hub

| Действие | owner | остальные |
|----------|-------|-----------|
| Редактировать свой draft | да | да (свой draft) |
| Сохранить (версию) | да | нет |
| Submit | нет | да |
| Apply / reject submission | да | нет |
| Комментировать | да | да |

## Diff

Полные снимки в versions и submissions; diff на клиенте (`parent → child`, `head ↔ submission`, `draft ↔ head`).

## Инварианты

1. v1 создаётся вместе с документом.
2. Versions immutable, линейная main.
3. **Round/handoff:** не более одного активного session draft на документ.
4. **Round/handoff:** после `fixVersion` session draft свободен и = head.
5. **Handoff:** занять session draft может только `currentActorId`.
6. **Owner hub:** canonical version создаёт только owner.
7. `Comment.targetVersionId` обязателен.
8. Submissions — только при `owner_hub`; `baseVersionId` обязателен.
9. При смене head в hub: личные draft'ы — `needsRebase`, без автозатирания ([ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)).

## Контракт API

[api-sketch.md](./api-sketch.md)
