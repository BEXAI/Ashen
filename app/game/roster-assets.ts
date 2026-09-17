import * as T from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {Actor,ActorVisual} from './character-skins';
import type {Strike,StrikeId} from './combat';
import type {RosterId} from './character-roster';
import {attachRosterEquipment} from './roster-equipment';
import {disposeTree,REQUIRED_CHARACTER_CLIPS} from './character-assets';
import {RosterPresentation} from './roster-presentation';

export const ROSTER_MANIFEST_URL='/assets/roster/recovered-2026-09-17/manifest.json';
type Variant={url:string;sha256:string};
export type RosterModel={height:number;yaw:number;strikeYaw?:number;equipment?:'authored'|'embedded';contactSockets?:'authored'|'embedded';contentVersion?:string;bounds?:{min:[number,number,number];max:[number,number,number]};contactPhase:[number,number]|Record<StrikeId,[number,number]>;variants:{mobile:Variant;hd:Variant};grounding?:{restMinY:number;clips:Record<string,number[]>}};
type Manifest={version:string;characters:Record<RosterId,RosterModel>};
type RosterTemplate=Pick<GLTF,'scene'|'animations'>;
type PendingInstall={gltf:RosterTemplate;model:RosterModel;variant:Variant;id:RosterId;tier:'low'|'mobile'|'hd'};
type Entry={actor:Actor;id:RosterId;always:boolean;distance:number;failed:boolean;canInstall?:()=>boolean;pending?:PendingInstall;loaded?:{gltf:RosterTemplate;tier:string}};

/** Cap decoded textures before their first GPU upload in Performance mode. */
export function limitRosterTextures(root:T.Object3D,limit:number,makeCanvas=()=>document.createElement('canvas')){
 const textures=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);});
 const resized=new Map<object,HTMLCanvasElement>();
 for(const texture of textures){
  const original=texture.image as (CanvasImageSource&{width:number;height:number;close?:()=>void})|undefined;
  const cached=original&&resized.get(original);if(cached){texture.source.data=cached;texture.needsUpdate=true;continue;}
  if(!original?.width||!original.height||Math.max(original.width,original.height)<=limit)continue;
  const canvas=makeCanvas(),ratio=limit/Math.max(original.width,original.height);canvas.width=Math.max(1,Math.round(original.width*ratio));canvas.height=Math.max(1,Math.round(original.height*ratio));
  const context=canvas.getContext('2d');if(!context)throw Error('Character texture resizing unavailable');
  context.drawImage(original,0,0,canvas.width,canvas.height);texture.source.data=canvas;texture.needsUpdate=true;resized.set(original,canvas);original.close?.();
 }
}

/** Imported animation owns its bones; the legacy combat rig is kept only as a loading fallback. */
export function installRosterVisual(actor:Actor,gltf:RosterTemplate,model:RosterModel,id:RosterId=(actor.group.userData.visualId??'lion-knight')):ActorVisual{
 for(const name of REQUIRED_CHARACTER_CLIPS.filter(name=>name!=='turn'))if(!gltf.animations.some(c=>c.name===name))throw Error(`Roster model is missing ${name}`);
 const instance=clone(gltf.scene),base=instance.getObjectByName('ContactBase'),tip=instance.getObjectByName('ContactTip');
 if(!base||!tip)throw Error('Roster model is missing contact sockets');
 let skinned=0;instance.traverse(o=>{if(o instanceof T.SkinnedMesh){skinned++;o.frustumCulled=false;}if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 if(!skinned)throw Error('Roster model has no weighted skeleton');
 instance.updateMatrixWorld(true);
 const bounds=model.bounds?new T.Box3(new T.Vector3(...model.bounds.min),new T.Vector3(...model.bounds.max)):new T.Box3().setFromObject(instance),size=bounds.getSize(new T.Vector3());
 if(!Number.isFinite(size.y)||size.y<.01)throw Error('Roster model has invalid bounds');
 const wrapper=new T.Group(),scale=model.height/size.y;
 wrapper.name='September character';wrapper.rotation.y=model.yaw;wrapper.scale.setScalar(scale);
 instance.position.sub(new T.Vector3((bounds.min.x+bounds.max.x)/2,bounds.min.y,(bounds.min.z+bounds.max.z)/2));wrapper.add(instance);
 if(model.contactSockets!=='embedded'&&['lion-knight','silver-knight','dusk-rogue','knife-rogue','skeleton-warrior','golem','shrouded-skeleton','ember-dragon'].includes(id)){const units=scale/base.parent!.getWorldScale(new T.Vector3()).y;base.position.set(0,.08*units,0);tip.position.set(0,(id==='knife-rogue'?.7:['golem','shrouded-skeleton','ember-dragon'].includes(id)?.38:1.05)*units,0);}
 const disposeEquipment=model.equipment==='embedded'?()=>{}:attachRosterEquipment(instance,id,scale);
 const muzzle=instance.getObjectByName('EquippedMuzzle')??(id==='ranger'?instance.getObjectByName('LeftHand'):undefined);
 const restY=instance.position.y;
 const mixer=new T.AnimationMixer(instance),actions=new Map(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
 const presentation=new RosterPresentation(wrapper);
 let current:T.AnimationAction|undefined,dead=false,strikeState:{strike:Strike;elapsed:number}|undefined;
 const sample=(name:string,time:number,loop=false)=>{
  presentation.restore();
  wrapper.rotation.y=model.yaw;
  const next=actions.get(name)!;
  if(current!==next){mixer.stopAllAction();next.reset().play();next.setLoop(T.LoopOnce,1);next.clampWhenFinished=true;current=next;}
  next.paused=true;next.enabled=true;next.setEffectiveWeight(1);
  const duration=next.getClip().duration;
  next.time=loop?((time%duration)+duration)%duration:T.MathUtils.clamp(time,0,duration);
  mixer.update(0);
  const ground=model.grounding?.clips[name];if(ground?.length){const at=next.time/duration*(ground.length-1),lo=Math.floor(at),hi=Math.min(ground.length-1,lo+1),minimum=T.MathUtils.lerp(ground[lo],ground[hi],at-lo),correction=model.grounding!.restMinY-minimum;instance.position.y=restY+(['dodge','hit','death'].includes(name)?Math.max(0,correction):correction);}else instance.position.y=restY;
 };
 const strike=(s:Strike,elapsed:number)=>{
  strikeState={strike:s,elapsed};
  const duration=actions.get(s.id)!.getClip().duration,[wind,contact]=Array.isArray(model.contactPhase)?model.contactPhase:model.contactPhase[s.id];
  const time=elapsed<s.windup?elapsed/s.windup*wind:elapsed<s.windup+s.active?wind+(elapsed-s.windup)/s.active*(contact-wind):contact+(elapsed-s.windup-s.active)/s.recovery*(1-contact);
  sample(s.id,time*duration);
  const turn=Math.min(1,elapsed/Math.max(.01,s.windup*.65),Math.max(0,(s.windup+s.active+s.recovery-elapsed)/(s.recovery*.5)));wrapper.rotation.y=model.yaw+(model.strikeYaw??0)*T.MathUtils.smoothstep(turn,0,1);
 };
 const previous=actor.visual;
 previous?.dispose();
 const fallback=actor.group.children.map(object=>({object,visible:object.visible}));
 fallback.forEach(({object})=>{object.visible=false;});actor.group.add(wrapper);
 const visual:ActorVisual={
  beginFrame:()=>presentation.begin(),present:dt=>presentation.present(current?.getClip().name??'idle',dt,strikeState),resetPresentation:()=>{presentation.reset();dead=false;strikeState=undefined;sample('idle',0,true);},strike,
  locomotion:(time,moving)=>{
   if(dead)return;
   strikeState=undefined;
   const dx=Number(actor.group.userData.localMoveX??0),dz=Number(actor.group.userData.localMoveZ??moving);
   const name=Math.abs(moving)<.05?'idle':Math.abs(dx)>Math.abs(dz)*1.2?(dx<0?'strafe_left':'strafe_right'):dz<-.1?'backward':'forward';
   sample(name,time,true);
  },
  reaction:(kind,elapsed)=>{strikeState=undefined;dead=kind==='death';const window=kind==='death'?.8:kind==='dodge'?.5:.3;sample(kind,elapsed/window*actions.get(kind)!.getClip().duration);},
  lod:()=>{},
  muzzle:out=>{if(!muzzle)return false;actor.group.updateMatrixWorld(true);muzzle.getWorldPosition(out);return true;},
  segment:(a,b)=>{actor.group.updateMatrixWorld(true);base.getWorldPosition(a);tip.getWorldPosition(b);},
  dispose:()=>{disposeEquipment();mixer.stopAllAction();mixer.uncacheRoot(instance);const skeletons=new Set<T.Skeleton>();instance.traverse(o=>{if(o instanceof T.SkinnedMesh)skeletons.add(o.skeleton);});skeletons.forEach(s=>s.dispose());wrapper.removeFromParent();fallback.forEach(({object,visible})=>{object.visible=visible;});if(actor.visual===visual){actor.visual=undefined;delete actor.group.userData.activeLod;delete actor.group.userData.assetVersion;}},
 };
 sample('idle',0,true);actor.visual=visual;actor.group.userData.activeLod=0;actor.group.userData.assetVersion=model.contentVersion??'september-8-2026';return visual;
}

/** Stream nearby characters serially to bound texture decoding and GPU upload memory. */
export class RosterAssets{
 private entries:Entry[]=[];private stopped=false;private working=false;private tier:'low'|'mobile'|'hd';private controller=new AbortController();private manifest:Promise<Manifest>;
 readonly status:Record<string,string>={};readonly sources:Record<string,{url:string;sha256:string;tier:string}>={};pendingLoads=0;manifestVersion:string|null=null;
 constructor(quality:string,mobile:boolean,private invalidate:()=>void,private onError:()=>void){
  this.tier=quality==='low'?'low':mobile?'mobile':'hd';
  this.manifest=fetch(ROSTER_MANIFEST_URL,{signal:this.controller.signal}).then(async r=>{if(!r.ok)throw Error('Roster manifest unavailable');const manifest=await r.json() as Manifest;this.manifestVersion=manifest.version;return manifest;});
  void this.manifest.catch(()=>{});
 }
 setHero(id:RosterId){const e=this.entries.find(entry=>entry.always);if(!e||e.id===id)return;this.discardPending(e);if(e.loaded){e.actor.visual?.dispose();disposeTree(e.loaded.gltf.scene,true);e.loaded=undefined;}delete this.sources[e.id];this.status[e.id]='dormant';e.id=id;e.actor.group.userData.visualId=id;e.failed=false;void this.refresh();}
 register(actor:Actor,id:RosterId,always=false,canInstall?:()=>boolean){actor.group.userData.visualId=id;this.entries.push({actor,id,always,distance:Infinity,failed:false,canInstall});}
 /** Guarded entries install only here, before the owner admits any new actions. */
 flushPendingInstalls(){
  if(this.stopped)return;
  for(const e of this.entries)if(e.pending){
   if(!this.pendingIsCurrent(e))this.discardPending(e);
   else if(!e.canInstall||e.canInstall())this.installPending(e);
  }
  void this.refresh();
 }
 get pendingInstalls(){return this.entries.filter(e=>e.pending).length;}
 private pendingIsCurrent(e:Entry){const p=e.pending;return !!p&&!this.stopped&&p.id===e.id&&p.tier===this.tier&&e.distance<=52&&e.actor.group.visible&&e.actor.group.userData.deathAge===undefined;}
 private discardPending(e:Entry){const p=e.pending;if(!p)return;e.pending=undefined;disposeTree(p.gltf.scene,true);this.status[e.id]=e.loaded?'ready':'dormant';}
 private installPending(e:Entry){
  const p=e.pending;if(!p)return;e.pending=undefined;
  try{
   const old=e.loaded;installRosterVisual(e.actor,p.gltf,p.model,p.id);e.loaded={gltf:p.gltf,tier:p.tier};
   if(old)disposeTree(old.gltf.scene,true);this.sources[e.id]={...p.variant,tier:p.tier};this.status[e.id]='ready';this.invalidate();
  }catch{disposeTree(p.gltf.scene,true);e.failed=true;this.status[e.id]='fallback';this.onError();}
 }
 setQuality(quality:string,mobile:boolean){
  const tier=quality==='low'?'low':mobile?'mobile':'hd';if(tier===this.tier)return;this.tier=tier;
  for(const e of this.entries){
   this.discardPending(e);e.failed=false;
   // Hidden retained characters do not enter the visible load queue. Release
   // their old tier now so Performance mode cannot keep hidden HD textures.
   if(!e.actor.group.visible){if(e.loaded){e.actor.visual?.dispose();disposeTree(e.loaded.gltf.scene,true);e.loaded=undefined;delete this.sources[e.id];this.invalidate();}this.status[e.id]='dormant';}
  }
  void this.refresh();
 }
 update(hero:T.Vector3){
  for(const e of this.entries){
   e.distance=e.always?0:e.actor.group.position.distanceTo(hero);
   if(e.pending&&!this.pendingIsCurrent(e))this.discardPending(e);
   // Living enemies are hidden at 36m. Keep their decoded model until 52m so
   // walking back across that visibility boundary does not trigger another load.
   const retired=!e.actor.group.visible&&e.actor.group.userData.deathAge!==undefined;
   if(e.loaded&&(e.distance>52||retired)){e.actor.visual?.dispose();disposeTree(e.loaded.gltf.scene,true);e.loaded=undefined;delete this.sources[e.id];this.status[e.id]='dormant';this.invalidate();}
  }
  void this.refresh();
 }
 private async refresh(){
  if(this.stopped||this.working||this.pendingInstalls>0)return;
  const e=this.entries.filter(e=>e.actor.group.visible&&e.actor.group.userData.deathAge===undefined&&!e.failed&&e.distance<36&&e.loaded?.tier!==this.tier).sort((a,b)=>a.distance-b.distance)[0];if(!e)return;
  this.working=true;this.pendingLoads++;const tier=this.tier,id=e.id;this.status[id]='loading';let incoming:GLTF|undefined;
  try{
   const manifest=await this.manifest,model=manifest.characters[id];if(!model)throw Error('Missing roster entry');const variant=model.variants[tier==='low'?'mobile':tier];
   const response=await fetch(variant.url,{signal:this.controller.signal});if(!response.ok)throw Error(`Character HTTP ${response.status}`);const bytes=await response.arrayBuffer();
   const obsolete=()=>this.stopped||tier!==this.tier||e.id!==id||e.distance>52||!e.actor.group.visible||e.actor.group.userData.deathAge!==undefined;
   if(obsolete()){if(!this.stopped&&e.id===id&&tier===this.tier)this.status[id]=e.loaded?'ready':'dormant';return;}
   if(crypto.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes);if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==variant.sha256)throw Error('Character checksum mismatch');}
   incoming=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,variant.url.slice(0,variant.url.lastIndexOf('/')+1));
   if(obsolete()){disposeTree(incoming.scene,true);incoming=undefined;if(!this.stopped&&e.id===id&&tier===this.tier)this.status[id]=e.loaded?'ready':'dormant';return;}
   if(tier==='low')limitRosterTextures(incoming.scene,512);
   // GLTF.parser retains the original BIN and image buffer caches. The active
   // model needs only these two fields; release the parser after installation.
   e.pending={gltf:{scene:incoming.scene,animations:incoming.animations},model,variant,id,tier};incoming=undefined;
   // One decoded pending template bounds transient memory. Async completion may
   // never swap a guarded actor, even if its guard becomes true between ticks.
   if(!e.canInstall)this.installPending(e);
   else this.invalidate();
  }catch{if(incoming)disposeTree(incoming.scene,true);if(!this.stopped&&e.id===id&&tier===this.tier){e.failed=true;this.status[id]='fallback';this.onError();}}
  finally{this.pendingLoads--;this.working=false;if(!this.stopped)void this.refresh();}
 }
 dispose(){this.stopped=true;this.controller.abort();for(const e of this.entries){this.discardPending(e);if(e.loaded){e.actor.visual?.dispose();disposeTree(e.loaded.gltf.scene,true);e.loaded=undefined;}}this.entries=[];}
}
