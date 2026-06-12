// src/services/llmService.js

/**
 * Низкоуровневый клиент OpenRouter (non-stream + SSE stream).
*/

const DEFAULT_API_URL = import.meta.env.VITE_LLM_PATH
const DEFAULT_API_KEY = import.meta.env.VITE_LLM_KEY

/** Пауза (ms) */
const delay = (ms) => new Promise((r) => setTimeout(r, ms))


/**
 * Собираем заголовки авторизации.
 * Передавайте token через аргументы или используйте runtime-хранилище/ENV.
 */
function buildAuthHeaders({ token, referer, title } = {}) {
  const hdr = {
    'Content-Type': 'application/json',
  }
  let auth = token ?? DEFAULT_API_KEY
  hdr['Authorization'] = `Bearer ${auth}`
  if (referer) {hdr['HTTP-Referer'] = referer}
  if (title) {hdr['X-Title'] = title}
  return hdr
}


/**
 * Базовый fetch с ретраями и таймаутом
 */
async function fetchWithRetry(url, options = {}) {
  const {
    retries = 0,
    retryDelayBaseMs = 400,
    retryOn = (res) => res.status === 429 || (res.status >= 500 && res.status <= 599),
    timeoutMs,
    signal,
    // остальные поля — для fetch()
    ...fetchInit
  } = options

  const controller = new AbortController()
  const signals = [controller.signal]
  if (signal) {signals.push(signal)}

  let timeoutId = null
  if (timeoutMs && Number.isFinite(timeoutMs)) {
    timeoutId = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs} ms`)), timeoutMs)
  }

  let attempt = 0
  let lastErr = null

  try {
    while (attempt <= retries) {
      try {
        const res = await fetch(url, { ...fetchInit, signal: mergeSignals(signals) })
        if (!res.ok && retryOn(res) && attempt < retries) {
          const waitMs = retryDelayBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100)
          await delay(waitMs)
          attempt++
          continue
        }
        return res
      } catch (error) {
        // abort/сеть — решаем, ретраить ли
        lastErr = error
        if (attempt < retries) {
          const waitMs = retryDelayBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100)
          await delay(waitMs)
          attempt++
          continue
        }
        throw error
      }
    }
    // если вышли из цикла без return
    throw lastErr || new Error('Unknown fetch error')
  } finally {
    if (timeoutId) {clearTimeout(timeoutId)}
  }
}

/** Объединение AbortSignal (простая обёртка): если любой абортится — прерываем запрос */
function mergeSignals(signals = []) {
  if (signals.length === 1) {return signals[0]}
  const controller = new AbortController()
  const onAbort = (evt) => controller.abort(evt?.target?.reason || new Error('Aborted'))
  for (const s of signals) {s && s.addEventListener('abort', onAbort, { once: true })}
  // если что-то уже аборчено
  const alreadyAborted = signals.find((s) => s && s.aborted)
  if (alreadyAborted) {controller.abort(alreadyAborted.reason)}
  return controller.signal
}

/** Чтение тела non-ok ответа как текст для диагностики */
async function readErrorBody(res) {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

/** Нормализация ошибки */
function normalizeHttpError(res, bodyText) {
  const err = new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${bodyText ? `: ${bodyText}` : ''}`)
  err.status = res.status
  err.statusText = res.statusText
  err.body = bodyText
  return err
}

/** Безопасный JSON.parse */
function safeJsonParse(str) {
  try {
    return JSON.parse(str)
  } catch (error) {
    const err = new Error('Failed to parse JSON')
    err.cause = error
    err.raw = str
    throw err
  }
}

/** SSE-парсер по спецификации (https://html.spec.whatwg.org/multipage/server-sent-events.html) */
async function parseSSEStream(readableStream, { onEvent, onData, onDone, onError } = {}) {
  const reader = readableStream.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  // поля текущего события
  let eventName = 'message'
  let eventId = ''
  let dataLines = []
  let jsonBuffer = ''

  const dispatchEvent = () => {
    const data = dataLines.join('\n') // многострочные data: объединяются через \n по стандарту
    try {
      if (data === '[DONE]') {
        onDone && onDone()
        return true // сигнализируем вызывающему, что поток завершён
      }
      // Пробрасываем сырые data-события наверх
      onData && onData({ event: eventName, id: eventId || undefined, data })
      // Если это JSON — декодируем и даём onEvent
      if (data && data.trim().startsWith('{')) {
        const json = safeJsonParse(data)
        onEvent && onEvent({ event: eventName, id: eventId || undefined, json })
      }
    } catch (error) {
      onError && onError(error)
    } finally {
      // сбрасываем state события
      eventName = 'message'
      eventId = ''
      dataLines = []
    }
    return false
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {break}
      buffer += decoder.decode(value, { stream: true })

      let lineStart = 0
      while (true) {
        const nlIndex = buffer.indexOf('\n', lineStart)
        if (nlIndex === -1) {
          // неполная строка
          buffer = buffer.slice(lineStart) // оставляем хвост
          break
        }
        let line = buffer.slice(lineStart, nlIndex)
        // срезаем CR
        if (line.endsWith('\r')) {line = line.slice(0, -1)}
        lineStart = nlIndex + 1

        if (line === '') {
          // пустая строка — конец одного SSE события
          const isDone = dispatchEvent()
          if (isDone) {return}
          continue
        }
        if (line.startsWith(':')) {
          // комментарий/keep-alive — игнор
          continue
        }
        // key: value | key:
        const colon = line.indexOf(':')
        let field = ''
        let valueStr = ''
        if (colon === -1) {
          field = line
        } else {
          field = line.slice(0, colon)
          valueStr = line.slice(colon + 1)
          if (valueStr.startsWith(' ')) {valueStr = valueStr.slice(1)}
        }

        switch (field) {
        case 'event': {
          eventName = valueStr || 'message'
        
        break;
        }
        case 'data': {
          dataLines.push(valueStr)
        
        break;
        }
        case 'id': {
          eventId = valueStr
        
        break;
        }
        case 'retry': {
          // можно обработать server-suggested retry, но клиент сам ретраит
        
        break;
        }
        // No default
        }
        // другие поля игнорируем
      }
    }

    // обработать любое «хвостовое» событие
    if (buffer.length > 0) {
      // если осталась строка без завершающей пустой строки — добросить её
      // (обычно сервер закрывает пустой строкой, но подстрахуемся)
      if (buffer.trim().length > 0) {
        // разобьём по \n, добавим как data:
        for (const l of buffer.split(/\r?\n/)) {
          if (l && !l.startsWith(':')) {
            const colon = l.indexOf(':')
            let valueStr = colon === -1 ? '' : l.slice(colon + 1).replace(/^ /, '')
            if (l.startsWith('data')) {dataLines.push(valueStr)}
          }
        }
      }
      dispatchEvent()
    }
    onDone && onDone()
  } catch (error) {
    onError && onError(error)
    throw error
  }
}



const llmService = {
  /**
   * Обычный нестримовый запрос.
   * @param {object} requestData — тело OpenRouter /chat/completions
   * @param {object} opts — { apiUrl, token, referer, title, timeoutMs, retries, signal }
   * @returns {Promise<object>} сырой JSON ответа
   */
  async sendMessage(requestData, opts = {}) {
    const {
      apiUrl = DEFAULT_API_URL,
      token,
      referer,
      title,
      timeoutMs = 60_000,
      retries = 1,
      signal,
    } = opts

    const headers = buildAuthHeaders({ token, referer, title })
    const res = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestData),
      timeoutMs,
      retries,
      signal,
    })

    if (!res.ok) {
      const bodyText = await readErrorBody(res)
      throw normalizeHttpError(res, bodyText)
    }
    return await res.json()
  },

  /**
   * Нестримоая обёртка с хендлерами (совместима с вашим кодом).
   */
  async sendMessageWithHandlers(requestData, { onEvent, onError, onDone } = {}, opts = {}) {
    try {
      const response = await this.sendMessage(requestData, opts)
      try { onEvent && onEvent({ type: 'non-stream-response', model: requestData?.model }) } catch {}
      try { onDone && onDone() } catch {}
      return response
    } catch (error) {
      try { onError && onError(error) } catch {}
      throw error
    }
  },

  /**
   * Стриминговый запрос через SSE.
   * @param {object} requestData
   * @param {object} handlers { onToken, onEvent, onDone, onError }
   * @param {object} opts { apiUrl, token, referer, title, timeoutMs, retries, signal }
   */
  async streamMessage(requestData, { onToken, onEvent, onDone, onError } = {}, opts = {}) {
    const {
      apiUrl = DEFAULT_API_URL,
      token,
      referer,
      title,
      timeoutMs = 90_000,  // стрим дольше
      retries = 1,
      signal,
    } = opts

    // важный нюанс: для SSE заголовок Accept
    const headers = {
      ...buildAuthHeaders({ token, referer, title }),
      'Accept': 'text/event-stream',
    }

    const res = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...requestData, stream: true }),
      timeoutMs,
      retries,
      signal,
    })

    if (!res.ok || !res.body) {
      const bodyText = await readErrorBody(res)
      throw normalizeHttpError(res, bodyText || `No stream body (ok=${res.ok})`)
    }

    let lastUsage = null

    // Для structured JSON ответа собираем только content-токены.
    // reasoning-токены могут содержать не-JSON текст и ломать парсинг.
    const isStructuredOutput = !!requestData?.response_format

    // парсим SSE и извлекаем delta.content (поддержка многострочных data)
    await parseSSEStream(res.body, {
      onData: ({ data }) => {
        if (!data || !data.trim()) {return}
        const lines = data.trim().split('\n')
        for (const line of lines) {
          if (!line.trim().startsWith('{')) {continue}
          try {
            const json = JSON.parse(line)
            const usage = json?.usage
            if (usage) {lastUsage = usage}

            // стандартный delta формат + reasoning (размышляющие модели)
            const delta = json?.choices?.[0]?.delta
            const content = delta?.content
            const reasoning = delta?.reasoning
            const reasoningText = (delta?.reasoning_details || [])
              .filter(d => d?.text)
              .map(d => d.text)
              .join('')
            const token = isStructuredOutput
              ? (content || '')
              : (content || reasoning || reasoningText)
            if (token) {onToken && onToken(token)}
          } catch {
            // игнорируем невалидный JSON
          }
        }
      },
      onEvent: ({ json }) => {
        try { onEvent && onEvent(json) } catch {}
      },
      onDone: () => {
        try { onDone && onDone({ usage: lastUsage || undefined }) } catch {}
      },
      onError: (err) => {
        try { onError && onError(err) } catch {}
      },
    })
  },

}

export default llmService
