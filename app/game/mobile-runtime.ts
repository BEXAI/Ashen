export type Quality = 'auto' | 'low' | 'medium' | 'high';

export function initialQuality(touch: boolean, read: () => string | null): Quality {
  try {
    const stored = read();
    if (stored && ['auto', 'low', 'medium', 'high'].includes(stored)) return stored as Quality;
  } catch { /* Private/restricted storage must not change the device default. */ }
  return touch ? 'auto' : 'high';
}

export function renderProfile(quality: string, touch: boolean) {
  return {
    output: quality === 'auto' ? 'medium' : quality,
    textures: quality === 'auto' ? (touch ? 'low' : 'medium') : quality,
    ao: quality === 'high' || (!touch && quality === 'medium'),
    bloom: quality !== 'low',
    reflections: quality === 'high' || (!touch && quality !== 'low'),
    shadowSize: quality === 'high' ? 2048 : touch ? 512 : 1024,
    lights: quality === 'high' ? 6 : quality === 'low' || touch ? 3 : 4,
    reflectionSize: quality === 'high' ? (touch ? 512 : 768) : 384,
  };
}

/** Limit rendering on high-refresh phones without slowing the simulation clock. */
export class FramePacer {
  private next = 0;
  constructor(private fps = 60) {}
  reset() { this.next = 0; }
  ready(now: number) {
    if (now + 0.5 < this.next) return false;
    const interval = 1000 / this.fps;
    this.next = now + interval - Math.max(0, now - this.next) % interval;
    return true;
  }
}

/** Ordinary pause draws once. A finite presentation owner may opt into paused draws. */
export class RenderLoop {
  private handle: number | null = null;
  private paused = false;
  private suspended = false;
  private stopped = false;
  private presenting = false;
  private pacer = new FramePacer(60);
  private lastRaf = 0;
  constructor(private draw: (now: number, rafInterval: number) => void,
    private request: (cb: FrameRequestCallback) => number = cb => requestAnimationFrame(cb),
    private cancel: (id: number) => void = id => cancelAnimationFrame(id)) {}
  invalidate() {
    if (!this.stopped && !this.suspended && this.handle === null) this.handle = this.request(this.tick);
  }
  private tick = (now: number) => {
    this.handle = null;
    if (this.stopped || this.suspended) return;
    const rafInterval=this.lastRaf?now-this.lastRaf:0;this.lastRaf=now;
    if ((!this.paused || this.presenting) && !this.pacer.ready(now)) { this.invalidate(); return; }
    this.draw(now,rafInterval);
    if (!this.paused || this.presenting) this.invalidate();
  };
  pause(value: boolean) { this.paused = value; this.presenting=false; this.pacer.reset();this.lastRaf=0; this.invalidate(); }
  /** Call after pause(true), then clear from the final terminal-animation draw. */
  setPresentationActive(value:boolean) {
    if(this.stopped||this.presenting===value)return;
    this.presenting=value;this.pacer.reset();this.lastRaf=0;
    if(value)this.invalidate();
    else if(this.paused&&this.handle!==null){this.cancel(this.handle);this.handle=null;}
  }
  setFps(fps:number) { this.pacer = new FramePacer(fps <= 30 ? 30 : 60); this.invalidate(); }
  suspend(value: boolean) {
    this.suspended = value; this.pacer.reset();this.lastRaf=0;
    if (value && this.handle !== null) { this.cancel(this.handle); this.handle = null; }
    if (!value) this.invalidate();
  }
  dispose() { this.stopped = true; if (this.handle !== null) this.cancel(this.handle); this.handle = null; }
}

/** Several save triggers share one write and, if needed, one latest-state follow-up. */
export class SaveQueue {
  private flight: Promise<boolean> | null = null;
  private pending = false;
  run(task: () => Promise<boolean>): Promise<boolean> {
    this.pending = true;
    if (this.flight) return this.flight;
    this.flight = Promise.resolve().then(async () => {
      try {
        while (this.pending) {
          this.pending = false;
          if (!await task()) { this.pending = false; return false; }
        }
        return true;
      } finally { this.flight = null; this.pending = false; }
    });
    return this.flight;
  }
}
