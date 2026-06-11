# CoDraft — документация

CoDraft — рабочее пространство для Markdown-документов с асинхронным ревью.

## Навигация

| Документ | О чём |
|----------|--------|
| [vision.md](./vision.md) | Зачем продукт, async / live |
| [domain-model.md](./domain-model.md) | **documents + versions + comments** |
| [async-workflows.md](./async-workflows.md) | round, handoff, ownerHub |
| [api-sketch.md](./api-sketch.md) | Контракт API |
| [decisions.md](./decisions.md) | ADR |

## Текущий фокус

- **Модель:** три таблицы; черновики = `versions.kind: draft`; publish = **promote** ([ADR-017](./decisions.md#adr-017-черновики-как-versions-три-таблицы))
- **round / handoff:** session draft → publish в канон
- **ownerHub:** personal drafts, `submitted`, owner merge в свой draft → publish
- **Базовый режим:** [round](./async-workflows.md#round)

## План

1. ~~Модель данных в доках~~ — ADR-017
2. Выравнивание прототипа под `versions.kind`
3. LLM tools, diff UI, handoff UI
4. HTTP backend

## Статус

Прототип на legacy-схеме (`document.draft`, `edits`, `actorDrafts`) — [расхождение](./decisions.md#расхождение-с-прототипом-front).
