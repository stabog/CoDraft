import { universalRequest } from './llmResponseService.js'
import { buildToneResponseSchema } from './toneResponseSchema.js'

const DEFAULT_MODEL = import.meta.env.VITE_LLM_MODEL

function buildTransport(signal) {
  return {
    token: import.meta.env.VITE_LLM_KEY || undefined,
    referer: typeof window !== 'undefined' ? window.location.origin : undefined,
    title: 'CoDraft',
    timeoutMs: 90_000,
    retries: 1,
    signal,
  }
}

/**
 * @param {{ prompt: string, json?: boolean, signal?: AbortSignal }} options
 * @returns {Promise<{ result: string }>}
 */
export async function executePrompt({ prompt, json = false, signal } = {}) {
  if (!import.meta.env.VITE_LLM_KEY) {
    throw new Error('Не задан VITE_LLM_KEY в front/.env')
  }

  if (!json) {
    const text = await universalRequest({
      messages: [{ role: 'user', content: prompt }],
      model: DEFAULT_MODEL,
      props: {
        stream: false,
        structured: false,
        temperature: 0.3,
        max_tokens: 2000,
        transport: buildTransport(signal),
      },
    })

    return { result: text }
  }

  const response = await universalRequest({
    messages: [{ role: 'user', content: prompt }],
    model: DEFAULT_MODEL,
    jsonSchema: buildToneResponseSchema(),
    props: {
      stream: false,
      structured: true,
      temperature: 0.3,
      max_tokens: 4000,
      transport: buildTransport(signal),
    },
  })

  return { result: JSON.stringify(response) }
}
