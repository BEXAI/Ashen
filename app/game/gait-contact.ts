import * as T from 'three';
import cache from './gait-contact-cache.json';
import type {Actor} from './character-skins';
type Profile={duration:number;cycleDistance:number;distance:number[];stance:number[];legPlaneRadians:number};
const profiles=cache as Record<string,Record<string,Profile>>;
const locomotion=new Set(['forward','backward','strafe_left','strafe_right']);
/** Distance chooses only a sampled clip phase; the engine remains the sole root-motion owner. */
export class DistanceGait {
 private before=new T.Vector3();private beforeRotation=new T.Quaternion();private scale=new T.Vector3();
 private distance=0;private mode='';private tracking=false;private sampled=false;private side=-1;private cycle=0;private amount=1;
 private plane=0;private active=false;private turning=false;private lastContact=-1;
 private anchors=[new T.Vector3(),new T.Vector3()];private anchored=[false,false];
 private center=new T.Vector3();private target=new T.Vector3();private offset=new T.Vector3();private axis=new T.Vector3(0,1,0);private q=new T.Quaternion();private qi=new T.Quaternion();
 readonly metrics={maximumHipXZModelMetres:0,maximumHipDownModelMetres:0,anchorReleases:0,stanceSamples:0};
 constructor(private actor:Actor,private points:T.Vector3[][]){}
 begin(){this.before.copy(this.actor.group.position);this.beforeRotation.copy(this.actor.group.quaternion);this.sampled=false;this.active=false;this.turning=false;}
 reset(){this.mode='';this.distance=0;this.tracking=false;this.sampled=false;this.side=-1;this.cycle=0;this.release();}
 private release(){this.anchored[0]=this.anchored[1]=false;this.lastContact=-1;}
 sample(mode:string,time:number,amount:number){
  if(this.sampled)return time;this.sampled=true;this.amount=amount;
  const p=profiles[String(this.actor.group.userData.skin)]?.[mode];
  const travel=Math.hypot(this.actor.group.position.x-this.before.x,this.actor.group.position.z-this.before.z),rotation=this.actor.group.quaternion.angleTo(this.beforeRotation);
  if(travel>.8||rotation>.65){this.reset();return time;}
  if(!p||amount<=.05){this.tracking=false;this.active=false;this.turning=(mode==='idle'||mode==='turn')&&rotation>.0001;if(!this.turning)this.release();return time;}
  if(this.mode!==mode){this.mode=mode;this.distance=0;this.cycle=0;this.release();}
  if(travel>1e-6)this.tracking=true;
  if(!this.tracking)return time; // Preserve explicit stationary pose inspection and original authored clips.
  this.actor.group.getWorldScale(this.scale);const scale=Math.max(.01,Math.abs(this.scale.x)+Math.abs(this.scale.z))*.5;
  this.distance+=travel/(scale*Math.max(.08,amount));
  this.cycle=Math.floor(this.distance/p.cycleDistance);const within=this.distance%p.cycleDistance;
  let lo=0,hi=p.distance.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(p.distance[mid]<=within)lo=mid;else hi=mid;}
  const fraction=(within-p.distance[lo])/Math.max(1e-9,p.distance[hi]-p.distance[lo]);this.side=p.stance[lo];const dx=Number(this.actor.group.userData.localMoveX??0),dz=Number(this.actor.group.userData.localMoveZ??1);const heading=Math.atan2(dx,dz);this.plane=heading-(mode==='backward'?(heading<0?-Math.PI:Math.PI):0);this.active=true;
  return p.duration*(lo+fraction)/(p.distance.length-1);
 }
 /** Called after the pure pose and transition have been sampled. Only hip/knee presentation changes. */
 apply(mode:string,ground:number,transitionAlpha:number){
  if(!locomotion.has(mode)&&mode!=='idle'&&mode!=='turn'){this.release();return false;}
  if(!this.active&&!this.turning){this.release();return false;}
  const actor=this.actor;actor.group.getWorldScale(this.scale);const scale=Math.max(.01,Math.abs(this.scale.y));
  if(this.active&&this.plane){this.q.setFromAxisAngle(this.axis,this.plane);this.qi.copy(this.q).invert();for(const node of [...actor.legs,...actor.knees])node.quaternion.premultiply(this.q).multiply(this.qi);}
  actor.group.updateMatrixWorld(true);
  // A moving stance alternates with backwards foot travel, rather than retaining
  // the lowest foot through its entire forward recovery. Lift that recovery foot.
  const sides=this.turning?[0,1]:[this.side];const contact=this.turning?-2:this.cycle*2+this.side;
  if(contact!==this.lastContact){this.release();this.lastContact=contact;}
  for(let side=0;side<2;side++){
   const planted=sides.includes(side),points=this.points[side];if(!points?.length)continue;
   let minimum=Infinity;for(const p of points)minimum=Math.min(minimum,this.target.copy(p).applyMatrix4(actor.knees[side].matrixWorld).y);
   const goal=ground+(planted?.004:.045)*scale,delta=planted?goal-minimum:Math.max(0,goal-minimum);
   const down=this.active?.18:.125,dy=T.MathUtils.clamp(delta,-down*scale,.04*scale),hip=actor.legs[side];
   hip.getWorldPosition(this.target);this.target.y+=dy;hip.parent!.worldToLocal(this.target);hip.position.copy(this.target);this.metrics.maximumHipDownModelMetres=Math.max(this.metrics.maximumHipDownModelMetres,-dy/scale);
  }
  actor.group.updateMatrixWorld(true);
  for(const side of sides){
   const points=this.points[side];if(!points?.length)continue;this.center.set(0,0,0);for(const p of points)this.center.add(p);this.center.divideScalar(points.length).applyMatrix4(actor.knees[side].matrixWorld);
   if(!this.anchored[side]||transitionAlpha<.999){this.anchors[side].copy(this.center);this.anchored[side]=true;}
   this.offset.copy(this.anchors[side]).sub(this.center);this.offset.y=0;
   const cap=(this.turning?.12:.18)*scale;
   if(this.offset.length()>cap){this.offset.clampLength(0,cap);this.anchors[side].copy(this.center).add(this.offset);this.metrics.anchorReleases++;}
   const hip=actor.legs[side];hip.getWorldPosition(this.target).add(this.offset);hip.parent!.worldToLocal(this.target);hip.position.copy(this.target);
   this.metrics.maximumHipXZModelMetres=Math.max(this.metrics.maximumHipXZModelMetres,this.offset.length()/scale);this.metrics.stanceSamples++;
  }
  return true;
 }
 get state(){return {active:this.active,turning:this.turning,side:this.side,cycle:this.cycle,mode:this.mode,metrics:{...this.metrics}};}
}
