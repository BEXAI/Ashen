import { CORRIDORS, GATES, ROOMS } from './dungeon';

export const LIGHTING_PROFILES = [
  { id:'entry', exposure:1, ambient:1.55, environment:.8, indirect:.8, probe:1, torch:.86, key:.9, fog:.013, color:'#334150' },
  { id:'cinder', exposure:1.025, ambient:1.6, environment:.8, indirect:.8, probe:1.02, torch:.84, key:.9, fog:.012, color:'#3b393c' },
  { id:'dusk', exposure:1.055, ambient:1.7, environment:.86, indirect:.84, probe:1.08, torch:.9, key:.92, fog:.012, color:'#344753' },
  { id:'crown', exposure:1.04, ambient:1.65, environment:.84, indirect:.82, probe:1.05, torch:.86, key:.92, fog:.012, color:'#3d3d48' },
  { id:'throne', exposure:1.07, ambient:1.75, environment:.88, indirect:.84, probe:1.1, torch:.84, key:.92, fog:.011, color:'#3d424e' },
] as const;

/** Hold the room's look; blend only across its connecting passage. */
export function roomBlend(z:number) {
  for(let i=0;i<ROOMS.length-1;i++) {
    const start=ROOMS[i].z-ROOMS[i].depth/2, end=ROOMS[i+1].z+ROOMS[i+1].depth/2;
    if(z>=start)return {a:i,b:i,t:1};
    if(z>end){const u=(z-end)/(start-end);return {a:i,b:i+1,t:u*u*(3-2*u)};}
  }
  return {a:4,b:4,t:1};
}

export function lightingAt(z:number) {
  const {a,b,t}=roomBlend(z),first=LIGHTING_PROFILES[a],second=LIGHTING_PROFILES[b];
  const mix=(key:'exposure'|'ambient'|'environment'|'indirect'|'probe'|'torch'|'key'|'fog')=>second[key]+(first[key]-second[key])*t;
  return {a,b,t,exposure:mix('exposure'),ambient:mix('ambient'),environment:mix('environment'),indirect:mix('indirect'),probe:mix('probe'),torch:mix('torch'),key:mix('key'),fog:mix('fog')};
}

/** Analytic floor-plan visibility, evaluated only while ranking the fixed light pool. */
export function torchReachable(from:{x:number;z:number},to:{x:number;z:number},closedGates:readonly boolean[]) {
  if(GATES.some((g,i)=>closedGates[i]&&(from.z-g.z)*(to.z-g.z)<0))return false;
  const dx=to.x-from.x,dz=to.z-from.z,intervals:[number,number][]=[];
  for(const room of [...ROOMS,...CORRIDORS]){
    let low=0,high=1;
    for(const [origin,direction,min,max] of [[from.x,dx,room.x-room.width/2,room.x+room.width/2],[from.z,dz,room.z-room.depth/2,room.z+room.depth/2]]){
      if(Math.abs(direction)<1e-8){if(origin<min||origin>max){high=-1;break;}}
      else {const a=(min-origin)/direction,b=(max-origin)/direction;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));}
    }
    if(low<=high)intervals.push([low,high]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let covered=0;
  for(const [start,end] of intervals){if(start>covered+1e-6)return false;covered=Math.max(covered,end);if(covered>=1-1e-6)return true;}
  return false;
}
