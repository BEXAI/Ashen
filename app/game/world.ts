import { applyWorldSurfaceUV } from './surface-uv';
import * as T from 'three';
import { WORLD, type Progress } from './model';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { Surface } from './graphics';
import { ROOMS, CORRIDORS, GATES, gateOpen } from './dungeon';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { buildDungeonArt, type RoomChunk } from './dungeon-art';

let seed=72139;
export function rand(){ seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; }
export function height(x:number,z:number) { void x; void z; return 0; }
import { knight, type Actor } from './character-skins';
import { applyStrikePose } from './combat-animation';
import { STRIKES, strikeDuration } from './combat';
export { knight, type Actor } from './character-skins';
export type TorchFixture={roomId:string;side:number;wallX:number;z:number;fallback:T.Group;flame:T.Mesh};
export type WorldScene={architectureFallbacks:Map<string,T.Object3D[]>;fixtures:TorchFixture[];scene:T.Scene,sun:T.DirectionalLight,hero:Actor,keeper:Actor,shrines:{id:string,group:T.Group,light:T.PointLight,flame:T.Mesh}[],chests:{id:string,group:T.Group,lid:T.Group}[],fires:{light:T.PointLight,flame:T.Mesh}[],water:T.ShaderMaterial,embers:T.Points,colliders:{x:number,z:number,r:number}[],materials:T.Material[],surfaces:Surface[],sky:T.Mesh,reflector:Reflector,architecture:T.Mesh,gates:T.Mesh[],chunks:RoomChunk[]};
const metal=new T.MeshPhysicalMaterial({color:'#77838b',metalness:.92,roughness:.29,clearcoat:.28,clearcoatRoughness:.36});
const trim=new T.MeshPhysicalMaterial({color:'#ba9760',metalness:.9,roughness:.35,clearcoat:.12});
const leather=new T.MeshStandardMaterial({color:'#1d2020',roughness:.98});
const swordmat=new T.MeshPhysicalMaterial({color:'#becbd3',metalness:1,roughness:.16,clearcoat:.4});
export function animateActor(a:Actor,t:number,moving:number,attack:number) {
 if(a.visual){a.visual.locomotion(t,moving);if(attack>0)applyStrikePose(a,STRIKES[0],(1-T.MathUtils.clamp(attack,0,1))*strikeDuration(STRIKES[0]));return;}
 a.legs[0].rotation.x=Math.sin(t*9)*moving*.65;a.legs[1].rotation.x=-Math.sin(t*9)*moving*.65;
 a.knees[0].rotation.x=Math.max(0,-Math.sin(t*9))*moving*.6;a.knees[1].rotation.x=Math.max(0,Math.sin(t*9))*moving*.6;
 a.torso.rotation.set(Math.sin(t*2)*.008,Math.sin(t*9)*moving*.035,0);
 a.arms[0].rotation.set(-.28-Math.sin(t*9)*moving*.3,.1,.18);
 a.arms[1].rotation.set(-.35+Math.sin(t*9)*moving*.24,-.1,-.15);
 a.elbows[0].rotation.set(-.55,0,0);a.elbows[1].rotation.set(-.45,0,0);
 a.wrists[0].rotation.set(.12,0,0);a.wrists[1].rotation.set(.35,0,0);
 a.body.position.y=Math.abs(Math.sin(t*9))*moving*.06;
 if(attack>0)applyStrikePose(a,STRIKES[0],(1-T.MathUtils.clamp(attack,0,1))*strikeDuration(STRIKES[0]));
 if(!a.cape.visible)return;
 const pos=a.cape.geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const y=pos.getY(i),x=pos.getX(i),k=(.8-y)/1.6;pos.setZ(i,Math.sin(t*3+x*5+y*2)*.09*k-(moving*.32)*k*k);}
 pos.needsUpdate=true;
}

export function createWorld(p:Progress,quality:string):WorldScene {
 seed=72139;
 const scene=new T.Scene();scene.background=new T.Color('#1c2733');scene.fog=new T.FogExp2('#293746',.014);
 const materials:T.Material[]=[metal,trim,leather,swordmat];
 const stone=new T.MeshStandardMaterial({color:'#aaa399',roughness:.88,normalScale:new T.Vector2(.8,.8)});
 const floor=new T.MeshStandardMaterial({color:'#9b9991',roughness:.82,normalScale:new T.Vector2(1.1,1.1)});
 const iron=new T.MeshPhysicalMaterial({color:'#423e36',metalness:.85,roughness:.42,clearcoat:.16});
 const grout=new T.MeshStandardMaterial({color:'#242626',roughness:1});
 materials.push(stone,floor,iron,grout);
 function mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=scene){
  const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 }
 const geometry:T.BufferGeometry[]=[];
 function wall(x:number,y:number,z:number,w:number,h:number,d:number){
  const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);applyWorldSurfaceUV(g);geometry.push(g);
 }
 const colliders:{x:number,z:number,r:number}[]=[];
 const architectureFallbacks=new Map<string,T.Object3D[]>(),architectureGroups:{roomId:string;group:T.Group}[]=[];
 function replaceable(id:string,roomId:string){const group=new T.Group();group.name=id;group.userData.runtimeFixture=true;scene.add(group);architectureFallbacks.set(id,[group]);architectureGroups.push({roomId,group});return group;}
 for(const room of [...ROOMS,...CORRIDORS]){
  const g=new T.PlaneGeometry(room.width,room.depth);g.rotateX(-Math.PI/2);g.translate(room.x,0,room.z);applyWorldSurfaceUV(g);
  mesh(g,floor,0,0,0);
  wall(-room.width/2-.45,4.5,room.z,.9,9,room.depth);
  wall(room.width/2+.45,4.5,room.z,.9,9,room.depth);
  wall(0,9.3,room.z,room.width+.9,.6,room.depth);
 }
 ROOMS.forEach((room,i)=>{
  for(const [edge,open] of [[room.z-room.depth/2,i<ROOMS.length-1],[room.z+room.depth/2,i>0]] as [number,boolean][]){
   if(open){
    const w=room.width/2-3;wall(-(3+w/2),4.5,edge-.02,w,9,.9);wall(3+w/2,4.5,edge-.02,w,9,.9);wall(0,8,edge,6,2,.9);
    const parent=edge===room.z-room.depth/2?replaceable(`threshold-${i}`,room.id):scene;
    const arch=mesh(new T.TorusGeometry(3.2,.32,8,24,Math.PI),stone,0,4,edge,parent);arch.scale.z=1.6;
    for(const side of [-1,1])mesh(new RoundedBoxGeometry(.7,4,1,2,.1),stone,side*3.25,2,edge,parent);
   }else wall(0,4.5,edge,room.width,9,.9);
  }
  // Repeated ribs and pilasters give the ceiling depth without thousands of draw calls.
  for(let z=room.z-room.depth/2+3;z<room.z+room.depth/2;z+=6){
   const rib=mesh(new T.TorusGeometry(room.width/2-.4,.22,6,32,Math.PI),stone,0,5.1,z);rib.scale.y=3.7/(room.width/2-.4);
   for(const side of [-1,1]){
    const parent=room.id==='crown'&&[-45,-33].includes(z)?replaceable(`chapel-pillar-${side}-${z}`,room.id):scene;
    mesh(new RoundedBoxGeometry(.7,5.2,.9,2,.08),stone,side*(room.width/2-.35),2.6,z,parent);
    mesh(new RoundedBoxGeometry(1.1,.35,1.2,2,.06),stone,side*(room.width/2-.35),5.05,z,parent);
   }
  }
 });
 const merged=mergeGeometries(geometry)!;geometry.forEach(g=>g.dispose());
 merged.boundsTree=new MeshBVH(merged);
 const architecture=new T.Mesh(merged,stone);architecture.raycast=acceleratedRaycast;architecture.castShadow=true;architecture.receiveShadow=true;scene.add(architecture);
 // Chipped edging, burial niches, and masonry fragments are instanced for mobile GPUs.
 const pieces:T.Matrix4[]=[],dummy=new T.Object3D();
 for(const room of ROOMS)for(const side of [-1,1]){
  for(let z=room.z-room.depth/2+1.5;z<room.z+room.depth/2-1;z+=2.1){
   dummy.position.set(side*(room.width/2-.15),.3,z);dummy.scale.set(.55,.55,1.96);dummy.rotation.set(0,0,0);dummy.updateMatrix();pieces.push(dummy.matrix.clone());
   for(const y of [2.6,5.3]){
    const niche=mesh(new T.BoxGeometry(.08,.85,1.35),grout,side*(room.width/2-.5),y,z);
    niche.castShadow=false;
   }
  }
 }
 const edging=new T.InstancedMesh(new RoundedBoxGeometry(1,1,1,2,.08),stone,pieces.length);pieces.forEach((m,i)=>edging.setMatrixAt(i,m));edging.castShadow=true;edging.receiveShadow=true;scene.add(edging);
 scene.add(new T.HemisphereLight('#c4d2e0','#737d89',.95));
 const sun=new T.DirectionalLight('#ffd3a2',1.5);sun.position.set(5,8,55);sun.castShadow=quality!=='low';sun.shadow.mapSize.setScalar(quality==='high'?2048:1024);Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.1,far:45});sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
 const sky=new T.Mesh(new T.SphereGeometry(1),new T.MeshBasicMaterial());sky.visible=false;
 const fires:{light:T.PointLight,flame:T.Mesh}[]=[];const fixtures:TorchFixture[]=[];
 function fire(parent:T.Object3D,x:number,y:number,z:number,size=1,color='#ffab55'){
  const light=new T.PointLight(color,28*size,20,2);light.position.set(x,y+.7,z);light.userData.baseIntensity=28*size;parent.add(light);
  const flame=mesh(new T.PlaneGeometry(.66,1.1),new T.MeshBasicMaterial({color,toneMapped:false,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}),x,y+.4,z,parent);flame.scale.set(size,size,1);flame.castShadow=false;flame.userData.baseScale=size;fires.push({light,flame});return {light,flame};
 }
 ROOMS.forEach(room=>{for(const side of [-1,1]){
  const x=side*(room.width/2-1),z=room.z;
  const fallback=new T.Group();fallback.name=`torch-fallback-${room.id}-${side}`;fallback.userData.runtimeFixture=true;scene.add(fallback);
  const fixtureParent=fallback;
  const bracket=mesh(new T.CylinderGeometry(.08,.1,.9,8),iron,x,2.4,z,fixtureParent);bracket.rotation.z=side*.35;
  mesh(new T.CylinderGeometry(.3,.18,.25,10),iron,x,2.9,z,fixtureParent);const f=fire(scene,x,3,z,1.4);fixtures.push({roomId:room.id,side,wallX:side*room.width/2,z,fallback,flame:f.flame});
 }});
 mesh(new T.CylinderGeometry(1.2,1.5,.3,16),stone,0,.15,45);fire(scene,0,.5,45,1.3);
 const keeper=knight();keeper.group.position.set(-4,0,43);keeper.group.rotation.y=2.5;scene.add(keeper.group);(keeper.cape.material as T.MeshStandardMaterial).color.set('#736443');
 const shrines=WORLD.shrines.map(s=>{
  const group=new T.Group();group.position.set(s.x,0,s.z);scene.add(group);
  mesh(new T.CylinderGeometry(1.4,1.8,.4,16),stone,0,.2,0,group);mesh(new T.CylinderGeometry(.45,.6,1.1,12),stone,0,.95,0,group);
  mesh(new T.TorusGeometry(.65,.12,8,24),trim,0,1.55,0,group).rotation.x=Math.PI/2;
  const f=fire(group,0,1.5,0,1,p.shrines.includes(s.id)?'#8cd6ec':'#d08239');return {id:s.id,group,...f};
 });
 const chests=WORLD.chests.map(c=>{
  const group=new T.Group();group.position.set(c.x,0,c.z);scene.add(group);
  mesh(new RoundedBoxGeometry(1.2,.8,.8,2,.06),leather,0,.4,0,group);const lid=new T.Group();lid.position.set(0,.76,-.4);group.add(lid);mesh(new RoundedBoxGeometry(1.2,.22,.85,2,.06),iron,0,0,.4,lid);
  for(const x of [-.4,.4])mesh(new T.BoxGeometry(.09,.82,.88),trim,x,.45,0,group);
  if(p.chests.includes(c.id))lid.rotation.x=-1.2;return{id:c.id,group,lid};
 });
 const gates=GATES.map((g,i)=>{
  const gate=mesh(new T.BoxGeometry(6,6.8,.28),new T.MeshStandardMaterial({color:'#59482d',transparent:true,opacity:.18,metalness:.7,roughness:.4}),0,3.4,g.z);
  for(let x=-2.8;x<=2.9;x+=.55)mesh(new T.CylinderGeometry(.06,.06,6.6,6),iron,x,0,0,gate);
  for(const y of [-2.3,1.7])mesh(new T.BoxGeometry(6,.16,.3),iron,0,y,0,gate);
  gate.visible=!gateOpen(i,p);return gate;
 });
 // Shallow water catches torch reflections in the ossuary.
 const shader=(Reflector as typeof Reflector & {ReflectorShader:{uniforms:Record<string,T.IUniform>,vertexShader:string,fragmentShader:string}}).ReflectorShader;
 const normals=new T.TextureLoader().load('/assets/water-normal.jpg');normals.wrapS=normals.wrapT=T.RepeatWrapping;
 const waterShader={uniforms:{...T.UniformsUtils.clone(shader.uniforms),time:{value:0},waterNormals:{value:normals}},vertexShader:shader.vertexShader,fragmentShader:shader.fragmentShader.replace('uniform vec3 color;','uniform vec3 color; uniform float time; uniform sampler2D waterNormals;').replace('vec4 base = texture2DProj( tDiffuse, vUv );','vec4 uv=vUv; vec3 n=texture2D(waterNormals,vUv.xy/max(vUv.w,0.001)*8.0+time*0.003).rgb; uv.xy+=(n.rg-0.5)*0.012*uv.w; vec4 base=texture2DProj(tDiffuse,uv); base.rgb=mix(vec3(0.025,0.035,0.038),base.rgb,0.65);')};
 const reflector=new Reflector(new T.CircleGeometry(3.7,48),{color:0x747c80,textureWidth:quality==='high'?768:384,textureHeight:quality==='high'?768:384,shader:waterShader,multisample:0});reflector.rotation.x=-Math.PI/2;reflector.position.set(7,.025,-8);scene.add(reflector);
 const renderReflection=reflector.onBeforeRender.bind(reflector);reflector.onBeforeRender=(renderer,world,camera,g,m,group)=>{if(!world.overrideMaterial&&reflector.userData.enabled)renderReflection(renderer,world,camera,g,m,group);};
 reflector.userData.enabled=quality!=='low';
 const water=reflector.material as T.ShaderMaterial;
 const wetStone=new T.MeshPhysicalMaterial({color:'#3c4547',roughness:.25,metalness:.1,clearcoat:.65});const wetPatch=mesh(new T.CircleGeometry(3.75,48),wetStone,7,.018,-8);wetPatch.rotation.x=-Math.PI/2;
 // A raised throne and hanging standards anchor the final encounter.
 mesh(new T.BoxGeometry(8,.3,5),stone,0,.15,-78);mesh(new RoundedBoxGeometry(2.5,4,.5,2,.12),iron,0,2.2,-80);mesh(new T.BoxGeometry(2.5,.5,2),stone,0,.7,-79);
 for(const side of [-1,1]){const banner=mesh(new T.PlaneGeometry(2.4,4.6,8,12),new T.MeshPhysicalMaterial({color:'#4d1d20',roughness:1,sheen:.8,side:T.DoubleSide}),side*5,5,-81.4);banner.rotation.z=side*.02;}
 const hero=knight();hero.group.position.set(p.x,0,p.z);hero.group.rotation.y=Math.PI;scene.add(hero.group);
 const emberGeo=new T.BufferGeometry(),arr=new Float32Array(100*3);for(let i=0;i<arr.length;i+=3){arr[i]=(rand()-.5)*24;arr[i+1]=rand()*8;arr[i+2]=(rand()-.5)*24;}
 emberGeo.setAttribute('position',new T.BufferAttribute(arr,3));const embers=new T.Points(emberGeo,new T.PointsMaterial({color:'#c2b99f',size:.025,transparent:true,opacity:.25,depthWrite:false}));scene.add(embers);
 scene.updateMatrixWorld(true);
 const world:WorldScene={architectureFallbacks,fixtures,scene,sun,hero,keeper,shrines,chests,fires,water,embers,colliders,materials,surfaces:[{material:floor,family:'floor',repeat:1},{material:stone,family:'wall',repeat:1}],sky,reflector,architecture,gates,chunks:[]};
 world.chunks=buildDungeonArt(world);
 // Shared masonry enables vertex colors in the room batches. Unbatched shrine
 // and replacement fallbacks need neutral colors too, otherwise they render black.
 scene.traverse(object=>{if(!(object instanceof T.Mesh)||object.geometry.attributes.color)return;const list=Array.isArray(object.material)?object.material:[object.material];if(list.some(m=>(m as T.MeshStandardMaterial).vertexColors))object.geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(object.geometry.attributes.position.count*3).fill(1),3));});
 // These removable fixtures share room visibility but survive asynchronous room replacements.
 for(const {roomId,group}of architectureGroups)world.chunks.find(c=>c.id===roomId)!.group.add(group);
 for(const fixture of fixtures)world.chunks.find(c=>c.id===fixture.roomId)!.group.add(fixture.fallback);
 return world;
}
