/**
 * @param {string} contextText
 * @param {string} focusText
 * @param {import('./toneAxes.js').ToneAxis[]} newTone
 * @param {import('./toneAxes.js').ToneAxis[]} initialTone
 * @returns {{ prompt: string | null, isDifferent: boolean }}
 */
export function buildToneChangePrompt(contextText, focusText, newTone, initialTone) {
  let prompt = `Context (markdown):\n${contextText}\n\nFocus fragment:\n${focusText}\n\nRewrite the context in markdown. Preserve markdown syntax (headings, lists, tables, code fences). Change the tone of the focus fragment according to:`
  let isDifferent = false

  for (const tone of newTone) {
    const baseline = initialTone.find(
      (item) => item.lowEn === tone.lowEn && item.highEn === tone.highEn,
    )
    const initialValue = baseline ? baseline.value : 5

    if (tone.value !== initialValue) {
      const targetAdjective = tone.value > 5 ? tone.highEn : tone.lowEn
      prompt += `\n- On a scale from 0 being ${tone.lowEn} and 10 being ${tone.highEn}, the focus is currently a ${initialValue} => change it to a ${tone.value} by making it more ${targetAdjective}`
      isDifferent = true
    }
  }

  if (!isDifferent) {
    return { prompt: null, isDifferent: false }
  }

  return {
    prompt: `${prompt}\n\nRespond with a JSON object with the property "context" containing the full rewritten markdown context.`,
    isDifferent: true,
  }
}
