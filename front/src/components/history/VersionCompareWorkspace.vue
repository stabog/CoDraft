<script setup>
import { computed, ref, watch } from 'vue'
import { buildAlignedDiffRows } from '../../utils/lineDiff'
import { renderMarkdownBlock } from '../../utils/markdownRender'

const props = defineProps({
  versions: {
    type: Array,
    default: () => [],
  },
})

const sortedVersions = computed(() =>
  [...props.versions].sort((a, b) => (a.number ?? a.versionNumber) - (b.number ?? b.versionNumber)),
)

const versionAId = ref('')
const versionBId = ref('')

function versionNumber(version) {
  return version?.number ?? version?.versionNumber ?? 0
}

function versionLabel(version) {
  const number = versionNumber(version)
  const summary = version.summary?.trim()
  return summary ? `v${number} — ${summary}` : `v${number}`
}

function syncDefaults() {
  const items = sortedVersions.value
  if (items.length < 2) {
    versionAId.value = items[0]?.id ?? ''
    versionBId.value = items[0]?.id ?? ''
    return
  }

  versionAId.value = items[items.length - 2].id
  versionBId.value = items[items.length - 1].id
}

watch(sortedVersions, syncDefaults, { immediate: true })

const versionA = computed(() => sortedVersions.value.find((item) => item.id === versionAId.value) ?? null)
const versionB = computed(() => sortedVersions.value.find((item) => item.id === versionBId.value) ?? null)

const diffRows = computed(() => {
  if (!versionA.value || !versionB.value) return []
  return buildAlignedDiffRows(versionA.value.content, versionB.value.content)
})

function cellClass(cell) {
  return {
    'is-placeholder': cell.type === 'placeholder',
    'is-removed': cell.type === 'removed',
    'is-added': cell.type === 'added',
    'is-modified': cell.type === 'modified',
  }
}

function renderCell(cell) {
  if (cell.type === 'empty') return ''
  if (cell.html) return cell.html
  return renderMarkdownBlock(cell.text)
}

function isRenderableCell(cell) {
  return cell.type !== 'placeholder' && cell.type !== 'empty'
}
</script>

<template>
  <section class="version-compare-workspace">
    <p v-if="sortedVersions.length < 2" class="empty-state">
      Для сравнения нужно минимум две зафиксированные версии.
    </p>

    <template v-else>
      <div class="compare-scroll">
        <div class="compare-headers">
          <header class="pane-header">
            <select v-model="versionAId" class="pane-select" aria-label="Левая версия">
              <option v-for="version in sortedVersions" :key="version.id" :value="version.id">
                {{ versionLabel(version) }}
              </option>
            </select>
          </header>
          <div class="header-divider" aria-hidden="true" />
          <header class="pane-header">
            <select v-model="versionBId" class="pane-select" aria-label="Правая версия">
              <option v-for="version in sortedVersions" :key="version.id" :value="version.id">
                {{ versionLabel(version) }}
              </option>
            </select>
          </header>
        </div>

        <div class="compare-rows">
          <div
            v-for="(row, index) in diffRows"
            :key="index"
            class="compare-row"
          >
            <div class="compare-cell" :class="cellClass(row.left)">
              <div v-if="row.left.type === 'placeholder'" class="diff-placeholder" aria-hidden="true" />
              <div v-else-if="isRenderableCell(row.left)" class="diff-content prose" v-html="renderCell(row.left)" />
            </div>

            <div class="row-divider" aria-hidden="true" />

            <div class="compare-cell" :class="cellClass(row.right)">
              <div v-if="row.right.type === 'placeholder'" class="diff-placeholder" aria-hidden="true" />
              <div v-else-if="isRenderableCell(row.right)" class="diff-content prose" v-html="renderCell(row.right)" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.version-compare-workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.empty-state {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
  padding: 24px 32px;
}

.compare-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.compare-headers {
  background: var(--background-primary);
  border-bottom: 1px solid var(--background-modifier-border);
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  position: sticky;
  top: 0;
  z-index: 2;
}

.header-divider,
.row-divider {
  background: var(--background-modifier-border);
}

.pane-header {
  padding: 8px 12px;
}

.pane-select {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  color: var(--text-normal);
  font-size: 12px;
  min-height: 30px;
  padding: 0 8px;
  width: 100%;
}

.compare-row {
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  min-height: 1.75rem;
}

.compare-cell {
  min-width: 0;
  padding: 4px 16px;
}

.compare-cell.is-removed {
  background: rgba(255, 100, 100, 0.12);
}

.compare-cell.is-added {
  background: rgba(61, 214, 140, 0.14);
}

.diff-segment-line {
  line-height: 1.72;
}

.diff-segment-line :deep(p),
.diff-segment-line :deep(.diff-highlight) {
  display: inline;
  margin: 0;
}

.diff-content :deep(.diff-word-removed) {
  background: rgba(255, 100, 100, 0.28);
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 2px;
  text-decoration: line-through;
  text-decoration-color: rgba(255, 140, 140, 0.9);
}

.diff-content :deep(.diff-word-added) {
  background: rgba(61, 214, 140, 0.28);
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 2px;
}

.diff-placeholder {
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 4px,
    rgba(255, 255, 255, 0.03) 4px,
    rgba(255, 255, 255, 0.03) 8px
  );
  border: 1px dashed var(--background-modifier-border);
  border-radius: 3px;
  min-height: 1.5rem;
  opacity: 0.7;
}

.diff-content :deep(p) {
  margin: 0 0 12px;
}

.diff-content :deep(.diff-segment-line p) {
  margin: 0;
}

.diff-content :deep(.diff-empty-line) {
  min-height: 1.5rem;
}

.prose {
  color: var(--text-normal);
  font-size: 16px;
  line-height: 1.72;
}

.prose :deep(h1) {
  font-size: 1.6em;
  line-height: 1.2;
  margin: 8px 0 4px;
}

.prose :deep(h2) {
  font-size: 1.3em;
  line-height: 1.25;
  margin: 8px 0 4px;
}

.prose :deep(h3) {
  font-size: 1.1em;
  margin: 6px 0 2px;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0;
  padding-left: 24px;
}

.prose :deep(blockquote) {
  border-left: 3px solid var(--interactive-accent);
  color: var(--text-muted);
  margin: 0;
  padding-left: 14px;
}

.prose :deep(code) {
  background: var(--background-secondary);
  border-radius: 3px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.9em;
  padding: 1px 4px;
}

.prose :deep(pre) {
  margin: 0;
  overflow-x: auto;
}

.prose :deep(pre code) {
  display: block;
  padding: 8px;
}

.prose :deep(table) {
  border-collapse: collapse;
  margin: 0 0 16px;
  table-layout: auto;
  width: 100%;
}

.prose :deep(th),
.prose :deep(td) {
  border: 1px solid var(--background-modifier-border);
  min-width: 80px;
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}

.prose :deep(th) {
  background: var(--background-secondary);
  font-weight: 600;
}

.diff-content :deep(td.diff-cell-removed),
.diff-content :deep(th.diff-cell-removed) {
  background: rgba(255, 100, 100, 0.22);
  text-decoration: line-through;
  text-decoration-color: rgba(255, 140, 140, 0.85);
}

.diff-content :deep(td.diff-cell-added),
.diff-content :deep(th.diff-cell-added) {
  background: rgba(61, 214, 140, 0.22);
}

.diff-content :deep(td.diff-cell-changed),
.diff-content :deep(th.diff-cell-changed) {
  background: rgba(255, 200, 80, 0.12);
}

.diff-content :deep(td.diff-table-row-spacer) {
  background: transparent;
  border-color: transparent;
  border-top: none;
  border-bottom: none;
  color: transparent;
  user-select: none;
}

.diff-content :deep(.diff-line-removed) {
  background: rgba(255, 100, 100, 0.12);
  border-radius: 4px;
  padding: 2px 6px;
}

.diff-content :deep(.diff-line-removed p:last-child),
.diff-content :deep(.diff-line-added p:last-child) {
  margin-bottom: 0;
}

.diff-content :deep(.diff-line-removed h1),
.diff-content :deep(.diff-line-removed h2),
.diff-content :deep(.diff-line-removed h3),
.diff-content :deep(.diff-line-removed h4),
.diff-content :deep(.diff-line-removed h5),
.diff-content :deep(.diff-line-removed h6) {
  text-decoration: line-through;
  text-decoration-color: rgba(255, 140, 140, 0.85);
}

.diff-content :deep(.diff-line-added) {
  background: rgba(61, 214, 140, 0.12);
  border-radius: 4px;
  padding: 2px 6px;
}

@media (max-width: 900px) {
  .compare-headers,
  .compare-row {
    grid-template-columns: 1fr;
  }

  .header-divider,
  .row-divider {
    height: 1px;
    width: 100%;
  }
}
</style>
