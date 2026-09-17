import * as T from 'three';
import { LIGHTING_PROFILES, lightingAt, roomBlend, torchReachable } from './lighting-profiles';
export { roomBlend } from './lighting-profiles';
import { renderProfile } from './mobile-runtime';
import type { WorldScene } from './world';

const ROOM_FILL=['#85949e','#af9273','#819ba5','#a58a85','#bc895c'];
export const DUNGEON_ENVIRONMENT_INTENSITY=.65;
// Authored low-order directional diffuse irradiance. These are not captured probes.
export function roomProbe(index:number){
 const color=new T.Color(ROOM_FILL[index]),sh=new T.SphericalHarmonics3();
 sh.coefficients[0].set(color.r,color.g,color.b).multiplyScalar(.26);
 sh.coefficients[1].set(.012,.017,.024); // cool overhead recesses
 sh.coefficients[2].set(.014,.008,.003).multiplyScalar(index===4?1.4:1); // warm depth
 sh.coefficients[6].set(-.004,-.005,-.006);
 return sh;
}
export function cryptEnvironment(renderer:T.WebGLRenderer){
 const scene=new T.Scene();scene.background=new T.Color('#26313e');
 // Broad captured vault radiance keeps reflective armor readable between torches.
 const stone=new T.MeshBasicMaterial({color:'#788899',side:T.BackSide});
 scene.add(new T.Mesh(new T.BoxGeometry(14,9,20),stone));
 const ambient=new T.HemisphereLight('#bdccdb','#737d89',.7);scene.add(ambient);
 for(const side of [-1,1]){const light=new T.PointLight('#ffb368',38,18,2);light.position.set(side*5,0,-2);scene.add(light);const glow=new T.Mesh(new T.PlaneGeometry(.35,1.2),new T.MeshBasicMaterial({color:new T.Color(3.2,1.1,.24),side:T.DoubleSide}));glow.position.copy(light.position);glow.rotation.y=side*Math.PI/2;scene.add(glow);}
 const generator=new T.PMREMGenerator(renderer),target=generator.fromScene(scene,0,.1,45);
 scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose();}});generator.dispose();return target;
}

/** Stable fixed-size light pool; changing rooms never increases the shader light count. */
export class DungeonLighting {
 private slots:{light:T.PointLight;source:number;next:number;weight:number}[]=[];private probe=new T.LightProbe();private clock=1;private targetKey=-1;private key=-1;private keyWeight=0;
 private snapSelection=false;private ambient:T.HemisphereLight;private fogColor=new T.Color();
 private positions:T.Vector3[];private probes=ROOM_FILL.map((_,i)=>roomProbe(i));
 constructor(private world:WorldScene){
  this.ambient=world.scene.children.find(o=>o instanceof T.HemisphereLight) as T.HemisphereLight;
  this.positions=world.fires.map(f=>f.light.getWorldPosition(new T.Vector3()));
  for(const fire of world.fires)fire.light.visible=false;
  // Preserve the world's broad fill, including Performance mode and torch gaps.
  world.scene.add(this.probe);
 }
 setQuality(quality:string,mobile:boolean){
  const count=renderProfile(quality,mobile).lights;
  while(this.slots.length>count){this.slots.pop()!.light.removeFromParent();}
  while(this.slots.length<count){const light=new T.PointLight('#ffb36b',0,21,2);this.world.scene.add(light);this.slots.push({light,source:-1,next:-1,weight:0});}
  this.clock=1;
 }
 resetSelection(){this.clock=1;this.snapSelection=true;}
 update(position:T.Vector3,time:number,dt:number,reducedMotion:boolean,shadows:boolean){
  this.clock+=dt;const profile=lightingAt(position.z);
  if(this.clock>=.25){
   this.clock=0;const ranked=this.positions.map((p,i)=>({i,d:p.distanceToSquared(position)})).filter(({i})=>torchReachable(position,this.positions[i],this.world.gates.map(g=>g.visible))).sort((a,b)=>a.d-b.d).slice(0,this.slots.length);
   const wanted=ranked.map(x=>x.i),used=new Set<number>();
   for(const slot of this.slots)if(wanted.includes(slot.source)){slot.next=slot.source;used.add(slot.source);}else slot.next=-1;
   for(const slot of this.slots)if(slot.next<0){slot.next=wanted.find(i=>!used.has(i))??-1;used.add(slot.next);}
   const fixed=ranked.find(x=>!this.world.shrines.some(s=>s.light===this.world.fires[x.i].light));
   if(!fixed)this.targetKey=-1;else if(this.key<0||!wanted.includes(this.key)||fixed.d<this.positions[this.key].distanceToSquared(position)*.72)this.targetKey=fixed.i;else this.targetKey=this.key;
  }
  if(this.snapSelection){for(const slot of this.slots){slot.source=slot.next;slot.weight=slot.source>=0?1:0;}this.key=this.targetKey;this.keyWeight=this.key>=0?1:0;this.snapSelection=false;}
  const blend=1-Math.exp(-Math.max(dt,.016)*9);
  for(const slot of this.slots){
   if(slot.source<0&&slot.next>=0){slot.source=slot.next;slot.weight=1;}
   const desired=slot.source===slot.next?1:0;slot.weight=T.MathUtils.lerp(slot.weight,desired,blend);
   if(slot.weight<.025&&slot.source!==slot.next){slot.source=slot.next;slot.weight=0;}
   if(slot.source<0){slot.light.intensity=0;continue;}
   const fire=this.world.fires[slot.source];slot.light.position.copy(this.positions[slot.source]);slot.light.color.copy(fire.light.color);
   slot.light.intensity=fire.light.userData.baseIntensity*profile.torch*slot.weight*(shadows&&slot.source===this.key?.55:1)*(reducedMotion?1:1+Math.sin(time*9+slot.source)*.055);
  }
  if(this.key<0&&this.targetKey>=0){this.key=this.targetKey;this.keyWeight=1;}
  this.keyWeight=T.MathUtils.lerp(this.keyWeight,this.key>=0&&this.targetKey===this.key?1:0,blend);
  if(this.keyWeight<.025&&this.key!==this.targetKey){this.key=this.targetKey;this.keyWeight=0;}
  if(this.key>=0){const p=this.positions[this.key];this.world.sun.position.copy(p);this.world.sun.target.position.set(p.x*.45,0,p.z-1.5);}
  this.world.sun.intensity=shadows&&this.key>=0?profile.key*this.keyWeight:0;
  const mix=roomBlend(position.z);this.probe.sh.copy(this.probes[mix.b]).lerp(this.probes[mix.a],mix.t);this.probe.intensity=profile.probe;
  this.world.scene.environmentIntensity=profile.environment;this.ambient.intensity=profile.ambient;
  const fog=this.world.scene.fog as T.FogExp2;fog.density=profile.fog;fog.color.set(LIGHTING_PROFILES[mix.b].color).lerp(this.fogColor.set(LIGHTING_PROFILES[mix.a].color),mix.t);
  for(const surface of this.world.surfaces)if(surface.material.lightMap)surface.material.lightMapIntensity=profile.indirect;
  for(let i=0;i<this.world.fires.length;i++){const flame=this.world.fires[i].flame;flame.scale.y=flame.userData.baseScale*(reducedMotion?1:1+Math.sin(time*7+i)*.07);}
 }
 get status(){return {slots:this.slots.length,active:this.slots.filter(s=>s.light.intensity>.01).length,sourceIndices:this.slots.filter(s=>s.light.intensity>.01).map(s=>s.source),shadowKey:this.key};}
 dispose(){this.slots.forEach(s=>s.light.removeFromParent());this.probe.removeFromParent();this.slots=[];}
}
