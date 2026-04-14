<template>
  <div class="playground">
    <!-- Input area -->
    <div class="playground-panel">
      <h3 class="panel-title">Message Text</h3>
      <textarea
        ref="textareaRef"
        v-model="text"
        class="playground-textarea"
        placeholder="Type your message text here..."
        @select="onSelect"
        @click="onSelect"
        @keyup="onSelect"
      />

      <!-- Entity toolbar -->
      <div class="entity-toolbar">
        <span class="toolbar-label">Apply to selection:</span>
        <button
          v-for="etype in entityTypes"
          :key="etype.type"
          class="entity-btn"
          :title="etype.label"
          :disabled="!hasSelection"
          @click="addEntity(etype)"
        >
          {{ etype.icon }}
          <span class="entity-btn-label">{{ etype.label }}</span>
        </button>
      </div>

      <!-- Mention/URL extra fields -->
      <div v-if="pendingEntity" class="extra-field">
        <label class="extra-label">{{ pendingEntity.fieldLabel }}</label>
        <input
          v-model="pendingEntity.value"
          class="extra-input"
          :placeholder="pendingEntity.placeholder"
          @keyup.enter="confirmPendingEntity"
        />
        <button class="extra-confirm" @click="confirmPendingEntity">Add</button>
        <button class="extra-cancel" @click="pendingEntity = null">✕</button>
      </div>

      <!-- Entity list -->
      <div v-if="entities.length" class="entity-list">
        <h4 class="entity-list-title">Entities</h4>
        <div v-for="(e, i) in entities" :key="i" class="entity-chip">
          <span class="entity-chip-type">{{ e.type }}</span>
          <span class="entity-chip-range">[{{ e.offset }}:{{ e.offset + e.length }}]</span>
          <span class="entity-chip-text">"{{ text.slice(e.offset, e.offset + e.length) }}"</span>
          <span v-if="e.extra" class="entity-chip-extra">{{ e.extra }}</span>
          <button class="entity-chip-remove" @click="entities.splice(i, 1)">✕</button>
        </div>
      </div>
    </div>

    <!-- Controls builder -->
    <div class="playground-panel">
      <h3 class="panel-title">Controls (Buttons)</h3>
      <div v-for="(row, ri) in controlRows" :key="ri" class="control-row">
        <div class="control-row-header">
          <span class="control-row-label">Row {{ ri + 1 }}</span>
          <button class="control-row-remove" @click="controlRows.splice(ri, 1)">Remove row</button>
        </div>
        <div class="control-buttons">
          <div v-for="(btn, bi) in row" :key="bi" class="control-btn-edit">
            <select v-model="btn.variant" class="control-select">
              <option value="callback">Callback</option>
              <option value="link">Link</option>
            </select>
            <input v-model="btn.label" class="control-input" placeholder="Label" />
            <input
              v-if="btn.variant === 'callback'"
              v-model="btn.id"
              class="control-input control-input-sm"
              placeholder="ID"
            />
            <input
              v-if="btn.variant === 'link'"
              v-model="btn.url"
              class="control-input"
              placeholder="https://..."
            />
            <div class="colour-row">
              <input v-model.number="btn.colourH" type="range" min="0" max="359" class="colour-slider" />
              <span class="colour-preview" :style="{ background: oklchToCss(btn.colourH) }"></span>
            </div>
            <label class="control-disabled-label">
              <input type="checkbox" v-model="btn.disabled" />
              disabled
            </label>
            <button class="entity-chip-remove" @click="row.splice(bi, 1)">✕</button>
          </div>
        </div>
        <button v-if="row.length < 5" class="add-btn add-btn-sm" @click="addButton(row)">+ Button</button>
      </div>
      <button v-if="controlRows.length < 5" class="add-btn" @click="addRow()">+ Add Row</button>
    </div>

    <!-- Live preview -->
    <div class="playground-panel">
      <h3 class="panel-title">Live Preview</h3>
      <div class="preview-message">
        <div class="preview-avatar">B</div>
        <div class="preview-content">
          <div class="preview-header">
            <span class="preview-username">YourBot</span>
            <span class="preview-time">now</span>
          </div>
          <div class="preview-text" v-html="renderedHtml"></div>
          <div v-if="renderedControls.length" class="preview-controls">
            <div v-for="(row, ri) in renderedControls" :key="ri" class="preview-control-row">
              <button
                v-for="(btn, bi) in row"
                :key="bi"
                class="preview-button"
                :class="{ 'preview-button--disabled': btn.disabled, 'preview-button--link': btn.variant === 'link' }"
                :style="btn.style"
              >
                {{ btn.label || 'Button' }}
                <span v-if="btn.variant === 'link'" class="preview-link-icon">↗</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- JSON output -->
    <div class="playground-panel">
      <h3 class="panel-title">
        API Payload
        <button class="copy-btn" @click="copyJson">{{ copied ? '✓ Copied' : 'Copy' }}</button>
      </h3>
      <pre class="json-output">{{ jsonPayload }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface EntityEntry {
  type: string;
  offset: number;
  length: number;
  extra?: string;
  // specific fields
  userId?: string;
  domain?: string;
  path?: string;
  email?: string;
  hashtag?: string;
  colour?: number;
}

interface ButtonEntry {
  variant: 'callback' | 'link';
  label: string;
  id: string;
  url: string;
  colourH: number;
  disabled: boolean;
}

interface PendingEntity {
  type: string;
  offset: number;
  length: number;
  fieldLabel: string;
  placeholder: string;
  field: string;
  value: string;
}

const entityTypes = [
  { type: 'bold',          icon: 'B',  label: 'Bold' },
  { type: 'italic',        icon: 'I',  label: 'Italic' },
  { type: 'strikethrough', icon: 'S',  label: 'Strikethrough' },
  { type: 'monospace',     icon: '<>', label: 'Monospace' },
  { type: 'spoiler',       icon: '██', label: 'Spoiler' },
  { type: 'underline',     icon: 'U',  label: 'Underline' },
  { type: 'mention',       icon: '@',  label: 'Mention', needsField: true, fieldLabel: 'User ID (GUID)', placeholder: 'd3b07384-...' },
  { type: 'url',           icon: '🔗', label: 'URL', needsField: true, fieldLabel: 'Domain / Path', placeholder: 'example.com' },
  { type: 'email',         icon: '✉',  label: 'Email', needsField: true, fieldLabel: 'Email', placeholder: 'user@example.com' },
  { type: 'hashTag',       icon: '#',  label: 'HashTag', needsField: true, fieldLabel: 'Tag', placeholder: 'argon' },
] as const;

const text = ref('Hello world! Check this out.');
const entities = ref<EntityEntry[]>([]);
const controlRows = ref<ButtonEntry[][]>([]);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const selStart = ref(0);
const selEnd = ref(0);
const pendingEntity = ref<PendingEntity | null>(null);
const copied = ref(false);

const hasSelection = computed(() => selStart.value !== selEnd.value);

function onSelect() {
  const el = textareaRef.value;
  if (!el) return;
  selStart.value = el.selectionStart;
  selEnd.value = el.selectionEnd;
}

function addEntity(etype: typeof entityTypes[number]) {
  if (!hasSelection.value) return;
  const offset = selStart.value;
  const length = selEnd.value - selStart.value;

  if ('needsField' in etype && etype.needsField) {
    pendingEntity.value = {
      type: etype.type,
      offset,
      length,
      fieldLabel: etype.fieldLabel!,
      placeholder: etype.placeholder!,
      field: etype.type,
      value: '',
    };
    return;
  }

  entities.value.push({ type: etype.type, offset, length });
}

function confirmPendingEntity() {
  const p = pendingEntity.value;
  if (!p || !p.value) return;

  const entry: EntityEntry = { type: p.type, offset: p.offset, length: p.length };

  switch (p.type) {
    case 'mention':
      entry.userId = p.value;
      entry.extra = `userId: ${p.value}`;
      break;
    case 'url': {
      const parts = p.value.split('/');
      entry.domain = parts[0];
      entry.path = '/' + parts.slice(1).join('/');
      entry.extra = `${entry.domain}${entry.path}`;
      break;
    }
    case 'email':
      entry.email = p.value;
      entry.extra = p.value;
      break;
    case 'hashTag':
      entry.hashtag = p.value.replace(/^#/, '');
      entry.extra = `#${entry.hashtag}`;
      break;
  }

  entities.value.push(entry);
  pendingEntity.value = null;
}

function addRow() {
  const row: ButtonEntry[] = [];
  addButton(row);
  controlRows.value.push(row);
}

function addButton(row: ButtonEntry[]) {
  row.push({
    variant: 'callback',
    label: 'Button',
    id: `btn_${Date.now()}`,
    url: '',
    colourH: 260,
    disabled: false,
  });
}

function oklchToCss(h: number): string {
  return `oklch(0.65 0.2 ${h})`;
}

// Render entities into HTML
const renderedHtml = computed(() => {
  const t = text.value;
  if (!t) return '';

  // Build spans
  type Span = { start: number; end: number; type: string; entity: EntityEntry };
  const spans: Span[] = entities.value
    .filter(e => e.offset >= 0 && e.offset + e.length <= t.length)
    .map(e => ({ start: e.offset, end: e.offset + e.length, type: e.type, entity: e }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  if (!spans.length) return escapeHtml(t);

  // Collect breakpoints
  const points = new Set<number>();
  points.add(0);
  points.add(t.length);
  for (const s of spans) {
    points.add(s.start);
    points.add(s.end);
  }
  const sorted = [...points].sort((a, b) => a - b);

  let html = '';
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const chunk = escapeHtml(t.slice(from, to));

    // Which entities cover this chunk?
    const active = spans.filter(s => s.start <= from && s.end >= to);

    if (!active.length) {
      html += chunk;
      continue;
    }

    let wrapped = chunk;
    for (const s of active) {
      wrapped = wrapEntity(wrapped, s.type, s.entity);
    }
    html += wrapped;
  }
  return html;
});

function wrapEntity(content: string, type: string, entity: EntityEntry): string {
  switch (type) {
    case 'bold':          return `<strong>${content}</strong>`;
    case 'italic':        return `<em>${content}</em>`;
    case 'strikethrough': return `<del>${content}</del>`;
    case 'monospace':     return `<code class="preview-mono">${content}</code>`;
    case 'spoiler':       return `<span class="preview-spoiler">${content}</span>`;
    case 'underline':     return `<u>${content}</u>`;
    case 'mention':       return `<span class="preview-mention">@${content}</span>`;
    case 'url':           return `<a class="preview-url">${content}</a>`;
    case 'email':         return `<a class="preview-url">${content}</a>`;
    case 'hashTag':       return `<span class="preview-hashtag">#${content}</span>`;
    default:              return content;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Render controls
const renderedControls = computed(() => {
  return controlRows.value.map(row =>
    row.map(btn => ({
      label: btn.label,
      variant: btn.variant,
      disabled: btn.disabled,
      style: {
        '--btn-colour': oklchToCss(btn.colourH),
        '--btn-bg': `oklch(0.65 0.2 ${btn.colourH} / 0.15)`,
        '--btn-border': `oklch(0.65 0.2 ${btn.colourH} / 0.3)`,
      },
    }))
  );
});

// JSON payload
const jsonPayload = computed(() => {
  const payload: any = {
    channelId: '00000000-0000-0000-0000-000000000000',
    text: text.value,
    randomId: 1,
  };

  if (entities.value.length) {
    payload.entities = entities.value.map(e => {
      const obj: any = { type: e.type, offset: e.offset, length: e.length };
      if (e.userId) obj.userId = e.userId;
      if (e.domain) { obj.domain = e.domain; obj.path = e.path; }
      if (e.email) obj.email = e.email;
      if (e.hashtag) obj.hashtag = e.hashtag;
      return obj;
    });
  }

  if (controlRows.value.length) {
    payload.controls = controlRows.value.map(row => ({
      controls: row.map(btn => {
        const obj: any = {
          type: 0, // Button
          variant: btn.variant === 'callback' ? 0 : 1,
          label: btn.label,
        };
        if (btn.variant === 'callback') obj.id = btn.id;
        if (btn.variant === 'link') obj.url = btn.url;
        obj.colour = { l: 0.65, c: 0.2, h: btn.colourH };
        if (btn.disabled) obj.disabled = true;
        return obj;
      }),
    }));
  }

  return JSON.stringify(payload, null, 2);
});

async function copyJson() {
  await navigator.clipboard.writeText(jsonPayload.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<style scoped>
.playground {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.playground-panel {
  background: var(--color-oled-surface);
  border: 1px solid var(--color-oled-border-subtle);
  border-radius: 1rem;
  padding: 1.25rem;
}

.panel-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.playground-textarea {
  width: 100%;
  min-height: 80px;
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--color-text-primary);
  resize: vertical;
  outline: none;
}
.playground-textarea:focus {
  border-color: var(--color-accent);
}

/* Entity toolbar */
.entity-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.75rem;
}
.toolbar-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-right: 0.25rem;
}
.entity-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.entity-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.entity-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.entity-btn-label {
  font-weight: 500;
}

/* Extra field popup */
.extra-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-accent);
  border-radius: 0.5rem;
}
.extra-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.extra-input {
  flex: 1;
  background: var(--color-oled-surface);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-primary);
  outline: none;
}
.extra-confirm {
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-accent);
  border: none;
  border-radius: 0.375rem;
  color: white;
  cursor: pointer;
}
.extra-cancel {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.8rem;
}

/* Entity chips */
.entity-list {
  margin-top: 0.75rem;
}
.entity-list-title {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.375rem;
}
.entity-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.2rem 0.5rem;
  margin: 0.125rem;
  font-size: 0.7rem;
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.375rem;
}
.entity-chip-type {
  color: var(--color-accent);
  font-weight: 600;
  font-family: var(--font-mono);
}
.entity-chip-range {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
.entity-chip-text {
  color: var(--color-text-secondary);
}
.entity-chip-extra {
  color: var(--color-accent-2);
  font-family: var(--font-mono);
}
.entity-chip-remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0;
  line-height: 1;
}
.entity-chip-remove:hover {
  color: var(--color-status-down);
}

/* Controls builder */
.control-row {
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.5rem;
}
.control-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.control-row-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
}
.control-row-remove {
  font-size: 0.65rem;
  background: none;
  border: none;
  color: var(--color-status-down);
  cursor: pointer;
}
.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.control-btn-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
.control-select, .control-input {
  background: var(--color-oled-surface);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  color: var(--color-text-primary);
  outline: none;
}
.control-input {
  flex: 1;
  min-width: 80px;
}
.control-input-sm {
  flex: 0;
  min-width: 60px;
  max-width: 100px;
}
.control-select {
  width: 90px;
}
.colour-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.colour-slider {
  width: 80px;
  height: 4px;
  accent-color: var(--color-accent);
}
.colour-preview {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--color-oled-border);
}
.control-disabled-label {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}
.add-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-oled-elevated);
  border: 1px dashed var(--color-oled-border);
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.add-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.add-btn-sm {
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
}

/* ── Live Preview ── */
.preview-message {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-oled-elevated);
  border-radius: 0.75rem;
}
.preview-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  flex-shrink: 0;
}
.preview-content {
  flex: 1;
  min-width: 0;
}
.preview-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.preview-username {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-accent);
}
.preview-time {
  font-size: 0.65rem;
  color: var(--color-text-muted);
}
.preview-text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--color-text-primary);
  word-break: break-word;
}
.preview-text :deep(strong) { font-weight: 700; }
.preview-text :deep(em) { font-style: italic; }
.preview-text :deep(del) { text-decoration: line-through; color: var(--color-text-secondary); }
.preview-text :deep(u) { text-decoration: underline; text-decoration-color: #3b82f6; }
.preview-text :deep(.preview-mono) {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  background: var(--color-oled-surface);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  border: 1px solid var(--color-oled-border);
}
.preview-text :deep(.preview-spoiler) {
  background: var(--color-text-muted);
  color: transparent;
  border-radius: 0.25rem;
  padding: 0 0.15rem;
  cursor: pointer;
  transition: all 0.2s;
}
.preview-text :deep(.preview-spoiler:hover) {
  background: transparent;
  color: var(--color-text-primary);
}
.preview-text :deep(.preview-mention) {
  color: var(--color-accent);
  font-weight: 600;
  cursor: pointer;
}
.preview-text :deep(.preview-url) {
  color: #3b82f6;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.preview-text :deep(.preview-url::after) {
  content: ' ↗';
  font-size: 0.7rem;
  font-weight: 700;
}
.preview-text :deep(.preview-hashtag) {
  color: var(--color-accent-2);
  font-weight: 500;
}

/* Controls preview */
.preview-controls {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.preview-control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.preview-button {
  padding: 0.375rem 0.875rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.5rem;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: var(--btn-colour);
  cursor: pointer;
  transition: all 0.15s;
}
.preview-button:hover:not(.preview-button--disabled) {
  filter: brightness(1.2);
}
.preview-button--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.preview-button--link {
  border-style: dashed;
}
.preview-link-icon {
  font-size: 0.65rem;
  margin-left: 0.2rem;
}

/* JSON output */
.json-output {
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.5rem;
  padding: 1rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}

.copy-btn {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border);
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
</style>
