import {ROOMS,CORRIDORS} from './dungeon';
export type ArchitectureModule='Arch'|'Pillar'|'Trim';
export type ArchitecturePlacement={id:string;module:ArchitectureModule;roomId:string;position:readonly [number,number,number];yaw:number;replaces?:string};
/** Decoration only. The original map, gate state and collision geometry stay authoritative. */
export function architecturePlacements():ArchitecturePlacement[]{
 const result:ArchitecturePlacement[]=CORRIDORS.map((passage,i)=>({id:`threshold-${i}`,module:'Arch',roomId:ROOMS[i].id,position:[0,0,passage.z+passage.depth/2],yaw:0,replaces:`generic doorway torus + two 4m pillars at z=${passage.z+passage.depth/2}`}));
 const chapel=ROOMS.find(r=>r.id==='crown')!,throne=ROOMS.find(r=>r.id==='throne')!;
 for(const z of [chapel.z-chapel.depth/2+3,chapel.z-chapel.depth/2+15])for(const side of [-1,1]){
  result.push({id:`chapel-pillar-${side}-${z}`,module:'Pillar',roomId:chapel.id,position:[side*(chapel.width/2-.35),0,z],yaw:0,replaces:`existing .7x5.2x.9 wall pilaster and its cap at x=${side*(chapel.width/2-.35)}, z=${z}`});
 }
 // The rear wall's interior face is z=-81.55. These pillars end at that plane;
 // no new floor obstacle extends forward into the throne arena.
 for(const side of [-1,1])result.push({id:`throne-pillar-${side}`,module:'Pillar',roomId:throne.id,position:[side*7,0,throne.z-throne.depth/2],yaw:0});
 result.push({id:'throne-crown-trim',module:'Trim',roomId:throne.id,position:[0,6.4,throne.z-throne.depth/2+.175],yaw:0});
 return result;
}
