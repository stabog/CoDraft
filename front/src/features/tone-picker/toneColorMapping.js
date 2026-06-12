const N_TONE_VALUES = 10

function hsvToRgb(h, s, v) {
  const hue = ((h % 360) + 360) % 360
  const chroma = v * s
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = v - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) [red, green, blue] = [chroma, second, 0]
  else if (hue < 120) [red, green, blue] = [second, chroma, 0]
  else if (hue < 180) [red, green, blue] = [0, chroma, second]
  else if (hue < 240) [red, green, blue] = [0, second, chroma]
  else if (hue < 300) [red, green, blue] = [second, 0, chroma]
  else [red, green, blue] = [chroma, 0, second]

  return [
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255),
  ]
}

function rgbToHsv(red, green, blue) {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0

  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60
    else if (max === g) hue = ((b - r) / delta + 2) * 60
    else hue = ((r - g) / delta + 4) * 60
  }

  const saturation = max === 0 ? 0 : delta / max
  return [hue, saturation, max]
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {[number, number, number]}
 */
export function rgbFromWheelPosition(x, y, width, height) {
  const dx = x / width - 0.5
  const dy = y / height - 0.5
  const hue = Math.atan2(-dy, -dx) * (180 / Math.PI)
  const dist = Math.sqrt(dx * dx + dy * dy)
  const saturation = Math.min(dist, 0.5) / 0.5

  if (dist > 0.5) return [255, 255, 255]
  return hsvToRgb(hue, saturation, 1)
}

/**
 * @param {number} red
 * @param {number} green
 * @param {number} blue
 * @param {number} width
 * @param {number} height
 * @returns {[number, number]}
 */
export function wheelPositionFromRgb(red, green, blue, width, height) {
  const [hue, saturation] = rgbToHsv(red, green, blue)
  const angle = (hue / 360) * 2 * Math.PI
  const x = -Math.cos(angle) * saturation * 0.5 + 0.5
  const y = -Math.sin(angle) * saturation * 0.5 + 0.5
  return [x * width, y * height]
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {[number, number, number]}
 */
export function toneValuesFromWheelPosition(x, y, width, height) {
  const [red, green, blue] = rgbFromWheelPosition(x, y, width, height)
  return [
    (Math.round((red / 255) * N_TONE_VALUES) / N_TONE_VALUES) * N_TONE_VALUES,
    (Math.round((green / 255) * N_TONE_VALUES) / N_TONE_VALUES) * N_TONE_VALUES,
    (Math.round((blue / 255) * N_TONE_VALUES) / N_TONE_VALUES) * N_TONE_VALUES,
  ]
}

/**
 * @param {import('./toneAxes.js').ToneAxis[]} axes
 * @param {number} wheelSize
 * @returns {[number, number]}
 */
export function wheelPositionFromToneAxes(axes, wheelSize) {
  const red = (axes[0].value / N_TONE_VALUES) * 255
  const green = (axes[1].value / N_TONE_VALUES) * 255
  const blue = (axes[2].value / N_TONE_VALUES) * 255
  return wheelPositionFromRgb(red, green, blue, wheelSize, wheelSize)
}

/**
 * @param {import('./toneAxes.js').ToneAxis[]} axes
 * @returns {string}
 */
export function toneAxesToWheelColor(axes) {
  const red = Math.round((axes[0].value / N_TONE_VALUES) * 255)
  const green = Math.round((axes[1].value / N_TONE_VALUES) * 255)
  const blue = Math.round((axes[2].value / N_TONE_VALUES) * 255)
  return `rgb(${red}, ${green}, ${blue})`
}

export { N_TONE_VALUES }
