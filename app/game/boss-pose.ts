import * as T from 'three';
import type { Actor } from './character-skins';
import type { Strike } from './combat';
import { applyStrikePose, bladeSegment } from './combat-animation';

export type BossPoseKind = 'sweep' | 'slam' | 'eruption';
export type BossPoseOptions = { target?: T.Vector3; groundY?: number };
export type BossPoseResult = { grounded: boolean; tip: T.Vector3; desiredTip: T.Vector3; error: number; reachClamped: boolean; surfacePoint?: T.Vector3 };
const SWEEP: Strike = { id:'side',label:'Boss claw sweep',windup:.8,active:.2,recovery:.65,stamina:0,damage:1,targets:1,stagger:0,travel:.2 };
const SLAM_SOURCE: Strike = { ...SWEEP,id:'overhead',label:'Boss grounded slam' };
const ease=(x:number)=>{const t=T.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};
const v=()=>new T.Vector3();
const world=(node:T.Object3D)=>node.getWorldPosition(v());
function setWorldQuaternion(node:T.Object3D,q:T.Quaternion){const parent=node.parent?.getWorldQuaternion(new T.Quaternion())??new T.Quaternion();node.quaternion.copy(parent.invert().multiply(q));node.updateWorldMatrix(false,true);}
function rotateWorld(node:T.Object3D,axis:T.Vector3,radians:number){setWorldQuaternion(node,new T.Quaternion().setFromAxisAngle(axis,radians).multiply(node.getWorldQuaternion(new T.Quaternion())));}
function align(node:T.Object3D,current:T.Vector3,desired:T.Vector3){
 const origin=world(node),a=current.clone().sub(origin),b=desired.clone().sub(origin);if(a.lengthSq()<1e-10||b.lengthSq()<1e-10)return;
 const delta=new T.Quaternion().setFromUnitVectors(a.normalize(),b.normalize());setWorldQuaternion(node,delta.multiply(node.getWorldQuaternion(new T.Quaternion())));
}
type End={node:T.Object3D;offset:T.Vector3};
const endpoint=(end:End)=>end.node.localToWorld(end.offset.clone());
/** Two rigid bone rotations. No translation of joints, bone scaling or socket relocation. */
function solveChain(upper:T.Object3D,lower:T.Object3D,end:End,target:T.Vector3,pole:T.Vector3){
 upper.updateWorldMatrix(true,true);const a=world(upper),b=world(lower),c=endpoint(end);
 const l1=a.distanceTo(b),l2=b.distanceTo(c),delta=target.clone().sub(a),raw=delta.length();
 if(l1<1e-8||l2<1e-8||raw<1e-8)return true;
 const d=T.MathUtils.clamp(raw,Math.abs(l1-l2)+1e-5,l1+l2-1e-5),axis=delta.multiplyScalar(1/raw);
 const tangent=pole.clone().sub(a).addScaledVector(axis,-pole.clone().sub(a).dot(axis));
 if(tangent.lengthSq()<1e-8)tangent.set(1,0,0).addScaledVector(axis,-axis.x);
 if(tangent.lengthSq()<1e-8)tangent.set(0,0,1).addScaledVector(axis,-axis.z);
 tangent.normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const desiredB=a.clone().addScaledVector(axis,along).addScaledVector(tangent,height),desiredC=a.clone().addScaledVector(axis,d);
 align(upper,b,desiredB);align(lower,endpoint(end),desiredC);return Math.abs(raw-d)>.001;
}
type Rig={hip:T.Object3D;spine:T.Object3D;upper:T.Object3D;lower:T.Object3D;hand:T.Object3D;tipOffset:T.Vector3;legs:{upper:T.Object3D;lower:T.Object3D;end:End;orient:T.Object3D|null}[];imported:boolean};
const swordTips=new WeakMap<T.Object3D,T.Vector3>();
/** Original fallback contact marker stops short of the visible blade end. Sample its actual geometry. */
function fallbackSurfaceOffset(actor:Actor,socketOffset:T.Vector3){
 const cached=swordTips.get(actor.sword);if(cached)return cached.clone();
 const direction=socketOffset.clone().normalize();let furthest=-Infinity;const offset=socketOffset.clone();
 actor.sword.traverse(node=>{if(!(node instanceof T.Mesh))return;const positions=node.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){const point=actor.wrists[1].worldToLocal(node.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)));const along=point.dot(direction);if(along>furthest){furthest=along;offset.copy(point);}}
 });
 swordTips.set(actor.sword,offset.clone());return offset;
}
function rigFor(actor:Actor):Rig|null{
 const find=(name:string)=>actor.group.getObjectByName(name);
 if(actor.visual){const hip=find('Hips'),spine=find('Spine02'),upper=find('RightArm'),lower=find('RightForeArm'),hand=find('RightHand'),tip=find('ContactTip');
  if(!hip||!spine||!upper||!lower||!hand||!tip)return null;
  actor.group.updateMatrixWorld(true);const tipOffset=hand.worldToLocal(world(tip));const legs:Rig['legs']=[];
  for(const side of ['Left','Right']){const u=find(side+'UpLeg'),l=find(side+'Leg'),f=find(side+'Foot');if(u&&l&&f)legs.push({upper:u,lower:l,end:{node:f,offset:v()},orient:f});}
  return {hip,spine,upper,lower,hand,tipOffset,legs,imported:true};
 }
 actor.group.updateMatrixWorld(true);const tip=v(),base=v();bladeSegment(actor,base,tip);
 return {hip:actor.body,spine:actor.torso,upper:actor.arms[1],lower:actor.elbows[1],hand:actor.wrists[1],tipOffset:fallbackSurfaceOffset(actor,actor.wrists[1].worldToLocal(tip)),imported:false,
  legs:actor.legs.map((upper,i)=>({upper,lower:actor.knees[i],end:{node:actor.knees[i],offset:new T.Vector3(0,-.46,.09)},orient:null}))};
}
type Overlay = {visual:Actor['visual'];active:boolean;nodes:{node:T.Object3D;quaternion:T.Quaternion}[]};
const overlays=new WeakMap<Actor,Overlay>();
function rememberNativePose(actor:Actor,nodes:T.Object3D[]){
 let state=overlays.get(actor);
 if(!state||state.visual!==actor.visual){state={visual:actor.visual,active:false,nodes:nodes.map(node=>({node,quaternion:new T.Quaternion()}))};overlays.set(actor,state);}
 for(const entry of state.nodes)entry.quaternion.copy(entry.node.quaternion);state.active=true;
}
/** Call before any other sampler/reset. Clears render interpolation before restoring the native mixer pose. */
export function restoreBossPose(actor:Actor){
 const state=overlays.get(actor);if(!state?.active)return;state.active=false;
 // A newly installed tier has different nodes. The retired visual owns disposal of the old skeleton.
 if(state.visual!==actor.visual){overlays.delete(actor);return;}
 actor.visual?.beginFrame();
 for(const {node,quaternion} of state.nodes)node.quaternion.copy(quaternion);
 actor.group.updateMatrixWorld(true);
}
/** Absolute authored sample. Undo our last edit before sampling, including constant animation tracks. */
function basePose(actor:Actor,kind:BossPoseKind,elapsed:number){
 restoreBossPose(actor);
 if(kind==='sweep'){applyStrikePose(actor,SWEEP,T.MathUtils.clamp(elapsed,0,1.65));return;}
 if(kind==='eruption'){applyStrikePose(actor,{...SLAM_SOURCE,windup:1,active:.35,recovery:.7},T.MathUtils.clamp(elapsed,0,2.05));return;}
 // The native clip is used only as a continuous anticipation/recovery scaffold, never with active=0.
 const t=T.MathUtils.clamp(elapsed,0,1.95);
 const sample=t<.65?t/.65*.8:t<1.10?.8+(t-.65)/.45*.1:.9+(t-1.10)/.85*.75;
 applyStrikePose(actor,SLAM_SOURCE,sample);
}
/** World target stays committed. The visible weighted arm and its original socket are moved together. */
export function applyBossPose(actor:Actor,kind:BossPoseKind,elapsed:number,options:BossPoseOptions={}):BossPoseResult{
 if(!Number.isFinite(elapsed))throw new RangeError('Invalid boss pose time');
 basePose(actor,kind,elapsed);actor.group.updateMatrixWorld(true);
 const base=v(),tip=v();bladeSegment(actor,base,tip);
 if(kind==='sweep'||kind==='eruption')return {grounded:false,tip:tip.clone(),desiredTip:tip.clone(),error:0,reachClamped:false};
 const rig=rigFor(actor),floor=options.groundY??actor.group.getWorldPosition(v()).y;
 const fallbackTarget=actor.group.localToWorld(new T.Vector3(0,0,1.5/1.8));fallbackTarget.y=floor+.035;
 const target=options.target?.clone()??fallbackTarget;target.y=floor+.035;
 if(!rig||![...target.toArray(),floor].every(Number.isFinite))return {grounded:false,tip,desiredTip:target,error:Infinity,reachClamped:true};
 const sourceTip=rig.hand.localToWorld(rig.tipOffset.clone());
 const load=elapsed<=1.1?ease((elapsed-.55)/.55):1-ease((elapsed-1.22)/.73);
 if(load<=0)return {grounded:false,tip,desiredTip:target,error:tip.distanceTo(target),reachClamped:false};
 const scale=actor.group.getWorldScale(v()).y;
 const right=new T.Vector3(1,0,0).applyQuaternion(actor.group.getWorldQuaternion(new T.Quaternion())).normalize();
 const forward=new T.Vector3(0,0,1).applyQuaternion(actor.group.getWorldQuaternion(new T.Quaternion())).normalize();
 const offUpper=actor.visual?actor.group.getObjectByName('LeftArm'):actor.arms[0],offLower=actor.visual?actor.group.getObjectByName('LeftForeArm'):actor.elbows[0],offHand=actor.visual?actor.group.getObjectByName('LeftHand'):actor.wrists[0];
 const off=offUpper&&offLower&&offHand?{upper:offUpper,lower:offLower,hand:offHand,point:world(offHand),q:offHand.getWorldQuaternion(new T.Quaternion()),pole:world(offLower)}:null;
 rememberNativePose(actor,[rig.spine,rig.upper,rig.lower,rig.hand,...(off?[off.upper,off.lower,off.hand]:[])]);
 // Hips and both leg chains are untouched. The rigid wings/tail therefore retain native grounding.
 rotateWorld(rig.spine,right,T.MathUtils.degToRad(rig.imported?75:30)*load);
 if(off){solveChain(off.upper,off.lower,{node:off.hand,offset:v()},off.point,off.pole);setWorldQuaternion(off.hand,off.q);}
 // Follow the native claw's pre-lean position into the committed floor point.
 actor.group.updateMatrixWorld(true);
 const desiredTip=sourceTip.clone().lerp(target,load);
 // The long fallback sword moves clear of the chest before turning point-down.
 if(!rig.imported){const clear=ease(Math.min(1,load*2.5));desiredTip.x=T.MathUtils.lerp(sourceTip.x,target.x,clear);desiredTip.z=T.MathUtils.lerp(sourceTip.z,target.z,clear);}
 const handQ=rig.hand.getWorldQuaternion(new T.Quaternion());
 const oldAxis=rig.tipOffset.clone().multiply(rig.hand.getWorldScale(v())).applyQuaternion(handQ).normalize();
 const pitch=rig.imported?-.65:-Math.PI/2;const downForward=forward.clone().multiplyScalar(Math.cos(pitch)).add(new T.Vector3(0,Math.sin(pitch),0)).normalize();
 const aimQ=new T.Quaternion().setFromUnitVectors(oldAxis,downForward).multiply(handQ);
 aimQ.premultiply(new T.Quaternion().setFromAxisAngle(downForward,rig.imported?2.4:0));
 // Authored recovered-dragon wrist orientation, in actor-root space. Roll raises the rigid wrist chain.
 const authoredHand=rig.imported?actor.group.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion(.3069137529,.1358199438,.8969176146,-.2879161061)):aimQ;
 const desiredQ=handQ.clone().slerp(authoredHand,ease(Math.min(1,load*2.5)));
 const tipOffsetWorld=rig.tipOffset.clone().multiply(rig.hand.getWorldScale(v())).applyQuaternion(desiredQ);
 const wrist=desiredTip.clone().sub(tipOffsetWorld);
 const elbow=world(rig.lower),pole=elbow.clone().addScaledVector(right,-scale*.45);
 const clamped=solveChain(rig.upper,rig.lower,{node:rig.hand,offset:v()},wrist,pole);
 setWorldQuaternion(rig.hand,desiredQ);actor.group.updateMatrixWorld(true);bladeSegment(actor,base,tip);
 const surfacePoint=rig.hand.localToWorld(rig.tipOffset.clone()),error=surfacePoint.distanceTo(desiredTip);
 return {grounded:load>=.999&&!clamped&&surfacePoint.distanceTo(target)<=.005,tip:tip.clone(),desiredTip,error,reachClamped:clamped,surfacePoint};
}

/**
 * Conservative, mutation-free gate for the tested recovered Dragon and Ember Sovereign fallback.
 * This is not a generic IK solver: the narrow corridor is proven by actual-GLB tests.
 * Other models, uneven floor or nonuniform scale skip the slam.
 */
export function bossGroundReachable(actor:Actor,target:T.Vector3,groundY=0):boolean{
 if(actor.visual){if(actor.group.userData.visualId!=='ember-dragon'||actor.group.userData.assetVersion!=='recovered-september9-v1')return false;}
 else if(actor.group.userData.skin!=='ember-sovereign')return false;
 const origin=actor.group.getWorldPosition(v()),scale=actor.group.getWorldScale(v());
 if(![...target.toArray(),groundY,...origin.toArray(),...scale.toArray()].every(Number.isFinite)||scale.y<=0||Math.abs(scale.x-scale.y)>1e-5||Math.abs(scale.z-scale.y)>1e-5)return false;
 if(Math.abs(groundY-origin.y)>.02||!rigFor(actor))return false;
 const ratio=scale.y/1.8,distance=Math.hypot(target.x-origin.x,target.z-origin.z);
 return distance>=1.25*ratio-1e-6&&distance<=1.65*ratio+1e-6;
}
/** Select this once before the warning. Never follow the moving hero after commitment. */
export function bossSlamTarget(actor:Actor,hero:{x:number;z:number},groundY=actor.group.getWorldPosition(v()).y):T.Vector3|null{
 const origin=actor.group.getWorldPosition(v()),dx=hero.x-origin.x,dz=hero.z-origin.z,d=Math.hypot(dx,dz);
 if(!Number.isFinite(d)||d<1e-6)return null;
 const reach=1.5*actor.group.getWorldScale(v()).y/1.8;
 const target=new T.Vector3(origin.x+dx/d*reach,groundY,origin.z+dz/d*reach);
 return bossGroundReachable(actor,target,groundY)?target:null;
}
