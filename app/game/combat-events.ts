import type { Point3 } from './combat';

export type ContactKind = 'melee' | 'ranged' | 'spell' | 'hazard';
export type BattlePhase = 'idle' | 'windup' | 'active' | 'recovery' | 'dodge';
export type Combatant = {
  id: string;
  hp: number;
  armor: number;
  hero: boolean;
  shielded: boolean;
  dead: boolean;
  phaseAt: (time: number) => BattlePhase;
  protectedAt: (time: number) => boolean;
};
export type ContactCandidate = {
  actionId: number;
  attackerId: string;
  targetId: string;
  time: number;
  damage: number;
  stagger: number;
  kind: ContactKind;
  point: Point3;
  direction: { x: number; z: number };
  /** Shared with the action. First geometric contact consumes this target. */
  hits: Set<string>;
  targetLimit: number;
  /** Nonpersistent direct spell/test events need no living source actor. */
  allowAbsentSource?: boolean;
};
export type CombatEvent = {
  id: string;
  tick: number;
  actionId: number;
  attackerId: string;
  targetId: string;
  time: number;
  kind: ContactKind;
  outcome: 'damaged' | 'evaded' | 'shielded';
  healthDelta: number;
  point: Point3;
  direction: { x: number; z: number };
  stagger: number;
  interrupted: boolean;
  lethal: boolean;
};
export type CombatBatch = { events: CombatEvent[]; deaths: string[]; interrupted: string[] };

/** One authority for contact admission, HP changes and chronological trades.
 * Presentation consumes the result; it cannot cause another health mutation.
 */
export function resolveContacts(
  candidates: readonly ContactCandidate[],
  combatants: Map<string, Combatant>,
  onBatch?: (batch: CombatBatch) => void,
): CombatEvent[] {
  const ordered = [...candidates].filter(c => Number.isFinite(c.time) && Number.isFinite(c.damage) && c.damage > 0)
    .sort((a, b) => a.time - b.time || a.actionId - b.actionId || a.targetId.localeCompare(b.targetId));
  const interrupted = new Set<string>();
  const result: CombatEvent[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && Math.abs(ordered[end].time - ordered[start].time) < 1e-9) end++;
    // Snapshot admission before damage: actors killed at this exact time trade.
    const admitted: { candidate: ContactCandidate; target: Combatant; outcome: CombatEvent['outcome'] }[] = [];
    for (let i = start; i < end; i++) {
      const c = ordered[i], source = combatants.get(c.attackerId), target = combatants.get(c.targetId);
      if (!target || target.dead || target.hp <= 0 || (!source && !c.allowAbsentSource) || source?.dead || (source && source.hp <= 0) || interrupted.has(c.attackerId)) continue;
      if (c.hits.has(c.targetId) || c.hits.size >= c.targetLimit) continue;
      c.hits.add(c.targetId);
      admitted.push({ candidate: c, target, outcome: target.shielded ? 'shielded' : target.protectedAt(c.time) ? 'evaded' : 'damaged' });
    }
    const batch: CombatBatch = { events: [], deaths: [], interrupted: [] };
    for (const { candidate: c, target, outcome } of admitted) {
      const before = target.hp;
      if (outcome === 'damaged') target.hp = Math.max(0, before - (target.hero ? Math.max(3, c.damage - target.armor * 3) : c.damage));
      const healthDelta = before - target.hp;
      const phase = target.phaseAt(c.time);
      const stops = healthDelta > 0 && (target.hero ? phase === 'windup' : target.id !== 'king' && c.stagger > 0 && phase !== 'active');
      const lethal = before > 0 && target.hp <= 0;
      if (lethal) batch.deaths.push(target.id);
      if (stops && !batch.interrupted.includes(target.id)) batch.interrupted.push(target.id);
      batch.events.push({ tick: Math.floor((c.time + 1e-10) * 60) + 1, id: `${c.actionId}:${c.targetId}`, actionId: c.actionId, attackerId: c.attackerId, targetId: c.targetId,
        time: c.time, kind: c.kind, outcome, healthDelta, point: { ...c.point }, direction: { ...c.direction }, stagger: c.stagger, interrupted: stops, lethal });
    }
    for (const id of batch.deaths) combatants.get(id)!.dead = true;
    for (const id of batch.interrupted) interrupted.add(id);
    onBatch?.(batch);
    result.push(...batch.events);
    start = end;
  }
  return result;
}
