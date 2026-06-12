/** @typedef {{ lowEn: string, highEn: string, lowRu: string, highRu: string, value: number }} ToneAxis */

/** @type {ToneAxis[]} */
export const DEFAULT_TONE_AXES = [
  {
    lowEn: 'Informal',
    highEn: 'Formal',
    lowRu: 'Неформальный',
    highRu: 'Формальный',
    value: 5,
  },
  {
    lowEn: 'Negative',
    highEn: 'Positive',
    lowRu: 'Негативный',
    highRu: 'Позитивный',
    value: 5,
  },
  {
    lowEn: 'Complicated',
    highEn: 'Simple',
    lowRu: 'Сложный',
    highRu: 'Простой',
    value: 5,
  },
]

/** @returns {ToneAxis[]} */
export function cloneDefaultToneAxes() {
  return DEFAULT_TONE_AXES.map((axis) => ({ ...axis }))
}
