# CoDraft — документация

CoDraft — рабочее пространство для Markdown-документов с асинхронным ревью. Цель: заменить пересылку Word-файлов прозрачной историей версий, комментариями и сравнением правок.

## Навигация

| Документ | О чём |
|----------|--------|
| [vision.md](./vision.md) | Зачем продукт, режимы сотрудничества (async / live) |
| [domain-model.md](./domain-model.md) | Сущности, инварианты, права |
| [async-workflows.md](./async-workflows.md) | Подрежимы async: handoff и owner hub, примеры |
| [api-sketch.md](./api-sketch.md) | Контракт адаптера (DTO, методы, owner hub) |
| [decisions.md](./decisions.md) | Принятые решения и отложенное |

## Текущий фокус

- **Режим:** async (как Word), не live (как Google Docs)
- **MVP async:** [owner hub](./async-workflows.md#owner-hub-владелец--предложения) — основной подрежим для первой реализации ([ADR-009](./decisions.md#adr-009-owner-hub--первый-реализуемый-async-подрежим))
- **Позже:** [handoff](./async-workflows.md#handoff-по-очереди) — второй срез
- **Прототип:** `front/` — локальный адаптер, зачаток async без подрежимов

## План реализации (owner hub)

1. ~~Зафиксировать owner hub как MVP~~ — [ADR-009](./decisions.md#adr-009-owner-hub--первый-реализуемый-async-подрежим)
2. ~~[api-sketch.md](./api-sketch.md)~~ — контракт адаптера
3. ~~Модель Edit + Comment, `localDocumentsApi` v2~~ — [ADR-010](./decisions.md#adr-010-edit-и-comment-как-два-типа-замечаний)
4. ~~Owner hub в прототипе: capabilities, fixVersion, ReviewPanel~~
5. Дальше: diff, margin-комментарии, range-edit из выделения

## Статус

Прототип на `codraft.state.v2` и owner hub API. Создайте документ под своим `user.id` — вы owner; другой id в localStorage → режим участника.
