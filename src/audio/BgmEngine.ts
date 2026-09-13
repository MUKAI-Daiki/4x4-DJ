/**
 * Chiptune BGM Engine - Authentic 8-bit NES style background music sequencer and metronome clock.
 * Sample-accurate timing using AudioContext.currentTime lookahead scheduler.
 */

export interface BgmPreset {
  id: string;
  name: string;
  category: string;
  defaultBpm: number;
}

export const BGM_PRESETS: BgmPreset[] = [
  { id: 'overworld', name: '8-BIT OVERWORLD', category: 'Action Adventure', defaultBpm: 136 },
  { id: 'techno',    name: 'CHIP TECHNO',    category: 'Electro 8-Bit',     defaultBpm: 128 },
  { id: 'dungeon',   name: 'DUNGEON GROOVE', category: 'Deep Minimal',      defaultBpm: 108 },
  { id: 'boss',      name: 'SPEED RUN',      category: 'Fast Tempo',        defaultBpm: 152 },
  { id: 'click',     name: 'CHIP METRONOME', category: 'Pure Clock',        defaultBpm: 120 },
  { id: 'silent',    name: 'NO BGM (CLOCK ONLY)', category: 'Pure Clock',    defaultBpm: 120 },
];

export interface VisualizerState {
  progress: number; // 0.0 to 1.0 in current measure
  beat: number;     // 0, 1, 2, 3
  step: number;     // 0 to 15
  bar: number;      // 1-based bar counter
  isPlaying: boolean;
  isDownbeat: boolean;
}

export class BgmEngine {
  private ctx: AudioContext;
  private outputNode: AudioNode;

  private isPlaying = false;
  private bpm = 136;
  private currentPresetId = 'overworld';

  // Lookahead scheduling
  private lookaheadMs = 25.0;
  private scheduleAheadTime = 0.1;
  private timerId: number | null = null;

  private currentStep = 0; // 0 to 15
  private currentBar = 1;
  private nextStepTime = 0;
  private measureStartTime = 0;
  private transportStartTime = 0;

  // Pre-cached NES noise buffers to eliminate runtime memory allocation and GC stutter
  private snareBuffer: AudioBuffer | null = null;
  private hatBuffer: AudioBuffer | null = null;

  // Callback to notify loopers and memory engine when a measure is prepared
  public onMeasurePrepare?: (bar: number, measureStartTime: number, measureDuration: number) => void;

  constructor(ctx: AudioContext, outputNode: AudioNode) {
    this.ctx = ctx;
    this.outputNode = outputNode;
    this.initNoiseBuffers();
  }

  private initNoiseBuffers(): void {
    const sampleRate = this.ctx.sampleRate;

    // Pre-cache NES Snare Noise Buffer (100ms)
    const snareLen = Math.floor(sampleRate * 0.1);
    this.snareBuffer = this.ctx.createBuffer(1, snareLen, sampleRate);
    const snareData = this.snareBuffer.getChannelData(0);
    let lfsrSnare = 0x7fff;
    for (let i = 0; i < snareLen; i++) {
      const bit = ((lfsrSnare >> 0) ^ (lfsrSnare >> 1)) & 1;
      lfsrSnare = (lfsrSnare >> 1) | (bit << 14);
      snareData[i] = ((lfsrSnare & 1) ? 1 : -1) * 0.6;
    }

    // Pre-cache NES Hi-Hat Noise Buffer (30ms)
    const hatLen = Math.floor(sampleRate * 0.03);
    this.hatBuffer = this.ctx.createBuffer(1, hatLen, sampleRate);
    const hatData = this.hatBuffer.getChannelData(0);
    let lfsrHat = 0x007f;
    for (let i = 0; i < hatLen; i++) {
      const bit = ((lfsrHat >> 0) ^ (lfsrHat >> 6)) & 1;
      lfsrHat = (lfsrHat >> 1) | (bit << 6);
      hatData[i] = ((lfsrHat & 1) ? 1 : -1) * 0.35;
    }
  }

  public setBpm(newBpm: number): void {
    this.bpm = Math.max(40, Math.min(240, Math.round(newBpm)));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setPreset(presetId: string): void {
    this.currentPresetId = presetId;
    const preset = BGM_PRESETS.find(p => p.id === presetId);
    if (preset && !this.isPlaying) {
      this.bpm = preset.defaultBpm;
    }
  }

  public getPreset(): string {
    return this.currentPresetId;
  }

  public play(): void {
    if (this.isPlaying) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.currentBar = 1;
    this.nextStepTime = this.ctx.currentTime + 0.04;
    this.transportStartTime = this.nextStepTime;
    this.measureStartTime = this.nextStepTime;

    const secondsPerMeasure = (60.0 / this.bpm) * 4;
    if (this.onMeasurePrepare) {
      this.onMeasurePrepare(1, this.transportStartTime, secondsPerMeasure);
    }

    this.scheduler();
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public stop(): void {
    this.pause();
    this.currentStep = 0;
    this.currentBar = 1;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getMeasureStartTime(): number {
    return this.measureStartTime;
  }

  public getTransportStartTime(): number {
    return this.transportStartTime;
  }

  public getMeasureDuration(): number {
    return (60.0 / this.bpm) * 4;
  }

  public getCurrentBar(): number {
    return this.currentBar;
  }

  public getVisualizerState(): VisualizerState {
    if (!this.isPlaying) {
      return {
        progress: 0,
        beat: 0,
        step: 0,
        bar: this.currentBar,
        isPlaying: false,
        isDownbeat: false
      };
    }

    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPerMeasure = secondsPerBeat * 4;
    const now = this.ctx.currentTime;
    const elapsed = Math.max(0, now - this.transportStartTime);
    const progress = (elapsed % secondsPerMeasure) / secondsPerMeasure;

    const beat = Math.floor(progress * 4) % 4;
    const step = Math.floor(progress * 16) % 16;
    const currentBar = Math.floor(elapsed / secondsPerMeasure) + 1;
    const isDownbeat = progress < 0.08;

    return {
      progress,
      beat,
      step,
      bar: currentBar,
      isPlaying: true,
      isDownbeat
    };
  }

  /**
   * Calculates the exact AudioContext time for the next quantized grid point.
   * Snaps to the nearest division grid point without artificial multi-beat delays.
   */
  public getNextQuantizedTime(division: '1/4' | '1/8' | '1/16' = '1/16'): number {
    const now = this.ctx.currentTime;
    if (!this.isPlaying) {
      return now;
    }

    const secondsPerBeat = 60.0 / this.bpm; // 1/4 note duration
    let unitSec = secondsPerBeat;
    if (division === '1/8') unitSec = secondsPerBeat / 2;
    if (division === '1/16') unitSec = secondsPerBeat / 4;

    const elapsed = Math.max(0, now - this.transportStartTime);
    const currentUnits = elapsed / unitSec;
    // Snap to nearest grid unit
    const nearestUnitIndex = Math.round(currentUnits);
    let targetTime = this.transportStartTime + nearestUnitIndex * unitSec;

    // Don't schedule in the past
    if (targetTime < now) {
      targetTime = now;
    }

    return targetTime;
  }

  // --- Scheduler Loop ---

  private scheduler = (): void => {
    if (!this.isPlaying) return;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }

    this.timerId = window.setTimeout(this.scheduler, this.lookaheadMs);
  };

  private advanceStep(): void {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPer16th = 0.25 * secondsPerBeat;

    this.nextStepTime += secondsPer16th;
    this.currentStep++;

    if (this.currentStep >= 16) {
      this.currentStep = 0;
      this.currentBar++;
      this.measureStartTime = this.nextStepTime;
      const secondsPerMeasure = (60.0 / this.bpm) * 4;
      if (this.onMeasurePrepare) {
        this.onMeasurePrepare(this.currentBar, this.measureStartTime, secondsPerMeasure);
      }
    }
  }

  private scheduleStep(step: number, time: number): void {
    switch (this.currentPresetId) {
      case 'overworld':
        this.playOverworldStep(step, time);
        break;
      case 'techno':
        this.playTechnoStep(step, time);
        break;
      case 'dungeon':
        this.playDungeonStep(step, time);
        break;
      case 'boss':
        this.playBossStep(step, time);
        break;
      case 'silent':
        // Silent clock for pad sequencer / looper
        break;
      case 'click':
      default:
        this.playMetronomeStep(step, time);
        break;
    }
  }

  // --- Chiptune Track Synthesizers ---

  /**
   * Overworld: Playful 8-bit adventure rhythm
   */
  private playOverworldStep(step: number, time: number): void {
    // 8-bit Kick on 0, 8
    if (step === 0 || step === 8) {
      this.triggerNesKick(time);
    }
    // 8-bit Snare on 4, 12
    if (step === 4 || step === 12) {
      this.triggerNesSnare(time);
    }
    // Periodic Hi-Hat on even steps
    if (step % 2 === 0) {
      this.triggerNesHat(time);
    }

    // Classic NES Triangle Bass Line (C Major / G)
    // Notes: C3 (130.81), E3 (164.81), G3 (196.00), A3 (220.00), B3 (246.94)
    const bassNotes = [
      130.81, 0, 130.81, 164.81,
      196.00, 0, 196.00, 164.81,
      130.81, 0, 130.81, 196.00,
      246.94, 0, 220.00, 196.00
    ];
    const freq = bassNotes[step];
    if (freq > 0) {
      this.triggerTriTone(time, freq, 0.08, 0.55);
    }

    // 8-Bit Pulse Chords on off-beats (step 2, 6, 10, 14)
    if (step === 2 || step === 6 || step === 10 || step === 14) {
      this.triggerSquareTone(time, 523.25, 0.05, 0.25); // C5
    }
  }

  /**
   * Chip Techno: High-energy 8-bit four-on-the-floor
   */
  private playTechnoStep(step: number, time: number): void {
    // Four on the floor kick (0, 4, 8, 12)
    if (step % 4 === 0) {
      this.triggerNesKick(time);
    }
    // Off-beat noise clap (2, 6, 10, 14)
    if (step % 4 === 2) {
      this.triggerNesSnare(time);
    }
    // Constant 16th-note metallic hat
    this.triggerNesHat(time);

    // Rolling 16th acid triangle bass
    const bassScale = [65.41, 65.41, 77.78, 65.41, 87.31, 65.41, 98.00, 116.54];
    const f = bassScale[step % bassScale.length];
    this.triggerTriTone(time, f, 0.06, 0.6);
  }

  /**
   * Dungeon Groove: Mysterious minimal underground chiptune
   */
  private playDungeonStep(step: number, time: number): void {
    // Deep heavy kick on 0, 7, 10
    if (step === 0 || step === 7 || step === 10) {
      this.triggerNesKick(time);
    }
    if (step === 4 || step === 12) {
      this.triggerNesSnare(time);
    }
    if (step % 4 === 0) {
      this.triggerNesHat(time);
    }

    // Creepy chromatic triangle bass
    const dungeonBass = [55.0, 0, 58.27, 0, 55.0, 0, 61.74, 0, 55.0, 0, 51.91, 0, 55.0, 65.41, 58.27, 0];
    const freq = dungeonBass[step];
    if (freq > 0) {
      this.triggerTriTone(time, freq, 0.1, 0.6);
    }
  }

  /**
   * Boss Battle: Rapid adrenaline speedrun
   */
  private playBossStep(step: number, time: number): void {
    if (step % 4 === 0 || step === 11) {
      this.triggerNesKick(time);
    }
    if (step === 4 || step === 12) {
      this.triggerNesSnare(time);
    }
    this.triggerNesHat(time);

    // Fast alternating triangle bass
    const f = step % 2 === 0 ? 110.0 : 220.0;
    this.triggerTriTone(time, f, 0.05, 0.55);
  }

  /**
   * Chip Metronome: High/Low 8-bit blip click
   */
  private playMetronomeStep(step: number, time: number): void {
    if (step % 4 !== 0) return;

    const isFirstBeat = step === 0;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    // High blip (1760Hz) on beat 1, lower blip (880Hz) on beats 2-4
    osc.frequency.setValueAtTime(isFirstBeat ? 1760 : 880, time);

    gain.gain.setValueAtTime(isFirstBeat ? 0.45 : 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

    osc.connect(gain);
    gain.connect(this.outputNode);

    osc.start(time);
    osc.stop(time + 0.04);
  }

  // --- Sound Generators for Sequencer ---

  private triggerNesKick(time: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.outputNode);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  private triggerNesSnare(time: number): void {
    if (!this.snareBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.snareBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(gain);
    gain.connect(this.outputNode);
    noise.start(time);
    noise.stop(time + 0.11);
  }

  private triggerNesHat(time: number): void {
    if (!this.hatBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.hatBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    noise.connect(gain);
    gain.connect(this.outputNode);
    noise.start(time);
    noise.stop(time + 0.035);
  }

  private triggerTriTone(time: number, freq: number, duration: number, vol: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.linearRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.outputNode);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private triggerSquareTone(time: number, freq: number, duration: number, vol: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.outputNode);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }
}
