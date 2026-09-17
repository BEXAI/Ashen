export const DODGE_RULES = Object.freeze({
  staminaCost: 25,
  cooldown: 1.1,
  duration: .45,
  cruiseDuration: .30,
  speed: 14,
  protectionStart: .05,
  protectionEnd: .30,
});
export const SPAWN_PROTECTION_SECONDS = 1;

export type AttackPhase = 'windup' | 'active' | 'recovery';
export type PlayerAction = 'idle' | 'attack' | 'dodge' | 'cast';
export type ActionAdmission = Readonly<{
  alive: boolean;
  paused: boolean;
  action: PlayerAction;
  attackPhase?: AttackPhase;
  stamina: number;
}>;

/** Admission only. The authoritative action start charges once and cancels the old action. */
export function canStartDodge(state: ActionAdmission & { cooldown: number }): boolean {
  return state.alive && !state.paused && state.action !== 'dodge'
    && Number.isFinite(state.stamina) && state.stamina >= DODGE_RULES.staminaCost
    && Number.isFinite(state.cooldown) && state.cooldown <= 0
    && (state.action !== 'attack' || state.attackPhase === 'windup' || state.attackPhase === 'recovery');
}

/** Existing attack availability; AttackSequence remains the sole tap/combo buffer. */
export function canStartStrike(state: ActionAdmission & { staminaCost: number }): boolean {
  return state.alive && !state.paused && state.action === 'idle'
    && Number.isFinite(state.staminaCost) && state.staminaCost >= 0
    && Number.isFinite(state.stamina) && state.stamina >= state.staminaCost;
}

export function isDodgeProtected(elapsed: number): boolean {
  // Arithmetic across fixed tick boundaries can differ by a few ulps.
  const epsilon = 1e-10;
  return elapsed >= DODGE_RULES.protectionStart - epsilon && elapsed < DODGE_RULES.protectionEnd - epsilon;
}

export function isSpawnProtected(remaining: number): boolean {
  return Number.isFinite(remaining) && remaining > 0;
}

export function dodgeSpeedAt(elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= DODGE_RULES.duration) return 0;
  if (elapsed <= DODGE_RULES.cruiseDuration) return DODGE_RULES.speed;
  return DODGE_RULES.speed * (DODGE_RULES.duration - elapsed) / (DODGE_RULES.duration - DODGE_RULES.cruiseDuration);
}

function dodgeDistanceAt(elapsed: number): number {
  const time = Math.max(0, Math.min(DODGE_RULES.duration, elapsed));
  const cruise = Math.min(time, DODGE_RULES.cruiseDuration);
  const tail = Math.max(0, time - DODGE_RULES.cruiseDuration);
  const tailDuration = DODGE_RULES.duration - DODGE_RULES.cruiseDuration;
  return DODGE_RULES.speed * (cruise + tail - tail * tail / (2 * tailDuration));
}

/** Exact integrated displacement, including intervals crossing speed/finish boundaries. */
export function dodgeTravelBetween(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new RangeError('Dodge times must be finite.');
  return to <= from ? 0 : dodgeDistanceAt(to) - dodgeDistanceAt(from);
}

/** Resolve once on accepted start. Store the result rather than re-reading input mid-dodge. */
export function dodgeDirection(x: number, z: number, facing: number): Readonly<{ x: number; z: number }> {
  if (![x, z, facing].every(Number.isFinite)) throw new RangeError('Dodge direction must be finite.');
  const length = Math.hypot(x, z);
  return length > 0 ? { x: x / length, z: z / length } : { x: Math.sin(facing), z: Math.cos(facing) };
}

/** A new press during dodge is ignored; a prior hold survives, and every release clears it. */
export function nextStrikeHeld(previous: boolean, pressed: boolean, dodging: boolean): boolean {
  return pressed && (previous || !dodging);
}

export type TickCommand<T> = Readonly<{ sequence: number; targetTick: number; payload: T }>;

/** Input edges only, not a second attack buffer. Drain inside unfrozen simulation ticks. */
export class TickCommandQueue<T> {
  private sequence = 0;
  private pending: TickCommand<T>[] = [];

  get size() { return this.pending.length; }

  enqueue(payload: T, targetTick: number): TickCommand<T> {
    if (!Number.isSafeInteger(targetTick) || targetTick < 1) throw new RangeError('Target tick must be a positive safe integer.');
    const command = Object.freeze({ sequence: ++this.sequence, targetTick, payload });
    this.pending.push(command);
    return command;
  }

  drain(tick: number): TickCommand<T>[] {
    if (!Number.isSafeInteger(tick) || tick < 1) throw new RangeError('Drain tick must be a positive safe integer.');
    const due = this.pending.filter(command => command.targetTick <= tick);
    this.pending = this.pending.filter(command => command.targetTick > tick);
    return due.sort((a, b) => a.targetTick - b.targetTick || a.sequence - b.sequence);
  }

  /** Lifecycle cancellation discards pending edges but does not reuse sequence IDs. */
  clear() { this.pending = []; }
}
