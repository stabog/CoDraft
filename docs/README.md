# CoDraft — документация

CoDraft — рабочее пространство для Markdown-документов с асинхронным ревью. Цель: заменить пересылку Word-файлов прозрачной историей версий, комментариями и сравнением правок.

## Навигация

| Документ | О чём |
|----------|--------|
| [vision.md](./vision.md) | Зачем продукт, режимы сотрудничества (async / live) |
| [domain-model.md](./domain-model.md) | Сущности, инварианты, права |
| [async-workflows.md](./async-workflows.md) | Подрежимы async: round, handoff, owner hub |
| [api-sketch.md](./api-sketch.md) | Контракт адаптера (DTO, методы) |
| [decisions.md](./decisions.md) | Принятые решения и отложенное |

## Текущий фокус

- **Режим:** async (как Word), не live (как Google Docs); content — **md** в async ([ADR-012](./decisions.md#adr-012-редактор-и-просмотр-правок-async-mvp-на-md))
- **Базовый подрежим:** [round](./async-workflows.md#round-по-раундам) — один редактор за раз, фиксация по раундам, документ как память (в т.ч. LLM) ([ADR-015](./decisions.md#adr-015-round--базовый-async-подрежим))
- **Расширения (опционально):** [handoff](./async-workflows.md#handoff-расширение) — очередь и передача хода; [owner hub](./async-workflows.md#owner-hub-расширение) — арбитраж при 3+ ([ADR-013](./decisions.md#adr-013-handoff-и-owner-hub-как-расширения-round))
- **Основа:** head + drafts + `fixVersion` = публикация version ([ADR-011](./decisions.md#adr-011-head-draft-и-submit), [ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования))
- **Хранение (целевое):** единая `drafts`; round/handoff — один session draft; handoff — `currentActorId`; hub — draft per actor + submissions

## План (актуальный)

1. ~~Edit + Comment в прототипе~~ — [ADR-010](./decisions.md#adr-010-edit-и-comment-как-два-типа-замечаний)
2. **Документация модели** — [ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)
3. Выравнивание прототипа: `drafts[]`, session draft, `currentActorId` только handoff
4. LLM tools: effective content, `list_versions`, `get_version`
5. Diff UI; handoff UI («Сохранить и передать»)
6. HTTP backend по [api-sketch.md](./api-sketch.md)

## Статус

Прототип `front/` — `document.draft`, `activeEditorId`, `actorDrafts` ([расхождение](./decisions.md#расхождение-с-прототипом-front)). Целевая схема — [domain-model.md](./domain-model.md).
