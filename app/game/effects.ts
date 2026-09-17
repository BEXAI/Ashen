import * as T from 'three';
import type { WorldScene } from './world';

/** Fixed capacity and one draw, even during overlapping melee/casting impacts. */
export class ImpactPool {
 readonly points:T.Points;
 private positions:Float32Array;private colors:Float32Array;private velocities:Float32Array;private life:Float32Array;private age:Float32Array;private opacity:Float32Array;private stationary:Uint8Array;private cursor=0;
 constructor(scene:T.Scene,readonly capacity=96){
  this.positions=new Float32Array(capacity*3).fill(-1000);this.colors=new Float32Array(capacity*3);this.velocities=new Float32Array(capacity*3);this.life=new Float32Array(capacity);this.age=new Float32Array(capacity);this.opacity=new Float32Array(capacity);this.stationary=new Uint8Array(capacity);
  const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage)).setAttribute('color',new T.BufferAttribute(this.colors,3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('particleLife',new T.BufferAttribute(this.opacity,1).setUsage(T.DynamicDrawUsage));
  const material=new T.PointsMaterial({size:.095,vertexColors:true,transparent:true,opacity:.85,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float particleLife; varying float vParticleLife;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('gl_PointSize = size;','gl_PointSize = size * (0.45 + 0.55 * particleLife); vParticleLife = particleLife;');
   shader.fragmentShader='varying float vParticleLife;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','float radius = length(gl_PointCoord - vec2(0.5));\ndiffuseColor.a *= (1.0 - smoothstep(0.12, 0.5, radius)) * vParticleLife;\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey=()=> 'ashen-contact-v9';
  this.points=new T.Points(geometry,material);this.points.frustumCulled=false;this.points.name='pooled contact fragments';scene.add(this.points);
 }
 burst(x:number,y:number,z:number,color:string,count:number,random:()=>number){
  const c=new T.Color(color);for(let n=0;n<Math.min(count,this.capacity);n++){
   const i=this.cursor++%this.capacity,p=i*3;this.stationary[i]=0;this.positions.set([x+(random()-.5)*.24,y+random()*.24,z+(random()-.5)*.24],p);this.colors.set(c.toArray(),p);
   this.velocities.set([(random()-.5)*3,1+random()*3,(random()-.5)*3],p);this.life[i]=.25+random()*.4;this.age[i]=0;this.opacity[i]=1;
  }
 }
 /** A contact burst uses the accepted blade/capsule point; reduced motion gets a short static flash. */
 contact(x:number,y:number,z:number,nx:number,nz:number,color:string,count:number,random:()=>number,stationary=false){
  const length=Math.hypot(nx,nz)||1;nx/=length;nz/=length;const c=new T.Color(color);
  for(let n=0;n<Math.min(stationary?2:count,this.capacity);n++){
   const i=this.cursor++%this.capacity,p=i*3;this.stationary[i]=stationary?1:0;
   this.positions.set([x+(random()-.5)*.035,y+(random()-.5)*.035,z+(random()-.5)*.035],p);this.colors.set(c.toArray(),p);
   const side=(random()-.5)*.9,speed=.65+random()*.7;
   this.velocities.set(stationary?[0,0,0]:[nx*speed-nz*side,.4+random()*.8,nz*speed+nx*side],p);
   this.life[i]=stationary?.12:.16+random()*.06;this.age[i]=0;this.opacity[i]=1;
  }
 }
 reset(){this.life.fill(0);this.age.fill(0);this.opacity.fill(0);this.positions.fill(-1000);this.points.visible=false;this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.particleLife.needsUpdate=true;}
 update(dt:number,hidden=false){
  let active=0;for(let i=0;i<this.capacity;i++){
   if(this.age[i]>=this.life[i])continue;this.age[i]+=dt;const p=i*3;
   this.opacity[i]=hidden&&!this.stationary[i]?0:Math.max(0,1-this.age[i]/this.life[i]);
   if(this.age[i]>=this.life[i]){this.positions[p+1]=-1000;continue;}if(!hidden||this.stationary[i])active++;
   for(let j=0;j<3;j++)this.positions[p+j]+=this.velocities[p+j]*dt;
   if(!this.stationary[i])this.velocities[p+1]-=dt*7;this.colors[p]*=Math.exp(-dt*2);this.colors[p+1]*=Math.exp(-dt*2);this.colors[p+2]*=Math.exp(-dt*2);
  }
  this.points.visible=active>0;this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;this.points.geometry.attributes.particleLife.needsUpdate=true;
 }
 dispose(){this.points.removeFromParent();this.points.geometry.dispose();(this.points.material as T.Material).dispose();}
}

export class FlameAtlas {
 private stopped=false;private textures=new Set<T.Texture>();
 private frames=new Map<T.Material,{flameMix:{value:number};flameStep:{value:T.Vector2};flameFloor:{value:number}}>();
 constructor(private world:WorldScene,private invalidate:()=>void){}
 async load(){
  try{const texture=await new T.TextureLoader().loadAsync('/assets/effects/v8/flame-atlas.webp');if(this.stopped){texture.dispose();return;}
   texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;this.textures.add(texture);
   for(const fire of this.world.fires){
    const map=texture.clone();map.repeat.set(240/1024,240/1024);map.needsUpdate=true;this.textures.add(map);const material=fire.flame.material as T.MeshBasicMaterial;
    const uniforms={flameMix:{value:0},flameStep:{value:new T.Vector2()},flameFloor:{value:fire.flame.userData.flameFloor??-10000}};this.frames.set(material,uniforms);
    material.onBeforeCompile=shader=>{
     Object.assign(shader.uniforms,uniforms);
     shader.vertexShader='varying float flameWorldY;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nflameWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
     shader.fragmentShader='uniform float flameMix; uniform vec2 flameStep; uniform float flameFloor; varying float flameWorldY;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(flameWorldY<flameFloor) discard;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(map, vMapUv + flameStep), flameMix);\ndiffuseColor *= sampledDiffuseColor;\n#endif');
    };
    material.customProgramCacheKey=()=> 'ashen-flame-v10';material.map=map;material.needsUpdate=true;
   }this.invalidate();
  }catch{/* The flame geometry remains a restrained luminous flame marker on failure. */}
 }
 update(time:number,camera:T.Camera,reducedMotion:boolean){
  const position=camera.getWorldPosition(new T.Vector3());
  this.world.fires.forEach((f,i)=>{const material=f.flame.material as T.MeshBasicMaterial,map=material.map;if(!map)return;const clock=(reducedMotion?0:time)*12,frame=(Math.floor(clock)+i*3)%16,next=(frame+1)%16;
   map.offset.set(((frame%4)*256+8)/1024,(1024-(Math.floor(frame/4)*256+248))/1024);
   const uniforms=this.frames.get(material);if(uniforms){uniforms.flameFloor.value=f.flame.userData.flameFloor??-10000;uniforms.flameMix.value=reducedMotion?0:T.MathUtils.smoothstep(clock-Math.floor(clock),0,1);uniforms.flameStep.value.set(((next%4)-(frame%4))*.25,(Math.floor(frame/4)-Math.floor(next/4))*.25);}
   const p=f.flame.getWorldPosition(new T.Vector3());f.flame.rotation.y=Math.atan2(position.x-p.x,position.z-p.z);
  });
 }
 dispose(){this.stopped=true;this.textures.forEach(t=>t.dispose());this.textures.clear();this.frames.clear();}
}
