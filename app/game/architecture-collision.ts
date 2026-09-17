import { ROOM_ARCHITECTURE } from './dungeon-layout';

type XYZ = Readonly<{x:number;y:number;z:number}>;
export const ARCHITECTURE_BOUNDS = Object.freeze(ROOM_ARCHITECTURE.map(box=>Object.freeze({
  id:box.id,minX:box.x-box.width/2,maxX:box.x+box.width/2,
  minY:box.y-box.height/2,maxY:box.y+box.height/2,
  minZ:box.z-box.depth/2,maxZ:box.z+box.depth/2,
})));
/** The flat-ground controller has no step/jump mode; overhead lintels/capitals
 * constrain rays and cameras but do not seal a traversable doorway below them.
 */
export const ARCHITECTURE_FLOOR_BOXES = Object.freeze(ARCHITECTURE_BOUNDS.filter(box=>box.minY<=.001));

/** First solid distance on the finite segment, including a start inside masonry.
 * Axis-aligned envelopes conservatively include the rounded .06–.10 corners.
 * Uses no renderer or downloaded mesh, so camera, contacts and movement retain
 * their architecture when a room is culled, replaced, or fails to load.
 */
export function architectureObstruction(from:XYZ,to:XYZ):number {
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz);
  if(!Number.isFinite(length)||length<1e-8)return Infinity;
  const minX=Math.min(from.x,to.x),maxX=Math.max(from.x,to.x),minY=Math.min(from.y,to.y),maxY=Math.max(from.y,to.y),minZ=Math.min(from.z,to.z),maxZ=Math.max(from.z,to.z);
  let first=Infinity;
  for(const box of ARCHITECTURE_BOUNDS){
    if(box.maxX<minX||box.minX>maxX||box.maxY<minY||box.minY>maxY||box.maxZ<minZ||box.minZ>maxZ)continue;
    let enter=0,exit=1;
    for(const [origin,delta,min,max] of [[from.x,dx,box.minX,box.maxX],[from.y,dy,box.minY,box.maxY],[from.z,dz,box.minZ,box.maxZ]]){
      if(Math.abs(delta)<1e-10){if(origin<min||origin>max){exit=-1;break;}}
      else{const a=(min-origin)/delta,b=(max-origin)/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(enter>exit)break;}
    }
    if(enter<=exit)first=Math.min(first,enter*length);
  }
  return first;
}
