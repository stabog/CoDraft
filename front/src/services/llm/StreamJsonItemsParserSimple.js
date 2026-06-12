// Парсер для упрощенной схемы: массив объектов напрямую
// Схема: [{kind: "message", ...}, {kind: "action", ...}]
export default class StreamJsonItemsParserSimple {
  constructor() {}

  feed(chunk) {
    const out = [];
    if (this.arrayEnded) {return { items: out, done: true };}

    for (const ch of chunk) {

      // Пропускаем пробелы до начала массива
      if (!this.arrayStarted) {
        if (/\s/.test(ch)) {continue;}
        if (ch === '[') {
          this.arrayStarted = true;
          this.arrayDepth = 1;
        }
        continue;
      }

      // === РЕЖИМ ЗАХВАТА ЭЛЕМЕНТА МАССИВА ===
      if (this.collectingItem) {
        if (this.inString) {
          this.itemBuffer += ch;
          if (this.escapeNext) {
            this.escapeNext = false;
          } else if (ch === '\\') {
            this.escapeNext = true;
          } else if (ch === '"') {
            this.inString = false;
          }
          continue;
        }
        
        this.itemBuffer += ch;
        
        if (ch === '"') {
          this.inString = true;
          continue;
        }
        
        if (ch === '{') {
          this.itemDepth++;
          continue;
        }
        
        if (ch === '}') {
          this.itemDepth--;
          if (this.itemDepth === 0) {
            // Элемент завершен
            const raw = this.itemBuffer.trim();
            this.collectingItem = false;
            this.itemBuffer = '';
            try {
              const obj = JSON.parse(raw);
              out.push(obj);
            } catch {
              // Ошибка парсинга - возможно элемент еще не завершен
              // Вернемся к сбору
              this.collectingItem = true;
              this.itemBuffer = raw;
              this.itemDepth = 0;
            }
          }
          continue;
        }
        
        continue;
      }

      // === НЕ ЗАХВАТ: обработка символов вне элемента ===
      if (this.inString) {
        if (this.escapeNext) {
          this.escapeNext = false;
          continue;
        }
        if (ch === '\\') {
          this.escapeNext = true;
          continue;
        }
        if (ch === '"') {
          this.inString = false;
        }
        continue;
      }

      // Старт нового элемента массива
      if (this.arrayDepth === 1 && ch === '{') {
        this.collectingItem = true;
        this.itemBuffer = '{';
        this.itemDepth = 1;
        continue;
      }

      // Обработка скобок массива
      if (ch === '[') {
        this.arrayDepth++;
        continue;
      }

      if (ch === ']') {
        this.arrayDepth--;
        if (this.arrayDepth === 0) {
          this.arrayEnded = true;
          return { items: out, done: true };
        }
        continue;
      }

      if (ch === '"') {
        this.inString = true;
        continue;
      }

      // Игнорируем пробелы, запятые, двоеточия вне строк
    }

    return { items: out, done: this.arrayEnded };
  }

  finish() {
    const out = [];
    
    // Если есть необработанный буфер элемента, попробуем его распарсить
    if (this.collectingItem && this.itemBuffer) {
      const raw = this.itemBuffer.trim();
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          out.push(obj);
        } catch (error) {
          console.warn('Failed to parse final item buffer:', error);
        }
      }
    }
    
    this.arrayEnded = true;
    this.collectingItem = false;
    this.itemBuffer = '';
    
    return { items: out, done: true };
  }
  arrayStarted = false;
  arrayEnded = false;
  arrayDepth = 0;
  inString = false;
  escapeNext = false;
  collectingItem = false;
  itemBuffer = '';
  itemDepth = 0;
}
