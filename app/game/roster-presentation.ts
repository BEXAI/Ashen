import * as T from 'three';
import type {Strike} from './combat';

const pose=()=>({position:new T.Vector3(),rotation:new T.Quaternion(),scale:new T.Vector3()});
type Pose=ReturnType<typeof pose>;
function capture(p:Pose,node:T.Object3D){p.position.copy(node.position);p.rotation.copy(node.quaternion);p.scale.copy(node.scale);}

/** Render-only transitions. Collision samples always use the unmodified authored pose. */
export class RosterPresentation{
 private entries:{node:T.Object3D;previous:Pose;from:Pose;sampled:Pose}[];
 private initialized=false;private edited=false;private mode='';private age=1;
 constructor(root:T.Object3D){
  const nodes:T.Object3D[]=[];root.traverse(node=>{if(node===root||node.parent===root||node instanceof T.Bone)nodes.push(node);});
  this.entries=nodes.map(node=>({node,previous:pose(),from:pose(),sampled:pose()}));
 }
 restore(){if(!this.edited)return;for(const e of this.entries){e.node.position.copy(e.sampled.position);e.node.quaternion.copy(e.sampled.rotation);e.node.scale.copy(e.sampled.scale);}this.edited=false;}
 begin(){for(const e of this.entries)capture(e.previous,e.node);this.restore();}
 reset(){this.restore();this.initialized=false;this.mode='';this.age=1;}
 present(mode:string,dt:number,strike?:{strike:Strike;elapsed:number}){
  // Saving the pure pose also avoids feeding a previous visual correction into
  // AnimationMixer tracks that are constant and skip rewriting their target.
  this.restore();for(const e of this.entries)capture(e.sampled,e.node);this.edited=true;
  if(!this.initialized){this.initialized=true;this.mode=mode;this.age=1;for(const e of this.entries)capture(e.previous,e.node);return;}
  if(mode!==this.mode){this.mode=mode;this.age=0;for(const e of this.entries){e.from.position.copy(e.previous.position);e.from.rotation.copy(e.previous.rotation);e.from.scale.copy(e.previous.scale);}}
  this.age+=Math.max(0,dt);
  let alpha=Math.min(1,this.age/(mode==='death'?.1:.14));
  // Reach the exact authored pose before active contact, even at 30 FPS.
  if(strike)alpha=strike.elapsed<strike.strike.windup?Math.min(1,strike.elapsed/Math.min(.12,strike.strike.windup*.65)):1;
  alpha=alpha*alpha*(3-2*alpha);
  if(alpha<1)for(const e of this.entries){e.node.position.lerp(e.from.position,1-alpha);e.node.quaternion.slerp(e.from.rotation,1-alpha);e.node.scale.lerp(e.from.scale,1-alpha);}
 }
}
