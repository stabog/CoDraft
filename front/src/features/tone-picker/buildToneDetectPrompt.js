/**
 * @param {string} focusText
 * @returns {string}
 */
export function buildToneDetectPrompt(focusText) {
  return `Classify the tone of the focus fragment below.

Return ONLY a JSON object with exactly three integer keys (each 0–10):
- "formal" (0 = Informal, 10 = Formal)
- "positive" (0 = Negative, 10 = Positive)
- "simple" (0 = Complicated, 10 = Simple)

Do NOT wrap the JSON in markdown. Do NOT add any text before or after the JSON object.

Focus fragment:
${focusText.trim()}`
}
