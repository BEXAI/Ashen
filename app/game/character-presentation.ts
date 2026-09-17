import {DistanceGait} from './gait-contact';
import * as T from 'three';
import type { Actor } from './character-skins';
import type { Strike } from './combat';
import soles from './foot-contact-cache.json';

type Pose={position:T.Vector3;rotation:T.Quaternion;scale:T.Vector3};
const pose=():Pose=>({position:new T.Vector3(),rotation:new T.Quaternion(),scale:new T.Vector3(1,1,1)});
const capture=(target:Pose,node:T.Object3D)=>{target.position.copy(node.position);target.rotation.copy(node.quaternion);target.scale.copy(node.scale);};
const protectedContact=new Set(['body','torso','right_arm','right_elbow','right_wrist','weapon','WeaponBase','WeaponTip']);

/** Called once after pure collision sampling; never advances an animation or combat clock. */
export class CharacterPresentation {
  private entries:{name:string;node:T.Object3D;previous:Pose;from:Pose;sampled:Pose}[];
  private mode='';private age=1;private initialized=false;private hasSampled=false;
  private capeFollow=0;private xAxis=new T.Vector3(1,0,0);
  private scratch=new T.Vector3();private worldScale=new T.Vector3();private capeRotation=new T.Quaternion();
  private points:T.Vector3[][];private gait:DistanceGait;
  constructor(private actor:Actor,nodes:Map<string,T.Object3D>){
    this.entries=[...nodes].map(([name,node])=>({name,node,previous:pose(),from:pose(),sampled:pose()}));
    this.points=(soles[actor.group.userData.skin as keyof typeof soles]??[]).map(leg=>leg.map(p=>new T.Vector3().fromArray(p)));this.gait=new DistanceGait(actor,this.points);
  }
  // The mixer can skip constant channels. Preserve the displayed transition
  // source, then undo presentation edits before the next pure animation sample.
  private restoreSampled(){if(!this.hasSampled)return;for(const e of this.entries){e.node.position.copy(e.sampled.position);e.node.quaternion.copy(e.sampled.rotation);e.node.scale.copy(e.sampled.scale);}this.hasSampled=false;}
  begin(){this.gait.begin();for(const e of this.entries)capture(e.previous,e.node);this.restoreSampled();}
  reset(){this.gait.reset();this.restoreSampled();this.initialized=false;this.mode='';this.age=1;this.capeFollow=0;}
  locomotionTime(mode:string,time:number,amount:number){return this.gait.sample(mode,time,amount);}
  get stance(){return this.gait.state;}
  present(mode:string,dt:number,moving:number,ground:number,reducedMotion:boolean,strike?:{strike:Strike;elapsed:number}){
    for(const e of this.entries)capture(e.sampled,e.node);this.hasSampled=true;
    const active=!!strike&&strike.elapsed>=strike.strike.windup&&strike.elapsed<strike.strike.windup+strike.strike.active;
    const first=!this.initialized;
    if(first){this.initialized=true;this.mode=mode;this.age=1;for(const e of this.entries){capture(e.from,e.node);capture(e.previous,e.node);}}
    if(mode!==this.mode){this.mode=mode;this.age=0;for(const e of this.entries){e.from.position.copy(e.previous.position);e.from.rotation.copy(e.previous.rotation);e.from.scale.copy(e.previous.scale);}}
    this.age+=Math.max(0,dt);
    let alpha=Math.min(1,this.age/(mode==='death'?.1:.14));
    if(strike)alpha=strike.elapsed<strike.strike.windup?Math.min(1,strike.elapsed/Math.min(.12,strike.strike.windup*.65)):1;
    alpha=first?1:alpha*alpha*(3-2*alpha);
    if(alpha<1)for(const e of this.entries){if(active&&protectedContact.has(e.name))continue;e.node.position.lerp(e.from.position,1-alpha);e.node.quaternion.slerp(e.from.rotation,1-alpha);e.node.scale.lerp(e.from.scale,1-alpha);}
    // Keep both authored dodge and death trajectories. Contact corrections only
    // move hip children; body, torso and the authoritative weapon chain are untouched.
    const stance=this.gait.apply(mode,ground,alpha);
    if(!stance&&!['dodge','death','hit'].includes(mode))this.groundFeet(moving,ground);
    const cape=this.entries.find(e=>e.name==='cape_lower')?.node;
    if(cape){
      const secondary=!reducedMotion&&!this.actor.group.userData.reducedSecondary&&this.actor.group.userData.activeLod!==2;
      this.capeFollow=T.MathUtils.lerp(this.capeFollow,secondary?Math.min(.045,moving*.045):0,1-Math.exp(-Math.max(0,dt)*8));
      const clearance=active&&['side','backhand'].includes(mode)?.03:0;
      this.capeRotation.setFromAxisAngle(this.xAxis,Math.min(.075,this.capeFollow+clearance));
      cape.quaternion.multiply(this.capeRotation);
    }
  }
  private groundFeet(moving:number,ground:number){
    if(this.points.length!==2)return;
    this.actor.group.updateMatrixWorld(true);this.actor.group.getWorldScale(this.worldScale);
    const scale=Math.max(.01,Math.abs(this.worldScale.y)),heights=[Infinity,Infinity];
    for(let side=0;side<2;side++)for(const p of this.points[side])heights[side]=Math.min(heights[side],this.scratch.copy(p).applyMatrix4(this.actor.knees[side].matrixWorld).y);
    for(let side=0;side<2;side++){
      const planted=moving<.05||heights[side]<=heights[1-side]+.008*scale;
      const delta=ground+.004*scale-heights[side];
      // Preserve swing-foot lift; correct penetration on either foot.
      if(!planted&&delta<0)continue;
      const offset=T.MathUtils.clamp(delta,-.125*scale,.04*scale),hip=this.actor.legs[side];
      hip.getWorldPosition(this.scratch);this.scratch.y+=offset;hip.parent!.worldToLocal(this.scratch);hip.position.copy(this.scratch);
    }
  }
}
