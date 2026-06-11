# Архитектурные решения

Краткий лог ключевых решений из обсуждения. Формат: контекст → решение → последствия.

---

## ADR-001: Async и live — отдельные режимы

**Контекст:** Word-подобный и Google Docs-подобный workflow смешивать в одном документе запутывает пользователя и усложняет код.

**Решение:** `collaborationMode` задаётся при создании. Сейчас реализуем только `async`. Live — отдельный движок позже.

**Последствия:** Общий редактор и оболочка; разная модель истории и синхронизации.

---

## ADR-002: v1 при создании документа

**Контекст:** Нужна ли «незафиксированная» история до первого save?

**Решение:** v1 создаётся сразу с пометкой вроде «Создание документа». Draft = содержимое v1.

**Последствия:** Diff всегда осмысленен; нет состояния «без версий».

---

## ADR-003: Версии immutable, draft mutable

**Контекст:** Что такое «зафиксировать результат»?

**Решение:** Version — неизменяемый снимок. Draft — общая рабочая копия с автосохранением. Фиксация не меняет семантику draft, только добавляет узел в историю.

**Уточнение ([ADR-017](#adr-017-черновики-как-versions-три-таблицы)):** immutable только `kind: published`; `kind: draft` — mutable до **promote**. Одна таблица `versions`, разные правила по `kind`.

**Последствия:** `hasChangesSinceVersion` = draft ≠ canonical.

---

## ADR-004: Комментарии привязаны к версии

**Контекст:** Комментарии к draft ломаются при правках; перенос между версиями неоднозначен.

**Решение:** `Comment.targetVersionId` + якорь в тексте этой версии. История ревью читается в контексте конкретной версии.

**Последствия:** При просмотре v1 показываются только комментарии к v1. Статус `outdated` — если якорь не найден в текущем контексте просмотра.

---

## ADR-005: Async-подрежимы — round, handoff, owner hub

**Контекст:** Разные сценарии: один редактор и версии по раундам vs пинг-понг двоих vs автор + много ревьюеров.

**Решение:** `asyncWorkflow: round | handoff | owner_hub`. По умолчанию — **`round`** ([ADR-015](#adr-015-round--базовый-async-подрежим)). Open (DAG) в MVP не выделяем.

**Последствия:** Общая основа round; handoff и owner hub — расширения поверх неё.

---

## ADR-006: Open сворачивается в owner hub

**Контекст:** Параллельные v2a/v2b + merge vs proposals.

**Решение:** Sibling-версии от одного parent заменяются **proposals**; слияние в одну main-линию делает owner при фиксации. Чистый Open — только при отсутствии арбитра (отложено).

**Последствия:** Линейная история; параллельность в слое proposals.

---

## ADR-007: Diff вычислять, не хранить

**Контекст:** Нужно сравнение версий и proposals.

**Решение:** Хранить полный текст снимков; diff на лету при просмотре.

**Последствия:** Проще модель данных; нагрузка при открытии diff UI.

---

## ADR-008: Роли отложены, capabilities заложить позже

**Контекст:** Нужен comment-only без полной RBAC.

**Решение:** MVP без ролей; в API предусмотреть `canEdit` / `canComment` с сервера.

**Последствия:** Round, handoff и owner hub задают права через `capabilities`.

---

## ADR-010: Edit и Comment как два типа замечаний

> **Частично заменён** [ADR-017](#adr-017-черновики-как-versions-три-таблицы): в ownerHub правки участников — **personal draft** + `submitted`, не отдельная сущность `Edit`. **Comment** остаётся. Ниже — модель прототипа и раннего обсуждения.

**Контекст:** В ревью нужно различать правку (можно применить) и комментарий (учесть или отклонить). Proposal как имя сущности смешивал смысл.

**Решение:**

- **Edit** (правка): `scope: document | range`, статусы `pending | applied | rejected | superseded`.
- **Comment**: `resolution: acknowledged | rejected` при `resolved`.
- Версия хранит `incorporatedEditIds` (не proposal).
- API: `submitEdit`, `applyEdit`, `rejectEdit`, `resolveComment`.

**Последствия:** Лента «Замечания» в UI — проекция Edit + Comment, не отдельная сущность в storage.

---

## ADR-009: Owner hub — первый реализуемый async-подрежим (прототип)

> **Историческое.** Продуктовая модель после [ADR-015](#adr-015-round--базовый-async-подрежим): базовый режим — **round**; handoff и owner hub — расширения. Ниже — порядок ранней реализации в прототипе.

**Контекст:** Два подрежима (handoff и owner hub) описаны в модели; в коде нужно начать с одного, чтобы не размывать MVP.

**Решение:** Первый вертикальный срез в **прототипе** `front/` — **owner hub**:

- создатель документа = `ownerId`;
- только owner редактирует draft и фиксирует canonical-версии;
- остальные участники комментируют версии и отправляют **proposals** (`Edit`);
- owner сливает proposals в draft вручную, diff `head ↔ proposal` и `parent → child`;
- `asyncWorkflow` по умолчанию `owner_hub`; выбор при создании документа — позже.

**Handoff** — следующий срез в коде после стабилизации общей модели ([ADR-013](#adr-013-handoff-и-owner-hub-как-расширения-round)).

**Уточнение (2025):** продуктовый приоритет для сценария «пересылка документов» — **handoff**; owner hub в продукте — прежде всего **арбитраж при конфликтах** ([ADR-013](#adr-013-handoff-и-owner-hub-как-расширения-round)). ADR-009 описывает порядок **реализации в прототипе**, не финальную продуктовую иерархию.

**Последствия:**

- В прототипе сначала: proposals, панель входящих, `canEdit` / `canComment`, `incorporatedEditIds` при фиксации.
- Поля `currentActorId`, `handoff` на версии — в модели данных можно заложить, но UI и логика handoff не в первом срезе.
- Новые документы в демо создаются как owner hub, пока нет переключателя подрежимов.

---

## ADR-011: Head, draft и submit

> **Уточнён** [ADR-017](#adr-017-черновики-как-versions-три-таблицы): head = `published`; draft = `versions.kind: draft`; submit = флаг `submitted` на personal draft (без `Edit`). Актуальная модель — [domain-model.md](./domain-model.md).

**Контекст:** Термин «draft» смешивал каноническую рабочую копию и личный черновик участника. Правки к тексту на md ломают якоря при параллельной работе. Нужна ясная модель «оригинал + рабочая копия».

**Решение:**

- **head** — принятая зафиксированная версия (immutable снимок vN).
- **Автосейв draft** сохраняет незавершённую работу раунда; **не меняет head**.
- **`fixVersion`** — конец раунда: снимок draft → новая версия, head обновляется ([ADR-015](#adr-015-round--базовый-async-подрежим)).

**По подрежимам** (целевое хранение — [ADR-016](#adr-016-единая-таблица-drafts-и-сессия-редактирования)):

| Подрежим | Draft |
|----------|--------|
| **round** (базовый) | Один **session draft**; эксклюзив у держателя сессии |
| **handoff** (расширение) | **Тот же session draft**; занять может только `currentActorId` |
| **owner_hub** (расширение) | Draft **per actor**; участники — **submit** → submission (`Edit` в API) |

- **submit** (`submitEdit` / `submitActorEdit`) — в **owner hub**: diff fork → `Edit`, owner мержит в канон. В **round** и **handoff** слой Edit не обязателен — правки идут через draft → `fixVersion`.
- **Effective content** (чтение, в т.ч. LLM): draft, если есть незафиксированные изменения; иначе head.

**Незасабмиченные изменения (owner hub):**

- Не попадают в head.
- **Не блокируют** публикацию owner'а (gate только по **submitted**).
- При смене head fork с устаревшим `baseVersionId` → **needs rebase**; уведомление.
- В handoff при передаче хода без submit — **confirm-диалог**, без жёсткой блокировки.

**Последствия:**

- Persistence: таблица `drafts` ([ADR-016](#adr-016-единая-таблица-drafts-и-сессия-редактирования)); в прототипе — `document.draft` / `actorDrafts[]`.
- ADR-003 сохраняется для head.

---

## ADR-012: Редактор и просмотр правок (async MVP на md)

**Контекст:** Наложение правок в том же editable view, что и ввод, даёт рассинхрон координат (рендер ≠ модель). Inline track changes в Milkdown — отдельный большой срез. JSON doc полезен для live, не для первого async MVP.

**Решение:**

- **Async MVP:** canonical content — **markdown**; structured JSON doc — для `collaborationMode: live` ([ADR-001](#adr-001-async-и-live--отдельные-режимы)), не для текущего MVP.
- **Редактор** всегда правит **один working-текст** (личный draft / fork от head). Не composite «база + чужие вставки в потоке».
- **Режим просмотра правок** — отдельно, **read-only**: head + overlay pending `Edit` (decorations / diff). Apply / reject — из панели или merge UI, не из preview-редактора.
- **Round / handoff:** один session draft ([ADR-016](#adr-016-единая-таблица-drafts-и-сессия-редактирования)); в прототипе round — `activeEditorId`.
- **Owner hub:** `base = head`, working = draft актора; submit строит diff (+ summary).
- Owner hub: owner правит **свой** draft; чужие изменения — через submitted `Edit`.
- **Edit** якорится к `baseVersionId` (head); смена **чужого** draft owner'ом не сдвигает якоря в storage. Ломается только **применимость к текущему draft** → поиск по `quotedText` + контекст, статус `draft_apply_ok | conflict | stale`.
- Основной сценарий правки — **range** (`scope: range`); **document** — через diff целиком.

**Последствия:**

- Diff UI и review mode — приоритет после базового submit.
- Якоря: эволюция от `{ from, to, quotedText }` к добавлению `contextBefore` / `contextAfter`; не переход на JSON в storage.

---

## ADR-013: Handoff и owner hub как расширения round

**Контекст:** Базовый [round](#adr-015-round--базовый-async-подрежим) покрывает «один редактор, версия по фиксации». Нужны опции для пересылки по очереди и параллельного ревью.

**Решение:**

| Ситуация | Подрежим |
|----------|----------|
| Редактирование по раундам, память LLM, соавторы без очереди | **round** (по умолчанию) |
| Два участника, явная очередь, «мяч у тебя», передача конкретному | **handoff** — расширение round |
| Три и более участника, или **несовместимые** submit'ы к одному head | **owner_hub** — расширение round; арбитраж |
| Несколько submit'ов, все **совместимы** | Auto-merge hunks без полноценного hub UI |

- **Handoff** добавляет к round: `currentActorId`, «Сохранить и передать …», reclaim, confirm ([ADR-016](#adr-016-единая-таблица-drafts-и-сессия-редактирования) — тот же session draft, не fork per actor).
- **Owner hub** добавляет к round: draft per actor, слой submission (`Edit`), owner-only `fixVersion`.

**Последствия:**

- Новые документы по умолчанию — `round`; handoff и owner_hub — опция при создании.
- Прототип `front/` опережал модель (hub/handoff); целевое выравнивание — round ([расхождение](#расхождение-с-прототипом-front)).

---

## ADR-015: Round — базовый async-подрежим

**Контекст:** Нужен простой режим работы с документом: один писатель за раз, канон по фиксации, история версий. Типичный сценарий — документ как **память для LLM**: агент правит в раунде, пользователь вносит коррективы когда нужно, без явной «передачи хода». Handoff и owner hub решают более сложную коллаборацию.

**Решение:**

- **`asyncWorkflow: round`** — подрежим по умолчанию при создании документа.
- **Раунд** — период от начала правок до `fixVersion`. Между раундами документ **открыт**: следующий раунд может начать **любой** участник, в том числе тот же.
- **Один session draft** на документ (не fork per actor); между сессиями слот свободен.
- **Эксклюзив:** держатель session draft (в прототипе — `activeEditorId` на document; целевое — `draft.actorId` держателя, см. [ADR-016](#adr-016-единая-таблица-drafts-и-сессия-редактирования)).
- **`fixVersion`** завершает сессию: снимок session draft → vN+1, слот освобождается, draft = новый head.
- **Чтение (UI, LLM):** *effective content* = draft, если `draft ≠ head`; иначе head. История — `listVersions` / `getVersion` (отдельные tools, не в каждом вызове).
- Слой **Edit** в round **не используется** — правки напрямую через draft → `fixVersion`.
- **Комментарии** к версиям — как в [ADR-004](#adr-004-комментарии-привязаны-к-версии).

**Handoff и owner hub** — опциональные расширения поверх round ([ADR-013](#adr-013-handoff-и-owner-hub-как-расширения-round)); не смешивать семантику очереди/арбитража в базовый round.

**Последствия:**

- API: `acquireEditLock` / `updateDraft` / `releaseEditLock` — занять / autosave / освободить session draft ([ADR-016](#adr-016-единая-таблица-drafts-и-сессия-редактирования)).
- UI: между сессиями — «документ готов к правкам»; во время сессии — кто держит session draft.
- LLM-интеграция: write при занятом session draft; read — effective content + опционально версии по tool.
- **`currentActorId` на document** — только handoff, не round.

---

## ADR-016: Единая таблица drafts и сессия редактирования

> **Частично заменён** [ADR-017](#adr-017-черновики-как-versions-три-таблицы): отдельные `drafts` и `submissions` не используем; черновики — строки `versions`. Ниже — промежуточное решение, оставлено для истории.

**Контекст:** В прототипе черновик встроен в `document.draft`, личные fork'и — в `actorDrafts[]`, эксклюзив round — в `activeEditorId` на document. Обсуждение показало: draft логичнее как **надстройка над version**; round и handoff делят **один** слот редактирования; owner hub — параллельные fork'и без общего lock; канон публикуется через **новую version** при каждом «Сохранить».

**Решение:**

### Сущности persistence (целевая)

| Сущность | Роль |
|----------|------|
| `documents` | Метаданные, `title`, `canonical_version_id`, `version_number`, `workflow`; **`turn_actor_id` только handoff** |
| `versions` | Immutable снимки, линейная main-линия |
| `drafts` | Mutable текст, всегда с `actor_id`; привязка `base_version_id` → versions |
| `submissions` | Owner hub: замороженное предложение при submit (в API/DTO пока `Edit`) |
| `comments` | Замечания к `target_version_id` |

Diff не хранится ([ADR-007](#adr-007-diff-вычислять-не-хранить)).

### Draft как надстройка над version

- Каждая строка `drafts`: `document_id`, `base_version_id`, `actor_id`, `title`, `content`, `updated_at`.
- `base_version_id` — от какого head начата работа; diff в UI: `version(base) ↔ draft`.
- **Не архивировать** draft'ы на каждую версию в истории — только активные рабочие копии.

### Round и handoff — один session draft

- На документ **не больше одного активного session draft** (эксклюзивная сессия).
- **Кто первый занял** — редактирует (`holder` / `actor_id` держателя сессии); остальные ждут.
- **Round:** занять может любой участник, когда session draft свободен.
- **Handoff:** занять может только `documents.turn_actor_id`; после «Сохранить и передать …» — `fixVersion` + смена `turn_actor_id`.
- **`active_editor_id` на document не используется** в целевой модели (эксклюзив на session draft; очередь — `turn_actor_id` только handoff).

### Owner hub — без общего lock

- **Нет** session draft на весь документ.
- У **owner** — свой draft (`actor_id = owner_id`) — канон в работе.
- У **участников** — свои draft'ы; параллельная работа.
- Submit → **submission** (снимок на момент отправки, не живой draft).
- Owner apply/reject → свой draft → `fixVersion`.

### Сохранение = новая version

- **«Сохранить»** (`fixVersion`) — единственная публикация в канон: снимок session draft (round/handoff) или draft owner'а (hub) → vN+1, `canonical_version_id` и `document.title` обновляются.
- **Autosave** во время сессии пишет только в draft, **не** создаёт version.
- После `fixVersion` в round/handoff: session draft освобождается / сбрасывается к новому head.

### Политика B при смене head (owner hub)

- Канонический draft owner'а после `fixVersion`: `base_version_id` и `content` синхронны с новым head.
- **Личные** draft'ы участников с устаревшим `base_version_id`: содержимое **не затирается**, `needs_rebase = true`; rebase вручную от нового head.
- Pending submissions к старому canonical → `superseded` (кроме `incorporated_submission_ids` в version).

### Имена полей (словарь)

`headVersionId` → **`canonicalVersionId`**; `asyncWorkflow` → **`workflow`** (`ownerHub`); `currentActorId` → **`turnActorId`**; `headVersionNumber` / `number` → **`versionNumber`**; `Edit` → **`Submission`** в persistence. Подробно — [domain-model.md](./domain-model.md).

### Handoff в UI

- Рядом с «Сохранить» — «Сохранить и передать …» с выбором получателя → `fixVersion` + `turnActorId := to` (+ опционально `version.handoff.to`).

### Схлопывание версий (отложено)

- Допускается будущая оптимизация: удаление промежуточных versions при сохранении ссылочной целостности (comments, submissions.base_version_id, head).

**Последствия:**

- Прототип `front/` (`document.draft`, `actorDrafts`, `activeEditorId`) — **временное** отображение целевой модели; выравнивание — отдельный срез.
- API: `acquireEditLock` / `releaseEditLock` семантически = занять / освободить **session draft**; в hub — `updateActorDraft` / `updateDraft` по actor.
- [ADR-011](#adr-011-head-draft-и-submit), [ADR-014](#adr-014-видимость-draft-и-публикация), [ADR-015](#adr-015-round--базовый-async-подрежим) остаются в силе по продуктовой семантике; меняется **расклад по таблицам** и поля lock/turn.

---

## ADR-017: Черновики как versions, три таблицы

**Контекст:** Отдельные `drafts`, `submissions`, copy при submit и `applyEdit` усложняли модель. Нужен минимальный persistence и один механизм публикации.

**Решение:**

### Три таблицы

`documents`, `versions`, `comments`. Черновики — `versions` с `kind: draft`.

### Version: два kind

| `kind` | Поведение |
|--------|-----------|
| `published` | Канон; `versionNumber`; **immutable**; без `parentVersionId` |
| `draft` | Рабочая копия; `parentVersionId` → canonical; **mutable**; `draftRole`: `session` \| `personal` |

### Публикация — только promote

«Сохранить» меняет **ту же строку**: `kind: draft` → `published`, присваивается `versionNumber`. **Copy не используем.**

- **round / handoff:** promote session draft.
- **ownerHub:** promote **только** personal draft owner'а.

### ownerHub без submissions

- Участники: personal draft + флаг **`submitted`** (та же строка, без copy).
- Owner видит personal draft'ы с `submitted=true` (живые, могут меняться до publish owner'а).
- Owner **вручную** собирает итог в своём personal draft (правки + comments к published).
- **Нет** `apply`/`reject`; отклонение — не переносить в свой draft / comment.
- Publish owner'а не блокируется незасабмиченными черновиками.
- После publish: `needsRebase` на draft'ах от старого canonical.

### Имена

`canonicalVersionId`, `workflow`, `turnActorId`, `versionNumber`, `authorId` на version. Handoff только на document.

**Последствия:** [domain-model.md](./domain-model.md), [api-sketch.md](./api-sketch.md). Прототип (`edits`, `actorDrafts`) — legacy.

---

## ADR-014: Видимость draft и публикация

**Контекст:** Всегда видимые черновики всех участников дают координацию, но шум, давление и риск преждевременных конфликтов. Полная скрытность до submit — приватность, но сюрпризы при publish.

**Решение** (уточнено [ADR-017](#adr-017-черновики-как-versions-три-таблицы)):

- **Round / handoff:** session draft виден на чтение; эксклюзив на запись у держателя.
- **Owner hub:** участники не видят чужие personal draft'ы до submit. Owner видит draft'ы с **`submitted=true`** (живой текст до publish owner'а).
- **Публикация:** promote draft owner'а (hub) или session draft (round/handoff). Незасабмиченные черновики **не блокируют** publish.
- После publish: `needsRebase`; уведомление участникам.

**Сценарий:** owner публикует, участник правил, но не submit'ил → vN+1 из draft owner; правки участника **не в каноне**; draft участника needs rebase; уведомление.

**Последствия:**

- UI: явное различие «Черновик сохранён» vs «Отправлено на рассмотрение».
- Метаданные «у кого есть неотправленный черновик» без текста — возможное расширение без смены ADR.

---

## Отложено

| Тема | Статус |
|------|--------|
| Live-режим (realtime) | Не проектируем детально; JSON doc — там ([ADR-012](#adr-012-редактор-и-просмотр-правок-async-mvp-на-md)) |
| Inline track changes в редакторе | Отдельно от diff + review mode ([ADR-012](#adr-012-редактор-и-просмотр-правок-async-mvp-на-md)) |
| Чистый Open (DAG без owner) | Только по запросу |
| 3-way auto-merge | Ручной merge арбитра; auto только для совместимых hunks ([ADR-013](#adr-013-handoff-и-owner-hub-как-расширения-round)) |
| Смена asyncWorkflow после создания | Избегать; миграция сложна |
| Round: session draft | [ADR-017](#adr-017-черновики-как-versions-три-таблицы); прототип — `activeEditorId` |
| Personal draft per actor | [ADR-017](#adr-017-черновики-как-versions-три-таблицы); `kind=draft`, `draftRole=personal` |
| Схлопывание промежуточных versions | [ADR-017](#adr-017-черновики-как-versions-три-таблицы); после backend |
| Owner видит submitted drafts | [ADR-014](#adr-014-видимость-draft-и-публикация), [ADR-017](#adr-017-черновики-как-versions-три-таблицы) |
| PHP backend / OpenAPI | После стабилизации local-адаптера по [api-sketch.md](./api-sketch.md) |

## Расхождение с прототипом `front/`

**Целевая модель:** `workflow: round` по умолчанию ([ADR-015](#adr-015-round--базовый-async-подрежим)); хранение — [ADR-017](#adr-017-черновики-как-versions-три-таблицы) (`documents` + `versions` + `comments`; draft = version с `kind: draft`).

**Реализовано (round, прототип):** `codraft.state.v4`, встроенный `document.draft`, `activeEditorId` на document (временная схема), `acquireEditLock` / `releaseEditLock`, `fixVersion`, capabilities, миграция v3→v4.

**Реализовано (owner hub, прототип):** демо `ownerHub`, Edit/Comment, `actorDrafts[]` (целевой аналог — `versions` kind=draft), submit/rebase/apply, ReviewPanel.

**Не реализовано:** целевая схема `versions.kind`; handoff (`turnActorId`, «Сохранить и передать»); `publish`/`submitDraft` вместо edits; LLM tools; diff UI; HTTP backend.

**Расширения (опционально):** схлопывание промежуточных versions; явный выбор `owner_hub` при создании.
