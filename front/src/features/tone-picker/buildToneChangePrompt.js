/**
 * @typedef {{
 *   before?: string,
 *   context: string,
 *   fragment: string,
 *   after?: string,
 * }} ToneChangeInput
 */

/**
 * @param {ToneChangeInput} input
 * @param {string[]} toneLines
 * @returns {string}
 */
export function formatToneChangePrompt(input, toneLines) {
  const payload = {
    before: input.before ?? '',
    context: input.context,
    fragment: input.fragment,
    after: input.after ?? '',
  }

  const toneSection =
    toneLines.length > 0
      ? toneLines.join('\n')
      : '(shift at least one tone axis to generate adjustment instructions)'

  return `You rewrite markdown for tone adjustment.

Rules:
- Use the same language as the original fragment and context. Do not translate or switch languages (for example, if the source is Russian, keep Russian).
- Change ONLY the tone of "fragment" inside "context". Wording may change, but facts and markdown structure must stay valid.
- "before" and "after" are read-only reference for coherence; do not rewrite them. Return only the updated "context".
- Preserve markdown syntax: headings, lists, tables, code fences, emphasis.

Input JSON fields:
- "before" / "after": neighboring markdown lines for context only; reproduce their meaning in the rewritten "context" if helpful, but do not copy them into the response.
- "context": the markdown block to rewrite and return.
- "fragment": the part inside "context" whose tone must change.

Tone adjustments:
${toneSection}

Input JSON:
${JSON.stringify(payload, null, 2)}

Respond with a single JSON object:
{ "context": "<full rewritten context markdown>" }`
}

/**
 * @param {ToneChangeInput} input
 * @param {import('./toneAxes.js').ToneAxis[]} newTone
 * @param {import('./toneAxes.js').ToneAxis[]} initialTone
 * @param {{ preview?: boolean }} [options]
 * @returns {{ prompt: string | null, isDifferent: boolean }}
 */
export function buildToneChangePrompt(input, newTone, initialTone, options = {}) {
  const toneLines = []
  let isDifferent = false

  for (const tone of newTone) {
    const baseline = initialTone.find(
      (item) => item.lowEn === tone.lowEn && item.highEn === tone.highEn,
    )
    const initialValue = baseline ? baseline.value : 5

    if (tone.value !== initialValue) {
      const targetAdjective = tone.value > 5 ? tone.highEn : tone.lowEn
      toneLines.push(
        `- On a scale from 0 being ${tone.lowEn} and 10 being ${tone.highEn}, the fragment is currently a ${initialValue} => change it to a ${tone.value} by making it more ${targetAdjective}`,
      )
      isDifferent = true
    }
  }

  if (!isDifferent && !options.preview) {
    return { prompt: null, isDifferent: false }
  }

  return {
    prompt: formatToneChangePrompt(input, toneLines),
    isDifferent,
  }
}
