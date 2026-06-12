# Архитектурные решения

Актуальный список. Детали — [domain-model.md](./domain-model.md), [async-workflows.md](./async-workflows.md), [api-sketch.md](./api-sketch.md).

| Тема | Якорь |
|------|--------|
| Async и live | [#режимы](#режимы-async-и-live) |
| Хранение | [#хранение](#хранение) |
| Подрежимы | [#подрежимы](#подрежимы-workflow) |
| Round и пересылка | [#round](#round-и-пересылка) |
| Owner hub | [#owner-hub](#owner-hub) |
| Редактор | [#редактор](#редактор-mvp) |
| Отложено | [#отложено](#отложено) |
| Прототип | [#прототип](#прототип-front) |

---

## Режимы async и live

- `collaborationMode` при создании; не переключаем.
- Сейчас только **async**. Live — отдельный движок позже.

---

## Хранение

**Три таблицы:** `documents`, `versions`, `comments`. Черновики — `versions` с `kind: draft`.

**Publish = promote** одной строки (без copy). `published` immutable; `draft` mutable до promote.

---

## Подрежимы workflow

`workflow`: **`round`** | **`ownerHub`**. По умолчанию — `round`.

| Режим | Когда |
|-------|--------|
| **round** | Один session draft; фиксация в канон через publish; опциональная очередь (`turnActorId`) |
| **ownerHub** | Personal draft на актора; submit + merge owner'а |

Отдельного `workflow: handoff` **нет**. Пересылка документа между двумя людьми — **round с очередью**.

---

## Round и пересылка

### Сессия

- Один **session draft**; **autosave** в него.
- **`sessionHolderId`** — кто держит слот (в т.ч. на время паузы / обеда).
- Закрытие вкладки **не** снимает слот, пока пользователь не закрыл сессию явно.

### Сохранение = publish

- Любое «Сохранить» — **promote** в canonical.
- За один период владения слотом — **несколько publish** допустимы.
- После publish без закрытия: держатель остаётся, новый session draft от canonical.

### Закрытие сессии (вместо отдельного «Передать ход»)

| UI | `turnActorId` после |
|----|---------------------|
| **Сохранить и закрыть** | `null` — следующий заход у **любого** |
| **Сохранить и передать ход** | конкретный `UserRef` |

Оба варианта — **`closeSession`**: при правках сначала publish, затем `sessionHolderId := null`, назначение очереди. Фиксируются **`turnSetBy`**, **`turnSetAt`**.

Без правок — close без publish.

### Очередь

- **`turnActorId = null`** — открытый round (занять может любой).
- **`turnActorId` задан** — пересылка по цепочке (только этот актор).

---

## Owner hub

- Personal draft на актора; **submit** = флаг `submitted`.
- Owner publish'ит **только свой** draft.
- Закрытие сессии и `turnActorId` к hub **не относятся**.

---

## Редактор (MVP)

- Markdown; один working-текст (session или personal draft).
- Round: черновик в session draft до publish; после закрытия сессии — canonical до следующего `acquireSession`.

### Якорь выделения (комментарии и ИИ)

- **Committed anchor** в `EditorPage` (`selectedRange`) — источник правды для цитаты, промпта и патча; не browser selection.
- **Кисть** в тулбаре (`showAnchorTools`): включена — выделения создают/заменяют якорь; выкл. — обычное выделение (copy/paste).
- **Alt+выделение** — разовый commit без включения кисти.
- Visual: подсветка через ProseMirror decoration; после commit нативное выделение схлопывается.
- **Сброс якоря:** Escape; кнопка «Снять»; в режиме кисти — клик в тексте вне якоря; новое выделение с кистью/Alt заменяет якорь.
- **Сохранение:** клик в сайдбар, вкладки, обычное выделение без кисти — якорь остаётся.
- Кисть в readonly (комментарии) и в review-preview (канон); не в карточках чужих черновиков.
- После **AI apply** якорь обновляется (новый `contextText`, offsets); после **комментария** — сброс.
- Canonical offsets — для патча; PM-позиции — для hit-test и decoration (пересчёт после смены документа).

---

## Отложено

| Тема | Статус |
|------|--------|
| Live / JSON doc | Отдельный движок |
| `closeSession` UI (закрыть / передать ход) | Не в прототипе |
| Diff UI | Нет экрана |
| Rename DTO в коде | В процессе плана |
| LLM tools, HTTP backend | Не начато |
| Лента истории передач хода | Пока только `turnSetBy` / `turnSetAt` |

---

## Прототип `front/`

**Storage v5:** `versions.kind`, promote, `submitDraft` (hub).

**Round сегодня:** session draft, `activeEditorId` (= `sessionHolderId`), publish снимает слот — **расходится** с моделью (publish должен сохранять holder).

**Нет в коде:** `turnActorId`, `turnSetBy`, `closeSession`, «Сохранить и закрыть».

Детали расхождений — в [api-sketch.md](./api-sketch.md#прототип).
