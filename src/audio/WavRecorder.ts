/**
 * WAV Recorder - Captures master audio stream and encodes to 16-bit PCM WAV format.
 * High fidelity, zero compression artifacts, universally compatible.
 */
export class WavRecorder {
  private audioContext: AudioContext;
  private inputNode: AudioNode;
  private processorNode: ScriptProcessorNode | null = null;
  private isRecording = false;
  private leftChannelData: Float32Array[] = [];
  private rightChannelData: Float32Array[] = [];
  private recordingLength = 0;
  private startTime = 0;

  constructor(audioContext: AudioContext, inputNode: AudioNode) {
    this.audioContext = audioContext;
    this.inputNode = inputNode;
  }

  public start(): void {
    if (this.isRecording) return;

    this.leftChannelData = [];
    this.rightChannelData = [];
    this.recordingLength = 0;
    this.startTime = Date.now();
    this.isRecording = true;

    // Buffer size 4096 gives smooth processing without dropping frames
    this.processorNode = this.audioContext.createScriptProcessor(4096, 2, 2);

    this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isRecording) return;
      const left = e.inputBuffer.getChannelData(0);
      const right = e.inputBuffer.getChannelData(1);

      this.leftChannelData.push(new Float32Array(left));
      this.rightChannelData.push(new Float32Array(right));
      this.recordingLength += left.length;
    };

    this.inputNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  public stop(): { blob: Blob; durationSec: number; url: string } | null {
    if (!this.isRecording) return null;

    this.isRecording = false;
    const durationSec = (Date.now() - this.startTime) / 1000;

    if (this.processorNode) {
      this.inputNode.disconnect(this.processorNode);
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.recordingLength === 0) return null;

    const sampleRate = this.audioContext.sampleRate;
    const wavBlob = this.encodeWAV(this.leftChannelData, this.rightChannelData, this.recordingLength, sampleRate);
    const url = URL.createObjectURL(wavBlob);

    return { blob: wavBlob, durationSec, url };
  }

  public getStatus(): { isRecording: boolean; elapsedSec: number } {
    return {
      isRecording: this.isRecording,
      elapsedSec: this.isRecording ? (Date.now() - this.startTime) / 1000 : 0
    };
  }

  /**
   * Encodes stereo Float32 buffers into standard 16-bit PCM RIFF WAV format
   */
  private encodeWAV(
    leftChunks: Float32Array[],
    rightChunks: Float32Array[],
    totalLength: number,
    sampleRate: number
  ): Blob {
    const leftFlat = new Float32Array(totalLength);
    const rightFlat = new Float32Array(totalLength);
    let offset = 0;
    for (let i = 0; i < leftChunks.length; i++) {
      leftFlat.set(leftChunks[i], offset);
      rightFlat.set(rightChunks[i], offset);
      offset += leftChunks[i].length;
    }

    const numChannels = 2;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = totalLength * blockAlign;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF Chunk Descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let writeOffset = 44;
    for (let i = 0; i < totalLength; i++) {
      let sL = Math.max(-1, Math.min(1, leftFlat[i]));
      view.setInt16(writeOffset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
      writeOffset += 2;

      let sR = Math.max(-1, Math.min(1, rightFlat[i]));
      view.setInt16(writeOffset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
      writeOffset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
