# Async-подрежимы

Три подрежима при `collaborationMode: async`. По умолчанию — **round**.

Модель данных: [хранение](./decisions.md#хранение) — черновики как `versions` с `kind: draft`; публикация — **promote**.

## Общая модель

| Понятие | Смысл |
|---------|--------|
| **canonical** | `version` с `kind: published` |
| **draft** | `version` с `kind: draft`, mutable |
| **publish** | promote draft → published (одна строка) |
| **submit** | `submitted: true` на personal draft (ownerHub, без copy) |

---

## Round

1. Создание → published **v1**.
2. Участник занимает **session** draft → autosave.
3. **«Сохранить»** → promote session draft → vN+1.
4. Новый session draft для следующей сессии (или слот свободен до «Редактировать»).

Комментарии — к **published**. Submissions нет.

| UI | API |
|----|-----|
| Редактировать | `acquireSession` |
| Сохранить | `publish` |
| Отменить | `releaseSession` |

---

## Handoff

Тот же **один session draft**, плюс `document.turnActorId`.

1. Занять session draft может только актор с ходом.
2. **«Сохранить»** → promote.
3. **«Сохранить и передать …»** → promote + `turnActorId := получатель`.

---

## Owner hub

Работа **на уровне черновиков** до publish owner'а.

1. Canonical vN. У каждого — **personal** draft (`parentVersionId = canonical`).
2. Участники правят свой draft; **submit** — флаг `submitted` (owner видит текст).
3. Пока owner **не опубликовал**, участники **могут менять** свои draft'ы (в т.ч. submitted).
4. Owner собирает итог **в своём** personal draft (правки участников + comments к published).
5. Owner **«Сохранить»** → promote **своего** draft → vN+1.
6. Остальные: `needsRebase`.

| | Участник | Owner |
|--|----------|-------|
| Видит | свой draft | свой + чужие `submitted=true` |
| Publish | нет | да |
| Submit | да | нет |

**Нет** apply/reject/copy. Отклонение — не включать в свой draft / comment.

---

## Сравнение

| | Round | Handoff | Owner hub |
|---|-------|---------|-----------|
| Draft | session ×1 | session ×1 | personal ×N |
| Publish | держатель session | актор с ходом | только owner |
| Submit | — | — | флаг на draft |
| `turnActorId` | null | задан | null |

---

## Примеры

- **LLM + пользователь** — round, session draft, publish.
- **Договор, вы + юрист как ревьюер** — ownerHub: юрист submit'ит personal draft, вы merge в свой.
- **Два соавтора по очереди** — handoff, один session draft.
