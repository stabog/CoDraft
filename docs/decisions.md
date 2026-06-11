# Архитектурные решения

Актуальный список. Детали полей и потоков — [domain-model.md](./domain-model.md), [async-workflows.md](./async-workflows.md), [api-sketch.md](./api-sketch.md).

| Тема | Якорь |
|------|--------|
| Async и live | [#режимы](#режимы-async-и-live) |
| Хранение (3 таблицы, promote) | [#хранение](#хранение) |
| Версии и черновики | [#версии](#версии-и-черновики) |
| Комментарии | [#комментарии](#комментарии) |
| Подрежимы workflow | [#подрежимы](#подрежимы-workflow) |
| Round | [#round](#round) |
| Видимость и publish | [#видимость](#видимость-и-publish) |
| Редактор (MVP) | [#редактор](#редактор-mvp) |
| Права | [#права](#права) |
| Отложено | [#отложено](#отложено) |
| Прототип `front/` | [#прототип](#прототип-front) |

---

## Режимы async и live

- `collaborationMode` задаётся при создании документа; **не переключаем** после создания.
- Сейчас реализуем только **async**. Live — отдельный движок (JSON doc, realtime) позже.
- Общие: редактор, список документов. Разные: история, синхронизация.

---

## Хранение

**Три таблицы:** `documents`, `versions`, `comments`. Отдельных `drafts`, `submissions`, `Edit` **нет**.

Черновики — строки `versions` с `kind: draft` (`draftRole`: `session` | `personal`).

**Публикация — только promote:** та же строка `draft` → `published`, присваивается `versionNumber`. Copy не используем.

| `kind` | Поведение |
|--------|-----------|
| `published` | Канон; immutable; `versionNumber`; без `parentVersionId` |
| `draft` | Mutable; `parentVersionId` → canonical |

После publish в ownerHub: personal draft'ы на старом canonical → `needsRebase`.

Целевые имена: `canonicalVersionId`, `workflow`, `turnActorId`, `versionNumber`. Handoff только на `document`.

---

## Версии и черновики

- При создании документа сразу **published v1** («Создание документа»).
- `published` immutable; `draft` mutable до promote.
- Diff не храним — вычисляем на клиенте ([api-sketch.md](./api-sketch.md)).
- **Effective content:** активный draft (session / personal owner'а), если отличается от canonical; иначе canonical.

---

## Комментарии

- Только к **`kind: published`** (`targetVersionId` + якорь в тексте).
- Статус `outdated`, если якорь не найден в контексте просмотра.
- Обсуждение (Comment) отделено от правок текста: в ownerHub правки — **personal draft**, не Comment.

---

## Подрежимы workflow

`workflow`: `round` | `handoff` | `ownerHub`. По умолчанию — **`round`**.

| Подрежим | Когда |
|----------|--------|
| **round** | Один редактор за раз, версии по фиксации; память LLM, соавторы без очереди |
| **handoff** | Двое, явная очередь, «пересылка» документа |
| **ownerHub** | Трое+, арбитраж при конфликтующих правках |

Open (DAG без owner) в MVP не выделяем.

Handoff и ownerHub — **расширения** round, не смешивать их семантику в базовый round.

---

## Round

- Один **session draft** на документ; между сессиями слот свободен.
- Занять может любой участник (`acquireEditLock`); эксклюзив на запись у держателя.
- Autosave пишет в session draft, **не** в canonical.
- **Publish** = promote session draft → vN+1; слот освобождается.
- Слой Edit/submit **не используется** — правки напрямую через draft → publish.
- `turnActorId` на document — **только handoff**, не round.

Подробнее: [async-workflows.md](./async-workflows.md#round).

---

## Handoff

- Тот же **один session draft**, что в round.
- Занять session draft может только `turnActorId`.
- Publish = promote; опционально «Сохранить и передать …» → `turnActorId := получатель`.
- **Не реализовано** в прототипе (UI, API).

---

## Owner hub

- У каждого актора **personal draft** от canonical (`parentVersionId`).
- Участник: правит свой draft; **submit** = `submitted: true` на той же строке (без copy).
- Owner видит чужие draft'ы с `submitted=true` (живые до publish owner'а).
- Owner **вручную** собирает итог в своём personal draft (правки + comments к published).
- **Publish** = promote **только** personal draft owner'а.
- Нет `apply`/`reject`; отклонение = не переносить в свой draft / comment.
- Незасабмиченные черновики **не блокируют** publish owner'а.

Подробнее: [async-workflows.md](./async-workflows.md#owner-hub).

---

## Видимость и publish

| Кто | Видит |
|-----|--------|
| Участник (hub) | свой personal draft |
| Owner (hub) | свой draft + чужие `submitted=true` |
| Все | published versions + comments |
| Round / handoff | session draft на чтение; запись у держателя |

После publish owner'а: `needsRebase` у draft'ов от старого canonical; уведомление участникам.

---

## Редактор (MVP)

- Async MVP: контент — **markdown**; structured JSON — для live, не сейчас.
- Редактор правит **один working-текст** (session или personal draft). Не composite «база + чужие вставки» в поле ввода.
- Просмотр отправленных черновиков — **отдельный read-only** режим (не в том же editable view).
- Owner merge в hub — вручную в своём редакторе, не через apply в storage.

---

## Права

- Полноценные роли отложены; права через **`capabilities`** с API.
- Round / handoff / ownerHub задают `canEditDraft`, `canSubmitDraft`, `canFixVersion` и т.д.

---

## Отложено

| Тема | Статус |
|------|--------|
| Live (realtime, CRDT/OT) | Отдельный движок |
| JSON doc в async | Нет; только live |
| Inline track changes | Diff + review mode |
| Handoff UI | `turnActorId`, «Сохранить и передать» |
| Diff UI | Клиентский diff есть; экран сравнения — нет |
| Переименование DTO (`workflow`, `canonicalVersionId`) | После стабилизации API |
| LLM tools | Не начато |
| HTTP backend / OpenAPI | После local-адаптера |
| Схлопывание промежуточных versions | После backend |
| 3-way auto-merge | Ручной merge owner'а |
| Open (DAG без owner) | По запросу |
| Смена `workflow` после создания | Избегать |

---

## Прототип `front/`

**Storage:** `codraft.state.v5` — `versions` с `kind: draft|published`; `publish` = promote; `submitDraft`.

| Целевое | В прототипе сейчас |
|---------|-------------------|
| `canonicalVersionId` | `headVersionId` |
| `workflow` / `ownerHub` | `asyncWorkflow` / `owner_hub` |
| `publish` | `fixVersion` (alias) |
| `sessionHolderId` | `activeEditorId` |
| `document.draft` в API | projection из session / owner personal draft |

**Сделано:** round (session draft + lock), ownerHub (personal drafts, submitted inbox), promote, миграция v4→v5.

**Не сделано:** handoff UI; rename DTO; diff UI; HTTP backend.

Демо-документ — `owner_hub`; новые документы по умолчанию — `round`.
