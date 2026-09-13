/**
 * Audio Engine - Master coordinator connecting pads, BGM, FX chain, recording, and microphone.
 */
import { SoundSynthesizer, PAD_DEFINITIONS, type PadSoundConfig } from './SoundSynthesizer';
import { BgmEngine } from './BgmEngine';
import { WavRecorder } from './WavRecorder';
import { MicSampler } from './MicSampler';
import { PadMemoryEngine } from './PadMemoryEngine';

export interface FXState {
  filterType: 'bypass' | 'lowpass' | 'highpass';
  filterFreq: number; // 20Hz to 20000Hz
  filterRes: number;  // Q factor
  filterKnob: number; // -1.0 (LPF) to 0 (Off) to +1.0 (HPF)
  delayEnabled: boolean;
  delayTime: number;  // seconds (e.g. 0.25)
  delayFeedback: number; // 0.0 to 0.8
  delayMix: number;   // 0.0 to 1.0
  reverbEnabled: boolean;
  reverbMix: number;  // 0.0 to 1.0
}

export class AudioEngine {
  private ctx: AudioContext;

  // Master nodes
  private masterGain: GainNode;
  private masterLimiter: DynamicsCompressorNode;
  private recorderInputNode: GainNode;

  // FX Nodes
  private fxInputNode: GainNode;
  private filterNode: BiquadFilterNode;

  private delayNode: DelayNode;
  private delayFeedbackGain: GainNode;
  private delayMixGain: GainNode;

  private convolverNode: ConvolverNode;
  private reverbMixGain: GainNode;

  // Direct dry line
  private dryGain: GainNode;

  // Sub-engines
  public synth: SoundSynthesizer;
  public bgm: BgmEngine;
  public recorder: WavRecorder;
  public mic: MicSampler;
  public memory: PadMemoryEngine;

  private bgmGainNode: GainNode;

  // Pad AudioBuffers (id -> AudioBuffer)
  private padBuffers: Map<number, AudioBuffer> = new Map();
  private padCustomNames: Map<number, string> = new Map();

  // FX State
  private fxState: FXState = {
    filterType: 'bypass',
    filterFreq: 20000,
    filterRes: 2.0,
    filterKnob: 0,
    delayEnabled: false,
    delayTime: 0.25,
    delayFeedback: 0.45,
    delayMix: 0.35,
    reverbEnabled: false,
    reverbMix: 0.4,
  };

  private isInitialized = false;

  constructor() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });

    // Master limiting & gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, 0);

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, 0);
    this.masterLimiter.knee.setValueAtTime(4, 0);
    this.masterLimiter.ratio.setValueAtTime(12, 0);
    this.masterLimiter.attack.setValueAtTime(0.003, 0);
    this.masterLimiter.release.setValueAtTime(0.1, 0);

    // Recording bus
    this.recorderInputNode = this.ctx.createGain();
    this.recorderInputNode.gain.setValueAtTime(1.0, 0);

    // FX Bus
    this.fxInputNode = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(1.0, 0);

    // DJ Filter
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'allpass';
    this.filterNode.frequency.setValueAtTime(20000, 0);
    this.filterNode.Q.setValueAtTime(2.0, 0);

    // Delay
    this.delayNode = this.ctx.createDelay(1.5);
    this.delayNode.delayTime.setValueAtTime(this.fxState.delayTime, 0);
    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.setValueAtTime(this.fxState.delayFeedback, 0);
    this.delayMixGain = this.ctx.createGain();
    this.delayMixGain.gain.setValueAtTime(0, 0);

    // Reverb
    this.convolverNode = this.ctx.createConvolver();
    this.reverbMixGain = this.ctx.createGain();
    this.reverbMixGain.gain.setValueAtTime(0, 0);

    // Routing
    this.fxInputNode.connect(this.filterNode);
    this.filterNode.connect(this.dryGain);
    this.dryGain.connect(this.masterLimiter);

    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.delayMixGain);
    this.delayMixGain.connect(this.masterLimiter);

    this.filterNode.connect(this.convolverNode);
    this.convolverNode.connect(this.reverbMixGain);
    this.reverbMixGain.connect(this.masterLimiter);

    this.masterLimiter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.recorderInputNode);

    // Sub-components
    this.bgmGainNode = this.ctx.createGain();
    this.bgmGainNode.gain.setValueAtTime(0.85, 0);
    this.bgmGainNode.connect(this.fxInputNode);

    this.synth = new SoundSynthesizer(this.ctx);
    this.bgm = new BgmEngine(this.ctx, this.bgmGainNode);
    this.recorder = new WavRecorder(this.ctx, this.recorderInputNode);
    this.mic = new MicSampler(this.ctx);

    // 1-Bar Pad Memory Sequencer
    this.memory = new PadMemoryEngine(
      (padId, exactTime, velocity) => this.playPadSample(padId, exactTime, velocity),
      () => this.ctx.currentTime
    );

    // Synchronize BGM measure scheduler with memory loop sequencer
    this.bgm.onMeasurePrepare = (bar, measureStartTime, measureDuration) => {
      this.memory.advanceMeasure(bar, measureStartTime, measureDuration);
    };
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Set up chiptune style impulse
    this.convolverNode.buffer = this.synth.createReverbImpulse(1.2, 3.5);

    // Pre-render 16 NES pad sounds
    for (const def of PAD_DEFINITIONS) {
      try {
        const buf = await this.synth.generatePadSound(def.id);
        this.padBuffers.set(def.id, buf);
      } catch (err) {
        console.error(`Failed to generate sound for pad ${def.id}`, err);
      }
    }

    this.isInitialized = true;
  }

  public getContext(): AudioContext {
    return this.ctx;
  }

  public async ensureResumed(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Quantize Mode: 'OFF', '1/16' (default), '1/8', '1/4'
  public quantizeMode: 'OFF' | '1/4' | '1/8' | '1/16' = '1/16';

  public setQuantizeMode(mode: 'OFF' | '1/4' | '1/8' | '1/16'): void {
    this.quantizeMode = mode;
  }

  public getQuantizeMode(): 'OFF' | '1/4' | '1/8' | '1/16' {
    return this.quantizeMode;
  }

  /**
   * Triggers a pad sound immediately with zero latency.
   * If quantize is active, the recording in memory sequencer is snapped to the grid.
   */
  public triggerPad(padId: number, velocity = 1.0): { targetTime: number; delayMs: number } {
    this.ensureResumed();

    const buffer = this.padBuffers.get(padId);
    const now = this.ctx.currentTime;
    if (!buffer) return { targetTime: now, delayMs: 0 };

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1.0, Math.max(0.1, velocity)), 0);

    source.connect(gain);
    gain.connect(this.fxInputNode);

    // Live pad playback is ALWAYS immediate (zero latency)
    source.start(now);

    // Record into Memory Sequencer if recording is armed and measure clock is running
    if (this.memory.getIsRecording() && this.bgm.getIsPlaying()) {
      this.memory.recordHit(
        padId,
        now,
        this.bgm.getTransportStartTime(),
        this.bgm.getMeasureDuration(),
        this.quantizeMode,
        velocity
      );
    }

    return { targetTime: now, delayMs: 0 };
  }

  /**
   * Plays a pad sample at an exact scheduled AudioContext time.
   * Connected to fxInputNode to receive all active DJ filter/echo/reverb and master recording.
   */
  public playPadSample(padId: number, exactTime: number, velocity = 1.0): void {
    this.ensureResumed();

    const buffer = this.padBuffers.get(padId);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1.0, Math.max(0.1, velocity)), 0);

    source.connect(gain);
    gain.connect(this.fxInputNode);

    source.start(Math.max(this.ctx.currentTime, exactTime));
  }

  public setPadBuffer(padId: number, buffer: AudioBuffer, customName?: string): void {
    this.padBuffers.set(padId, buffer);
    if (customName) {
      this.padCustomNames.set(padId, customName);
    }
  }

  public getPadName(padId: number): string {
    if (this.padCustomNames.has(padId)) {
      return this.padCustomNames.get(padId)!;
    }
    const def = PAD_DEFINITIONS.find(p => p.id === padId);
    return def ? def.name : `PAD ${padId}`;
  }

  public getPadDefinition(padId: number): PadSoundConfig | undefined {
    return PAD_DEFINITIONS.find(p => p.id === padId);
  }

  public setFilter(knobValue: number): void {
    this.fxState.filterKnob = Math.max(-1.0, Math.min(1.0, knobValue));
    const now = this.ctx.currentTime;

    if (Math.abs(this.fxState.filterKnob) < 0.04) {
      this.filterNode.type = 'allpass';
      this.filterNode.frequency.setValueAtTime(20000, now);
      this.fxState.filterType = 'bypass';
    } else if (this.fxState.filterKnob < 0) {
      this.filterNode.type = 'lowpass';
      const norm = Math.abs(this.fxState.filterKnob);
      const freq = 20000 * Math.pow(180 / 20000, norm);
      this.filterNode.frequency.setTargetAtTime(Math.max(120, freq), now, 0.02);
      this.filterNode.Q.setTargetAtTime(3.5 * norm + 0.7, now, 0.02);
      this.fxState.filterType = 'lowpass';
    } else {
      this.filterNode.type = 'highpass';
      const norm = this.fxState.filterKnob;
      const freq = 20 * Math.pow(4500 / 20, norm);
      this.filterNode.frequency.setTargetAtTime(Math.min(6000, freq), now, 0.02);
      this.filterNode.Q.setTargetAtTime(3.0 * norm + 0.7, now, 0.02);
      this.fxState.filterType = 'highpass';
    }
  }

  public toggleDelay(enabled?: boolean): boolean {
    const newState = enabled !== undefined ? enabled : !this.fxState.delayEnabled;
    this.fxState.delayEnabled = newState;
    const targetGain = newState ? this.fxState.delayMix : 0;
    this.delayMixGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.03);
    return newState;
  }

  public setDelayFeedback(feedback: number): void {
    this.fxState.delayFeedback = Math.max(0.1, Math.min(0.85, feedback));
    this.delayFeedbackGain.gain.setTargetAtTime(this.fxState.delayFeedback, this.ctx.currentTime, 0.03);
  }

  public setDelayTime(timeSec: number): void {
    this.fxState.delayTime = Math.max(0.05, Math.min(1.0, timeSec));
    this.delayNode.delayTime.setTargetAtTime(this.fxState.delayTime, this.ctx.currentTime, 0.03);
  }

  public toggleReverb(enabled?: boolean): boolean {
    const newState = enabled !== undefined ? enabled : !this.fxState.reverbEnabled;
    this.fxState.reverbEnabled = newState;
    const targetGain = newState ? this.fxState.reverbMix : 0;
    this.reverbMixGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.03);
    return newState;
  }

  public setReverbMix(mix: number): void {
    this.fxState.reverbMix = Math.max(0, Math.min(1.0, mix));
    if (this.fxState.reverbEnabled) {
      this.reverbMixGain.gain.setTargetAtTime(this.fxState.reverbMix, this.ctx.currentTime, 0.03);
    }
  }

  public setMasterVolume(volume: number): void {
    const vol = Math.max(0, Math.min(1.2, volume));
    this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
  }

  public setBgmVolume(volume: number): void {
    const vol = Math.max(0, Math.min(1.2, volume));
    this.bgmGainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
  }

  public getFxState(): FXState {
    return { ...this.fxState };
  }
}
