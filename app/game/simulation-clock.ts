export const SIMULATION_STEP = 1 / 60;
export const MAX_FRAME_ADMISSION = .1;
export const MAX_FRAME_OPPORTUNITIES = 6;
export const MELEE_HIT_STOP_OPPORTUNITIES = 2;

export type SimulationTick = Readonly<{
  /** One-based simulation tick. Frozen opportunities do not advance this ID. */
  tick: number;
  startTime: number;
  endTime: number;
}>;

export type FrameStep = Readonly<{
  ticks: number;
  frozenOpportunities: number;
  opportunities: number;
  /** Fractional accumulator remainder, always in [0, 1). */
  alpha: number;
  /** Admission includes hit stop; dropped overload time is excluded. */
  admittedTime: number;
  droppedTime: number;
  gameTime: number;
  nextTick: number;
  frozenRemaining: number;
  /** Render the current pose while hit stop is pending or just consumed. */
  holdPresentation: boolean;
}>;

// Tolerate roundoff at a boundary without admitting a meaningful partial tick.
const ROUNDING_EPSILON = SIMULATION_STEP * 1e-9;

/** Owns foreground timing only. The caller skips advanceFrame while paused. */
export class SimulationClock {
  private accumulator = 0;
  private completedTicks = 0;
  private freezeRemaining = 0;
  private lastOpportunityFrozen = false;
  private admittedTotal = 0;
  private droppedTotal = 0;

  get gameTime() { return this.completedTicks * SIMULATION_STEP; }
  get nextTick() { return this.completedTicks + 1; }
  get frozenRemaining() { return this.freezeRemaining; }
  get totalAdmittedTime() { return this.admittedTotal; }
  get totalDroppedTime() { return this.droppedTotal; }

  /** Call from accepted melee outcomes. Same-tick requests never add together. */
  requestHitStop() {
    this.freezeRemaining = Math.max(this.freezeRemaining, MELEE_HIT_STOP_OPPORTUNITIES);
  }

  /** Pause/hidden/context/reset boundary; preserve monotonically increasing time/IDs. */
  reset() {
    this.accumulator = 0;
    this.freezeRemaining = 0;
    this.lastOpportunityFrozen = false;
  }

  advanceFrame(elapsed: number, runTick: (dt: number, tick: SimulationTick) => void): FrameStep {
    if (!Number.isFinite(elapsed)) throw new RangeError('Elapsed time must be finite.');
    const foreground = Math.max(0, elapsed);
    const admittedTime = Math.min(MAX_FRAME_ADMISSION, foreground);
    const droppedTime = foreground - admittedTime;
    this.admittedTotal += admittedTime;
    this.droppedTotal += droppedTime;
    this.accumulator += admittedTime;
    let ticks = 0, frozenOpportunities = 0, opportunities = 0;

    while (this.accumulator + ROUNDING_EPSILON >= SIMULATION_STEP && opportunities < MAX_FRAME_OPPORTUNITIES) {
      this.accumulator = Math.max(0, this.accumulator - SIMULATION_STEP);
      opportunities++;
      if (this.freezeRemaining > 0) {
        this.freezeRemaining--;
        this.lastOpportunityFrozen = true;
        frozenOpportunities++;
        continue;
      }
      this.lastOpportunityFrozen = false;
      const tick = this.nextTick;
      const startTime = this.gameTime;
      // A callback may request hit stop for the next opportunity, including one
      // later in this same render. Never rerun this callback for a frozen slot.
      this.completedTicks = tick;
      runTick(SIMULATION_STEP, { tick, startTime, endTime: this.gameTime });
      ticks++;
    }

    return {
      ticks, frozenOpportunities, opportunities,
      alpha: Math.min(1 - Number.EPSILON, this.accumulator / SIMULATION_STEP),
      admittedTime, droppedTime, gameTime: this.gameTime, nextTick: this.nextTick,
      frozenRemaining: this.freezeRemaining,
      holdPresentation: this.freezeRemaining > 0 || this.lastOpportunityFrozen,
    };
  }
}
