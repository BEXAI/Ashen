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

export type ArchitectureBox = Readonly<{
  id:string;roomId:string;x:number;y:number;z:number;width:number;height:number;depth:number;
  kind:'wall'|'post'|'pilaster'|'capital';rounding?:number;fixture?:string;
}>;
/** Solid room masonry, including the portions projecting into the floor union.
 * Rounded details use their conservative outer box for collision. Their source
 * and replacement visuals share this envelope; loading never changes authority.
 */
export const ROOM_ARCHITECTURE:readonly ArchitectureBox[] = Object.freeze(ROOMS.flatMap((room,i)=>{
  const boxes:ArchitectureBox[]=[];
  const add=(box:Omit<ArchitectureBox,'roomId'>)=>boxes.push(Object.freeze({...box,roomId:room.id}));
  for(const [edge,open] of [[room.z-room.depth/2,i<ROOMS.length-1],[room.z+room.depth/2,i>0]] as [number,boolean][]){
    if(open){
      const width=room.width/2-3;
      for(const side of [-1,1]){
        add({id:`wall:${room.id}:${edge}:${side}`,kind:'wall',x:room.x+side*(3+width/2),y:4.5,z:edge-.02,width,height:9,depth:.9});
        add({id:`post:${room.id}:${edge}:${side}`,kind:'post',x:room.x+side*3.25,y:2,z:edge,width:.7,height:4,depth:1,rounding:.1,
          fixture:edge===room.z-room.depth/2?`threshold-${i}`:undefined});
      }
      add({id:`lintel:${room.id}:${edge}`,kind:'wall',x:room.x,y:8,z:edge,width:6,height:2,depth:.9});
    }else add({id:`wall:${room.id}:${edge}`,kind:'wall',x:room.x,y:4.5,z:edge,width:room.width,height:9,depth:.9});
  }
  for(let z=room.z-room.depth/2+3;z<room.z+room.depth/2;z+=6)for(const side of [-1,1]){
    const x=room.x+side*(room.width/2-.35),fixture=room.id==='crown'&&[-45,-33].includes(z)?`chapel-pillar-${side}-${z}`:undefined;
    add({id:`pilaster:${room.id}:${side}:${z}`,kind:'pilaster',x,y:2.6,z,width:.7,height:5.2,depth:.9,rounding:.08,fixture});
    add({id:`capital:${room.id}:${side}:${z}`,kind:'capital',x,y:5.05,z,width:1.1,height:.35,depth:1.2,rounding:.06,fixture});
  }
  return boxes;
}));
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
