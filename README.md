# 4x4 DJ - 8-Bit Chiptune Sampler & Looper

Authentic Nintendo Famicom / NES 2A03 hardware sound synthesizer, 4x4 live performance pad arena, 1-bar loop memory sequencer, DJ master effects chain, and 16-bit PCM WAV recorder.

![Version](https://img.shields.io/badge/version-1.0.0-cyan.svg)
![Audio](https://img.shields.io/badge/Web_Audio_API-NES_2A03-orange.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 🎮 Features

- **NES 2A03 Sound Synthesis**:
  - Pulse waves (12.5%, 25%, 50% duty cycles)
  - Pure triangle wave (punchy kicks & unattenuated bass)
  - 8-bit pseudo-random LFSR noise (snares, metallic hi-hats, explosions)
  - Ultra-fast micro-arpeggios (classic 8-bit chord illusion)
- **Zero-Latency Live Pad Arena**:
  - 16 interactive pads with multi-touch & pointer support
  - Full keyboard mapping optimized for Chromebook & PC
  - Immediate audio triggering with dynamic LED illumination
- **1-Bar Loop Memory Sequencer**:
  - Sample-accurate measure synchronization with AudioContext clock
  - Live overdubbing mode
  - Multi-layer undo & redo
  - LocalStorage persistence (Save / Load pattern)
- **Built-in Chiptune BGM & Metronome**:
  - 6 preset groove patterns (Overworld, Chip Techno, Dungeon, Speed Run, Click, Silent Clock)
  - 40 to 240 BPM tempo control with Tap Tempo detection
  - 16-step visualizer timeline with downbeat accent LEDs
- **DJ Master Effects Rack**:
  - 3-way resonant DJ filter (Lowpass / Bypass / Highpass)
  - 8-bit style feedback delay (Echo)
  - Space convolution reverb
- **Master Lossless Recording**:
  - Direct 16-bit PCM RIFF WAV export
  - Instant in-browser arrangement download
- **Quick Mic Sampler**:
  - Record voice or acoustic sounds directly onto any pad with auto-normalization

---

## ⌨️ Keyboard Shortcuts

| Row | Pad Numbers | Sound Types | Keyboard Keys |
| :--- | :--- | :--- | :--- |
| **Row 1** | Pads 13 - 16 | NES Kick, Snare, Noise Hit, Hi-Hat | `1`, `2`, `3`, `4` |
| **Row 2** | Pads 09 - 12 | Triangle Bass, Pulse Leads | `Q`, `W`, `E`, `R` |
| **Row 3** | Pads 05 - 08 | Arpeggios, 1-UP, Power Up | `A`, `S`, `D`, `F` |
| **Row 4** | Pads 01 - 04 | Coin, Jump, Laser, Explosion | `Z`, `X`, `C`, `V` |

### Transport & Memory Controls
- `Space`: BGM Play / Pause
- `M`: 1-Bar Memory REC / Overdub Toggle
- `P`: 1-Bar Memory Loop Play / Mute Toggle
- `Backspace`: Undo last recorded layer

---

## 🚀 Tech Stack

- **Frontend**: TypeScript, Vanilla CSS (Custom Design System), HTML5
- **Audio Engine**: Web Audio API, OfflineAudioContext, ScriptProcessorNode, MediaRecorder
- **Build Tool**: Vite 8 (Rolldown / Oxc)
- **Offline PWA**: Service Worker Cache API

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 📄 License

MIT License © 2026 MUKAI Daiki (RiTan)
