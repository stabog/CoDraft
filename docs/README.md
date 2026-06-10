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
- **Основа:** head + draft + `fixVersion` = конец раунда ([ADR-011](./decisions.md#adr-011-head-draft-и-submit))

## План (актуальный)

1. ~~Edit + Comment в прототипе~~ — [ADR-010](./decisions.md#adr-010-edit-и-comment-как-два-типа-замечаний)
2. **Round в коде:** `activeEditorId`, shared draft, lock при правке, `fixVersion` сбрасывает раунд — [ADR-015](./decisions.md#adr-015-round--базовый-async-подрежим)
3. LLM tools: effective content, `list_versions`, `get_version`
4. Diff UI, review mode для owner hub
5. Handoff и owner hub как явный выбор при создании документа

## Статус

Прототип `front/` опережает целевую модель (actorDrafts, owner hub API). Выравнивание под **round** — [decisions.md § прототип](./decisions.md#расхождение-с-прототипом-front).
