import type { Progress } from './model';

/** Shared immutable layout: rendering, progression and collision use these same values. */
export const BONE_THRONE = { x:-11, z:-77, scale:1.45, halfWidth:.638004, halfDepth:.696039 } as const;
export const ROOMS = [
  { id:'entry', name:'The Threshold', x:0, z:49, width:20, depth:22 },
  { id:'cinder', name:'Cinder Crypt', x:0, z:20, width:32, depth:24 },
  { id:'dusk', name:'The Ossuary', x:0, z:-10, width:38, depth:24 },
  { id:'crown', name:'Chapel of Ash', x:0, z:-38, width:32, depth:20 },
  { id:'throne', name:'The Hollow Throne', x:0, z:-69, width:38, depth:26 },
] as const;
export const CORRIDORS = [
  {x:0,z:35,width:6,depth:6}, {x:0,z:5,width:6,depth:6},
  {x:0,z:-25,width:6,depth:6}, {x:0,z:-52,width:6,depth:8},
] as const;
export const GATES = [
  { z:5, shrine:'cinder', enemies:['w1','w2','w3'], name:'Cinder seal' },
  { z:-25, shrine:'dusk', enemies:['w4','w5','w6'], name:'Ossuary seal' },
  { z:-52, shrine:'crown', enemies:['w7','w8','w9'], name:'Throne seal' },
] as const;
/** The gate mesh is 6 wide; the outer horizontal bars are .30 deep. */
export const GATE_HALF_WIDTH = 3;
export const GATE_HALF_DEPTH = .15;
export function gateOpen(index:number, p:Pick<Progress,'won'|'shrines'|'defeated'>) {
  const gate=GATES[index];
  return p.won || p.shrines.includes(gate.shrine) && gate.enemies.every(id=>p.defeated.includes(id));
}
export function roomAt(x:number,z:number) {
  return ROOMS.find(r=>Math.abs(x-r.x)<=r.width/2&&Math.abs(z-r.z)<=r.depth/2);
}
