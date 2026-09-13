/**
 * Mic Sampler - Records microphone audio with instant quick-sampling for 4x4 pads.
 */

export class MicSampler {
  private ctx: AudioContext;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private targetPadId: number | null = null;

  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private meterDataArray: Uint8Array<ArrayBuffer> | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  public async initMic(): Promise<boolean> {
    try {
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        });

        // Setup analyser node for VU meter
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        const binCount = this.analyser.frequencyBinCount;
        this.meterDataArray = new Uint8Array(new ArrayBuffer(binCount));
        this.micSource = this.ctx.createMediaStreamSource(this.mediaStream);
        this.micSource.connect(this.analyser);
      }
      return true;
    } catch (err) {
      console.warn('Microphone access was denied or not supported', err);
      return false;
    }
  }

  public getMicLevel(): number {
    if (!this.analyser || !this.meterDataArray) return 0;
    this.analyser.getByteFrequencyData(this.meterDataArray);
    let sum = 0;
    for (let i = 0; i < this.meterDataArray.length; i++) {
      sum += this.meterDataArray[i];
    }
    return sum / (this.meterDataArray.length * 255);
  }

  public async startRecording(targetPadId: number | null = null): Promise<boolean> {
    const ready = await this.initMic();
    if (!ready || !this.mediaStream) return false;

    this.targetPadId = targetPadId;
    this.audioChunks = [];
    this.isRecording = true;

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.start();
      return true;
    } catch (e) {
      console.error('Failed to start MediaRecorder', e);
      this.isRecording = false;
      return false;
    }
  }

  public async stopRecording(): Promise<{ buffer: AudioBuffer; padId: number | null } | null> {
    if (!this.isRecording || !this.mediaRecorder) return null;

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        if (this.audioChunks.length === 0) {
          resolve(null);
          return;
        }

        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          const arrayBuffer = await audioBlob.arrayBuffer();
          const decodedBuffer = await this.ctx.decodeAudioData(arrayBuffer);

          this.normalizeBuffer(decodedBuffer);

          resolve({
            buffer: decodedBuffer,
            padId: this.targetPadId
          });
        } catch (err) {
          console.error('Error decoding recorded audio', err);
          resolve(null);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getTargetPadId(): number | null {
    return this.targetPadId;
  }

  private normalizeBuffer(buffer: AudioBuffer): void {
    let max = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > max) max = abs;
      }
    }
    if (max > 0.05 && max < 0.95) {
      const factor = 0.95 / max;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          data[i] *= factor;
        }
      }
    }
  }
}
