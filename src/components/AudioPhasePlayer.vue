<template>
  <div class="phase-player">
    <!-- Transport controls -->
    <div class="transport">
      <button class="play-btn" @click="toggle" :aria-label="playing ? 'Pause' : 'Play'">
        <svg v-if="!playing" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
      </button>
      <span class="time-display">
        <span class="time-current">{{ formatTime(currentTime) }}</span>
        <span class="time-sep">/</span>
        <span class="time-total">{{ formatTime(duration) }}</span>
      </span>
      <div class="volume-group">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="volume-icon">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z"/>
        </svg>
        <input type="range" min="0" max="1" step="0.01" v-model.number="volume" class="volume-slider" />
      </div>
    </div>

    <!-- Timeline bar -->
    <div class="timeline" ref="timelineRef" @click="seek" @mousemove="onHover" @mouseleave="hoverPhase = null">
      <div
        v-for="phase in phases"
        :key="phase.name"
        class="phase-segment"
        :class="{ active: currentPhase?.name === phase.name }"
        :style="segmentStyle(phase)"
        :title="phase.name"
      />
      <!-- Playhead -->
      <div class="playhead" :style="{ left: playheadPct + '%' }" />
      <!-- Hover tooltip -->
      <div v-if="hoverPhase" class="phase-tooltip" :style="{ left: hoverX + 'px' }">
        {{ hoverPhase.name }} · {{ formatTime(hoverTime) }}
      </div>
    </div>

    <!-- Phase legend -->
    <div class="phase-legend">
      <div
        v-for="phase in phases"
        :key="phase.name"
        class="legend-item"
        :class="{ active: currentPhase?.name === phase.name }"
      >
        <span class="legend-dot" :style="{ background: phase.color }" />
        <span class="legend-label">{{ phase.label }}</span>
      </div>
    </div>

    <!-- Active phase description -->
    <div v-if="currentPhase" class="phase-description" :key="currentPhase.name">
      <div class="phase-desc-header">
        <span class="phase-desc-dot" :style="{ background: currentPhase.color }" />
        <span class="phase-desc-name">{{ currentPhase.label }}</span>
        <span class="phase-desc-time">{{ formatTime(currentPhase.start) }}–{{ formatTime(currentPhase.end) }}</span>
      </div>
      <p class="phase-desc-text">{{ currentPhase.description }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  phases: {
    type: Array,
    required: true,
    // Each: { name, label, start, end, color, description }
  },
})

const audio = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.7)
const timelineRef = ref(null)
const hoverPhase = ref(null)
const hoverX = ref(0)
const hoverTime = ref(0)
let raf = null

const totalEnd = computed(() => {
  const maxPhase = Math.max(...props.phases.map(p => p.end))
  return duration.value > 0 ? duration.value : maxPhase
})

const playheadPct = computed(() => {
  if (totalEnd.value === 0) return 0
  return Math.min((currentTime.value / totalEnd.value) * 100, 100)
})

const currentPhase = computed(() => {
  const t = currentTime.value
  for (let i = props.phases.length - 1; i >= 0; i--) {
    if (t >= props.phases[i].start) return props.phases[i]
  }
  return props.phases[0]
})

function segmentStyle(phase) {
  const total = totalEnd.value || 1
  const left = (phase.start / total) * 100
  const width = ((phase.end - phase.start) / total) * 100
  return {
    left: left + '%',
    width: width + '%',
    background: phase.color,
  }
}

function formatTime(sec) {
  if (!sec || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

function toggle() {
  if (!audio.value) return
  if (playing.value) {
    audio.value.pause()
  } else {
    audio.value.play()
  }
}

function seek(e) {
  if (!audio.value || !timelineRef.value) return
  const total = totalEnd.value
  if (!total || !isFinite(total)) return
  const rect = timelineRef.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  audio.value.currentTime = pct * total
}

function onHover(e) {
  if (!timelineRef.value) return
  const total = totalEnd.value
  if (!total || !isFinite(total)) return
  const rect = timelineRef.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const t = pct * total
  hoverX.value = e.clientX - rect.left
  hoverTime.value = t
  hoverPhase.value = null
  for (let i = props.phases.length - 1; i >= 0; i--) {
    if (t >= props.phases[i].start && t < props.phases[i].end) {
      hoverPhase.value = props.phases[i]
      break
    }
  }
}

function tick() {
  if (audio.value) {
    currentTime.value = audio.value.currentTime
  }
  raf = requestAnimationFrame(tick)
}

watch(volume, (v) => {
  if (audio.value) audio.value.volume = v
})

onMounted(() => {
  const a = new Audio(props.src)
  a.volume = volume.value
  a.addEventListener('loadedmetadata', () => { duration.value = a.duration })
  a.addEventListener('play', () => { playing.value = true })
  a.addEventListener('pause', () => { playing.value = false })
  a.addEventListener('ended', () => { playing.value = false; currentTime.value = 0 })
  audio.value = a
  raf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  if (audio.value) {
    audio.value.pause()
    audio.value.src = ''
  }
})
</script>

<style scoped>
.phase-player {
  border: 1px solid var(--color-oled-border);
  border-radius: 16px;
  background: var(--color-oled-surface);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Transport */
.transport {
  display: flex;
  align-items: center;
  gap: 12px;
}

.play-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--color-oled-border);
  background: var(--color-oled-elevated);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.play-btn:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.time-display {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 80px;
}
.time-current { color: var(--color-text-primary); }
.time-sep { margin: 0 2px; }

.volume-group {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.volume-icon { color: var(--color-text-muted); flex-shrink: 0; }
.volume-slider {
  width: 70px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-oled-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-text-secondary);
  cursor: pointer;
}
.volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-text-secondary);
  border: none;
  cursor: pointer;
}

/* Timeline */
.timeline {
  position: relative;
  height: 32px;
  background: var(--color-oled-elevated);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--color-oled-border-subtle);
}

.phase-segment {
  position: absolute;
  top: 0;
  height: 100%;
  opacity: 0.5;
  transition: opacity 0.2s ease;
  border-right: 1px solid var(--color-oled-bg);
}
.phase-segment.active {
  opacity: 1;
}

.playhead {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: var(--color-text-primary);
  border-radius: 1px;
  pointer-events: none;
  z-index: 2;
  box-shadow: 0 0 6px rgba(255,255,255,0.3);
  transition: left 0.05s linear;
}

.phase-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: var(--color-oled-card);
  border: 1px solid var(--color-oled-border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}

/* Legend */
.phase-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0.5;
  transition: opacity 0.2s ease;
}
.legend-item.active {
  opacity: 1;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Phase description */
.phase-description {
  background: var(--color-oled-elevated);
  border: 1px solid var(--color-oled-border-subtle);
  border-radius: 10px;
  padding: 12px 14px;
}

.phase-desc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.phase-desc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.phase-desc-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.phase-desc-time {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  margin-left: auto;
}

.phase-desc-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}
</style>
