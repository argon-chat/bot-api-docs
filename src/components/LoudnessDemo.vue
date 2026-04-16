<template>
  <div class="loudness-demo">
    <!-- Cards -->
    <div class="demo-cards">
      <div
        v-for="sample in samples"
        :key="sample.id"
        class="demo-card"
        :class="[sample.status, { playing: activeSample === sample.id }]"
      >
        <!-- LUFS badge -->
        <div class="lufs-badge" :class="sample.status">
          {{ sample.lufs }} LUFS
        </div>

        <div class="card-label">{{ sample.label }}</div>
        <p class="card-desc">{{ sample.description }}</p>

        <!-- Volume meter (animated bars) -->
        <div class="meter">
          <div
            v-for="n in 12"
            :key="n"
            class="meter-bar"
            :class="{ lit: activeSample === sample.id && n <= sample.meterBars }"
            :style="barStyle(n, sample)"
          />
        </div>

        <!-- Play button -->
        <button class="demo-play-btn" @click="toggleSample(sample.id)" :aria-label="activeSample === sample.id ? 'Stop' : 'Play ' + sample.label">
          <svg v-if="activeSample !== sample.id" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <span class="demo-play-label">{{ activeSample === sample.id ? 'Stop' : 'Play' }}</span>
        </button>
      </div>
    </div>

    <!-- LUFS scale -->
    <div class="lufs-scale">
      <div class="scale-track">
        <div class="scale-fill" />
        <!-- Markers for each sample -->
        <div
          v-for="sample in samples"
          :key="sample.id + '-marker'"
          class="scale-marker"
          :class="sample.status"
          :style="{ left: lufsToPercent(sample.lufsNum) + '%' }"
        >
          <div class="marker-dot" />
          <div class="marker-label">{{ sample.lufs }}</div>
        </div>
        <!-- Range labels -->
        <div class="range-zone too-loud" :style="{ left: lufsToPercent(-10) + '%', width: (lufsToPercent(-10) - lufsToPercent(-16)) + '%' }">
          <span>Too loud</span>
        </div>
        <div class="range-zone good" :style="{ left: lufsToPercent(-23) + '%', width: (lufsToPercent(-16) - lufsToPercent(-23)) + '%' }">
          <span>Target</span>
        </div>
        <div class="range-zone too-quiet" :style="{ left: lufsToPercent(-45) + '%', width: (lufsToPercent(-30) - lufsToPercent(-45)) + '%' }">
          <span>Too quiet</span>
        </div>
      </div>
      <div class="scale-labels">
        <span v-for="db in scaleMarkers" :key="db" class="scale-db" :style="{ left: lufsToPercent(db) + '%' }">{{ db }}</span>
      </div>
    </div>

    <!-- Browser note -->
    <p class="compat-note">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline;vertical-align:-2px;margin-right:4px;opacity:0.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      Opus playback requires Chrome, Firefox, or Edge. Safari does not support OGG/Opus natively.
    </p>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  quietSrc: { type: String, required: true },
  loudSrc: { type: String, required: true },
  goodSrc: { type: String, required: true },
})

const activeSample = ref(null)
const audioEl = ref(null)

const samples = [
  {
    id: 'quiet',
    label: 'Too Quiet',
    description: 'Barely audible. Listener has to max out volume to hear anything.',
    lufs: '-40',
    lufsNum: -40,
    status: 'warn-quiet',
    meterBars: 2,
    src: props.quietSrc,
  },
  {
    id: 'loud',
    label: 'Too Loud',
    description: 'Clipping, distorted. Painful on headphones, wakes the neighbors.',
    lufs: '-8',
    lufsNum: -8,
    status: 'warn-loud',
    meterBars: 12,
    src: props.loudSrc,
  },
  {
    id: 'good',
    label: 'Normalized',
    description: 'Clean, comfortable listening level. Consistent with other tracks.',
    lufs: '-18',
    lufsNum: -18,
    status: 'good',
    meterBars: 7,
    src: props.goodSrc,
  },
]

const scaleMarkers = [-45, -40, -30, -23, -18, -14, -8, 0]

function lufsToPercent(lufs) {
  // Map -50 LUFS → 0%, 0 LUFS → 100%
  return Math.max(0, Math.min(100, ((lufs + 50) / 50) * 100))
}

function barStyle(n, sample) {
  const hue = sample.status === 'good' ? '160' : sample.status === 'warn-loud' ? '0' : '260'
  const sat = sample.status === 'good' ? '70%' : sample.status === 'warn-loud' ? '80%' : '30%'
  const light = 20 + n * 4
  return {
    '--bar-color': `hsl(${hue}, ${sat}, ${light}%)`,
    transitionDelay: (n * 30) + 'ms',
  }
}

function toggleSample(id) {
  // Stop current
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value.src = ''
  }

  if (activeSample.value === id) {
    activeSample.value = null
    audioEl.value = null
    return
  }

  const sample = samples.find(s => s.id === id)
  if (!sample) return

  const a = new Audio(sample.src)
  a.addEventListener('ended', () => { activeSample.value = null })
  a.play()
  audioEl.value = a
  activeSample.value = id
}

onUnmounted(() => {
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value.src = ''
  }
})
</script>

<style scoped>
.loudness-demo {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Cards grid */
.demo-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .demo-cards {
    grid-template-columns: 1fr;
  }
}

.demo-card {
  border: 1px solid var(--color-oled-border);
  border-radius: 14px;
  background: var(--color-oled-surface);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.demo-card.playing {
  border-color: var(--color-oled-border);
}
.demo-card.playing.warn-quiet {
  border-color: var(--color-text-muted);
  box-shadow: 0 0 20px rgba(107, 114, 128, 0.1);
}
.demo-card.playing.warn-loud {
  border-color: var(--color-status-down);
  box-shadow: 0 0 20px var(--color-status-down-subtle);
}
.demo-card.playing.good {
  border-color: var(--color-status-up);
  box-shadow: 0 0 20px var(--color-status-up-subtle);
}

/* LUFS badge */
.lufs-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  width: fit-content;
}
.lufs-badge.warn-quiet {
  background: var(--color-status-unknown-subtle);
  color: var(--color-status-unknown);
}
.lufs-badge.warn-loud {
  background: var(--color-status-down-subtle);
  color: var(--color-status-down);
}
.lufs-badge.good {
  background: var(--color-status-up-subtle);
  color: var(--color-status-up);
}

.card-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
  flex: 1;
}

/* Volume meter */
.meter {
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 28px;
  padding: 4px 0;
}

.meter-bar {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  background: var(--color-oled-border);
  transition: background 0.15s ease, transform 0.15s ease;
  transform-origin: bottom;
}

.meter-bar.lit {
  background: var(--bar-color);
  animation: meter-pulse 0.8s ease-in-out infinite alternate;
}

@keyframes meter-pulse {
  from { transform: scaleY(0.85); }
  to { transform: scaleY(1); }
}

/* Play button */
.demo-play-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  border-radius: 8px;
  border: 1px solid var(--color-oled-border);
  background: var(--color-oled-elevated);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.demo-play-btn:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.demo-play-label {
  font-family: var(--font-sans);
}

/* LUFS Scale */
.lufs-scale {
  position: relative;
  padding: 8px 0 0;
}

.scale-track {
  position: relative;
  height: 6px;
  background: var(--color-oled-elevated);
  border-radius: 3px;
  margin: 16px 0 24px;
}

.scale-fill {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: linear-gradient(90deg,
    var(--color-status-unknown) 0%,
    var(--color-status-unknown) 20%,
    var(--color-status-up) 46%,
    var(--color-status-up) 64%,
    var(--color-status-degraded) 80%,
    var(--color-status-down) 100%
  );
  opacity: 0.25;
}

.scale-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

.marker-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--color-oled-surface);
}
.scale-marker.warn-quiet .marker-dot { background: var(--color-status-unknown); }
.scale-marker.warn-loud .marker-dot { background: var(--color-status-down); }
.scale-marker.good .marker-dot { background: var(--color-status-up); }

.marker-label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.range-zone {
  position: absolute;
  top: -18px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.range-zone span {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.range-zone.too-quiet span { color: var(--color-status-unknown); }
.range-zone.good span { color: var(--color-status-up); }
.range-zone.too-loud span { color: var(--color-status-down); }

.scale-labels {
  position: relative;
  height: 16px;
}

.scale-db {
  position: absolute;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-text-faint);
}

/* Compat note */
.compat-note {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 0;
}
</style>
