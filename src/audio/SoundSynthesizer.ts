/**
 * NES 2A03 Chiptune Sound Synthesizer
 * Authentic Nintendo Famicom / NES sound synthesis:
 * - Pulse waves (12.5%, 25%, 50% duty cycles)
 * - Pure Triangle wave (unattenuated punchy kicks and deep bass)
 * - 8-bit LFSR noise (long/short periodic noise for snares, metallic hats, explosions)
 * - Rapid micro-arpeggios (classic 8-bit chord illusion)
 */

export interface PadSoundConfig {
  id: number;
  name: string;
  category: 'drum' | 'bass' | 'lead' | 'sfx';
  color: string;
  keyLabel: string;
  desc: string;
}

export const PAD_DEFINITIONS: PadSoundConfig[] = [
  // Row 1 (Percussion) - Red/Orange
  { id: 13, name: 'NES KICK',     category: 'drum', color: '#ff2a5f', keyLabel: '1', desc: 'Triangle Drop' },
  { id: 14, name: 'NES SNARE',    category: 'drum', color: '#ff5e3a', keyLabel: '2', desc: 'Noise Burst' },
  { id: 15, name: 'NOISE HIT',    category: 'drum', color: '#ff9500', keyLabel: '3', desc: 'Short Noise' },
  { id: 16, name: 'NES HI-HAT',   category: 'drum', color: '#ffd600', keyLabel: '4', desc: 'Metallic Tick' },

  // Row 2 (8-bit Bass & Leads) - Cyan/Blue
  { id: 9,  name: 'TRI BASS C',   category: 'bass', color: '#00e5ff', keyLabel: 'Q', desc: 'Triangle Bass Low' },
  { id: 10, name: 'TRI BASS G',   category: 'bass', color: '#00b0ff', keyLabel: 'W', desc: 'Triangle Bass Mid' },
  { id: 11, name: 'PULSE LEAD 1', category: 'lead', color: '#2979ff', keyLabel: 'E', desc: '25% Duty Lead' },
  { id: 12, name: 'PULSE LEAD 2', category: 'lead', color: '#651fff', keyLabel: 'R', desc: '50% Square Lead' },

  // Row 3 (Arpeggios & Jingles) - Lime/Green
  { id: 5,  name: 'CHIP ARP MAJ', category: 'lead', color: '#00e676', keyLabel: 'A', desc: 'C Major Fast Arp' },
  { id: 6,  name: 'CHIP ARP MIN', category: 'lead', color: '#1de9b6', keyLabel: 'S', desc: 'A Minor Fast Arp' },
  { id: 7,  name: '1-UP JINGLE',  category: 'sfx',  color: '#00bfa5', keyLabel: 'D', desc: 'Retro 1-UP Fanfare' },
  { id: 8,  name: 'POWER UP',     category: 'sfx',  color: '#76ff03', keyLabel: 'F', desc: 'Rising Glissando' },

  // Row 4 (Classic 8-bit SFX) - Magenta/Purple
  { id: 1,  name: 'COIN SFX',     category: 'sfx',  color: '#f50057', keyLabel: 'Z', desc: 'Mario Coin Ring' },
  { id: 2,  name: 'JUMP SFX',     category: 'sfx',  color: '#d500f9', keyLabel: 'X', desc: 'Spring Jump Boing' },
  { id: 3,  name: 'LASER SFX',    category: 'sfx',  color: '#aa00ff', keyLabel: 'C', desc: 'Rapid 8-bit Blaster' },
  { id: 4,  name: 'EXPLOSION',    category: 'sfx',  color: '#ff1744', keyLabel: 'V', desc: 'Low-rate Noise Blast' },
];

export class SoundSynthesizer {
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  public async generatePadSound(padId: number): Promise<AudioBuffer> {
    switch (padId) {
      case 13: return this.createNesKick();
      case 14: return this.createNesSnare();
      case 15: return this.createNoiseHit();
      case 16: return this.createNesHiHat();
      case 9:  return this.createTriBass(65.41); // C2
      case 10: return this.createTriBass(98.00); // G2
      case 11: return this.createPulseLead(523.25, 0.25); // C5 with 25% duty
      case 12: return this.createPulseLead(659.25, 0.50); // E5 with 50% square
      case 5:  return this.createFastArpeggio([523.25, 659.25, 783.99, 1046.50]); // C-E-G-C (Major)
      case 6:  return this.createFastArpeggio([440.00, 523.25, 659.25, 880.00]);   // A-C-E-A (Minor)
      case 7:  return this.create1UpJingle();
      case 8:  return this.createPowerUpGlissando();
      case 1:  return this.createCoinSfx();
      case 2:  return this.createJumpSfx();
      case 3:  return this.createLaserSfx();
      case 4:  return this.createExplosionSfx();
      default: return this.createNesKick();
    }
  }

  /**
   * Generates a retro 8-bit style spring/room reverb impulse
   */
  public createReverbImpulse(durationSec = 1.2, decay = 3.5): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const factor = Math.exp(-n * decay);
      // Discrete stepped noise for chiptune texture
      const stepL = Math.floor((Math.random() * 2 - 1) * 8) / 8;
      const stepR = Math.floor((Math.random() * 2 - 1) * 8) / 8;
      left[i] = stepL * factor;
      right[i] = stepR * factor;
    }
    return impulse;
  }

  // --- NES Percussion Synthesizers ---

  /**
   * NES Kick: Classic fast downward triangle pitch bend
   */
  private async createNesKick(): Promise<AudioBuffer> {
    const duration = 0.28;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'triangle';

    // Fast pitch drop from 220Hz down to 40Hz
    osc.frequency.setValueAtTime(240, 0);
    osc.frequency.exponentialRampToValueAtTime(42, duration);

    // Discrete 4-step volume envelope for 8-bit DAC feel
    gain.gain.setValueAtTime(1.0, 0);
    gain.gain.setValueAtTime(0.8, 0.06);
    gain.gain.setValueAtTime(0.5, 0.12);
    gain.gain.setValueAtTime(0.2, 0.20);
    gain.gain.linearRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  /**
   * NES Snare: 8-bit pseudo-random noise burst + quick triangle thump
   */
  private async createNesSnare(): Promise<AudioBuffer> {
    const duration = 0.22;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    // 8-bit quantized noise buffer (LFSR simulation)
    const noiseBuffer = actx.createBuffer(1, Math.floor(actx.sampleRate * duration), actx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lfsr = 0x7fff;
    for (let i = 0; i < data.length; i++) {
      // 15-bit shift register with feedback bit
      const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      data[i] = ((lfsr & 1) ? 1 : -1) * 0.75;
    }

    const noise = actx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseGain = actx.createGain();
    noiseGain.gain.setValueAtTime(0.9, 0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, duration);

    // Underlying triangle punch
    const tri = actx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.setValueAtTime(180, 0);
    tri.frequency.exponentialRampToValueAtTime(60, 0.08);

    const triGain = actx.createGain();
    triGain.gain.setValueAtTime(0.6, 0);
    triGain.gain.exponentialRampToValueAtTime(0.001, 0.08);

    noise.connect(noiseGain);
    noiseGain.connect(actx.destination);

    tri.connect(triGain);
    triGain.connect(actx.destination);

    noise.start(0);
    tri.start(0);

    return actx.startRendering();
  }

  /**
   * NES Noise Hit: Short snare/clap noise hit
   */
  private async createNoiseHit(): Promise<AudioBuffer> {
    const duration = 0.15;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const noiseBuffer = actx.createBuffer(1, Math.floor(actx.sampleRate * duration), actx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lfsr = 0x5a5a;
    for (let i = 0; i < data.length; i++) {
      const bit = ((lfsr >> 0) ^ (lfsr >> 6)) & 1; // 6-bit feedback for crunchier texture
      lfsr = (lfsr >> 1) | (bit << 14);
      data[i] = ((lfsr & 1) ? 1 : -1) * 0.8;
    }

    const noise = actx.createBufferSource();
    noise.buffer = noiseBuffer;

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.9, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    noise.connect(gain);
    gain.connect(actx.destination);
    noise.start(0);

    return actx.startRendering();
  }

  /**
   * NES Hi-Hat: Short periodic metallic tick
   */
  private async createNesHiHat(): Promise<AudioBuffer> {
    const duration = 0.045;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const noiseBuffer = actx.createBuffer(1, Math.floor(actx.sampleRate * duration), actx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lfsr = 0x007f;
    for (let i = 0; i < data.length; i++) {
      // 93-step short noise mode in NES
      const bit = ((lfsr >> 0) ^ (lfsr >> 6)) & 1;
      lfsr = (lfsr >> 1) | (bit << 6);
      data[i] = ((lfsr & 1) ? 1 : -1) * 0.5;
    }

    const noise = actx.createBufferSource();
    noise.buffer = noiseBuffer;

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.8, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    noise.connect(gain);
    gain.connect(actx.destination);
    noise.start(0);

    return actx.startRendering();
  }

  // --- NES Bass & Leads ---

  /**
   * Triangle Bass: The signature unmodulated bass tone of the NES
   */
  private async createTriBass(freq: number): Promise<AudioBuffer> {
    const duration = 0.5;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, 0);

    // Fast decay with steady sustain
    gain.gain.setValueAtTime(0.9, 0);
    gain.gain.linearRampToValueAtTime(0.7, 0.05);
    gain.gain.linearRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  /**
   * Pulse Lead: Characteristic NES 25% or 50% duty pulse wave
   */
  private async createPulseLead(freq: number, duty: number): Promise<AudioBuffer> {
    const duration = 0.55;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    // Build periodic wave matching duty cycle
    const periodicWave = this.generatePulseWave(actx, duty);
    osc.setPeriodicWave(periodicWave);

    osc.frequency.setValueAtTime(freq, 0);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.65, 0);
    gain.gain.linearRampToValueAtTime(0.5, 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  /**
   * Fast Micro-Arpeggio: The classic chiptune trick to play full chords on a monophonic pulse channel
   */
  private async createFastArpeggio(notes: number[]): Promise<AudioBuffer> {
    const duration = 0.7;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    osc.type = 'square';

    // Step through chord notes every 40 milliseconds
    const stepDuration = 0.04;
    const totalSteps = Math.floor(duration / stepDuration);
    for (let i = 0; i < totalSteps; i++) {
      const freq = notes[i % notes.length];
      osc.frequency.setValueAtTime(freq, i * stepDuration);
    }

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  // --- Classic 8-Bit Jingles & SFX ---

  private async create1UpJingle(): Promise<AudioBuffer> {
    const duration = 0.55;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    osc.type = 'square';

    // E5, G5, E6, C6, D6, G6
    const notes = [659.25, 783.99, 1318.51, 1046.50, 1174.66, 1567.98];
    const step = 0.08;
    notes.forEach((f, i) => {
      osc.frequency.setValueAtTime(f, i * step);
    });

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.setValueAtTime(0.6, step * (notes.length - 1));
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  private async createPowerUpGlissando(): Promise<AudioBuffer> {
    const duration = 0.45;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    osc.type = 'square';

    // Upward stepped glissando
    osc.frequency.setValueAtTime(220, 0);
    osc.frequency.linearRampToValueAtTime(1320, duration);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.55, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  private async createCoinSfx(): Promise<AudioBuffer> {
    const duration = 0.4;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    osc.type = 'square';

    // B5 (987.77 Hz) for 0.07s then E6 (1318.51 Hz) ring
    osc.frequency.setValueAtTime(987.77, 0);
    osc.frequency.setValueAtTime(1318.51, 0.07);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.65, 0);
    gain.gain.setValueAtTime(0.65, 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  private async createJumpSfx(): Promise<AudioBuffer> {
    const duration = 0.22;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    osc.type = 'square';

    // Upward frequency sweep 150Hz -> 650Hz
    osc.frequency.setValueAtTime(150, 0);
    osc.frequency.exponentialRampToValueAtTime(650, duration);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  private async createLaserSfx(): Promise<AudioBuffer> {
    const duration = 0.2;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const osc = actx.createOscillator();
    osc.type = 'square';

    // Downward rapid laser pitch 1600Hz -> 100Hz
    osc.frequency.setValueAtTime(1600, 0);
    osc.frequency.exponentialRampToValueAtTime(120, duration);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(0);

    return actx.startRendering();
  }

  private async createExplosionSfx(): Promise<AudioBuffer> {
    const duration = 0.7;
    const actx = new OfflineAudioContext(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);

    const noiseBuffer = actx.createBuffer(1, Math.floor(actx.sampleRate * duration), actx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lfsr = 0x7fff;
    for (let i = 0; i < data.length; i++) {
      const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      data[i] = ((lfsr & 1) ? 1 : -1) * 0.9;
    }

    const noise = actx.createBufferSource();
    noise.buffer = noiseBuffer;

    // Lowpass filter closing down
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, 0);
    filter.frequency.exponentialRampToValueAtTime(200, duration);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.95, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(actx.destination);
    noise.start(0);

    return actx.startRendering();
  }

  /**
   * Helper to create Fourier coefficients for pulse wave with custom duty cycle
   */
  private generatePulseWave(actx: BaseAudioContext, duty: number): PeriodicWave {
    const numHarmonics = 64;
    const real = new Float32Array(numHarmonics);
    const imag = new Float32Array(numHarmonics);

    for (let n = 1; n < numHarmonics; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    }
    return actx.createPeriodicWave(real, imag);
  }
}
