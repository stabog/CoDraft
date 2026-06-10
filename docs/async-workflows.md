# Async-подрежимы

Внутри `collaborationMode: async` — три подрежима. Выбираются при создании документа.

**По умолчанию — [round](#round-по-раундам).** [Handoff](#handoff-расширение) и [owner hub](#owner-hub-расширение) — опциональные расширения ([ADR-013](./decisions.md#adr-013-handoff-и-owner-hub-как-расширения-round), [ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)).

## Общая модель

| Понятие | Смысл |
|---------|--------|
| **head** | Принятая version (vN), immutable |
| **draft** | Mutable копия от `base_version_id`; autosave не создаёт version |
| **session draft** | Round/handoff: **один** слот на документ; кто занял — редактирует |
| **Сохранить** | `fixVersion` → новая version, канон обновлён |
| **Effective content** | Session draft или draft owner'а, если ≠ head; иначе head |

---

## Round (по раундам)

> **Статус:** базовый подрежим ([ADR-015](./decisions.md#adr-015-round--базовый-async-подрежим), [ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)).

**Метафора:** чекпоинты в истории — один пишет, сохраняет в version, любой может начать следующую сессию.

### Поток

1. Создание → **v1**; session draft свободен.
2. Участник **занимает** session draft (первый свободный) → правки, autosave в draft.
3. Остальные **ждут**, пока слот занят.
4. **«Сохранить»** (`fixVersion`) → vN+1, session draft освобождается (= head).
5. Следующую сессию может начать **любой** участник.

Submissions **не используются**. Комментарии к versions — [ADR-004](./decisions.md#adr-004-комментарии-привязаны-к-версии).

### UX (ориентиры)

- Между сессиями: документ = head, готов к правкам.
- Во время сессии: кто держит session draft.
- Autosave — в draft; **«Сохранить»** — единственная публикация version.
- **«Редактировать»** — занять session draft от head.
- **«Отменить»** — освободить session draft, откат к head.

| UI | API / модель |
|----|----------------|
| Редактировать | занять session draft |
| Сохранить | `fixVersion` |
| Отменить | освободить session draft (откат к head) |
| Autosave | `updateDraft` / update session draft |

---

## Handoff (расширение)

> **Статус:** опционально; пересылка Word ([ADR-013](./decisions.md#adr-013-handoff-и-owner-hub-как-расширения-round)).

**Метафора:** «мяч у тебя» — тот же **один session draft**, что в round, плюс очередь на document.

### Отличие от round

| | Round | Handoff |
|---|-------|---------|
| Session draft | один | **тот же один** |
| Кто может занять | любой | только **`currentActorId`** |
| Поле на document | `currentActorId = null` | `currentActorId` = чей ход |
| Передача хода | не нужна | **«Сохранить и передать …»** |

### Поток

1. Создание → v1, `currentActorId` = создатель.
2. Актор с ходом занимает session draft, правит, autosave.
3. **«Сохранить»** → vN+1; или **«Сохранить и передать …»** → vN+1 + `currentActorId := получатель`.
4. Session draft освобождается; следующий актор с ходом занимает слот.

### UX

- Badge «Твой ход».
- Выпадающий список у «Сохранить»: передать конкретному участнику.
- Reclaim, confirm при передаче без сохранения — по [ADR-011](./decisions.md#adr-011-head-draft-и-submit).

---

## Owner hub (расширение)

> **Статус:** опционально; арбитраж при 3+ ([ADR-013](./decisions.md#adr-013-handoff-и-owner-hub-как-расширения-round)).

**Метафора:** maintainer собирает параллельную обратную связь.

### Отличие от round/handoff

- **Нет** общего session draft и **нет** lock на весь документ.
- У каждого актора **свой** draft от текущего head.
- Участники **submit** → submissions (Edit); owner **apply/reject** → свой draft → **«Сохранить»**.

### Поток

1. Owner создаёт документ → v1, свой draft.
2. Участники параллельно: свой draft + комментарии + submit.
3. Owner: diff, apply/reject, правит свой draft.
4. **«Сохранить»** → v2; submissions к старому head → `superseded`.
5. Чужие draft'ы: **политика B** — `needsRebase`, rebase вручную ([ADR-016](./decisions.md#adr-016-единая-таблица-drafts-и-сессия-редактирования)).

Видимость живых fork'ов — [ADR-014](./decisions.md#adr-014-видимость-draft-и-публикация).

---

## Сравнение подрежимов

| | Round | Handoff | Owner hub |
|---|-------|---------|-----------|
| По умолчанию | **да** | опция | опция |
| Draft | Один **session** | Один **session** | Draft **per actor** |
| Lock | Session draft | Session + `currentActorId` | Нет общего lock |
| Сохранение | `fixVersion` | `fixVersion` (+ передать) | Owner `fixVersion` |
| Параллельные правки | Нет | Нет | Да (draft + submit) |
| Submissions | Нет | Нет | Да |
| `currentActorId` | null | задан | null |

---

## Примеры

### Память LLM + правки пользователя

- **Round** — агент занимает session draft, сохраняет version; пользователь — следующая сессия.

### Договор: вы + юрист

- **Owner hub** — вы owner, юрист submit'ит.
- **Handoff** — соавторство по очереди, один session draft.

### Бриф: вы + 5 коллег

- **Owner hub** — параллельные submissions.

### Два маркетолога

- **Handoff** — пинг-понг с «Сохранить и передать».
- **Round** — без очереди, кто первый занял session draft.
