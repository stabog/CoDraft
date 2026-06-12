/**
 * Path-aware streaming JSON parser.
 * Эмитит { path, value } по мере завершения каждого значения в потоке.
 * Поддерживает корневой массив [{...}] и корневой объект {...}.
 * Формат path: "data.variants" или "0.data.variants"
 *
 * onPartialValue({ path, value }) — частичные строковые значения по мере стриминга.
 */
export default class StreamJsonPathParser {
  constructor(options = {}) {
    this.onPathValue = options.onPathValue || (() => {})
    this.onPartialValue = options.onPartialValue || null

    this.reset()
  }

  reset() {
    this.done = false
    this.inString = false
    this.escapeNext = false
    this.pathStack = []
    this.currentKey = null
    this.arrayIndexStack = []

    this.valueBuffer = ''
    this.valueDepth = 0
    this.valueInString = false
    this.valueEscapeNext = false

    this.keyBuffer = ''
    this.state = 'init'
    this.rootType = null
  }

  /** Формирует текущий путь как строку */
  getPath() {
    const parts = []
    for (const p of this.pathStack) {
      if (p.type === 'array') {parts.push(String(p.index))}
      else if (p.type === 'object' && p.key) {parts.push(p.key)}
    }
    if (this.currentKey) {parts.push(this.currentKey)}
    return parts.join('.')
  }

  /** Парсит буфер значения через JSON.parse */
  parseValue(raw) {
    const s = raw.trim()
    if (!s) {return undefined}
    try {
      return JSON.parse(s)
    } catch {
      return undefined
    }
  }

  emit(path, value) {
    if (path && value !== undefined) {
      this.onPathValue({ path, value })
    }
  }

  feed(chunk) {
    const emitted = []
    if (this.done) {return { pathValues: emitted, done: true }}

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]

      if (this.state === 'init') {
        if (ch === '[') {
          this.state = 'in_array'
          this.rootType = 'array'
          this.pathStack.push({ type: 'array', index: 0 })
          this.arrayIndexStack.push(0)
          continue
        }
        if (ch === '{') {
          this.state = 'in_object'
          this.rootType = 'object'
          this.pathStack.push({ type: 'object', key: null })
          continue
        }
        if (/\s/.test(ch)) {continue}
        continue
      }

      if (this.state === 'in_value_string') {
        this.valueBuffer += ch
        if (this.valueEscapeNext) {
          this.valueEscapeNext = false
        } else if (ch === '\\') {
          this.valueEscapeNext = true
        } else if (ch === '"') {
          this.valueInString = false
          const path = this.getPath()
          const content = this.valueBuffer.slice(0, -1)
          let value
          try {
            value = JSON.parse('"' + content + '"')
          } catch {
            value = content
          }
          this.emit(path, value)
          emitted.push({ path, value })
          this.valueBuffer = ''
          this.currentKey = null
          const top = this.pathStack.at(-1)
          if (top?.type === 'array' && this.arrayIndexStack.length > 0) {
            this.arrayIndexStack[this.arrayIndexStack.length - 1]++
          }
          this.state = this.pathStack.at(-1)?.type === 'array' || (this.rootType === 'array' && this.pathStack.length === 0) ? 'in_array' : 'in_object'
        }
        continue
      }

      if (this.state === 'in_value_buf') {
        this.valueBuffer += ch
        if (this.valueInString) {
          if (this.valueEscapeNext) {this.valueEscapeNext = false}
          else if (ch === '\\') {this.valueEscapeNext = true}
          else if (ch === '"') {this.valueInString = false}
          continue
        }
        switch (ch) {
        case '"': {
        this.valueInString = true
        break;
        }
        case '[': 
        case '{': {
        this.valueDepth++
        break;
        }
        case ']': 
        case '}': {
          this.valueDepth--
          if (this.valueDepth === 0) {
            const path = this.getPath()
            const value = this.parseValue(this.valueBuffer)
            if (value !== undefined) {
              this.emit(path, value)
              emitted.push({ path, value })
            }
            this.valueBuffer = ''
            this.currentKey = null
            const topBuf = this.pathStack.at(-1)
            if (topBuf?.type === 'array' && this.arrayIndexStack.length > 0) {
              this.arrayIndexStack[this.arrayIndexStack.length - 1]++
            }
            this.state = this.pathStack.at(-1)?.type === 'array' || (this.rootType === 'array' && this.pathStack.length === 0) ? 'in_array' : 'in_object'
          }
        
        break;
        }
        // No default
        }
        continue
      }

      if (this.state === 'in_value_prim') {
        if (/[,\]\}]/.test(ch)) {
          const path = this.getPath()
          const raw = this.valueBuffer.trim()
          let value
          switch (raw) {
          case 'true': {
          value = true
          break;
          }
          case 'false': {
          value = false
          break;
          }
          case 'null': {
          value = null
          break;
          }
          default: { value = Number(raw)
          }
          }
          if (path) {
            this.emit(path, value)
            emitted.push({ path, value })
          }
          this.valueBuffer = ''
          this.currentKey = null
          const topPrim = this.pathStack.at(-1)
          if (topPrim?.type === 'array' && this.arrayIndexStack.length > 0) {
            this.arrayIndexStack[this.arrayIndexStack.length - 1]++
          }
          this.state = this.pathStack.at(-1)?.type === 'array' || (this.rootType === 'array' && this.pathStack.length === 0) ? 'in_array' : 'in_object'
          i--
          continue
        }
        this.valueBuffer += ch
        continue
      }

      if (this.state === 'in_key') {
        if (this.inString) {
          if (this.escapeNext) {
            this.escapeNext = false
            this.keyBuffer += ch
          } else if (ch === '\\') {
            this.escapeNext = true
          } else if (ch === '"') {
            this.inString = false
            try {
              this.currentKey = JSON.parse('"' + this.keyBuffer + '"')
            } catch {
              this.currentKey = this.keyBuffer
            }
            this.keyBuffer = ''
            this.state = 'after_key'
          } else {
            this.keyBuffer += ch
          }
          continue
        }
        if (ch === '"') {this.inString = true}
        continue
      }

      if (this.state === 'after_key') {
        if (ch === ':') {this.state = 'after_colon'}
        continue
      }

      if (this.state === 'after_colon') {
        if (/\s/.test(ch)) {continue}
        if (ch === '"') {
          this.state = 'in_value_string'
          this.valueBuffer = ''
          this.valueInString = true
          this.valueEscapeNext = false
          continue
        }
        if (ch === '{') {
          this.pathStack.push({ type: 'object', key: this.currentKey })
          this.currentKey = null
          this.state = 'in_object'
          continue
        }
        if (ch === '[') {
          this.pathStack.push({ type: 'object', key: this.currentKey }, { type: 'array', index: 0 })
          this.arrayIndexStack.push(0)
          this.currentKey = null
          this.state = 'in_array'
          continue
        }
        if (ch === '-' || ch === 't' || ch === 'f' || ch === 'n' || /\d/.test(ch)) {
          this.state = 'in_value_prim'
          this.valueBuffer = ch
          continue
        }
        continue
      }

      if (this.state === 'in_array') {
        if (/\s/.test(ch)) {continue}
        if (ch === ']') {
          const top = this.pathStack.at(-1)
          if (top?.type === 'array') {
            this.pathStack.pop()
            if (this.arrayIndexStack.length > 0) {this.arrayIndexStack.pop()}
            if (this.pathStack.length === 0 && this.rootType === 'array') {
              this.done = true
              return { pathValues: emitted, done: true }
            }
            const prevTop = this.pathStack.at(-1)
            if (prevTop?.type === 'object' && prevTop?.key) {
              this.pathStack.pop()
            }
          }
          this.state = this.pathStack.at(-1)?.type === 'array' ? 'in_array' : 'in_object'
          continue
        }
        if (ch === ',') {continue}
        if (ch === '{') {
          const topArr = this.pathStack.at(-1)
          if (topArr?.type === 'array') {
            topArr.index = this.arrayIndexStack.at(-1)
          }
          this.pathStack.push({ type: 'object', key: null })
          this.state = 'in_object'
          this.currentKey = null
          continue
        }
        if (ch === '[') {
          const topArr = this.pathStack.at(-1)
          if (topArr?.type === 'array') {
            topArr.index = this.arrayIndexStack.at(-1)
          }
          this.pathStack.push({ type: 'array', index: 0 })
          this.arrayIndexStack.push(0)
          continue
        }
        if (ch === '"') {
          const topArr = this.pathStack.at(-1)
          if (topArr?.type === 'array') {
            topArr.index = this.arrayIndexStack.at(-1)
          }
          this.state = 'in_value_string'
          this.valueBuffer = ''
          this.valueInString = true
          this.valueEscapeNext = false
          continue
        }
        if (ch === '-' || ch === 't' || ch === 'f' || ch === 'n' || /\d/.test(ch)) {
          const topArr = this.pathStack.at(-1)
          if (topArr?.type === 'array') {
            topArr.index = this.arrayIndexStack.at(-1)
          }
          this.state = 'in_value_prim'
          this.valueBuffer = ch
          continue
        }
        continue
      }

      if (this.state === 'in_object') {
        if (/\s/.test(ch)) {continue}
        if (ch === '}') {
          this.pathStack.pop()
          if (this.pathStack.length === 0 && this.rootType === 'object') {
            this.done = true
            return { pathValues: emitted, done: true }
          }
          const top = this.pathStack.at(-1)
          if (top?.type === 'array' && this.arrayIndexStack.length > 0) {
            this.arrayIndexStack[this.arrayIndexStack.length - 1]++
          }
          const inArray = this.pathStack.at(-1)?.type === 'array'
          const betweenArrayElements = this.rootType === 'array' && this.pathStack.length === 0
          this.state = inArray || betweenArrayElements ? 'in_array' : 'in_object'
          continue
        }
        if (ch === ',') {continue}
        if (ch === '"') {
          this.state = 'in_key'
          this.inString = true
          this.escapeNext = false
          this.keyBuffer = ''
          continue
        }
        continue
      }
    }

    if (this.onPartialValue && this.state === 'in_value_string' && this.valueBuffer.length > 0) {
      const path = this.getPath()
      if (path) {
        let value
        try {
          value = JSON.parse('"' + this.valueBuffer + '"')
        } catch {
          value = this.valueBuffer
        }
        this.onPartialValue({ path, value })
      }
    }

    return { pathValues: emitted, done: this.done }
  }

  finish() {
    const emitted = []
    if (this.state === 'in_value_prim' && this.valueBuffer.trim()) {
      const path = this.getPath()
      const raw = this.valueBuffer.trim()
      let value
      switch (raw) {
      case 'true': {
      value = true
      break;
      }
      case 'false': {
      value = false
      break;
      }
      case 'null': {
      value = null
      break;
      }
      default: { value = Number(raw)
      }
      }
      if (path) {
        this.emit(path, value)
        emitted.push({ path, value })
      }
    }
    if (this.state === 'in_value_buf' && this.valueBuffer.trim()) {
      const path = this.getPath()
      const value = this.parseValue(this.valueBuffer)
      if (path && value !== undefined) {
        this.emit(path, value)
        emitted.push({ path, value })
      }
    }
    this.done = true
    return { pathValues: emitted, done: true }
  }
}
