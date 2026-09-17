import type { Progress } from './model';
import { GATES, gateOpen } from './dungeon-layout';
import { buildCollisionWorld, canOccupy, moveBody, openFloorWorld } from './kinematic';

export { BONE_THRONE, ROOMS, CORRIDORS, GATES, GATE_HALF_WIDTH, GATE_HALF_DEPTH, gateOpen, roomAt } from './dungeon-layout';

/** Floor/throne check intentionally ignores progression gates, as before. */
export function walkable(x:number,z:number,radius=.45) {
  return canOccupy(openFloorWorld(),x,z,radius);
}

/** Compatibility adapter. New callers should retain moveBody's full timed path. */
export function dungeonMove(x:number,z:number,nx:number,nz:number,p:Progress,radius=.45) {
  const next=moveBody({x,z,radius},{x:nx-x,z:nz-z},buildCollisionWorld(p));
  return {x:next.x,z:next.z};
}

export function validDungeonSpawn(p:Progress) {
  return canOccupy(buildCollisionWorld(p),p.x,p.z,.45)
    && !GATES.some((g,i)=>!gateOpen(i,p)&&p.z<g.z+.8);
}
