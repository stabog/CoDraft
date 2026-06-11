# Async-подрежимы

`collaborationMode: async`. По умолчанию — **round**.

Модель: [domain-model.md](./domain-model.md). Решения: [round и пересылка](./decisions.md#round-и-пересылка).

## Общие понятия

| Понятие | Смысл |
|---------|--------|
| **canonical** | `version`, `kind: published` |
| **session draft** | `kind: draft`, `draftRole: session` (только round) |
| **personal draft** | `kind: draft`, `draftRole: personal` (только ownerHub) |
| **publish** | promote → новая published version |
| **closeSession** | выйти из сессии + назначить очередь |

---

## Round

### Жизненный цикл

1. Создание → published **v1**.
2. **`acquireSession`** — занять слот (с учётом `turnActorId`).
3. Autosave в session draft (переживает перезагрузку вкладки, слот держится).
4. **`publish`** («Сохранить») — promote, держатель **остаётся**, новый session draft.
5. Повторять 3–4 сколько нужно (обед, промежуточные версии).
6. **`closeSession`** — завершить владение слотом:
   - **Сохранить и закрыть** — `passTo: null` (дальше любой);
   - **Сохранить и передать ход** — `passTo: конкретный актор`.

### Пересылка документа

Тот же round. Отличие — **`turnActorId`** после `closeSession`:

```
Анна closeSession({ passTo: Борис }) → только Борис может acquireSession
Борис publish… → closeSession({ passTo: null }) → дальше любой
```

### API (целевое)

| UI | Метод |
|----|--------|
| Редактировать | `acquireSession` |
| Сохранить | `publish` |
| Сохранить и закрыть | `closeSession({ passTo: null })` |
| Сохранить и передать ход | `closeSession({ passTo })` |

---

## Owner hub

1. Personal draft на актора от canonical.
2. Участники: правки + **`submit`** (`submitted: true`).
3. Owner: merge в свой draft + **publish**.
4. Остальные: **`needsRebase`**.

| | Участник | Owner |
|--|----------|-------|
| Publish | нет | да |
| Submit | да | нет |
| Видит submitted чужих | нет | да |

---

## Сравнение

| | Round | Owner hub |
|---|-------|-----------|
| Draft | session ×1 | personal ×N |
| Фиксация в канон | `publish` (держатель) | `publish` (owner) |
| Очередь | `turnActorId` | — |
| Закрытие сессии | `closeSession` | — |

---

## Примеры

- **LLM + пользователь** — round, `turnActorId: null`.
- **Два соавтора по очереди** — round, цепочка `closeSession({ passTo })`.
- **Автор + ревьюеры** — ownerHub.
