import './style.css';
import { AudioEngine } from './audio/AudioEngine';
import { PAD_DEFINITIONS, type PadSoundConfig } from './audio/SoundSynthesizer';
import { BGM_PRESETS } from './audio/BgmEngine';
import type { MemoryPadEvent } from './audio/PadMemoryEngine';

// Initialize Core Audio Engine
const engine = new AudioEngine();

// Tap BPM Tracker State
const tapTimes: number[] = [];
let tapResetTimer: number | null = null;

// Quick Mic Sampling & 3-Second Countdown State
let activeSamplingPadId: number | null = null;
let countingDownPadId: number | null = null;
let countdownTimer: number | null = null;
let countdownRemaining = 3;
let samplingStartTime = 0;

// Audio Master Recording State
let recordIntervalId: number | null = null;
let recordDownloadUrl: string | null = null;

// Prevent Context Menu on long-press or right-click across the entire application
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
});

// Render Main App Structure
const app = document.getElementById('app')!;
app.innerHTML = `
  <!-- Top Hardware Header -->
  <header class="dj-header">
    <div class="brand-section">
      <div class="brand-logo" title="4x4 DJ (RiTan)">
        <svg class="brand-icon-svg" width="22" height="19" viewBox="0 0 44.7 39.42" fill="none">
          <polygon fill="#197dc8" points="16.75 39.37 0 39.42 0 37.03 14.28 36.99 14.29 19.75 29.99 19.73 30.01 2.62 35.64 2.63 35.64 5.01 32.46 5.01 32.45 22.17 16.73 22.18 16.75 39.37"/>
          <ellipse fill="#c01421" cx="41.2" cy="3.51" rx="3.5" ry="3.51"/>
        </svg>
        4x4 DJ
      </div>
      <span class="brand-badge">CHIPTUNE</span>
      <div class="header-status-led">
        <span class="led-dot active" id="audioLed"></span>
        <span id="audioStatusText">ONLINE</span>
      </div>
    </div>

    <div class="header-tools">
      <button class="btn-icon-hdr" id="btnFullscreen" title="Toggle Fullscreen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
    </div>
  </header>

  <!-- Main DJ Console (2-Column) -->
  <main class="dj-main">
    <!-- LEFT COLUMN: 4x4 Pad Arena -->
    <section class="pad-arena">
      <!-- Quick Sampling / Countdown Status Banner -->
      <div class="mic-assign-banner" id="micAssignBanner">
        <span class="mic-assign-text" id="micBannerText">
          <span>●</span> <span>RECORDING MIC TO PAD...</span>
        </span>
        <button class="mic-assign-cancel-btn" id="btnCancelMicAssign" title="Cancel">✕</button>
      </div>

      <div class="pad-arena-inner">
        <div class="pad-grid-4x4" id="padGrid">
          <!-- 16 Pads generated dynamically -->
        </div>
      </div>
    </section>

    <!-- RIGHT COLUMN: Control Rack -->
    <section class="control-rack">
      <!-- 1. Rhythm Visualizer -->
      <div class="rack-card visualizer-card">
        <div class="rack-card-hdr">
          <span class="rack-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            VISUALIZER
          </span>
          <div class="visualizer-meta-row">
            <button class="btn-quantize active" id="btnQuantize" title="Quantize Grid">⊞ 1/16</button>
            <span style="margin-left: 12px;">▮ <span class="counter-value" id="barCounter">01</span></span>
            <span style="margin-left: 10px;">● <span class="counter-value" id="beatCounter">1</span></span>
          </div>
        </div>

        <div class="visualizer-display">
          <!-- 4-Beat Accent LEDs -->
          <div class="beat-leds-bar">
            <div class="beat-led downbeat" id="beatLed0"></div>
            <div class="beat-led" id="beatLed1"></div>
            <div class="beat-led" id="beatLed2"></div>
            <div class="beat-led" id="beatLed3"></div>
          </div>

          <!-- Sweep Bar Timeline (16 Steps) -->
          <div class="rhythm-timeline" id="timelineBar">
            <div class="timeline-ticks">
              ${Array.from({ length: 16 })
                .map((_, i) => `<div class="tick ${i % 4 === 0 ? 'beat-marker' : ''}"></div>`)
                .join('')}
            </div>
            <div class="memory-timeline-notes" id="memoryTimelineNotes"></div>
            <div class="playhead-bar" id="playhead"></div>
          </div>
        </div>
      </div>

      <!-- 2. 1-Bar Loop Memory Sequencer -->
      <div class="rack-card memory-card" id="memoryCard">
        <div class="rack-card-hdr">
          <span class="rack-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            LOOP MEMORY
          </span>
          <div class="memory-meta-badges">
            <span class="memory-status-tag idle" id="memoryStatusTag">IDLE</span>
            <span class="memory-stat-badge">♪ <span id="memNotesCount">0</span></span>
            <span class="memory-stat-badge">≡ <span id="memLayersCount">0</span></span>
          </div>
        </div>

        <div class="memory-controls-grid">
          <!-- Row 1: Primary Loop Action Buttons -->
          <div class="memory-primary-actions">
            <button class="btn-memory-rec" id="btnMemoryRec" title="1-Bar Recording (Overdub) [Key: M]">
              <span class="led-dot" id="memRecLed" style="width:10px; height:10px;"></span>
              <span id="memRecText">● REC</span>
            </button>

            <button class="btn-memory-play active" id="btnMemoryPlay" title="Toggle Loop Playback [Key: P]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" id="memPlayIcon">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
              <span id="memPlayText">PLAY</span>
            </button>
          </div>

          <!-- Row 2: Secondary Memory Management Buttons (Icon-Only Minimal) -->
          <div class="memory-secondary-actions">
            <button class="btn-memory-tool" id="btnMemoryUndo" title="Undo [Backspace]" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M3 7v6h6"/>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
            </button>

            <button class="btn-memory-tool" id="btnMemoryClear" title="Clear Loop">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>

            <button class="btn-memory-tool" id="btnMemorySave" title="Save Pattern">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            </button>

            <button class="btn-memory-tool" id="btnMemoryLoad" title="Load Pattern">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          </div>

          <!-- Notification / Ticker bar -->
          <div class="memory-ticker-bar">
            <span id="memTickerText">1-BAR MEMORY READY: TAP REC TO RECORD LOOPS</span>
          </div>
        </div>
      </div>

      <!-- 3. BGM / Clock Select & Transport -->
      <div class="rack-card">
        <div class="rack-card-hdr">
          <span class="rack-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
            BGM
          </span>
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            <input type="range" id="bgmVolume" min="0" max="1.2" step="0.05" value="0.85" class="dj-slider" style="width: 85px;" />
          </div>
        </div>

        <div class="bgm-controls-row">
          <select class="preset-selector" id="bgmSelect">
            ${BGM_PRESETS.map(p => `<option value="${p.id}">${p.name} (${p.category})</option>`).join('')}
          </select>

          <button class="btn-transport" id="btnPlayBgm" title="Play / Pause BGM [Space]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>

          <button class="btn-transport" id="btnStopBgm" title="Stop">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 4. BPM & Tap Tempo -->
      <div class="rack-card">
        <div class="rack-card-hdr">
          <span class="rack-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            TEMPO
          </span>
        </div>

        <div class="bpm-row">
          <div class="bpm-display-box">
            <span class="bpm-label">BPM</span>
            <span class="bpm-num" id="bpmDisplay">136</span>
          </div>

          <div class="bpm-slider-wrap">
            <input type="range" id="bpmSlider" min="50" max="220" value="136" class="dj-slider" />
            <div class="bpm-btn-group">
              <button class="btn-nudge" id="btnBpmMinus" title="Tempo -1">−</button>
              <button class="btn-nudge" id="btnBpmPlus" title="Tempo +1">＋</button>
            </div>
          </div>

          <button class="btn-tap-bpm" id="btnTapBpm" title="Tap tempo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            TAP
          </button>
        </div>
      </div>

      <!-- 5. DJ Effects Rack -->
      <div class="rack-card">
        <div class="rack-card-hdr">
          <span class="rack-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>
            </svg>
            FX
          </span>
        </div>

        <div class="fx-grid">
          <!-- Filter Module -->
          <div class="fx-module">
            <span class="fx-module-title">FILTER</span>
            <input type="range" id="fxFilterSlider" min="-1" max="1" step="0.05" value="0" class="dj-slider" />
            <div class="fx-filter-center-label">
              <span>LPF</span>
              <span style="color:var(--neon-cyan); font-weight:bold;">●</span>
              <span>HPF</span>
            </div>
          </div>

          <!-- Delay Module -->
          <div class="fx-module">
            <span class="fx-module-title">ECHO</span>
            <button class="fx-toggle-btn" id="btnFxDelay">DLY OFF</button>
            <input type="range" id="fxDelayFeedback" min="0.1" max="0.8" step="0.05" value="0.45" class="dj-slider" title="Echo Feedback" />
          </div>

          <!-- Reverb Module -->
          <div class="fx-module">
            <span class="fx-module-title">REV</span>
            <button class="fx-toggle-btn rev" id="btnFxReverb">REV OFF</button>
            <input type="range" id="fxReverbMix" min="0" max="0.9" step="0.05" value="0.4" class="dj-slider" title="Reverb Amount" />
          </div>
        </div>
      </div>

      <!-- 6. Recording & Master Export -->
      <div class="bottom-tools-row">
        <!-- Master WAV Arrangement Recording -->
        <div class="tool-card" style="grid-column: 1 / -1;">
          <div class="tool-header">
            <span class="tool-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
              MASTER REC (WAV)
            </span>
            <span style="font-size:0.9rem; font-weight:700; color:var(--text-muted);" id="recTime">00:00</span>
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <button class="btn-action-tool" id="btnRecordMaster" style="flex:1;">
              <span class="led-dot" id="recLed" style="width:8px; height:8px;"></span>
              <span id="recBtnText">● REC</span>
            </button>
            <div id="wavDownloadContainer"></div>
          </div>
        </div>
      </div>
    </section>
  </main>
`;

// --- Build 4x4 Pad Grid Elements ---
const padGrid = document.getElementById('padGrid')!;
const padElementMap = new Map<number, HTMLElement>();

function isSamplingOrCounting(): boolean {
  return activeSamplingPadId !== null || countingDownPadId !== null;
}

function updateQuickRecButtonsState(): void {
  const bgmPlaying = engine.bgm.getIsPlaying();
  const samplingActive = isSamplingOrCounting();

  document.querySelectorAll<HTMLElement>('.pad-quick-rec-btn').forEach((btn) => {
    const padId = Number(btn.getAttribute('data-rec-id'));
    if (activeSamplingPadId === padId) {
      btn.classList.add('recording');
      btn.classList.remove('disabled');
    } else if (bgmPlaying || samplingActive) {
      btn.classList.remove('recording');
      btn.classList.add('disabled');
    } else {
      btn.classList.remove('recording');
      btn.classList.remove('disabled');
    }
  });
}

function applyExclusiveLock(targetPadId: number | null, lock: boolean): void {
  // Lock or unlock non-target pads
  PAD_DEFINITIONS.forEach((def) => {
    const el = padElementMap.get(def.id);
    if (el) {
      if (lock && def.id !== targetPadId) {
        el.classList.add('pad-muted');
      } else {
        el.classList.remove('pad-muted');
      }
    }
  });

  // Lock or unlock BGM controls & transport
  const bgmSection = document.querySelector('.bgm-controls-row');
  const memorySection = document.querySelector('.memory-controls-grid');
  if (bgmSection) {
    if (lock) bgmSection.classList.add('transport-locked');
    else bgmSection.classList.remove('transport-locked');
  }
  if (memorySection) {
    if (lock) memorySection.classList.add('transport-locked');
    else memorySection.classList.remove('transport-locked');
  }
}

function renderPads(): void {
  padGrid.innerHTML = '';

  PAD_DEFINITIONS.forEach((def: PadSoundConfig) => {
    const pad = document.createElement('div');
    pad.className = 'dj-pad';
    pad.id = `pad-${def.id}`;
    pad.setAttribute('data-id', String(def.id));
    pad.style.setProperty('--pad-accent-color', def.color);
    pad.style.setProperty('--pad-glow-color', `${def.color}66`);

    pad.innerHTML = `
      <div class="pad-top-meta">
        <span class="pad-num">${String(def.id).padStart(2, '0')}</span>
        <span class="pad-key">${def.keyLabel}</span>
      </div>
      <div class="pad-center">
        <div class="pad-indicator-dot"></div>
        <div class="pad-countdown-display" id="padCountdown-${def.id}">3</div>
      </div>
      <div class="pad-bottom-meta">
        <span class="pad-title" id="padTitle-${def.id}">${def.name}</span>
        <button class="pad-quick-rec-btn" data-rec-id="${def.id}" title="Mic Record to Pad ${def.id}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="7"/>
          </svg>
        </button>
      </div>
    `;

    // Multi-touch Pointer Events - Direct instant trigger only (Long-press recording removed)
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPadTrigger(def.id);
    });

    pad.addEventListener('pointerup', (e) => {
      e.preventDefault();
      onPadRelease(def.id);
    });

    pad.addEventListener('pointercancel', (e) => {
      e.preventDefault();
      onPadRelease(def.id);
    });

    pad.addEventListener('pointerleave', (e) => {
      e.preventDefault();
      onPadRelease(def.id);
    });

    // Quick Mic assignment button inside pad - ONLY method to initiate mic recording
    const quickRecBtn = pad.querySelector('.pad-quick-rec-btn') as HTMLElement;
    quickRecBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleQuickRecButtonClick(def.id);
    });

    padGrid.appendChild(pad);
    padElementMap.set(def.id, pad);
  });

  updateQuickRecButtonsState();
}

renderPads();

// --- Pad Interaction & Multi-Touch Logic ---
function onPadTrigger(padId: number): void {
  // Prohibit pad triggers while recording or in countdown
  if (isSamplingOrCounting()) return;

  // If memory recording is armed but BGM transport is stopped, auto-start transport so 1-bar cycle runs
  if (engine.memory.getIsRecording() && !engine.bgm.getIsPlaying()) {
    engine.bgm.play();
    updateBgmPlayButton(true);
    updateQuickRecButtonsState();
  }

  const el = padElementMap.get(padId);
  const { delayMs } = engine.triggerPad(padId);

  if (el) {
    if (delayMs > 35) {
      // Pad is queued for next quantized beat grid!
      el.classList.add('queued');
      window.setTimeout(() => {
        el.classList.remove('queued');
        el.classList.add('active');
        window.setTimeout(() => el.classList.remove('active'), 130);
      }, delayMs);
    } else {
      // Immediate trigger
      el.classList.add('active');
    }
  }
}

function onPadRelease(padId: number): void {
  if (isSamplingOrCounting()) return;

  const el = padElementMap.get(padId);
  if (el && !el.classList.contains('queued')) {
    el.classList.remove('active');
  }
}

// Chromebook Keyboard Shortcuts mapping (16 Keys)
const keyPadMap: Record<string, number> = {
  // Row 1: Percussion
  '1': 13, '2': 14, '3': 15, '4': 16,
  // Row 2: Bass & Lead
  'q': 9, 'w': 10, 'e': 11, 'r': 12,
  'Q': 9, 'W': 10, 'E': 11, 'R': 12,
  // Row 3: Arps & Chords
  'a': 5, 's': 6, 'd': 7, 'f': 8,
  'A': 5, 'S': 6, 'D': 7, 'F': 8,
  // Row 4: Retro SFX
  'z': 1, 'x': 2, 'c': 3, 'v': 4,
  'Z': 1, 'X': 2, 'C': 3, 'V': 4,
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

  // Prohibit all keys if recording or countdown is active
  if (isSamplingOrCounting()) return;

  // Space for BGM Play/Pause
  if (e.code === 'Space') {
    e.preventDefault();
    toggleBgmTransport();
    return;
  }

  // 'm' or 'M' for Memory REC toggle
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleMemoryRecord();
    return;
  }

  // 'p' or 'P' for Memory Loop toggle
  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    toggleMemoryPlay();
    return;
  }

  // 'Backspace' for Memory Undo
  if (e.key === 'Backspace') {
    e.preventDefault();
    triggerMemoryUndo();
    return;
  }

  const padId = keyPadMap[e.key];
  if (padId !== undefined) {
    onPadTrigger(padId);
  }
});

window.addEventListener('keyup', (e) => {
  if (isSamplingOrCounting()) return;

  const padId = keyPadMap[e.key];
  if (padId !== undefined) {
    onPadRelease(padId);
  }
});

// --- Quick Mic Sampling with 3-Second Countdown & Exclusive Lock ---
const micAssignBanner = document.getElementById('micAssignBanner')!;
const micBannerText = document.getElementById('micBannerText')!;
const btnCancelMicAssign = document.getElementById('btnCancelMicAssign')!;

let warningBannerTimeout: number | null = null;
function showMicBannerWarning(msg: string): void {
  micBannerText.innerHTML = `<span>⚠</span> <span>${msg}</span>`;
  micAssignBanner.className = 'mic-assign-banner warning show';
  if (warningBannerTimeout) window.clearTimeout(warningBannerTimeout);
  warningBannerTimeout = window.setTimeout(() => {
    if (!isSamplingOrCounting()) {
      micAssignBanner.className = 'mic-assign-banner';
    }
  }, 2500);
}

function handleQuickRecButtonClick(padId: number): void {
  // 1. If currently recording this pad, tap 〇 saves and completes recording
  if (activeSamplingPadId === padId) {
    finishQuickMicSampling(padId);
    return;
  }

  // 2. If counting down on this pad, tap 〇 cancels
  if (countingDownPadId === padId) {
    cancelCountdown();
    return;
  }

  // 3. If another pad is already recording or counting down, ignore
  if (isSamplingOrCounting()) {
    return;
  }

  // 4. Check BGM playback: Do NOT allow recording while BGM is playing
  if (engine.bgm.getIsPlaying()) {
    showMicBannerWarning('BGM再生中は録音できません (BGMを停止してください)');
    return;
  }

  // 5. Start 3-second countdown
  startCountdown(padId);
}

function startCountdown(padId: number): void {
  cancelCountdown();
  countingDownPadId = padId;
  countdownRemaining = 3;

  applyExclusiveLock(padId, true);
  updateQuickRecButtonsState();

  const targetPad = padElementMap.get(padId);
  if (targetPad) {
    targetPad.classList.add('rec-countdown');
    const cdDisplay = document.getElementById(`padCountdown-${padId}`);
    if (cdDisplay) cdDisplay.textContent = '3';
  }

  micBannerText.innerHTML = `<span>⏱</span> <span>COUNTDOWN: ${countdownRemaining}...</span>`;
  micAssignBanner.className = 'mic-assign-banner countdown show';

  countdownTimer = window.setInterval(() => {
    countdownRemaining--;
    if (countdownRemaining > 0) {
      const cdDisplay = document.getElementById(`padCountdown-${padId}`);
      if (cdDisplay) cdDisplay.textContent = String(countdownRemaining);
      micBannerText.innerHTML = `<span>⏱</span> <span>COUNTDOWN: ${countdownRemaining}...</span>`;
    } else {
      if (countdownTimer) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
      countingDownPadId = null;
      if (targetPad) {
        targetPad.classList.remove('rec-countdown');
      }
      startQuickMicSampling(padId);
    }
  }, 1000);
}

function cancelCountdown(): void {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (countingDownPadId !== null) {
    const pad = padElementMap.get(countingDownPadId);
    if (pad) {
      pad.classList.remove('rec-countdown');
    }
    countingDownPadId = null;
  }
  applyExclusiveLock(null, false);
  micAssignBanner.className = 'mic-assign-banner';
  updateQuickRecButtonsState();
}

async function startQuickMicSampling(padId: number): Promise<void> {
  await engine.init();
  if (activeSamplingPadId !== null) return;

  const started = await engine.mic.startRecording(padId);
  if (!started) {
    alert('Microphone permission required for sampling.');
    cancelCountdown();
    return;
  }

  activeSamplingPadId = padId;
  samplingStartTime = Date.now();

  const el = padElementMap.get(padId);
  if (el) el.classList.add('rec-target');

  micBannerText.innerHTML = `<span>●</span> <span>RECORDING PAD ${String(padId).padStart(2, '0')}... (TAP 〇 TO SAVE)</span>`;
  micAssignBanner.className = 'mic-assign-banner show';
  updateQuickRecButtonsState();
}

async function finishQuickMicSampling(padId: number): Promise<void> {
  if (activeSamplingPadId !== padId) return;

  const elapsed = Date.now() - samplingStartTime;
  if (elapsed < 150) {
    await new Promise(r => setTimeout(r, 200 - elapsed));
  }

  const result = await engine.mic.stopRecording();
  activeSamplingPadId = null;

  const el = padElementMap.get(padId);
  if (el) el.classList.remove('rec-target');
  micAssignBanner.className = 'mic-assign-banner';

  applyExclusiveLock(null, false);
  updateQuickRecButtonsState();

  if (result && result.buffer) {
    engine.setPadBuffer(padId, result.buffer, `MIC REC`);
    const padTitle = document.getElementById(`padTitle-${padId}`);
    if (padTitle) {
      padTitle.textContent = `● MIC`;
      padTitle.style.color = 'var(--neon-red)';
    }

    // Audition newly sampled audio
    engine.triggerPad(padId);
  }
}

btnCancelMicAssign.addEventListener('click', async () => {
  if (countingDownPadId !== null) {
    cancelCountdown();
  } else if (activeSamplingPadId !== null) {
    const padId = activeSamplingPadId;
    activeSamplingPadId = null;
    await engine.mic.stopRecording();
    const el = padElementMap.get(padId);
    if (el) el.classList.remove('rec-target');
    applyExclusiveLock(null, false);
    micAssignBanner.className = 'mic-assign-banner';
    updateQuickRecButtonsState();
  }
});

// --- Rhythm Visualizer & Playhead Animation ---
const timelineBarEl = document.getElementById('timelineBar');
const playhead = document.getElementById('playhead')!;
const barCounter = document.getElementById('barCounter')!;
const beatCounter = document.getElementById('beatCounter')!;
const beatLeds = [
  document.getElementById('beatLed0')!,
  document.getElementById('beatLed1')!,
  document.getElementById('beatLed2')!,
  document.getElementById('beatLed3')!,
];

// Cache timeline width with ResizeObserver to completely eliminate layout thrashing (clientWidth) on every frame
let cachedTimelineWidth = timelineBarEl ? timelineBarEl.clientWidth : 300;
if (window.ResizeObserver && timelineBarEl) {
  new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.contentRect.width > 0) {
        cachedTimelineWidth = entry.contentRect.width;
      }
    }
  }).observe(timelineBarEl);
} else {
  window.addEventListener('resize', () => {
    if (timelineBarEl) cachedTimelineWidth = timelineBarEl.clientWidth;
  });
}

let lastBeat = -1;
let lastBar = -1;
let lastIsPlaying = false;

function updateVisualizerLoop(): void {
  const state = engine.bgm.getVisualizerState();

  if (state.isPlaying) {
    lastIsPlaying = true;
    const sweepPx = state.progress * cachedTimelineWidth;
    playhead.style.transform = `translateX(${sweepPx}px)`;

    if (state.bar !== lastBar) {
      lastBar = state.bar;
      barCounter.textContent = String(state.bar).padStart(2, '0');
    }

    if (state.beat !== lastBeat) {
      lastBeat = state.beat;
      beatCounter.textContent = String(state.beat + 1);
      beatLeds.forEach((led, idx) => {
        if (idx === state.beat) {
          led.classList.add('active');
          window.setTimeout(() => led.classList.remove('active'), 110);
        }
      });
    }
  } else if (lastIsPlaying) {
    // Only reset once when stopping playback to avoid redundant DOM operations every frame
    lastIsPlaying = false;
    lastBeat = -1;
    lastBar = -1;
    playhead.style.transform = 'translateX(0px)';
    beatCounter.textContent = '1';
  }

  requestAnimationFrame(updateVisualizerLoop);
}
requestAnimationFrame(updateVisualizerLoop);

// --- Quantize Control (Grid timing alignment) ---
const btnQuantize = document.getElementById('btnQuantize') as HTMLButtonElement;
const quantizeModes: Array<'1/16' | '1/8' | '1/4' | 'OFF'> = ['1/16', '1/8', '1/4', 'OFF'];
let currentQuantizeIdx = 0; // Starts at '1/16'

btnQuantize.addEventListener('click', () => {
  currentQuantizeIdx = (currentQuantizeIdx + 1) % quantizeModes.length;
  const mode = quantizeModes[currentQuantizeIdx];
  engine.setQuantizeMode(mode);

  btnQuantize.textContent = `QNTZ: ${mode}`;
  if (mode === 'OFF') {
    btnQuantize.classList.remove('active');
    btnQuantize.classList.add('off');
  } else {
    btnQuantize.classList.remove('off');
    btnQuantize.classList.add('active');
  }
});

// --- BGM & Transport Controls ---
const btnPlayBgm = document.getElementById('btnPlayBgm')!;
const btnStopBgm = document.getElementById('btnStopBgm')!;
const bgmSelect = document.getElementById('bgmSelect') as HTMLSelectElement;
const bgmVolume = document.getElementById('bgmVolume') as HTMLInputElement;

function updateBgmPlayButton(isPlaying: boolean): void {
  if (isPlaying) {
    btnPlayBgm.classList.add('playing');
    btnPlayBgm.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    `;
  } else {
    btnPlayBgm.classList.remove('playing');
    btnPlayBgm.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    `;
  }
}

async function toggleBgmTransport(): Promise<void> {
  // Prohibit BGM playback during sampling or countdown
  if (isSamplingOrCounting()) return;

  await engine.init();
  if (engine.bgm.getIsPlaying()) {
    engine.bgm.pause();
    updateBgmPlayButton(false);
  } else {
    engine.bgm.play();
    updateBgmPlayButton(true);
  }
  updateQuickRecButtonsState();
}

btnPlayBgm.addEventListener('click', async () => {
  await toggleBgmTransport();
});

btnStopBgm.addEventListener('click', () => {
  engine.bgm.stop();
  updateBgmPlayButton(false);
  updateQuickRecButtonsState();
});

bgmSelect.addEventListener('change', () => {
  engine.bgm.setPreset(bgmSelect.value);
  bpmSlider.value = String(engine.bgm.getBpm());
  bpmDisplay.textContent = String(engine.bgm.getBpm());
});

bgmVolume.addEventListener('input', () => {
  // Set independent BGM volume without muting pads or memory looper
  engine.setBgmVolume(parseFloat(bgmVolume.value));
});

// --- 1-Bar Loop Memory Sequencer UI Controls ---
const memoryTimelineNotes = document.getElementById('memoryTimelineNotes')!;
const memoryStatusTag = document.getElementById('memoryStatusTag')!;
const memNotesCount = document.getElementById('memNotesCount')!;
const memLayersCount = document.getElementById('memLayersCount')!;

const btnMemoryRec = document.getElementById('btnMemoryRec')!;
const memRecLed = document.getElementById('memRecLed')!;
const memRecText = document.getElementById('memRecText')!;

const btnMemoryPlay = document.getElementById('btnMemoryPlay')!;
const memPlayIcon = document.getElementById('memPlayIcon')!;
const memPlayText = document.getElementById('memPlayText')!;

const btnMemoryUndo = document.getElementById('btnMemoryUndo') as HTMLButtonElement;
const btnMemoryClear = document.getElementById('btnMemoryClear') as HTMLButtonElement;
const btnMemorySave = document.getElementById('btnMemorySave') as HTMLButtonElement;
const btnMemoryLoad = document.getElementById('btnMemoryLoad') as HTMLButtonElement;
const memTickerText = document.getElementById('memTickerText')!;

let tickerTimer: number | null = null;
function setTicker(msg: string, durationMs = 3000): void {
  memTickerText.textContent = msg;
  memTickerText.classList.add('highlight');
  if (tickerTimer) window.clearTimeout(tickerTimer);
  tickerTimer = window.setTimeout(() => {
    memTickerText.classList.remove('highlight');
    if (engine.memory.getIsRecording()) {
      memTickerText.textContent = '● RECORDING (OVERDUB): TAP PADS TO LAYER SOUNDS';
    } else if (engine.memory.getEventCount() > 0) {
      memTickerText.textContent = `LOOPING: ${engine.memory.getEventCount()} NOTES ACROSS ${engine.memory.getLayerCount()} LAYERS`;
    } else {
      memTickerText.textContent = '1-BAR MEMORY READY: TAP REC TO RECORD LOOPS';
    }
  }, durationMs);
}

function renderMemoryTimelineNotes(events: MemoryPadEvent[]): void {
  if (!memoryTimelineNotes) return;
  memoryTimelineNotes.innerHTML = '';

  events.forEach((ev) => {
    const padDef = PAD_DEFINITIONS.find(p => p.id === ev.padId);
    const color = padDef ? padDef.color : 'var(--neon-cyan)';
    const marker = document.createElement('div');
    marker.className = 'mem-note-pill';
    marker.style.left = `${ev.normalizedTime * 100}%`;
    marker.style.setProperty('--pill-color', color);
    marker.title = `Pad ${ev.padId}: ${padDef?.name || ''}`;
    memoryTimelineNotes.appendChild(marker);
  });
}

// Memory State Change Callback
engine.memory.onUpdate = (state) => {
  memNotesCount.textContent = String(state.eventCount);
  memLayersCount.textContent = String(state.layerCount);

  // Status badge
  if (state.isRecording) {
    memoryStatusTag.textContent = 'REC / DUB';
    memoryStatusTag.className = 'memory-status-tag rec';
  } else if (state.eventCount > 0 && state.isPlaying) {
    memoryStatusTag.textContent = 'LOOP PLAY';
    memoryStatusTag.className = 'memory-status-tag playing';
  } else {
    memoryStatusTag.textContent = 'IDLE';
    memoryStatusTag.className = 'memory-status-tag idle';
  }

  // REC button styling
  if (state.isRecording) {
    btnMemoryRec.classList.add('recording');
    memRecLed.classList.add('rec');
    memRecText.textContent = '● REC';
  } else {
    btnMemoryRec.classList.remove('recording');
    memRecLed.classList.remove('rec');
    memRecText.textContent = '● REC';
  }

  // Play button styling
  if (state.isPlaying) {
    btnMemoryPlay.classList.add('active');
    memPlayText.textContent = 'PAUSE';
    memPlayIcon.innerHTML = `
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    `;
  } else {
    btnMemoryPlay.classList.remove('active');
    memPlayText.textContent = 'PLAY';
    memPlayIcon.innerHTML = `
      <polygon points="5 3 19 12 5 21 5 3"/>
    `;
  }

  // Undo button enabled state
  btnMemoryUndo.disabled = state.eventCount === 0 && state.layerCount === 0;

  // Timeline note blips
  renderMemoryTimelineNotes(state.events);
};

// Pad visual illumination on loop triggers
engine.memory.onPadTrigger = (padId: number, delayMs: number) => {
  // Prohibit loop pad triggers while sampling or countdown
  if (isSamplingOrCounting()) return;

  window.setTimeout(() => {
    const el = padElementMap.get(padId);
    if (el) {
      el.classList.add('loop-active');
      window.setTimeout(() => el.classList.remove('loop-active'), 110);
    }
  }, delayMs);
};

// Toggle REC / OVERDUB
async function toggleMemoryRecord(): Promise<void> {
  if (isSamplingOrCounting()) return;

  await engine.init();
  const willRecord = !engine.memory.getIsRecording();

  // If turning on recording and transport is not playing, auto-start transport
  if (willRecord && !engine.bgm.getIsPlaying()) {
    engine.bgm.play();
    updateBgmPlayButton(true);
    updateQuickRecButtonsState();
  }

  engine.memory.setRecording(willRecord);
  if (willRecord) {
    setTicker('● RECORDING (OVERDUB) ACTIVE: TAP PADS TO LAYER SOUNDS');
  } else {
    setTicker(`RECORDING STOPPED. LOOPING ${engine.memory.getEventCount()} NOTES.`);
  }
}

// Toggle LOOP PLAY / MUTE
async function toggleMemoryPlay(): Promise<void> {
  if (isSamplingOrCounting()) return;

  await engine.init();
  const willPlay = !engine.memory.getIsPlaying();
  engine.memory.setPlaying(willPlay);

  if (willPlay && !engine.bgm.getIsPlaying() && engine.memory.getEventCount() > 0) {
    engine.bgm.play();
    updateBgmPlayButton(true);
    updateQuickRecButtonsState();
  }

  setTicker(willPlay ? 'LOOP PLAYBACK ON' : 'LOOP PLAYBACK MUTED');
}

// Trigger Undo
function triggerMemoryUndo(): void {
  const res = engine.memory.undo();
  if (res.success) {
    setTicker(`UNDO: REMOVED ${res.removedNotes} NOTE(S). ${res.remainingLayers} LAYER(S) REMAIN.`);
  } else {
    setTicker('NOTHING TO UNDO');
  }
}

// Trigger Clear
function triggerMemoryClear(): void {
  const count = engine.memory.getEventCount();
  if (count === 0) {
    setTicker('MEMORY IS ALREADY EMPTY');
    return;
  }
  engine.memory.clear();
  setTicker(`MEMORY CLEARED (REMOVED ${count} NOTES)`);
}

// Trigger Save
function triggerMemorySave(): void {
  const res = engine.memory.saveToLocal(engine.bgm.getBpm(), engine.getQuantizeMode());
  if (res.success) {
    btnMemorySave.classList.add('flash-success');
    btnMemoryLoad.classList.add('has-save');
    window.setTimeout(() => btnMemorySave.classList.remove('flash-success'), 700);
    setTicker(`SAVED! ${res.count} NOTES (${res.layers} LAYERS) TO LOCAL STORAGE`);
  } else {
    setTicker('SAVE FAILED');
  }
}

// Trigger Load
function triggerMemoryLoad(): void {
  const data = engine.memory.loadFromLocal();
  if (data) {
    if (data.bpm) {
      setBpm(data.bpm);
    }
    btnMemoryLoad.classList.add('flash-success');
    window.setTimeout(() => btnMemoryLoad.classList.remove('flash-success'), 700);
    setTicker(`LOADED! RESTORED ${data.totalEvents} NOTES (${data.layers.length} LAYERS)`);
  } else {
    setTicker('NO SAVED PATTERN FOUND IN LOCAL STORAGE');
  }
}

// Attach Memory Button Listeners
btnMemoryRec.addEventListener('click', () => toggleMemoryRecord());
btnMemoryPlay.addEventListener('click', () => toggleMemoryPlay());
btnMemoryUndo.addEventListener('click', () => triggerMemoryUndo());
btnMemoryClear.addEventListener('click', () => triggerMemoryClear());
btnMemorySave.addEventListener('click', () => triggerMemorySave());
btnMemoryLoad.addEventListener('click', () => triggerMemoryLoad());

// Check if localStorage has saved loop data on start
if (engine.memory.hasSavedData()) {
  btnMemoryLoad.classList.add('has-save');
  btnMemoryLoad.title = 'Saved loop pattern available in Local Storage (Click to Load)';
}

// --- BPM & Tap Tempo Engine ---
const bpmSlider = document.getElementById('bpmSlider') as HTMLInputElement;
const bpmDisplay = document.getElementById('bpmDisplay')!;
const btnBpmMinus = document.getElementById('btnBpmMinus')!;
const btnBpmPlus = document.getElementById('btnBpmPlus')!;
const btnTapBpm = document.getElementById('btnTapBpm')!;

function setBpm(val: number): void {
  const rounded = Math.max(50, Math.min(220, Math.round(val)));
  bpmSlider.value = String(rounded);
  bpmDisplay.textContent = String(rounded);
  engine.bgm.setBpm(rounded);
}

bpmSlider.addEventListener('input', () => {
  setBpm(parseInt(bpmSlider.value, 10));
});

btnBpmMinus.addEventListener('click', () => {
  setBpm(parseInt(bpmSlider.value, 10) - 1);
});

btnBpmPlus.addEventListener('click', () => {
  setBpm(parseInt(bpmSlider.value, 10) + 1);
});

// TAP BPM Implementation
btnTapBpm.addEventListener('click', () => {
  const now = performance.now();
  tapTimes.push(now);

  if (tapResetTimer) {
    window.clearTimeout(tapResetTimer);
  }
  tapResetTimer = window.setTimeout(() => {
    tapTimes.length = 0;
  }, 2500);

  if (tapTimes.length > 1) {
    if (tapTimes.length > 5) tapTimes.shift();

    const intervals: number[] = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const computedBpm = Math.round(60000 / avgIntervalMs);

    if (computedBpm >= 40 && computedBpm <= 240) {
      setBpm(computedBpm);
    }
  }
});

// --- DJ Effects Controls ---
const fxFilterSlider = document.getElementById('fxFilterSlider') as HTMLInputElement;
const btnFxDelay = document.getElementById('btnFxDelay')!;
const fxDelayFeedback = document.getElementById('fxDelayFeedback') as HTMLInputElement;
const btnFxReverb = document.getElementById('btnFxReverb')!;
const fxReverbMix = document.getElementById('fxReverbMix') as HTMLInputElement;

fxFilterSlider.addEventListener('input', () => {
  engine.setFilter(parseFloat(fxFilterSlider.value));
});

btnFxDelay.addEventListener('click', () => {
  const active = engine.toggleDelay();
  if (active) {
    btnFxDelay.classList.add('active');
    btnFxDelay.textContent = 'DLY ON';
  } else {
    btnFxDelay.classList.remove('active');
    btnFxDelay.textContent = 'DLY OFF';
  }
});

fxDelayFeedback.addEventListener('input', () => {
  engine.setDelayFeedback(parseFloat(fxDelayFeedback.value));
});

btnFxReverb.addEventListener('click', () => {
  const active = engine.toggleReverb();
  if (active) {
    btnFxReverb.classList.add('active');
    btnFxReverb.textContent = 'REV ON';
  } else {
    btnFxReverb.classList.remove('active');
    btnFxReverb.textContent = 'REV OFF';
  }
});

fxReverbMix.addEventListener('input', () => {
  engine.setReverbMix(parseFloat(fxReverbMix.value));
});

// --- Master Arrangement Recording (16-bit PCM WAV) ---
const btnRecordMaster = document.getElementById('btnRecordMaster')!;
const recLed = document.getElementById('recLed')!;
const recBtnText = document.getElementById('recBtnText')!;
const recTime = document.getElementById('recTime')!;
const wavDownloadContainer = document.getElementById('wavDownloadContainer')!;

btnRecordMaster.addEventListener('click', async () => {
  await engine.init();
  const status = engine.recorder.getStatus();

  if (!status.isRecording) {
    // Start Master Recording
    engine.recorder.start();
    btnRecordMaster.classList.add('recording');
    recLed.classList.add('rec');
    recBtnText.textContent = '■ STOP';
    wavDownloadContainer.innerHTML = '';

    const startMs = Date.now();
    recordIntervalId = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
      const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const s = String(elapsedSec % 60).padStart(2, '0');
      recTime.textContent = `${m}:${s}`;
    }, 500);
  } else {
    // Stop Recording & Generate Lossless WAV
    if (recordIntervalId) {
      window.clearInterval(recordIntervalId);
      recordIntervalId = null;
    }

    const result = engine.recorder.stop();
    btnRecordMaster.classList.remove('recording');
    recLed.classList.remove('rec');
    recBtnText.textContent = '● REC';

    if (result) {
      if (recordDownloadUrl) {
        URL.revokeObjectURL(recordDownloadUrl);
      }
      recordDownloadUrl = result.url;

      const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const fileName = `4x4_DJ_${dateStr}_${engine.bgm.getBpm()}BPM.wav`;

      wavDownloadContainer.innerHTML = `
        <a href="${result.url}" download="${fileName}" class="btn-download-wav">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          SAVE WAV (${result.durationSec.toFixed(1)}s)
        </a>
      `;

      // Auto trigger download for convenient immediate export
      const autoLink = document.createElement('a');
      autoLink.href = result.url;
      autoLink.download = fileName;
      autoLink.click();
    }
  }
});

// --- Fullscreen Toggle ---
const btnFullscreen = document.getElementById('btnFullscreen')!;
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Auto initialize Audio on first touch/click
window.addEventListener('pointerdown', () => {
  engine.init();
}, { once: true });
