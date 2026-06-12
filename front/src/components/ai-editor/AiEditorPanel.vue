<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildToneChangePrompt } from '../../features/tone-picker/buildToneChangePrompt.js'
import { buildToneDetectPrompt } from '../../features/tone-picker/buildToneDetectPrompt.js'
import { parseToneDetectResponse } from '../../features/tone-picker/parseToneDetectResponse.js'
import { parseToneResponse } from '../../features/tone-picker/parseToneResponse.js'
import { cloneDefaultToneAxes } from '../../features/tone-picker/toneAxes.js'
import {
  N_TONE_VALUES,
  toneAxesToWheelColor,
  toneValuesFromWheelPosition,
  wheelPositionFromToneAxes,
} from '../../features/tone-picker/toneColorMapping.js'
import { executePrompt, executeToneDetectPrompt } from '../../services/llm/llmClient.js'
import PromptPreviewModal from './PromptPreviewModal.vue'

const props = defineProps({
  selectedRange: { type: Object, default: null },
  isWritable: { type: Boolean, default: false },
})

const emit = defineEmits(['apply-replacement'])

const toneAxes = ref(cloneDefaultToneAxes())
const initialToneAxes = ref(cloneDefaultToneAxes())
const isDraggingWheel = ref(false)
const isApplying = ref(false)
const isDetectingTone = ref(false)
const toneBaselineDetected = ref(false)
const errorMessage = ref('')
const promptPreviewOpen = ref(false)
const promptPreviewText = ref('')
const wheelRef = ref(null)

const wheelSize = 168
const canUseTonePicker = computed(
  () => props.isWritable && Boolean(props.selectedRange?.contextText),
)
const selectedQuote = computed(() => props.selectedRange?.anchorText ?? props.selectedRange?.text ?? '')
const hasLineContext = computed(() => Boolean(props.selectedRange?.contextText))
const wheelPosition = computed(() => wheelPositionFromToneAxes(toneAxes.value, wheelSize))
const wheelColor = computed(() => toneAxesToWheelColor(toneAxes.value))
const hasToneChanges = computed(() =>
  toneAxes.value.some((axis, index) => axis.value !== initialToneAxes.value[index]?.value),
)

watch(
  () => props.selectedRange,
  () => {
    toneAxes.value = cloneDefaultToneAxes()
    initialToneAxes.value = cloneDefaultToneAxes()
    toneBaselineDetected.value = false
    errorMessage.value = ''
  },
)

function currentPrompt() {
  if (!props.selectedRange?.contextText) return { prompt: null, isDifferent: false }
  return buildToneChangePrompt(
    props.selectedRange.contextText,
    props.selectedRange.focusText,
    toneAxes.value,
    initialToneAxes.value,
  )
}

function updateToneFromPointer(clientX, clientY) {
  const element = wheelRef.value
  if (!element) return

  const rect = element.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const [first, second, third] = toneValuesFromWheelPosition(x, y, rect.width, rect.height)

  toneAxes.value = toneAxes.value.map((axis, index) => ({
    ...axis,
    value: [first, second, third][index],
  }))
}

function onWheelPointerDown(event) {
  if (!canUseTonePicker.value || event.button !== 0) return
  isDraggingWheel.value = true
  updateToneFromPointer(event.clientX, event.clientY)
  event.preventDefault()
}

function onWheelPointerMove(event) {
  if (!isDraggingWheel.value) return
  updateToneFromPointer(event.clientX, event.clientY)
}

function onWheelPointerUp() {
  isDraggingWheel.value = false
}

function onAxisInput(index, value) {
  const nextValue = Number(value)
  toneAxes.value = toneAxes.value.map((axis, axisIndex) =>
    axisIndex === index ? { ...axis, value: nextValue } : axis,
  )
}

function openPromptPreview() {
  const { prompt } = currentPrompt()
  if (!props.selectedRange?.contextText) {
    promptPreviewText.value = '(Контекст не выбран.)'
  } else if (!prompt) {
    promptPreviewText.value =
      `Context (markdown):\n${props.selectedRange.contextText}\n\nFocus fragment:\n${props.selectedRange.focusText}\n\n(Оси тона не изменены — инструкции для переписывания не сформированы.)`
  } else {
    promptPreviewText.value = prompt
  }
  promptPreviewOpen.value = true
}

async function detectTone() {
  if (!canUseTonePicker.value || !props.selectedRange?.focusText || isDetectingTone.value) return

  errorMessage.value = ''
  isDetectingTone.value = true

  try {
    const prompt = buildToneDetectPrompt(props.selectedRange.focusText)
    const { result } = await executeToneDetectPrompt({ prompt })
    const detected = parseToneDetectResponse(result)

    if (!detected) {
      errorMessage.value = 'Не удалось разобрать оценку тона от LLM.'
      return
    }

    initialToneAxes.value = detected.map((axis) => ({ ...axis }))
    toneAxes.value = detected.map((axis) => ({ ...axis }))
    toneBaselineDetected.value = true
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось определить тон фрагмента.'
  } finally {
    isDetectingTone.value = false
  }
}

async function applyToneChange() {
  if (!canUseTonePicker.value || !props.selectedRange || isApplying.value) return

  const { prompt, isDifferent } = currentPrompt()
  if (!isDifferent || !prompt) {
    errorMessage.value = 'Сдвиньте хотя бы одну ось тона перед применением.'
    return
  }

  errorMessage.value = ''
  isApplying.value = true

  try {
    const { result } = await executePrompt({ prompt, json: true })
    const rewritten = parseToneResponse(result)

    if (!rewritten) {
      errorMessage.value = 'Не удалось разобрать ответ LLM.'
      return
    }

    emit('apply-replacement', {
      selection: props.selectedRange,
      newContextText: rewritten,
    })
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось применить изменение тона.'
  } finally {
    isApplying.value = false
  }
}

onMounted(() => {
  window.addEventListener('mouseup', onWheelPointerUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', onWheelPointerUp)
})
</script>

<template>
  <section class="ai-editor-panel">
    <p v-if="!isWritable" class="hint">Редактирование недоступно в текущем режиме.</p>
    <p v-else-if="!selectedRange" class="hint">
      Выделите фрагмент: включите кисть в тулбаре или удерживайте Alt при выделении.
    </p>
    <p v-else-if="!hasLineContext" class="hint">Не удалось определить markdown-контекст выделения.</p>

    <template v-else>
      <p class="quote">"{{ selectedQuote }}"</p>

      <div class="tone-section">
        <div class="tone-section-header">
          <p class="section-label">Тон</p>
          <button
            type="button"
            class="secondary tone-detect-btn"
            :disabled="!canUseTonePicker || isDetectingTone"
            @click="detectTone"
          >
            {{ isDetectingTone ? 'Определяю…' : 'Определить тон' }}
          </button>
        </div>

        <p v-if="!toneBaselineDetected" class="tone-baseline-hint">
          Текущий тон не определён — в промпте используется 5 по всем осям. Нажмите «Определить тон».
        </p>
        <p v-else class="tone-baseline-hint tone-baseline-hint-detected">
          Текущий тон определён. Сдвиньте колесо или слайдеры для целевого тона.
        </p>

        <div
          ref="wheelRef"
          class="tone-wheel"
          :style="{ width: `${wheelSize}px`, height: `${wheelSize}px` }"
          @mousedown="onWheelPointerDown"
          @mousemove="onWheelPointerMove"
        >
          <div class="tone-wheel-spectrum" />
          <div class="tone-wheel-vignette" />
          <div
            v-if="!Number.isNaN(wheelPosition[0])"
            class="tone-wheel-handle"
            :style="{
              left: `${wheelPosition[0] - 8}px`,
              top: `${wheelPosition[1] - 8}px`,
              background: wheelColor,
            }"
          />
        </div>

        <div v-for="(axis, index) in toneAxes" :key="axis.lowEn" class="axis-row">
          <div class="axis-labels">
            <span>{{ axis.lowRu }}</span>
            <span>{{ axis.highRu }}</span>
          </div>
          <input
            type="range"
            min="0"
            :max="N_TONE_VALUES"
            step="1"
            :value="axis.value"
            :disabled="!canUseTonePicker"
            :class="`axis-slider axis-slider-${index}`"
            @input="onAxisInput(index, $event.target.value)"
          />
        </div>
      </div>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <div class="actions">
        <button type="button" class="secondary" :disabled="!canUseTonePicker" @click="openPromptPreview">
          Показать промпт
        </button>
        <button
          type="button"
          :disabled="!canUseTonePicker || isApplying || !hasToneChanges"
          @click="applyToneChange"
        >
          {{ isApplying ? 'Применяю…' : 'Применить' }}
        </button>
      </div>
    </template>

    <PromptPreviewModal
      :open="promptPreviewOpen"
      :prompt="promptPreviewText"
      @close="promptPreviewOpen = false"
    />
  </section>
</template>

<style scoped>
.ai-editor-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.quote {
  background: var(--background-primary);
  border-left: 2px solid var(--interactive-accent);
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.35;
  margin: 0 0 12px;
  padding: 8px 10px;
}

.tone-section {
  display: grid;
  gap: 12px;
}

.tone-section-header {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.section-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin: 0;
  text-transform: uppercase;
}

.tone-detect-btn {
  flex-shrink: 0;
  font-size: 11px;
  margin: 0;
  min-height: 28px;
  padding: 0 10px;
}

.tone-baseline-hint {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
  margin: 0;
}

.tone-baseline-hint-detected {
  color: var(--text-faint);
}

.tone-wheel {
  margin: 0 auto;
  position: relative;
  touch-action: none;
  user-select: none;
}

.tone-wheel-spectrum,
.tone-wheel-vignette {
  border-radius: 50%;
  inset: 0;
  position: absolute;
}

.tone-wheel-spectrum {
  background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
  transform: rotate(270deg);
}

.tone-wheel-vignette {
  background: radial-gradient(circle closest-side, rgb(255, 255, 255), transparent);
  transform: rotate(270deg);
}

.tone-wheel-handle {
  border: 3px solid white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  height: 16px;
  pointer-events: none;
  position: absolute;
  width: 16px;
}

.axis-row {
  display: grid;
  gap: 4px;
}

.axis-labels {
  color: var(--text-muted);
  display: flex;
  font-size: 11px;
  justify-content: space-between;
}

.axis-slider {
  accent-color: var(--interactive-accent);
  width: 100%;
}

.axis-slider-0 {
  accent-color: #ef4444;
}

.axis-slider-1 {
  accent-color: #22c55e;
}

.axis-slider-2 {
  accent-color: #3b82f6;
}

.error {
  color: var(--color-orange);
  font-size: 12px;
  margin: 12px 0 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.actions button {
  flex: 1;
  font-size: 12px;
  margin: 0;
  min-height: 32px;
  min-width: 120px;
}
</style>
