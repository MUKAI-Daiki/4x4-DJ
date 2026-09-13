/**
 * Pad Memory Engine - 1-Bar Pad Looper with Overdubbing, Multi-layer Undo, Clear, and Local Persistence.
 * Perfectly synchronizes with AudioContext currentTime and BgmEngine measure clock.
 */

export interface MemoryPadEvent {
  id: string;
  padId: number;
  velocity: number;
  normalizedTime: number; // 0.0 to < 1.0 (relative position within 1 measure)
  layerId: number;
}

export interface MemoryLayer {
  id: number;
  createdAt: number;
  events: MemoryPadEvent[];
}

export interface SavedMemoryData {
  version: number;
  savedAt: string;
  bpm: number;
  quantizeMode: string;
  layers: MemoryLayer[];
  totalEvents: number;
}

export type MemoryUpdateCallback = (state: {
  isRecording: boolean;
  isPlaying: boolean;
  eventCount: number;
  layerCount: number;
  events: MemoryPadEvent[];
}) => void;

export type PadTriggerCallback = (padId: number, delayMs: number) => void;

export class PadMemoryEngine {
  private isRecording = false;
  private isPlaying = true; // Auto-play loop when events exist

  private layers: MemoryLayer[] = [];
  private currentPassEvents: MemoryPadEvent[] = [];
  private layerCounter = 1;

  // Undo / Redo history
  private redoStack: MemoryLayer[] = [];

  // Callbacks
  public onUpdate?: MemoryUpdateCallback;
  public onPadTrigger?: PadTriggerCallback;

  // Track scheduled measure to prevent duplicate scheduling
  private lastScheduledBar = -1;

  // Audio trigger function injected from AudioEngine
  private playSampleFn: (padId: number, exactTime: number, velocity: number) => void;
  private getContextTimeFn: () => number;

  constructor(
    playSampleFn: (padId: number, exactTime: number, velocity: number) => void,
    getContextTimeFn: () => number
  ) {
    this.playSampleFn = playSampleFn;
    this.getContextTimeFn = getContextTimeFn;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setRecording(rec: boolean): void {
    if (this.isRecording === rec) return;
    this.isRecording = rec;

    // If stopping recording, commit any pending hits from this pass
    if (!rec && this.currentPassEvents.length > 0) {
      this.commitCurrentPass();
    }

    this.notifyUpdate();
  }

  public toggleRecording(): boolean {
    this.setRecording(!this.isRecording);
    return this.isRecording;
  }

  public setPlaying(play: boolean): void {
    this.isPlaying = play;
    this.notifyUpdate();
  }

  public togglePlaying(): boolean {
    this.setPlaying(!this.isPlaying);
    return this.isPlaying;
  }

  /**
   * Records a user-triggered pad hit into the active memory pass.
   * Snaps to the nearest quantize division with zero latency.
   */
  public recordHit(
    padId: number,
    hitTime: number,
    transportStartTime: number,
    measureDuration: number,
    quantizeMode: 'OFF' | '1/4' | '1/8' | '1/16' = 'OFF',
    velocity = 1.0
  ): void {
    if (!this.isRecording || measureDuration <= 0) return;

    // Continuous time since transport started
    let elapsed = hitTime - transportStartTime;
    if (elapsed < 0) elapsed = 0;

    let normalizedTime = (elapsed % measureDuration) / measureDuration;

    // Apply Nearest-grid Input Quantization if enabled
    if (quantizeMode !== 'OFF') {
      let divisions = 16;
      if (quantizeMode === '1/8') divisions = 8;
      if (quantizeMode === '1/4') divisions = 4;

      const nearestStep = Math.round(normalizedTime * divisions);
      normalizedTime = (nearestStep % divisions) / divisions;
    } else {
      if (normalizedTime >= 0.99) {
        normalizedTime = 0;
      }
    }

    const event: MemoryPadEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      padId,
      velocity: Math.max(0.2, Math.min(1.0, velocity)),
      normalizedTime,
      layerId: this.layerCounter,
    };

    this.currentPassEvents.push(event);
    this.notifyUpdate();
  }

  /**
   * Called by BgmEngine scheduler at each bar preparation boundary.
   * Schedules Web Audio playback for all committed loop notes in the upcoming bar.
   */
  public advanceMeasure(bar: number, measureStartTime: number, measureDuration: number): void {
    // 1. Commit any events recorded during the measure that just completed
    if (this.currentPassEvents.length > 0) {
      this.commitCurrentPass();
    }

    // 2. Prevent duplicate scheduling of the same bar
    if (bar === this.lastScheduledBar) return;
    this.lastScheduledBar = bar;

    // 3. If loop is playing, schedule all loop events for this upcoming measure
    if (!this.isPlaying || this.layers.length === 0) return;

    const now = this.getContextTimeFn();

    for (const layer of this.layers) {
      for (const event of layer.events) {
        const eventExactTime = measureStartTime + event.normalizedTime * measureDuration;

        // Schedule if within upcoming time window (allow 10ms grace period)
        if (eventExactTime >= now - 0.01) {
          this.playSampleFn(event.padId, eventExactTime, event.velocity);

          // Trigger visual UI pad animation when sample plays
          if (this.onPadTrigger) {
            const delayMs = Math.max(0, (eventExactTime - now) * 1000);
            this.onPadTrigger(event.padId, delayMs);
          }
        }
      }
    }
  }

  private commitCurrentPass(): void {
    if (this.currentPassEvents.length === 0) return;

    const layer: MemoryLayer = {
      id: this.layerCounter++,
      createdAt: Date.now(),
      events: [...this.currentPassEvents],
    };

    this.layers.push(layer);
    this.currentPassEvents = [];
    this.redoStack = []; // Clear redo on new action
    this.notifyUpdate();
  }

  /**
   * Undo: Removes the last recorded layer of events.
   */
  public undo(): { success: boolean; removedNotes: number; remainingLayers: number } {
    // If currently recording with uncommitted notes in this bar, discard those first
    if (this.currentPassEvents.length > 0) {
      const removed = this.currentPassEvents.length;
      this.currentPassEvents = [];
      this.notifyUpdate();
      return { success: true, removedNotes: removed, remainingLayers: this.layers.length };
    }

    // Otherwise, pop the latest committed layer
    if (this.layers.length > 0) {
      const popped = this.layers.pop()!;
      this.redoStack.push(popped);
      this.notifyUpdate();
      return { success: true, removedNotes: popped.events.length, remainingLayers: this.layers.length };
    }

    return { success: false, removedNotes: 0, remainingLayers: 0 };
  }

  /**
   * Redo: Restores previously undone layer.
   */
  public redo(): boolean {
    if (this.redoStack.length > 0) {
      const layer = this.redoStack.pop()!;
      this.layers.push(layer);
      this.notifyUpdate();
      return true;
    }
    return false;
  }

  /**
   * Clear: Erases all recorded memory events.
   */
  public clear(): void {
    this.layers = [];
    this.currentPassEvents = [];
    this.redoStack = [];
    this.notifyUpdate();
  }

  public getAllEvents(): MemoryPadEvent[] {
    const events: MemoryPadEvent[] = [];
    for (const layer of this.layers) {
      events.push(...layer.events);
    }
    events.push(...this.currentPassEvents);
    return events;
  }

  public getEventCount(): number {
    let count = this.currentPassEvents.length;
    for (const l of this.layers) {
      count += l.events.length;
    }
    return count;
  }

  public getLayerCount(): number {
    return this.layers.length + (this.currentPassEvents.length > 0 ? 1 : 0);
  }

  public getLayers(): MemoryLayer[] {
    return [...this.layers];
  }

  // --- Local Persistence (localStorage) ---
  private static readonly STORAGE_KEY = '4X4_DJ_MEMORY_LOOP';

  public saveToLocal(bpm: number, quantizeMode: string): { success: boolean; count: number; layers: number } {
    // Commit active notes first
    if (this.currentPassEvents.length > 0) {
      this.commitCurrentPass();
    }

    const data: SavedMemoryData = {
      version: 1,
      savedAt: new Date().toISOString(),
      bpm,
      quantizeMode,
      layers: this.layers,
      totalEvents: this.getEventCount(),
    };

    try {
      localStorage.setItem(PadMemoryEngine.STORAGE_KEY, JSON.stringify(data));
      return { success: true, count: data.totalEvents, layers: this.layers.length };
    } catch (err) {
      console.error('Failed to save memory loop to localStorage', err);
      return { success: false, count: 0, layers: 0 };
    }
  }

  public loadFromLocal(): SavedMemoryData | null {
    try {
      const raw = localStorage.getItem(PadMemoryEngine.STORAGE_KEY);
      if (!raw) return null;

      const data: SavedMemoryData = JSON.parse(raw);
      if (data && Array.isArray(data.layers)) {
        this.layers = data.layers;
        this.currentPassEvents = [];
        this.redoStack = [];
        this.layerCounter = (this.layers[this.layers.length - 1]?.id || 0) + 1;
        this.notifyUpdate();
        return data;
      }
    } catch (err) {
      console.error('Failed to load memory loop from localStorage', err);
    }
    return null;
  }

  public hasSavedData(): boolean {
    try {
      return localStorage.getItem(PadMemoryEngine.STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate({
        isRecording: this.isRecording,
        isPlaying: this.isPlaying,
        eventCount: this.getEventCount(),
        layerCount: this.getLayerCount(),
        events: this.getAllEvents(),
      });
    }
  }
}
