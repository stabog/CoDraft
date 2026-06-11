# CoDraft — документация

CoDraft — рабочее пространство для Markdown-документов с асинхронным ревью.

## Навигация

| Документ | О чём |
|----------|--------|
| [vision.md](./vision.md) | Зачем продукт, async / live |
| [domain-model.md](./domain-model.md) | **documents + versions + comments** |
| [async-workflows.md](./async-workflows.md) | round, handoff, ownerHub |
| [api-sketch.md](./api-sketch.md) | Контракт API |
| [decisions.md](./decisions.md) | Актуальные архитектурные решения |

## Текущий фокус

- **Модель:** три таблицы; черновики = `versions.kind: draft`; publish = **promote** ([хранение](./decisions.md#хранение))
- **round / handoff:** session draft → publish в канон
- **ownerHub:** personal drafts, `submitted`, owner merge в свой draft → publish
- **Базовый режим:** [round](./async-workflows.md#round)

## План

1. ~~Модель данных в доках~~
2. ~~Выравнивание прототипа под `versions.kind`~~ (v5)
3. Handoff UI, diff UI, rename DTO
4. LLM tools
5. HTTP backend

## Статус

Прототип v5 — [decisions.md#прототип](./decisions.md#прототип-front).
