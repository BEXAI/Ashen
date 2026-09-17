import type { Progress } from './model';

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
];
export const GATES = [
  { z:5, shrine:'cinder', enemies:['w1','w2','w3'], name:'Cinder seal' },
  { z:-25, shrine:'dusk', enemies:['w4','w5','w6'], name:'Ossuary seal' },
  { z:-52, shrine:'crown', enemies:['w7','w8','w9'], name:'Throne seal' },
] as const;
export function gateOpen(index:number,p:Progress) {
  const gate=GATES[index];
  return p.won || p.shrines.includes(gate.shrine) && gate.enemies.every(id=>p.defeated.includes(id));
}
export function roomAt(x:number,z:number) {
  return ROOMS.find(r=>Math.abs(x-r.x)<=r.width/2&&Math.abs(z-r.z)<=r.depth/2);
}
export function walkable(x:number,z:number,radius=.45) {
  return [-radius,radius].every(dx=>[-radius,radius].every(dz=>[...ROOMS,...CORRIDORS].some(r=>Math.abs(x+dx-r.x)<=r.width/2&&Math.abs(z+dz-r.z)<=r.depth/2)));
}
export function dungeonMove(x:number,z:number,nx:number,nz:number,p:Progress) {
  const allowed=(a:number,b:number)=>walkable(a,b)&&!GATES.some((g,i)=>!gateOpen(i,p)&&(Math.abs(b-g.z)<.75||(z-g.z)*(b-g.z)<0));
  // Resolve axes separately so a thumb pushed into a wall slides along it.
  const rx=allowed(nx,z)?nx:x;
  return {x:rx,z:allowed(rx,nz)?nz:z};
}
export function validDungeonSpawn(p:Progress) {
  return walkable(p.x,p.z)&&!GATES.some((g,i)=>!gateOpen(i,p)&&p.z<g.z+.8);
}
