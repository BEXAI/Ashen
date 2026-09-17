import { SimulationClock } from './simulation-clock';
import { TickCommandQueue } from './action-rules';
import { HazardSystem } from './hazards';
import { BossPatternController } from './enemy-patterns';
import type { Swing } from './combat';
import type { Actor } from './world';
import type { MotionPath, PairResolution, XZ } from './kinematic';
import type { CombatEvent, ContactCandidate } from './combat-events';
export type Command = {type:'attack'|'cast'|'dodge'|'heal'|'interact'} | {type:'hold';pressed:boolean;cancelBuffered?:boolean};
export type ActionWindow={swing:Swing;from:number;to:number;actor:Actor;done:boolean};
export function createMechanics(){return {
 clock:new SimulationClock(), commands:new TickCommandQueue<Command>(), executing:false, collecting:false,
 serial:0, actionIds:new WeakMap<Swing,number>(), paths:new Map<string,MotionPath>(), windows:new Map<string,ActionWindow>(),
 velocity:new Map<string,XZ>(), recoil:new Map<string,XZ>(), candidates:[] as ContactCandidate[],
 tickStart:0,tickEnd:0,dodgeStartRemaining:0,spawnStartRemaining:0,spawnRemaining:0,dodgeDirection:{x:0,z:1} as Readonly<XZ>,
 hazards:new HazardSystem(), boss:new BossPatternController(), hazardHits:new Map<string,Set<string>>(),
 terminal:null as 'death'|'victory'|null, terminalAge:0, terminalVisible:false,
 deaths:new Map<string,number>(), eventTrace:[] as CombatEvent[],
 pairReport:{iterations:0,unresolved:[],invalidBodies:[]} as PairResolution,
 };
}
export type MechanicsState=ReturnType<typeof createMechanics>;
