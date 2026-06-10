import { DEV_USERS } from '../config/devUsers'

export const DEMO_DOCUMENT_ID = '22222222-2222-4222-8222-222222222201'
export const DEMO_VERSION_ID = '22222222-2222-4222-8222-222222222211'

export const DEMO_TITLE = 'Архитектурные решения CoDraft'

export const DEMO_CONTENT = `# Архитектурные решения

Краткий лог ключевых решений из обсуждения. Формат: контекст → решение → последствия.

---

## ADR-001: Async и live — отдельные режимы

**Контекст:** Word-подобный и Google Docs-подобный workflow смешивать в одном документе запутывает пользователя и усложняет код.

**Решение:** \`collaborationMode\` задаётся при создании. Сейчас реализуем только \`async\`. Live — отдельный движок позже.

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

**Последствия:** \`hasChangesSinceVersion\` = draft ≠ head.

---

## ADR-004: Комментарии привязаны к версии

**Контекст:** Комментарии к draft ломаются при правках; перенос между версиями неоднозначен.

**Решение:** \`Comment.targetVersionId\` + якорь в тексте этой версии. История ревью читается в контексте конкретной версии.

**Последствия:** При просмотре v1 показываются только комментарии к v1. Статус \`outdated\` — если якорь не найден в текущем контексте просмотра.

---

## ADR-005: Два async-подрежима — handoff и owner hub

**Контекст:** Разные сценарии: пинг-понг двоих vs автор + много ревьюеров.

**Решение:** \`asyncWorkflow: handoff | owner_hub\`. Open (DAG) в MVP не выделяем.

**Последствия:** Два workflow-сервиса поверх общей доменной модели.

---

## ADR-006: Open сворачивается в owner hub

**Контекст:** Параллельные v2a/v2b + merge vs proposals.

**Решение:** Sibling-версии от одного parent заменяются **edits**; слияние в одну main-линию делает owner при фиксации. Чистый Open — только при отсутствии арбитра (отложено).

**Последствия:** Линейная история; параллельность в слое правок.

---

## ADR-007: Diff вычислять, не хранить

**Контекст:** Нужно сравнение версий и правок.

**Решение:** Хранить полный текст снимков; diff на лету при просмотре.

**Последствия:** Проще модель данных; нагрузка при открытии diff UI.

---

## ADR-008: Роли отложены, capabilities заложить позже

**Контекст:** Нужен comment-only без полной RBAC.

**Решение:** MVP без ролей; в API предусмотреть \`canEdit\` / \`canComment\` с сервера.

**Последствия:** Owner hub и handoff задают права implicitly.

---

## ADR-010: Edit и Comment как два типа замечаний

**Контекст:** В ревью нужно различать правку (можно применить) и комментарий (учесть или отклонить).

**Решение:**

- **Edit** (правка): \`scope: document | range\`, статусы \`pending | applied | rejected | superseded\`.
- **Comment**: \`resolution: acknowledged | rejected\` при \`resolved\`.
- Версия хранит \`incorporatedEditIds\`.
- API: \`submitEdit\`, \`applyEdit\`, \`rejectEdit\`, \`resolveComment\`.

**Последствия:** Лента «Замечания» в UI — проекция Edit + Comment, не отдельная сущность в storage.

---

## ADR-009: Owner hub — первый реализуемый async-подрежим

**Контекст:** Два подрежима (handoff и owner hub) описаны в модели; в коде нужно начать с одного, чтобы не размывать MVP.

**Решение:** Первый вертикальный срез в прототипе — **owner hub**:

- создатель документа = \`ownerId\`;
- только owner редактирует draft и фиксирует canonical-версии;
- остальные участники комментируют версии и отправляют **правки**;
- owner сливает правки в draft вручную;
- \`asyncWorkflow\` по умолчанию \`owner_hub\`.

**Handoff** — второй срез после стабилизации owner hub.

**Последствия:** В прототипе: панель замечаний, capabilities, \`incorporatedEditIds\` при фиксации.

---

## Отложено

| Тема | Статус |
|------|--------|
| Live-режим (realtime) | Не проектируем детально |
| Track changes / suggestions | Diff + комментарии достаточно для MVP |
| Чистый Open (DAG без owner) | Только по запросу |
| 3-way auto-merge | Ручной merge owner в draft |
| Смена asyncWorkflow после создания | Избегать; миграция сложна |
| Handoff (передача хода) | После owner hub в коде |
| PHP backend / OpenAPI | После стабилизации local-адаптера |

## Расхождение с прототипом

Реализовано: owner hub, Edit/Comment, capabilities, ReviewPanel. Не реализовано: handoff, diff UI, margin-комментарии, HTTP-адаптер.
`

const [anna, boris, maria] = DEV_USERS

function userRef(user) {
  return { id: user.id, name: user.name }
}

function anchorFor(content, quotedText) {
  const from = content.indexOf(quotedText)
  if (from < 0) return null
  return { from, to: from + quotedText.length, quotedText }
}

function buildDemoEdits(documentId, baseVersionId, content) {
  const documentEditContent = content.replace(
    '**Решение:** Sibling-версии от одного parent заменяются **edits**',
    '**Решение:** Параллельные sibling-версии заменяются слоем **Edit** (правки)',
  )

  const rangeQuote = 'Open (DAG) в MVP не выделяем'
  const rangeAnchor = anchorFor(content, rangeQuote)

  const edits = [
    {
      id: '33333333-3333-4333-8333-333333333301',
      documentId,
      baseVersionId,
      author: userRef(boris),
      scope: 'document',
      summary: 'Уточнил формулировку ADR-006 про Edit вместо proposals',
      status: 'pending',
      title: DEMO_TITLE,
      content: documentEditContent,
      createdAt: '2026-06-08T10:15:00.000Z',
    },
  ]

  if (rangeAnchor) {
    edits.push({
      id: '33333333-3333-4333-8333-333333333302',
      documentId,
      baseVersionId,
      author: userRef(maria),
      scope: 'range',
      summary: 'Предлагаю явно написать, что Open отложен, а не «не выделяем»',
      status: 'pending',
      anchor: rangeAnchor,
      suggestedText: 'Open (DAG) отложен до запроса на равноправные ветки',
      createdAt: '2026-06-08T11:40:00.000Z',
    })
  }

  return edits
}

function buildDemoComments(documentId, baseVersionId, content) {
  const comments = []

  const quoteBoris = 'Word-подобный и Google Docs-подобный workflow'
  const anchorBoris = anchorFor(content, quoteBoris)
  if (anchorBoris) {
    comments.push({
      id: '44444444-4444-4444-8444-444444444401',
      documentId,
      targetVersionId: baseVersionId,
      author: userRef(boris),
      anchor: anchorBoris,
      body: 'Стоит добавить в intro короткую таблицу «когда async, когда live», чтобы читатель не уходил в ADR-001 без контекста.',
      status: 'open',
      resolution: null,
      replies: [],
      createdAt: '2026-06-08T09:30:00.000Z',
      resolvedAt: null,
    })
  }

  const quoteMaria = 'только owner редактирует draft'
  const anchorMaria = anchorFor(content, quoteMaria)
  if (anchorMaria) {
    comments.push({
      id: '44444444-4444-4444-8444-444444444402',
      documentId,
      targetVersionId: baseVersionId,
      author: userRef(maria),
      anchor: anchorMaria,
      body: 'Нужен ли здесь пример сценария «бриф + три ревьюера», или это уже в async-workflows?',
      status: 'open',
      resolution: null,
      replies: [
        {
          id: '44444444-4444-4444-8444-444444444403',
          author: userRef(boris),
          body: 'Думаю, одного абзаца-примера хватит, без дублирования всего workflows.',
          createdAt: '2026-06-08T12:05:00.000Z',
        },
      ],
      createdAt: '2026-06-08T10:55:00.000Z',
      resolvedAt: null,
    })
  }

  const quoteAnna = 'Diff на лету при просмотре'
  const anchorAnna = anchorFor(content, quoteAnna)
  if (anchorAnna) {
    comments.push({
      id: '44444444-4444-4444-8444-444444444404',
      documentId,
      targetVersionId: baseVersionId,
      author: userRef(anna),
      anchor: anchorAnna,
      body: 'Зафиксировать в api-sketch: diff всегда client-side в MVP.',
      status: 'resolved',
      resolution: 'acknowledged',
      replies: [],
      createdAt: '2026-06-07T18:00:00.000Z',
      resolvedAt: '2026-06-08T08:00:00.000Z',
    })
  }

  return comments
}

export function createDemoDocumentState() {
  const createdAt = '2026-06-07T16:00:00.000Z'
  const author = userRef(anna)
  const content = DEMO_CONTENT

  const document = {
    id: DEMO_DOCUMENT_ID,
    createdBy: author,
    ownerId: anna.id,
    collaborationMode: 'async',
    asyncWorkflow: 'owner_hub',
    activeEditorId: null,
    headVersionId: DEMO_VERSION_ID,
    draft: {
      title: DEMO_TITLE,
      content,
      updatedAt: createdAt,
      updatedBy: author,
    },
    createdAt,
  }

  const version = {
    id: DEMO_VERSION_ID,
    documentId: DEMO_DOCUMENT_ID,
    parentVersionId: null,
    number: 1,
    author,
    title: DEMO_TITLE,
    content,
    summary: 'Создание документа',
    incorporatedEditIds: [],
    createdAt,
  }

  return {
    document,
    version,
    edits: buildDemoEdits(DEMO_DOCUMENT_ID, DEMO_VERSION_ID, content),
    comments: buildDemoComments(DEMO_DOCUMENT_ID, DEMO_VERSION_ID, content),
  }
}

export function mergeDemoIntoState(state) {
  if (state.documents.some((item) => item.id === DEMO_DOCUMENT_ID)) {
    return { state, changed: false }
  }

  const demo = createDemoDocumentState()
  state.documents.unshift(demo.document)
  state.versions.push(demo.version)
  state.edits.push(...demo.edits)
  state.comments.push(...demo.comments)
  return { state, changed: true }
}
