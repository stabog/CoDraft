// src/services/llmResponseService.js
// Версия для упрощенной схемы (массив объектов напрямую)
import llmService from './llmService.js'

import StreamJsonItemsParserSimple from './StreamJsonItemsParserSimple.js'
import StreamJsonPathParser from './StreamJsonPathParser.js'

/**
 * Универсальный сервис запроса к LLM для упрощенной схемы:
 *  - Режимы: stream / non-stream x text / json (structured)
 *  - Проксирует transport-опции (token, signal, timeoutMs, retries, referer, title)
 *  - Безопасный парсинг JSON (structured)
 *  - Единая маршрутизация handlers и meta.usage
 *  - Работает с массивом объектов: [{ kind, data, ... }, ...]
 *
 * Для stream+structured парсеры включаются по наличию handlers:
 *  - onJsonItem — поэлементно (полные объекты)
 *  - onJsonPathValue({ path, value }, context) — по путям (path: "data.variants" или "0.data.variants")
 *  можно передать оба — будут работать оба парсера
 */

const DEFAULT_MODEL = import.meta.env.VITE_LLM_MODEL

export async function universalRequest({
  messages,
  model = DEFAULT_MODEL,
  jsonSchema,
  props = {},
}) {
  const {
    stream = false,
    structured = false,
    temperature = 0.7,
    max_tokens = 1000,
    n = 1,
    providerSort = 'price',
    handlers = {},
    context: externalContext = {},
    transport = {}, // { token, referer, title, signal, timeoutMs, retries }
  } = props || {}

  const requestData = buildUniversalRequestData({
    messages,
    model,
    jsonSchema,
    options: { structured, temperature, max_tokens, n, providerSort },
  })

  const baseContext = {
    ...externalContext,
    model,
    structured,
    type: structured ? 'json' : 'text',
    mode: stream ? 'stream' : 'non-stream',
  }

  safeCall(() => handlers.onStart && handlers.onStart(baseContext))

  try {
    if (!stream && !structured) {
      return await handleNonStreamText(requestData, { handlers, context: baseContext, transport })
    } else if (!stream && structured) {
      return await handleNonStreamJson(requestData, { handlers, context: baseContext, transport })
    } else if (stream && !structured) {
      return await handleStreamText(requestData, { handlers, context: baseContext, transport })
    } else {
      // stream && structured
      return await handleStreamJson(requestData, {
        handlers,
        context: baseContext,
        transport,
        jsonSchema,
      })
    }
  } catch (error) {
    console.error('LLM request error:', error)
    const norm = normalizeError(error)
    safeCall(() => handlers.onError && handlers.onError(norm, baseContext))
    throw norm
  }
}

export function buildUniversalRequestData({
  messages,
  model = DEFAULT_MODEL,
  jsonSchema,
  options = {},
}) {
  const {
    structured = false,
    temperature = 0.7,
    max_tokens = 1000,
    n = 1,
    providerSort = 'price',
    reasoning,
  } = options || {}

  const requestData = {
    model: model || DEFAULT_MODEL, // Используем переданную модель или дефолтную
    messages,
    provider: { sort: providerSort },
    n,
    temperature,
    max_tokens,
    reasoning: reasoning ?? { exclude: true, effort: 'minimal' },
  }

  if ((structured || jsonSchema) && jsonSchema) {
    requestData.response_format = jsonSchema
  }

  return requestData
}

export default {
  universalRequest,
  buildUniversalRequestData,
}

// ---------- Внутренние обработчики режимов ----------

async function handleNonStreamText(requestData, { handlers = {}, context, transport } = {}) {
  const response = await llmService.sendMessageWithHandlers(
    requestData,
    {
      onEvent: (evt) => safeCall(() => handlers.onEvent && handlers.onEvent(evt, context)),
      onDone: () => {},
      onError: (err) => safeCall(() => handlers.onError && handlers.onError(normalizeError(err), context)),
    },
    transport
  )

  const text = response?.choices?.[0]?.message?.content ?? ''
  const usage = response?.usage || response?.choices?.[0]?.usage || null

  safeCall(() => handlers.onTextDone && handlers.onTextDone(
    { text, raw: response, meta: usage ? { usage } : undefined },
    context
  ))

  return text
}

async function handleNonStreamJson(requestData, { handlers = {}, context, transport } = {}) {
  const response = await llmService.sendMessageWithHandlers(
    requestData,
    {
      onEvent: (evt) => safeCall(() => handlers.onEvent && handlers.onEvent(evt, context)),
      onDone: () => {},
      onError: (err) => safeCall(() => handlers.onError && handlers.onError(normalizeError(err), context)),
    },
    transport
  )

  const choice = response?.choices?.[0]
  const rawText = choice?.message?.content ?? ''
  const usage = response?.usage || choice?.usage || null
  const finishReason = choice?.finish_reason ?? choice?.native_finish_reason
  const truncated = finishReason === 'length' || finishReason === 'MAX_TOKENS'

  let json
  try {
    json = parseStructuredJson(rawText)
  } catch (parseError) {
    if (truncated) {
      const err = new Error(
        'Ответ LLM обрезан по лимиту токенов. Попробуйте ещё раз или смените модель.',
      )
      err.raw = rawText
      err.finishReason = finishReason
      throw err
    }
    throw parseError
  }

  safeCall(() => handlers.onJsonDone && handlers.onJsonDone(
    { json, raw: response, meta: usage ? { usage } : undefined },
    context
  ))

  return json
}

async function handleStreamText(requestData, { handlers = {}, context, transport } = {}) {
  let collectedText = ''
  let lastUsage = null

  await llmService.streamMessage(
    requestData,
    {
      onToken: (token) => {
        collectedText += token
        safeCall(() => handlers.onTextDelta && handlers.onTextDelta({ chunk: token }, context))
      },
      onEvent: (evt) => {
        if (evt?.usage) {lastUsage = evt.usage}
        safeCall(() => handlers.onEvent && handlers.onEvent(evt, context))
      },
      onDone: (info) => {
        lastUsage = info?.usage || lastUsage
        safeCall(() => handlers.onTextDone && handlers.onTextDone(
          { text: collectedText, meta: lastUsage ? { usage: lastUsage } : undefined },
          context
        ))
      },
      onError: (err) => {
        safeCall(() => handlers.onError && handlers.onError(normalizeError(err), context))
      },
    },
    transport
  )

  return collectedText
}

async function handleStreamJson(requestData, {
  handlers = {},
  context,
  transport,
  jsonSchema,
} = {}) {
  let collectedText = ''
  let lastUsage = null

  const parser = handlers.onJsonItem ? new StreamJsonItemsParserSimple() : null
  const pathParser = handlers.onJsonPathValue ? new StreamJsonPathParser({
    onPathValue: ({ path, value }) => {
      safeCall(() => handlers.onJsonPathValue && handlers.onJsonPathValue({ path, value }, context))
    },
    onPartialValue: handlers.onJsonPathPartial
      ? ({ path, value }) => {
          safeCall(() => handlers.onJsonPathPartial({ path, value }, context))
        }
      : null,
  }) : null

  const items = []
  let index = 0

  await llmService.streamMessage(
    requestData,
    {
      onToken: (chunk) => {
        collectedText += chunk

        safeCall(() => handlers.onTextDelta && handlers.onTextDelta({ chunk }, context))

        if (pathParser) {
          pathParser.feed(chunk)
        }

        if (parser) {
          const { items: ready } = parser.feed(chunk)

          if (ready && ready.length > 0) {
            for (const it of ready) {
              items.push(it)
              if (import.meta.env.DEV) {
                console.debug('[ActionBlocks:Stream] onToken onJsonItem', index, it?.kind, it?.id)
              }
              safeCall(() => handlers.onJsonItem && handlers.onJsonItem(
                { item: it, index },
                context
              ))
              index++
            }
          }
        }
      },
      onEvent: (evt) => {
        if (evt?.usage) {lastUsage = evt.usage}
        safeCall(() => handlers.onEvent && handlers.onEvent(evt, context))
      },
      onDone: (info) => {
        lastUsage = info?.usage || lastUsage

        if (pathParser) {
          pathParser.finish()
        }

        let finalJson = null

        if (parser) {
          const { items: tail } = parser.finish()

          if (import.meta.env.DEV) {
            console.debug('[ActionBlocks:Stream] onDone: parser.finish tail length', tail?.length ?? 0, 'items.length', items.length)
          }
          if (tail && tail.length > 0) {
            for (const it of tail) {
              items.push(it)
              if (import.meta.env.DEV) {
                console.debug('[ActionBlocks:Stream] onDone tail onJsonItem', index, it?.kind, it?.id)
              }
              safeCall(() => handlers.onJsonItem && handlers.onJsonItem(
                { item: it, index },
                context
              ))
              index++
            }
          }
        }

        try {
          const cleanText = stripCodeFencesAndTrim(collectedText)
          finalJson = unwrapJsonString(JSON.parse(cleanText))
        } catch {
          try {
            finalJson = parseStructuredJson(collectedText)
          } catch {
            console.warn('Failed to parse full JSON, using items array instead')
            finalJson = items.length > 0 ? items : []
          }
        }

        // Если ответ — объект с массивом (обёртка API), берём массив
        if (finalJson && typeof finalJson === 'object' && !Array.isArray(finalJson)) {
          const arr = finalJson.items ?? finalJson.data ?? finalJson.response ?? finalJson.result ?? finalJson.output
          if (Array.isArray(arr)) {finalJson = arr}
        }
        // Для single-edit допускаем одиночный объект:
        // приводим к массиву, чтобы отработал единый catch-up/dipatch-пайплайн.
        if (finalJson && typeof finalJson === 'object' && !Array.isArray(finalJson) && finalJson.kind) {
          finalJson = [finalJson]
        }
        // Отладка: финальный JSON и количество элементов из потока
        // Если поток не отдал элементы или отдал меньше — добиваем из финального JSON
        if (parser && Array.isArray(finalJson) && finalJson.length > 0) {
          const catchUpFrom = items.length
          if (import.meta.env.DEV && catchUpFrom < finalJson.length) {
            console.debug('[ActionBlocks:Stream] onDone: catch-up onJsonItem', catchUpFrom, '..', finalJson.length - 1, 'total', finalJson.length)
          }
          for (let i = items.length; i < finalJson.length; i++) {
            const el = finalJson[i]
            if (import.meta.env.DEV) {
              console.debug('[ActionBlocks:Stream] catch-up onJsonItem', i, el?.kind, el?.id)
            }
            safeCall(() => handlers.onJsonItem && handlers.onJsonItem(
              { item: el, index: i },
              context
            ))
          }
        }

        if (import.meta.env.DEV) {
          console.debug('[ActionBlocks:Stream] onDone: final items.length', items.length, 'finalJson.length', Array.isArray(finalJson) ? finalJson.length : 'n/a')
        }

        safeCall(() => handlers.onJsonDone && handlers.onJsonDone(
          { json: finalJson, meta: lastUsage ? { usage: lastUsage } : undefined, raw: collectedText },
          context
        ))
      },
      onError: (err) => {
        safeCall(() => handlers.onError && handlers.onError(normalizeError(err), context))
      }
    },
    transport
  )

  try {
    if (parser && items.length > 0) {return items}
    const parsed = parseStructuredJson(collectedText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.kind) {
      return [parsed]
    }
    return parsed
  } catch {
    console.warn('Final JSON parsing failed, returning items array or empty array')
    return items.length > 0 ? items : []
  }
}


// ---------- Утилиты ----------

function safeCall(fn) {
  try { fn && fn() } catch { /* no-op */ }
}

function normalizeError(err) {
  if (!err) {return { message: 'Unknown error' }}
  if (err.name === 'AbortError') {return { message: 'Aborted', code: 'ABORTED' }}
  if (typeof err === 'string') {return { message: err }}
  if (err instanceof Error) {
    const out = { message: err.message }
    if (err.status) {out.status = err.status}
    if (err.statusText) {out.statusText = err.statusText}
    if (err.body) {out.body = err.body}
    if (err.code) {out.code = err.code}
    return out
  }
  try {
    return { message: err.message || 'Error', code: err.code, details: err }
  } catch {
    return { message: 'Error' }
  }
}

/** Распаковка двойного экранирования: если результат — строка с JSON, парсим ещё раз */
export function unwrapJsonString(value) {
  if (typeof value !== 'string') {return value}
  const t = value.trim()
  if ((t.startsWith('[') || t.startsWith('{')) && t.length > 1) {
    try {
      const parsed = JSON.parse(value)
      return unwrapJsonString(parsed)
    } catch {}
  }
  return value
}

/** Надёжный парсинг JSON для non-stream structured */
function parseStructuredJson(text) {
  try {
    const parsed = JSON.parse(text)
    return unwrapJsonString(parsed)
  } catch {}
  const cleaned = stripCodeFencesAndTrim(text)
  try {
    const parsed = JSON.parse(cleaned)
    return unwrapJsonString(parsed)
  } catch {}
  const extracted = extractFirstJson(cleaned)
  if (extracted != null) {return unwrapJsonString(extracted)}
  const err = new Error('Failed to parse structured JSON from model output')
  err.raw = text
  throw err
}

function stripCodeFencesAndTrim(s) {
  if (!s) {return ''}
  let t = s.trim()
  const fencedMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    t = fencedMatch[1]
  }
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '')
    t = t.replace(/```$/i, '')
  }
  t = t.replace(/```/g, '')
  t = t.replace(/^\uFEFF/, '')
  return t.trim()
}

function extractFirstJson(s) {
  if (!s) {return null}
  const obj = findBalancedJson(s, '{', '}')
  if (obj != null) {return obj}
  const arr = findBalancedJson(s, String.raw`\[`, String.raw`\]`)
  if (arr != null) {return arr}
  return null
}

function findBalancedJson(s, openCh, closeCh) {
  const open = new RegExp(openCh, 'g')
  const close = new RegExp(closeCh, 'g')
  const opens = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c.match(open)) {opens.push(i)}
    else if (c.match(close) && opens.length > 0) {
        const start = opens.pop()
        const candidate = s.slice(start, i + 1).trim()
        try { return JSON.parse(candidate) } catch {}
      }
  }
  return null
}
