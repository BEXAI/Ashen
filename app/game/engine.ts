import { RosterAssets } from './roster-assets';
import { ENEMY_ROSTER, DEFAULT_HERO, ROSTER, approachDistance, type HeroId, type RosterId } from './character-roster';
import { AutoController, type AutoDecision } from './auto-controller';
import type { FrameClass } from './frame-measurements';
import { DirectionalTelegraph, bladeContactPoint } from './combat-feedback';
import { ImpactRotation, cameraFollowAlpha } from './camera-feedback';
import { PropAssets } from './prop-assets';
import { ShrineAssets } from './shrine-assets';
import { ArchitectureAssets } from './architecture-assets';
import { lightingAt } from './lighting-profiles';
import { DEFAULT_GRAPHICS, effectiveGraphics, validateGraphics, type GraphicsPreferences } from './graphics-preferences';
import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { GATES, gateOpen, roomAt, dungeonMove, validDungeonSpawn } from './dungeon';
import { CharacterAssets } from './character-assets';
import { ImpactPool, FlameAtlas } from './effects';
import { cryptEnvironment, DungeonLighting, DUNGEON_ENVIRONMENT_INTENSITY } from './dungeon-lighting';
import { DungeonAssets } from './dungeon-assets';
import { AttackSequence, STRIKES, activeInterval, bladeHitsCapsule, createSwing, swingPhase, swingStep, travelBetween, type Swing } from './combat';
import { applyStrikePose, bladeSegment, combatFootwork, WeaponTrail } from './combat-animation';
import { SurfaceTextures, renderResolution, mobileAutoResolution } from './graphics';
import { RenderLoop, renderProfile } from './mobile-runtime';
import { createWorld, height, knight, animateActor, rand, type Actor, type WorldScene } from './world';
import { WORLD, damage, maxHealth, level, type Progress } from './model';
import { BENCHMARK_VIEWS, FrameDiagnostics, visibleCharacterLodCounts, type BenchmarkView } from './visual-bench';

export type Hud={p:Progress,healthMax:number,stamina:number,castCd:number,dodgeCd:number,prompt:string,region:string,boss:{hp:number,max:number}|null,heading:number,enemies:{x:number,z:number}[],damageFlash:number,renderSize:{width:number,height:number}};
export type GameEvent={type:'notice'|'keeper'|'death'|'victory'|'milestone'|'graphics-lost',text?:string};
type Enemy={id:Progress['defeated'][number],actor:Actor,hp:number,max:number,x:number,z:number,spawnX:number,spawnZ:number,cool:number,swing:Swing|null,attackIndex:number,stagger:number,trail:WeaponTrail,dead:boolean,ring:T.Mesh,telegraph:DirectionalTelegraph,hit:number};
type Effect={mesh:T.Mesh,age:number,life:number,expand:number};
class Sound {
 ctx:AudioContext|null=null;master:GainNode|null=null;enabled=true;
 ensure(){if(!this.enabled)return;try{if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=.22;this.master.connect(this.ctx.destination);}if(this.ctx.state!=='running'&&this.ctx.state!=='closed')void this.ctx.resume().catch(()=>{});}catch{}}
 tone(freq:number,time=.14,type:OscillatorType='sine',volume=.2){this.ensure();if(!this.ctx||!this.master||!this.enabled)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.45),this.ctx.currentTime+time);g.gain.setValueAtTime(volume,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+time);o.connect(g);g.connect(this.master);o.start();o.stop(this.ctx.currentTime+time);o.onended=()=>{o.disconnect();g.disconnect();};}
 suspend(){if(this.ctx&&this.ctx.state!=='closed')void this.ctx.suspend().catch(()=>{});}
 close(){if(this.ctx&&this.ctx.state!=='closed')void this.ctx.close().catch(()=>{});}
}
export function stopCameraAtWall(target:T.Vector3,position:T.Vector3,hit:number){
 if(Number.isFinite(hit)){const direction=position.clone().sub(target).normalize();position.copy(target).addScaledVector(direction,Math.max(.25,hit-.3));}
 return position;
}
export class GameEngine {
 private bloom:UnrealBloomPass|null=null;private adaptiveTransitions:AutoDecision[]=[];
 private cameraImpact=new ImpactRotation();private contactPosition=new T.Vector3();private cameraNeedsSnap=true;
 private metrics=new FrameDiagnostics();private benchmarkView:BenchmarkView|null=null;
 private dungeonLighting:DungeonLighting|null=null;
 private dungeonAssets:DungeonAssets|null=null;private props:PropAssets|null=null;private shrineAssets:ShrineAssets|null=null;private architectureAssets:ArchitectureAssets|null=null;
 private world:WorldScene;private renderer:T.WebGLRenderer;private camera:T.PerspectiveCamera;private composer:EffectComposer|null=null;
 private roster:RosterAssets|null=null;
 private characters:CharacterAssets|null=null;private impacts:ImpactPool|null=null;private flames:FlameAtlas|null=null;private fxaa:ShaderPass|null=null;private ao:GTAOPass|null=null;private surfaces:SurfaceTextures;private lighting:T.WebGLRenderTarget|null=null;private sightRay=new T.Raycaster();
 private p:Progress;private enemies:Enemy[]=[];private actorList:Actor[]=[];private effects:Effect[]=[];private sound=new Sound();
 private keys=new Set<string>();private stick={x:0,y:0};private touchSprint=false;private attackHeld=false;private loop:RenderLoop|null=null;private last=0;private time=0;private hudClock=0;private paused=false;private disposed=false;
 private yaw=0;private pitch=.47;private drag:{id:number,x:number,y:number,startX:number,startY:number,moved:boolean}|null=null;
 private combat=new AttackSequence();private heroTrail:WeaponTrail|null=null;private bladeBase=new T.Vector3();private bladeTip=new T.Vector3();private bladeOrigin=new T.Vector3();private hitPause=0;private reducedMotion=false;private assetWarmupUntil=0;private graphics:GraphicsPreferences={...DEFAULT_GRAPHICS};
 private castCd=0;private dodgeCd=0;private dodgeTime=0;private attackAnim=0;private stamina=100;private flash=0;private regen=0;
 private moving=0;private facing=Math.PI;private prompt='';private near='';private quality:string;
 private benchmarkMobileOverride=false;private mobile=false;private contextLost=false;private adaptive=new AutoController();private resizeTimer:ReturnType<typeof setTimeout>|null=null;private resizeKey='';private viewportKey='';
 private resizeObserver:ResizeObserver;private cleanup:(()=>void)[]=[];
 constructor(private container:HTMLElement,p:Progress,quality:string,sound:boolean,private onHud:(h:Hud)=>void,private event:(e:GameEvent)=>void,graphics:GraphicsPreferences={...DEFAULT_GRAPHICS},private validationMode=false) {
  this.p=structuredClone(p);if(!validDungeonSpawn(this.p)){this.p.x=0;this.p.z=51;}p=this.p;this.quality=quality;this.sound.enabled=sound;this.mobile=window.matchMedia('(any-pointer: coarse)').matches;
  this.reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;this.graphics=validateGraphics(graphics);
  try {
  this.renderer=new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(1);
  this.renderer.shadowMap.enabled=quality!=='low';this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35*this.graphics.brightness*lightingAt(this.p.z).exposure;this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.domElement.setAttribute('aria-label','Ashen Realm 3D game world. Use W A S D to move, mouse drag to look, J to attack, Q for magic, E to interact.');
  this.container.appendChild(this.renderer.domElement);this.camera=new T.PerspectiveCamera(55,1,.1,650);
  this.world=createWorld(this.p,quality);this.world.hero.group.rotation.y=this.facing;
  this.dungeonAssets=new DungeonAssets(this.world,()=>{this.assetChanged();});this.dungeonAssets.update(this.p.z);
  this.props=new PropAssets(this.world,this.renderer,()=>this.assetChanged());
  this.shrineAssets=new ShrineAssets(this.world,this.renderer,()=>this.assetChanged(),this.p.shrines);
  this.architectureAssets=new ArchitectureAssets(this.world,this.renderer,()=>this.assetChanged(),{fallbacks:this.world.architectureFallbacks});
  this.surfaces=new SurfaceTextures(this.world.surfaces,Math.min(this.mobile?4:16,this.renderer.capabilities.getMaxAnisotropy()),()=>this.notice('Some detailed textures could not load. The world remains playable.'),()=>this.assetChanged());
  void this.surfaces.setQuality(renderProfile(quality,this.mobile).textures);this.loadLighting();
  for(const e of WORLD.enemies){if(p.defeated.includes(e.id))continue;const actor=knight(true,e.id==='king');actor.group.position.set(e.x,height(e.x,e.z),e.z);this.world.scene.add(actor.group);
   const max=e.id==='king'?620:80,telegraph=new DirectionalTelegraph(this.world.scene,e.id==='king'?'ember-sovereign':'crypt-warden'),ring=telegraph.mesh;
   this.enemies.push({...e,spawnX:e.x,spawnZ:e.z,actor,hp:max,max,cool:1+rand()*2,swing:null,attackIndex:this.enemies.length%4,stagger:0,trail:new WeaponTrail(this.world.scene,e.id==='king'?'#fa9850':'#cf9467'),dead:false,ring,telegraph,hit:0});
  }
  this.heroTrail=new WeaponTrail(this.world.scene);
  this.metrics.hook(this.world.scene,this.camera);
  this.characters=new CharacterAssets(this.renderer,quality,this.mobile,()=>{this.assetChanged();},()=>this.notice('Some character detail is unavailable. You can continue playing.'));
  this.actorList=[this.world.hero,this.world.keeper,...this.enemies.map(e=>e.actor)];this.characters.register(this.world.keeper);this.characters.load();
  this.roster=new RosterAssets(quality,this.mobile,()=>this.assetChanged(),()=>this.notice('A character could not finish loading. You can continue playing.'));
  this.roster.register(this.world.hero,p.hero??DEFAULT_HERO,true);for(const enemy of this.enemies)this.roster.register(enemy.actor,ENEMY_ROSTER[enemy.id]);this.roster.update(this.world.hero.group.position);
  this.impacts=new ImpactPool(this.world.scene);this.flames=new FlameAtlas(this.world,()=>this.assetChanged());void this.flames.load();
  this.loop=new RenderLoop(this.frame);this.configurePostprocessing();this.configureWorldQuality();
  this.resizeObserver=new ResizeObserver(()=>{if(this.resizeTimer)clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>this.resize(),120);});this.resizeObserver.observe(container);this.resize();
  this.camera.position.set(p.x, height(p.x,p.z)+7,p.z+12);this.camera.lookAt(p.x,height(p.x,p.z)+1.8,p.z);
  const listen=(obj:Window|HTMLElement|Document,name:string,fn:EventListener,opts?:AddEventListenerOptions)=>{obj.addEventListener(name,fn,opts);this.cleanup.push(()=>obj.removeEventListener(name,fn,opts));};
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)'),motionChanged=()=>{this.reducedMotion=motion.matches;if(this.reducedMotion){this.hitPause=0;this.cameraImpact.reset();}this.loop?.invalidate();};motion.addEventListener('change',motionChanged);this.cleanup.push(()=>motion.removeEventListener('change',motionChanged));
  listen(window,'keydown',((e:KeyboardEvent)=>{if(this.paused||this.disposed)return;if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k))e.preventDefault();this.keys.add(k);if(!e.repeat){if(k==='j')this.attack();if(k==='q')this.cast();if(k===' ')this.dodge();if(k==='r')this.heal();if(k==='e')this.interact();}}) as EventListener);
  listen(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.key.toLowerCase());}) as EventListener);
  listen(window,'blur',(()=>this.clearInput()) as EventListener);
  listen(window,'orientationchange',(()=>this.clearInput()) as EventListener);
  const visibility=()=>{this.resetMeasurements(document.hidden?'hidden':'visible');this.last=0;this.adaptive.resetSamples(performance.now());this.loop?.suspend(document.hidden||this.contextLost);if(document.hidden){this.clearInput();this.sound.suspend();}};
  listen(document,'visibilitychange',visibility as EventListener);
  listen(window,'pagehide',(()=>{this.resetMeasurements('pagehide');this.loop?.suspend(true);this.sound.suspend();this.clearInput();}) as EventListener);
  listen(window,'pageshow',visibility as EventListener);
  const canvas=this.renderer.domElement;
  listen(canvas,'contextmenu',(e=>e.preventDefault()));
  listen(canvas,'pointerdown',((e:PointerEvent)=>{if(this.paused||this.drag||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{return;}this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};this.sound.ensure();}) as EventListener);
  listen(canvas,'pointermove',((e:PointerEvent)=>{if(!this.drag||this.drag.id!==e.pointerId||this.paused)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.yaw-=dx*.006;this.pitch=T.MathUtils.clamp(this.pitch+dy*.003,.18,.98);this.drag.x=e.clientX;this.drag.y=e.clientY;if(Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)>7)this.drag.moved=true;}) as EventListener);
  listen(canvas,'pointerup',((e:PointerEvent)=>{if(this.drag?.id===e.pointerId){if(!this.drag.moved&&e.pointerType==='mouse'&&e.button===0)this.attack();this.drag=null;}}) as EventListener);
  const endCamera=((e:PointerEvent)=>{if(this.drag?.id===e.pointerId)this.drag=null;}) as EventListener;
  listen(canvas,'pointercancel',endCamera);
  listen(canvas,'lostpointercapture',endCamera);
  listen(canvas,'webglcontextlost',((e:Event)=>{e.preventDefault();if(this.contextLost)return;this.contextLost=true;this.loop?.suspend(true);this.pause(true);this.event({type:'graphics-lost'});}) as EventListener);
  this.resetMeasurements('construction');this.emit();this.loop.suspend(document.hidden);this.loop.invalidate();
  } catch(error) { this.dispose(); throw error; }
 }
 private assetChanged(){this.metrics.markRenderStateChanged('asset changed');this.assetWarmupUntil=performance.now()+2000;this.metrics.hook(this.world.scene,this.camera);this.loop?.invalidate();}
 private resize(){
  if(this.disposed||this.contextLost)return;const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;
  const viewport=`${w}:${h}`;if(viewport!==this.viewportKey){this.viewportKey=viewport;this.adaptive.resetSamples(performance.now());}
  const gl=this.renderer.getContext();const cap=Math.min(this.renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
  const size=this.quality==='auto'&&this.mobile?mobileAutoResolution(w,h,this.adaptive.current.scale,cap):renderResolution(w,h,renderProfile(this.quality,this.mobile).output,cap);
  const key=`${w}:${h}:${size.width}:${size.height}`;if(key===this.resizeKey)return;this.resizeKey=key;
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(size.width,size.height,false);
  if(this.composer)this.composer.setSize(size.width,size.height);
  // Contact shading is sampled at half size; the final frame stays at full output resolution.
  // AO dimensions are scaled in its setSize adapter; the composer allocates them once.
  this.fxaa?.uniforms.resolution.value.set(1/size.width,1/size.height);this.loop?.invalidate();
 }
 private configurePostprocessing(){
  this.composer?.passes.forEach(p=>p.dispose());this.composer?.dispose();this.composer=null;this.ao=null;this.fxaa=null;this.bloom=null;
  this.resizeKey='';const profile=renderProfile(this.quality,this.mobile);if(this.quality==='low')return;
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.world.scene,this.camera));
  if(profile.ao){this.ao=new GTAOPass(this.world.scene,this.camera,256,144);const resizeAO=this.ao.setSize.bind(this.ao);this.ao.setSize=(w,h)=>resizeAO(Math.max(1,Math.floor(w/2)),Math.max(1,Math.floor(h/2)));this.ao.blendIntensity=.3;this.ao.updateGtaoMaterial({radius:2.4,thickness:1,scale:1,distanceFallOff:.65,samples:12});this.ao.updatePdMaterial({radius:5,samples:8});this.composer.addPass(this.ao);}
  this.bloom=new UnrealBloomPass(new T.Vector2(512,288),.24,.65,1.2);this.bloom.enabled=profile.bloom&&(!this.mobile||this.quality!=='auto'||this.adaptive.current.bloom);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);
 }
 private loadLighting(){
  this.lighting=cryptEnvironment(this.renderer);this.world.scene.environment=this.lighting.texture;this.world.scene.environmentIntensity=DUNGEON_ENVIRONMENT_INTENSITY;
  this.dungeonLighting=new DungeonLighting(this.world);
 }
 private obstruction(from:T.Vector3,to:T.Vector3){
  if(!this.world.architecture)return Infinity;
  const direction=to.clone().sub(from),distance=direction.length();if(distance<.001)return Infinity;
  this.sightRay.set(from,direction.divideScalar(distance));this.sightRay.far=distance;this.sightRay.firstHitOnly=true;
  return this.sightRay.intersectObjects([this.world.architecture,...this.world.gates.filter(g=>g.visible)],false)[0]?.distance??Infinity;
 }
 private visibleTarget(x:number,z:number){return this.obstruction(new T.Vector3(this.p.x,1.4,this.p.z),new T.Vector3(x,1.4,z))===Infinity;}
 snapshot(){return structuredClone(this.p);}
 private renderHistoryContext(at:number){
  const sconce=this.props?.status,shrine=this.shrineAssets?.status,architecture=this.architectureAssets?.status;
  return {
   scenario:this.benchmarkView??'gameplay',player:{x:this.p.x,z:this.p.z,room:roomAt(this.p.x,this.p.z)?.id??'passage'},
   renderProfile:{mobileBudget:this.mobile,override:this.benchmarkMobileOverride?'mobile budget on current browser':'detected device',hardwareClaim:'unverified browser environment'},
   characterLods:visibleCharacterLodCounts(this.actorList),
   characterAssets:{states:{...this.characters?.status,...this.roster?.status},tiers:Object.fromEntries(Object.entries({...this.characters?.sources,...this.roster?.sources}).map(([skin,source])=>[skin,source.tier])),overlap:this.characters?.overlap??null},
   assetVersions:{roster:this.roster?.manifestVersion,characters:this.characters?.manifestVersion??null,dungeon:this.dungeonAssets?.manifestVersion??null,sconce:sconce?.version??null,shrine:shrine?.version??null,architecture:architecture?.version??null},
   props:{sconce:sconce??null,shrine:shrine??null,architecture:architecture??null,budget:{draws:10,triangles:25000,reportedDrawsUpperBound:(sconce?.draws??0)+(shrine?.draws??0)+(architecture?.draws??0),reportedTrianglesUpperBound:(sconce?.triangles??0)+(shrine?.triangles??0)+(architecture?.triangles??0)}},
   streaming:this.dungeonAssets?.status??null,
   loading:{roster:this.roster?.pendingLoads,characters:this.characters?.pendingLoads??0,surfaces:this.surfaces.pending,uploadWarmup:at<this.assetWarmupUntil},
   adaptive:this.mobile&&this.quality==='auto'?this.adaptive.status:null,
  };
 }
 diagnostics(){
  const targets=new Set<T.WebGLRenderTarget>();
  const inspect=(value:unknown,depth=0)=>{if(value instanceof T.WebGLRenderTarget){targets.add(value);return;}if(depth>1||!value||typeof value!=='object')return;for(const item of Object.values(value))if(item instanceof T.WebGLRenderTarget||Array.isArray(item))inspect(item,depth+1);};
  inspect(this.composer);for(const pass of this.composer?.passes??[])inspect(pass);inspect(this.lighting);inspect(this.world.reflector.getRenderTarget());inspect(this.world.sun.shadow.map);
  const renderTargets=[...targets].map(t=>({width:t.width,height:t.height,textures:t.textures.length,type:t.texture.type,estimatedColorBytes:t.width*t.height*t.textures.length*4*(t.texture.type===T.HalfFloatType?2:t.texture.type===T.FloatType?4:1),depthBuffer:t.depthBuffer,samples:t.samples}));
  return {...this.metrics.report(this.renderer,this.world.scene,this.quality,{sourceRevision:import.meta.env.VITE_SOURCE_REVISION??'local-uncommitted',scenario:this.benchmarkView??'gameplay',environment:{userAgent:navigator.userAgent,coarsePointer:window.matchMedia('(any-pointer: coarse)').matches,mobileRenderingProfile:this.mobile,profileOverride:this.benchmarkMobileOverride?'mobile budget on current browser':'detected device',devicePixelRatio:window.devicePixelRatio,viewport:[window.innerWidth,window.innerHeight],hardwareClaim:'unverified browser environment'},assetVersions:{roster:this.roster?.manifestVersion,characters:this.characters?.manifestVersion,dungeon:this.dungeonAssets?.manifestVersion,props:this.props?.status.version,shrine:this.shrineAssets?.status.version,architecture:this.architectureAssets?.status.version},lights:this.dungeonLighting?.status,renderTargets,renderTargetCaveat:'Color attachments estimate only; depth/stencil, MSAA, driver storage and transient upload allocations are not measured.'}),characters:{...this.characters?.status,...this.roster?.status},characterSources:{...this.characters?.sources,...this.roster?.sources},characterLods:[this.world.hero,this.world.keeper,...this.enemies.map(e=>e.actor)].filter(a=>a.group.visible).map(a=>({skin:a.group.userData.visualId??a.group.userData.skin,lod:a.group.userData.activeLod??'procedural'})),streaming:this.dungeonAssets?.status,props:this.props?.status,shrine:this.shrineAssets?.status,architecture:this.architectureAssets?.status,environmentProps:{drawsUpperBound:(this.props?.status.draws??0)+(this.shrineAssets?.status.draws??0)+(this.architectureAssets?.status.draws??0),trianglesUpperBound:(this.props?.status.triangles??0)+(this.shrineAssets?.status.triangles??0)+(this.architectureAssets?.status.triangles??0),drawBudget:10,triangleBudget:25000},transientAssetOverlap:this.characters?.overlap,loading:{roster:this.roster?.pendingLoads,characters:this.characters?.pendingLoads,surfaces:this.surfaces.pending,uploadWarmup:performance.now()<this.assetWarmupUntil},graphics:this.graphicsPreferences,adaptive:this.mobile&&this.quality==='auto'?{...this.adaptive.status,transitions:this.adaptiveTransitions}:null};
 }
 resetMeasurements(reason='manual scenario',warmupMs=2000){this.metrics.measurements.reset(reason,performance.now(),warmupMs);this.last=0;this.adaptive.resetSamples(performance.now(),warmupMs);}
 exportDiagnostics(){return {...this.diagnostics(),measurementWindows:this.metrics.measurements.export()};}
 benchmark(view:BenchmarkView){
  if(!this.validationMode)return;
  this.benchmarkView=view;const v=BENCHMARK_VIEWS[view];this.p.x=v.player[0];this.p.z=v.player[1];
  for(const actor of this.actorList)actor.visual?.resetPresentation();
  this.world.hero.group.position.set(this.p.x,0,this.p.z);this.world.hero.group.rotation.y=Math.PI;
  this.camera.position.set(v.camera[0],v.camera[1],v.camera[2]);this.camera.lookAt(new T.Vector3(...v.target));this.dungeonLighting?.resetSelection();this.pause(true);this.resetMeasurements(`view:${view}`);
 }
 benchmarkDeviceProfile(mobileBudget:boolean){if(!this.validationMode)return;this.benchmarkMobileOverride=mobileBudget;this.mobile=mobileBudget||window.matchMedia('(any-pointer: coarse)').matches;this.surfaces?.setAnisotropy(Math.min(this.mobile?4:16,this.renderer.capabilities.getMaxAnisotropy()));this.setQuality(this.quality,true);}
 benchmarkProps(enabled:boolean){if(!this.validationMode)return;this.props?.setEnabled(enabled);this.shrineAssets?.setEnabled(enabled);this.architectureAssets?.setEnabled(enabled);this.resetMeasurements('prop comparison');}
 benchmarkState(open:boolean){if(!this.validationMode)return;this.p.shrines=open?WORLD.shrines.map(s=>s.id):[];this.p.defeated=open?WORLD.enemies.filter(e=>e.id!=='king').map(e=>e.id):[];for(const shrine of this.world.shrines){const color=open?'#8cd6ec':'#d08239';shrine.light.color.set(color);(shrine.flame.material as T.MeshBasicMaterial).color.set(color);}this.shrineAssets?.setAwakened(this.p.shrines);this.dungeonLighting?.resetSelection();this.resetMeasurements('gate/shrine fixture');this.loop?.invalidate();}
 replace(p:Progress){if(p.x!==this.p.x||p.z!==this.p.z){this.resetCombatFeedback();this.cameraNeedsSnap=true;}this.p=structuredClone(p);this.shrineAssets?.setAwakened(this.p.shrines);this.emit();}
 pause(value:boolean){this.resetCombatFeedback();for(const actor of this.actorList){actor.visual?.resetPresentation();actor.group.userData.gaitTime=0;}this.resetMeasurements(value?'pause':'resume');this.paused=value;this.last=0;this.adaptive?.resetSamples(performance.now());this.clearInput();if(value)this.sound.suspend();this.loop?.pause(value);}
 clearInput(){this.resetCombatFeedback();this.keys.clear();this.stick={x:0,y:0};this.touchSprint=false;this.attackHeld=false;this.combat.clearInput();const drag=this.drag;this.drag=null;const canvas=this.renderer?.domElement;try{if(drag&&canvas?.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);}catch{}}
 setStick(x:number,y:number,sprint=false){if(this.paused||this.disposed)return;this.stick={x,y};this.touchSprint=sprint;}
 setAttackHeld(value:boolean,cancelBuffered=false){if(!value){this.attackHeld=false;if(cancelBuffered)this.combat.clearInput();return;}if(this.paused||this.disposed||this.p.health<=0||this.attackHeld)return;this.attackHeld=true;this.attack();}
 setGraphics(value:GraphicsPreferences){this.graphics=validateGraphics(value);if(!this.graphicsPreferences.impactShake)this.cameraImpact.reset();this.renderer.toneMappingExposure=1.35*this.graphics.brightness*lightingAt(this.p.z).exposure;this.loop?.invalidate();}
 get graphicsPreferences(){return effectiveGraphics(this.graphics,this.reducedMotion);}
 setSound(value:boolean){this.sound.enabled=value;if(value)this.sound.ensure();else this.sound.suspend();}
 setQuality(value:string,force=false){if(value===this.quality&&!force)return;this.resetMeasurements(`quality:${value}`);this.quality=value;if(this.contextLost)return;this.adaptive=new AutoController();this.adaptiveTransitions=[];for(const actor of this.actorList)actor.group.userData.reducedSecondary=false;this.props?.setSecondaryDetail(false);this.architectureAssets?.setSecondaryDetail(false);this.world.embers.geometry.setDrawRange(0,Infinity);this.configurePostprocessing();this.configureWorldQuality();void this.surfaces.setQuality(renderProfile(value,this.mobile).textures);this.characters?.setQuality(value,this.mobile);this.roster?.setQuality(value,this.mobile);this.resize();}
 private configureWorldQuality(){
  const profile=renderProfile(this.quality,this.mobile),size=Math.min(profile.shadowSize,this.renderer.capabilities.maxTextureSize);
  this.renderer.shadowMap.enabled=this.quality!=='low';this.world.sun.castShadow=this.quality!=='low';
  if(this.quality==='low'||this.world.sun.shadow.mapSize.x!==size){this.world.sun.shadow.map?.dispose();this.world.sun.shadow.map=null;this.world.sun.shadow.mapSize.setScalar(size);}
  this.world.reflector.userData.enabled=profile.reflections;this.world.reflector.visible=profile.reflections;
  this.world.reflector.getRenderTarget().setSize(profile.reflectionSize,profile.reflectionSize);
  this.dungeonLighting?.setQuality(this.quality,this.mobile);
  this.loop?.setFps(this.quality==='low'?30:60);
 }
 resumeAudio(){this.sound.ensure();}
 private get reducedSecondary(){return this.mobile&&this.quality==='auto'&&this.adaptive.current.secondaryDetail==='reduced';}
 private applyAdaptiveDecision(decision:AutoDecision){
  this.metrics.markRenderStateChanged('adaptive decision');
  this.adaptiveTransitions.push(decision);if(this.adaptiveTransitions.length>40)this.adaptiveTransitions.shift();
  const {before,after}=decision;
  if(this.bloom)this.bloom.enabled=after.bloom;
  if(before.shadowSize!==after.shadowSize){this.world.sun.shadow.map?.dispose();this.world.sun.shadow.map=null;this.world.sun.shadow.mapSize.setScalar(Math.min(after.shadowSize,this.renderer.capabilities.maxTextureSize));}
  if(before.fps!==after.fps)this.loop?.setFps(after.fps);
  for(const actor of this.actorList)actor.group.userData.reducedSecondary=after.secondaryDetail==='reduced';
  this.props?.setSecondaryDetail(after.secondaryDetail==='reduced');this.architectureAssets?.setSecondaryDetail(after.secondaryDetail==='reduced');
  this.world.embers.geometry.setDrawRange(0,after.secondaryDetail==='reduced'?24:Infinity);
  if(before.scale!==after.scale)this.resize();
 }
 private notice(text:string){this.event({type:'notice',text});}
 private resetCombatFeedback(){this.cameraImpact?.reset();this.heroTrail?.reset();this.impacts?.reset();for(const e of this.enemies??[]){e.trail?.reset();e.telegraph?.reset();}}
 private acceptedContact(x:number,y:number,z:number,nx:number,nz:number,color:string,strength:number){
  this.impacts?.contact(x,y,z,nx,nz,color,this.quality==='low'||this.reducedSecondary?3:6,rand,this.reducedMotion);
  const side=nx*Math.cos(this.yaw)-nz*Math.sin(this.yaw);
  this.cameraImpact?.trigger(strength,side,this.graphicsPreferences.impactShake&&!this.paused);
 }
 private burst(x:number,y:number,z:number,color:string,count=12){this.impacts?.burst(x,y,z,color,this.quality==='low'||this.reducedSecondary?Math.min(count,6):count,rand);}
 private ring(x:number,z:number,radius:number,color:string,life=.45){
  if(this.effects.length>=12){const old=this.effects.shift()!;old.mesh.removeFromParent();old.mesh.geometry.dispose();(old.mesh.material as T.Material).dispose();}
  const m=new T.Mesh(new T.RingGeometry(.8,1,32),new T.MeshBasicMaterial({color,transparent:true,side:T.DoubleSide,depthWrite:false,toneMapped:false}));m.rotation.x=-Math.PI/2;m.position.set(x,height(x,z)+.3,z);this.world.scene.add(m);this.effects.push({mesh:m,age:0,life,expand:radius});
 }
 attack(){
  if(this.paused||this.disposed||this.p.health<=0||this.dodgeTime>0||this.attackAnim>0)return;
  this.combat.queue(this.time);this.startPlayerSwing();
 }
 private startPlayerSwing(){
  if(this.combat.swing||this.dodgeTime>0||this.attackAnim>0)return;
  const swing=this.combat.start(this.time,this.stamina,this.facing,this.attackHeld);if(!swing)return;
  // Aim assistance is limited to the forward hemisphere, then facing locks for the strike.
  const ranged=['staff','bow'].includes(ROSTER[this.p.hero??DEFAULT_HERO].style);
  const targets=this.enemies.filter(e=>{const dx=e.x-this.p.x,dz=e.z-this.p.z;return !e.dead&&Math.hypot(dx,dz)<(ranged?12:e.id==='king'?5.4:3.6)&&dx*Math.sin(this.facing)+dz*Math.cos(this.facing)>0&&this.visibleTarget(e.x,e.z);}).sort((a,b)=>Math.hypot(a.x-this.p.x,a.z-this.p.z)-Math.hypot(b.x-this.p.x,b.z-this.p.z));
  if(targets[0])swing.facing=Math.atan2(targets[0].x-this.p.x,targets[0].z-this.p.z);
  this.facing=swing.facing;this.stamina-=swing.strike.stamina;this.heroTrail?.reset();
 }
 private resolveMelee(actor:Actor,swing:Swing,from:number,to:number,trail:WeaponTrail|null,enemy?:Enemy){
  const interval=activeInterval(swing.strike,from,to);
  const id=enemy?ENEMY_ROSTER[enemy.id]:this.p.hero??DEFAULT_HERO,style=ROSTER[id].style;
  if(style==='staff'||style==='bow'){
   if(interval&&!swing.sounded){swing.sounded=true;applyStrikePose(actor,swing.strike,interval[0]);this.releaseBolt(actor,swing,id,enemy);}
   applyStrikePose(actor,swing.strike,to);return;
  }
  if(interval){
   if(!swing.sounded){swing.sounded=true;this.sound.tone(swing.strike.id==='overhead'?95:165,.16,'sawtooth',enemy?.09:.16);}
   // Subsample the same articulated pose used for rendering: low FPS cannot skip contact.
   const samples=Math.max(1,Math.ceil((interval[1]-interval[0])*120));
   for(let i=0;i<=samples;i++){
    const age=interval[0]+(interval[1]-interval[0])*i/samples;
    applyStrikePose(actor,swing.strike,age);bladeSegment(actor,this.bladeBase,this.bladeTip);
    this.bladeOrigin.set(actor.group.position.x,actor.group.position.y+(enemy?.id==='king'?2.7:1.6),actor.group.position.z);
    if(Number.isFinite(this.obstruction(this.bladeOrigin,this.bladeBase)))continue;
    const wall=this.obstruction(this.bladeBase,this.bladeTip),length=this.bladeBase.distanceTo(this.bladeTip);
    if(Number.isFinite(wall)&&length>.001)this.bladeTip.lerpVectors(this.bladeBase,this.bladeTip,Math.max(0,wall-.02)/length);
    trail?.sample(this.bladeBase,this.bladeTip,this.time-(to-age)/swing.speed);
    if(enemy){
     if(!swing.hits.has('hero')&&this.visibleTarget(enemy.x,enemy.z)&&bladeHitsCapsule(this.bladeBase,this.bladeTip,this.p.x,this.p.z,.60,.4,2.3)){
      swing.hits.add('hero');bladeContactPoint(this.bladeBase,this.bladeTip,this.p.x,this.p.z,.4,2.3,this.contactPosition??=new T.Vector3());this.hitPlayer(Math.round((enemy.id==='king'?27:14)*swing.strike.damage),this.contactPosition);
     }
    }else if(swing.hits.size<swing.strike.targets){
     for(const e of this.enemies){
      if(e.dead||swing.hits.has(e.id)||swing.hits.size>=swing.strike.targets)continue;
      const dx=e.x-this.p.x,dz=e.z-this.p.z,boss=e.id==='king';
      if(dx*Math.sin(swing.facing)+dz*Math.cos(swing.facing)<0||Math.hypot(dx,dz)>(boss?5.4:3.6)||!this.visibleTarget(e.x,e.z))continue;
      if(bladeHitsCapsule(this.bladeBase,this.bladeTip,e.x,e.z,boss?1.15:.62,boss?.65:.35,boss?4.7:2.4)){
       swing.hits.add(e.id);bladeContactPoint(this.bladeBase,this.bladeTip,e.x,e.z,boss?.65:.35,boss?4.7:2.4,this.contactPosition??=new T.Vector3());this.hurtEnemy(e,Math.round(damage(this.p)*swing.strike.damage),swing.strike.stagger,this.contactPosition);
       if(!this.reducedMotion)this.hitPause=.035;
      }
     }
    }
   }
  }
  applyStrikePose(actor,swing.strike,to);
 }
 private releaseBolt(actor:Actor,swing:Swing,id:RosterId,enemy?:Enemy){
  const bow=ROSTER[id].style==='bow',color=bow?'#d7c799':id==='frost-mage'?'#83deff':id==='lich'?'#c497ff':'#ffac55';
  const start=new T.Vector3(actor.group.position.x,actor.group.position.y+1.55,actor.group.position.z);
  const end=start.clone().add(new T.Vector3(Math.sin(swing.facing)*12,0,Math.cos(swing.facing)*12));
  // Preserve the locked forward aim, then launch from the evaluated weapon.
  // Aim down toward a target instead of firing horizontally above its capsule
  // when an animated staff crystal rises above the character's head.
  const aim=enemy?bladeHitsCapsule(start,end,this.p.x,this.p.z,.60,.4,2.3)?this.p:undefined:this.enemies.filter(e=>!e.dead&&bladeHitsCapsule(start,end,e.x,e.z,e.id==='king'?1.15:.62,.35,e.id==='king'?4.7:2.4)).sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z))[0];
  if(aim)end.set(aim.x,1.55,aim.z);
  const bodyOrigin=start.clone();actor.visual?.muzzle?.(start);
  // A hand beyond a wall cannot shoot through it from the far side.
  if(Number.isFinite(this.obstruction(bodyOrigin,start)))return;
  const rayLength=start.distanceTo(end);if(rayLength>12)end.lerpVectors(start,end,12/rayLength);
  const wall=this.obstruction(start,end);if(Number.isFinite(wall))end.lerpVectors(start,end,Math.max(0,wall-.04)/Math.max(.001,start.distanceTo(end)));
  if(enemy){
   if(bladeHitsCapsule(start,end,this.p.x,this.p.z,.60,.4,2.3)){end.set(this.p.x,1.55,this.p.z);this.hitPlayer(Math.round(14*swing.strike.damage),end);}
  }else{
   const target=this.enemies.filter(e=>!e.dead&&bladeHitsCapsule(start,end,e.x,e.z,e.id==='king'?1.15:.62,.35,e.id==='king'?4.7:2.4)).sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z))[0];
   if(target){end.set(target.x,1.55,target.z);this.hurtEnemy(target,Math.round(damage(this.p)*swing.strike.damage),swing.strike.stagger,end);}
  }
  const distance=start.distanceTo(end),direction=end.clone().sub(start).normalize();
  const mesh=new T.Mesh(new T.CylinderGeometry(bow?.025:.045,bow?.025:.045,Math.max(.01,distance),6),new T.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
  mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);
  this.world.scene.add(mesh);this.effects.push({mesh,age:0,life:bow?.09:.16,expand:0});this.sound.tone(bow?240:460,.13,bow?'triangle':'sine',.12);
 }
 cast(){
  if(this.paused||this.p.health<=0||this.castCd>0||this.combat.swing||this.dodgeTime>0)return;if(this.p.mana<25){this.notice('Not enough mana. It recovers over time.');return;}
  this.p.mana-=25;this.castCd=2.8;this.attackAnim=.4;this.sound.tone(580,.6,'sine',.22);this.ring(this.p.x,this.p.z,12,'#89dbe8',.6);this.burst(this.p.x,height(this.p.x,this.p.z)+1,this.p.z,'#9beafa',24);
  for(const e of this.enemies)if(!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<12&&this.visibleTarget(e.x,e.z))this.hurtEnemy(e,42+this.p.blade*5);
 }
 dodge(){if(this.paused||this.p.health<=0||this.dodgeCd>0||this.stamina<25||(this.combat.swing&&swingPhase(this.combat.swing)==='active'))return;this.combat.cancel();this.heroTrail?.reset();this.attackAnim=0;this.stamina-=25;this.dodgeTime=.45;this.dodgeCd=1.1;this.sound.tone(95,.2,'triangle',.12);}
 heal(){if(this.paused||this.p.health<=0)return;if(this.p.health>=maxHealth(this.p))return this.notice('Your health is already full.');if(!this.p.potions)return this.notice('Rest at a shrine to refill your flasks.');this.p.potions--;this.p.health=Math.min(maxHealth(this.p),this.p.health+85);this.ring(this.p.x,this.p.z,2.5,'#bbda9a');this.sound.tone(660,.55,'sine',.16);this.notice('Crimson flask · +85 health');this.event({type:'milestone'});this.emit();}
 interact(){
  if(this.paused||this.p.health<=0)return;
  if(!this.near){this.notice('Move closer to a shrine, chest, seal, or the Keeper.');return;}
  if(this.near.startsWith('seal:')){const i=Number(this.near.slice(5));this.notice(`${GATES[i].name}: defeat the chamber wardens and awaken its shrine.`);return;}
  if(this.near==='keeper'){this.p.talked=true;this.event({type:'keeper'});this.event({type:'milestone'});this.emit();return;}
  if(this.near==='camp'){this.rest('camp');return;}
  const s=WORLD.shrines.find(s=>s.id===this.near);if(s){const first=!this.p.shrines.includes(s.id);if(first){this.p.shrines.push(s.id);this.shrineAssets?.setAwakened(this.p.shrines);this.p.souls+=35;this.p.xp+=60;this.p.talked=true;const f=this.world.shrines.find(a=>a.id===s.id)!;f.light.color.set('#8cd6ec');(f.flame.material as T.MeshBasicMaterial).color.set('#8cd6ec');this.burst(s.x,height(s.x,s.z)+2,s.z,'#a5eafa',25);this.notice(`${s.name} awakened · +35 embers`);}this.rest(s.id as Progress['checkpoint'],first);return;}
  const c=WORLD.chests.find(c=>c.id===this.near);if(c&&!this.p.chests.includes(c.id)){this.p.chests.push(c.id);this.p.souls+=55;this.p.potions=Math.min(5,this.p.potions+1);this.world.chests.find(x=>x.id===c.id)!.lid.rotation.x=-1.2;this.sound.tone(780,.35,'triangle',.2);this.notice('Relic cache · +55 embers · +1 flask');this.event({type:'milestone'});this.emit();}
 }
 private rest(checkpoint:Progress['checkpoint'],quiet=false){if(this.enemies.some(e=>!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<8)){this.notice('Defeat nearby enemies before resting.');return;}this.p.checkpoint=checkpoint;this.p.health=maxHealth(this.p);this.p.mana=100;this.stamina=100;this.p.potions=Math.max(3,this.p.potions);this.sound.tone(440,.6,'sine',.18);if(!quiet)this.notice('Restored · health, mana, and flasks replenished');this.event({type:'milestone'});this.emit();}
 private hurtEnemy(e:Enemy,amount:number,stagger=0,contact?:T.Vector3){
  if(e.dead)return false;
  if(e.id==='king'&&this.p.shrines.length<3){this.notice('The King is shielded. Awaken all three shrines.');return false;}
  e.hp=Math.max(0,e.hp-amount);e.hit=.2;if(contact)this.acceptedContact(contact.x,contact.y,contact.z,contact.x-e.x,contact.z-e.z,e.id==='king'?'#f38538':'#c9b79b',.55);else this.burst(e.x,height(e.x,e.z)+1.6,e.z,e.id==='king'?'#f38538':'#c9b79b',10);this.sound.tone(e.id==='king'?72:95,.12,'triangle',.28);
  if(stagger>0&&e.id!=='king'){
   // Committed active strikes retain momentum; wind-ups can be interrupted.
   if(!e.swing||swingPhase(e.swing)!=='active'){e.stagger=stagger;e.swing=null;e.trail?.reset();e.cool=Math.max(e.cool,.55);}
   const dx=e.x-this.p.x,dz=e.z-this.p.z,d=Math.hypot(dx,dz);
   if(d>.01){const next=dungeonMove(e.x,e.z,e.x+dx/d*stagger*.6,e.z+dz/d*stagger*.6,this.p);e.x=next.x;e.z=next.z;}
  }
  if(e.hp<=0){e.dead=true;e.swing=null;e.trail?.reset();e.ring.visible=false;this.p.defeated.push(e.id);const before=level(this.p);this.p.xp+=e.id==='king'?360:65;this.p.souls+=e.id==='king'?250:28;
   if(level(this.p)>before){this.p.health=maxHealth(this.p);this.notice(`Level ${level(this.p)} · Vitality restored`);}else this.notice(e.id==='king'?'The Hollow King has fallen.':'Warden vanquished · +28 embers');
   if(e.id==='king'){this.p.won=true;this.event({type:'victory'});}this.event({type:'milestone'});
  }
  return true;
 }
 chooseHero(id:HeroId){this.p.hero=id;this.combat.cancel();this.heroTrail?.reset();this.roster?.setHero(id);this.event({type:'milestone'});this.emit();}
 respawn(){this.cameraNeedsSnap=true;const s=WORLD.shrines.find(s=>s.id===this.p.checkpoint),x=s?s.x:0,z=s?s.z+3:51;this.p.x=x;this.p.z=z;if(!validDungeonSpawn(this.p)){this.p.x=0;this.p.z=51;}this.p.health=maxHealth(this.p);this.p.mana=100;this.p.potions=Math.max(3,this.p.potions);this.stamina=100;this.dodgeTime=1;this.flash=0;this.combat.cancel();this.heroTrail?.reset();this.hitPause=0;this.attackAnim=0;for(const e of this.enemies){if(e.dead)continue;e.x=e.spawnX;e.z=e.spawnZ;e.hp=e.max;e.cool=2;e.swing=null;e.stagger=0;e.hit=0;e.trail.reset();e.ring.visible=true;}this.pause(false);this.event({type:'milestone'});this.emit();}
 private hitPlayer(damage:number,contact?:T.Vector3){if(this.dodgeTime>0||this.p.health<=0)return false;this.p.health=Math.max(0,this.p.health-Math.max(3,damage-this.p.armor*3));if(contact)this.acceptedContact(contact.x,contact.y,contact.z,contact.x-this.p.x,contact.z-this.p.z,'#ffbb85',1);this.flash=.75;this.regen=0;this.sound.tone(48,.28,'sawtooth',.3);if(this.combat.swing&&swingPhase(this.combat.swing)==='windup')this.combat.cancel();if(this.p.health<=0){this.combat.cancel();this.heroTrail?.reset();this.pause(true);this.event({type:'death'});this.event({type:'milestone'});}this.emit();return true;}
 private updatePrompt(){const p=this.p;this.near='';this.prompt='';let d=4.6;
  const check=(id:string,x:number,z:number,text:string)=>{const distance=Math.hypot(p.x-x,p.z-z);if(distance<d&&this.visibleTarget(x,z)){d=distance;this.near=id;this.prompt=text;}};
  GATES.forEach((g,i)=>{if(!gateOpen(i,this.p)&&Math.abs(this.p.z-g.z)<4.6){this.near=`seal:${i}`;this.prompt=`${g.name} · wardens + shrine`;}});
  check('camp',0,45,'Rest at the campfire');check('keeper',-4,43,'Speak to the Keeper');
  for(const s of WORLD.shrines)check(s.id,s.x,s.z,p.shrines.includes(s.id)?'Rest at '+s.name:'Awaken '+s.name);
  for(const c of WORLD.chests)if(!p.chests.includes(c.id))check(c.id,c.x,c.z,'Open relic cache');
 }
 private emit(){const boss=this.enemies.find(e=>e.id==='king'&&!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<24);this.onHud({p:this.snapshot(),healthMax:maxHealth(this.p),stamina:this.stamina,castCd:this.castCd,dodgeCd:this.dodgeCd,prompt:this.prompt,region:(roomAt(this.p.x,this.p.z)?.name??'SEALED PASSAGE').toUpperCase(),boss:boss?{hp:boss.hp,max:boss.max}:null,heading:this.yaw,enemies:this.enemies.filter(e=>!e.dead).map(e=>({x:e.x,z:e.z})),damageFlash:this.flash,renderSize:{width:this.renderer.domElement.width,height:this.renderer.domElement.height}});}
 private frame=(now:number,rafInterval=0)=>{
  const cpuStarted=performance.now();
  if(this.disposed||this.contextLost)return;const elapsed=this.last?now-this.last:0;const rawDt=this.paused?0:Math.min(.05,elapsed?elapsed/1000:.016);const stopped=Math.min(this.hitPause,rawDt);this.hitPause=Math.max(0,this.hitPause-rawDt);const dt=rawDt-stopped;this.last=now;this.time+=dt;
  if(!this.paused){
   for(const actor of this.actorList)actor.visual?.beginFrame();
   if(this.validationMode)this.p.health=maxHealth(this.p);
   this.p.playtime+=rawDt;this.attackAnim=Math.max(0,this.attackAnim-dt);this.castCd=Math.max(0,this.castCd-dt);this.dodgeCd=Math.max(0,this.dodgeCd-dt);this.dodgeTime=Math.max(0,this.dodgeTime-dt);this.flash=Math.max(0,this.flash-dt*1.8);
   this.p.mana=Math.min(100,this.p.mana+dt*6);this.stamina=Math.min(100,this.stamina+dt*(this.combat.swing?6:18));this.regen+=dt;
   this.startPlayerSwing();
   const forward=(this.keys.has('w')||this.keys.has('arrowup')?1:0)-(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-this.stick.y;
   const side=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0)+this.stick.x;
   let vx=side*Math.cos(this.yaw)-forward*Math.sin(this.yaw),vz=-forward*Math.cos(this.yaw)-side*Math.sin(this.yaw);const len=Math.hypot(vx,vz);if(len>1){vx/=len;vz/=len;}
   this.moving=Math.min(1,len);let speed=5.4;
   if(!this.combat.swing&&(this.keys.has('shift')||this.touchSprint)&&this.stamina>12&&len>0){speed=8.6;this.stamina=Math.max(0,this.stamina-dt*30);}
   if(this.combat.swing)speed*=swingPhase(this.combat.swing)==='active'?.25:.45;
   if(len>.05&&!this.combat.swing)this.facing=Math.atan2(vx,vz);
   if(this.dodgeTime>0){speed=14;if(len<.05){vx=Math.sin(this.facing);vz=Math.cos(this.facing);}}
   const next=dungeonMove(this.p.x,this.p.z,this.p.x+vx*speed*dt,this.p.z+vz*speed*dt,this.p);
   const moved=Math.hypot(next.x-this.p.x,next.z-this.p.z);this.moving=dt>0?Math.min(1,moved/(5.4*dt)):0;
   this.p.x=next.x;this.p.z=next.z;
   const hero=this.world.hero;hero.group.position.set(this.p.x,height(this.p.x,this.p.z),this.p.z);let diff=this.facing-hero.group.rotation.y;diff=Math.atan2(Math.sin(diff),Math.cos(diff));hero.group.rotation.y+=diff*Math.min(1,dt*15);
   hero.group.userData.localMoveX=vx*Math.cos(hero.group.rotation.y)-vz*Math.sin(hero.group.rotation.y);hero.group.userData.localMoveZ=vx*Math.sin(hero.group.rotation.y)+vz*Math.cos(hero.group.rotation.y);hero.group.userData.turn=diff;
   hero.group.userData.gaitTime=Number(hero.group.userData.gaitTime??0)+moved/5.4;
   hero.body.rotation.x=0;animateActor(hero,this.moving>.05?hero.group.userData.gaitTime:this.time,this.moving,this.attackAnim/.4);
   if(this.dodgeTime>0){if(hero.visual)hero.visual.reaction('dodge',Math.max(0,.45-this.dodgeTime)/.45*.5);else hero.body.rotation.x=-.45;}
   if(this.combat.swing){
    const swing=this.combat.swing,step=swingStep(swing,dt),travel=travelBetween(swing.strike,step.from,step.to);
    const next=dungeonMove(this.p.x,this.p.z,this.p.x+Math.sin(swing.facing)*travel,this.p.z+Math.cos(swing.facing)*travel,this.p);
    this.p.x=next.x;this.p.z=next.z;hero.group.position.set(this.p.x,0,this.p.z);
    this.resolveMelee(hero,swing,step.from,step.to,this.heroTrail);
    combatFootwork(hero,this.moving,this.time);
    if(step.done)this.combat.finish(this.time);
   }
   for(const e of this.enemies){
    if(this.p.health<=0)break;
    if(e.dead){const age=Number(e.actor.group.userData.deathAge??0)+dt;e.actor.group.userData.deathAge=age;if(e.actor.visual)e.actor.visual.reaction('death',Math.min(.8,age));else e.actor.group.rotation.z=T.MathUtils.lerp(e.actor.group.rotation.z,Math.PI/2,dt*4);e.actor.group.position.y-=dt*.2;if(e.actor.group.position.y<height(e.x,e.z)-2)e.actor.group.visible=false;continue;}
    const dx=this.p.x-e.x,dz=this.p.z-e.z,dist=Math.hypot(dx,dz),boss=e.id==='king',active=dist<(boss?25:22)&&(!boss||this.p.shrines.length===3)&&this.visibleTarget(e.x,e.z);
    e.actor.group.visible=dist<36;e.ring.visible=dist<36;
    if(dist>=36){e.swing=null;e.trail.reset();e.cool=Math.max(e.cool,.5);continue;}
    e.cool=Math.max(0,e.cool-dt);e.hit=Math.max(0,e.hit-dt);e.stagger=Math.max(0,e.stagger-dt);let mov=0;
    if(!e.swing&&e.stagger<=0&&active){
     if(dist>approachDistance(ENEMY_ROSTER[e.id])){
      const speed=boss?2.4:2.35,separation={x:0,z:0};
      for(const other of this.enemies){if(other===e||other.dead)continue;const sx=e.x-other.x,sz=e.z-other.z,sd=Math.hypot(sx,sz);if(sd<1.7&&sd>.01){separation.x+=sx/sd;separation.z+=sz/sd;}}
      const next=dungeonMove(e.x,e.z,e.x+(dx/dist*speed+separation.x)*dt,e.z+(dz/dist*speed+separation.z)*dt,this.p),moved=Math.hypot(next.x-e.x,next.z-e.z);e.x=next.x;e.z=next.z;mov=dt>0?Math.min(1,moved/(speed*dt))*.8:0;e.actor.group.userData.gaitTime=Number(e.actor.group.userData.gaitTime??0)+moved/speed;
     }else if(e.cool<=0){
      const strike=STRIKES[e.attackIndex++%STRIKES.length];
      e.swing=createSwing({...strike,windup:boss?.80:.55,active:strike.active*(boss?1.2:1),recovery:strike.recovery*(boss?1.15:1)},Math.atan2(dx,dz));e.trail.reset();
     }
     e.actor.group.rotation.y=Math.atan2(dx,dz);
    }
    e.actor.group.position.set(e.x,height(e.x,e.z),e.z);animateActor(e.actor,mov>.05?Number(e.actor.group.userData.gaitTime??0):this.time,mov,0);
    if(e.hit>0&&!e.swing)e.actor.visual?.reaction('hit',(.2-e.hit)/.2*.3);
    if(e.swing){
     const swing=e.swing,step=swingStep(swing,dt),travel=travelBetween(swing.strike,step.from,step.to)*(boss?1.3:1);
     const next=dungeonMove(e.x,e.z,e.x+Math.sin(swing.facing)*travel,e.z+Math.cos(swing.facing)*travel,this.p);e.x=next.x;e.z=next.z;
     e.actor.group.position.set(e.x,0,e.z);e.actor.group.rotation.y=swing.facing;
     this.resolveMelee(e.actor,swing,step.from,step.to,e.trail,e);
     if(step.done){e.swing=null;e.cool=boss?1.1:1.25;}
    }
    e.telegraph?.update(e.swing,e.x,height(e.x,e.z),e.z,e.actor.group.scale.x,this.reducedMotion); if(!e.swing||swingPhase(e.swing)!=='active'){e.actor.body.position.x=e.hit>0?Math.sin(this.time*65)*.035:0;e.actor.torso.rotation.x+=e.hit*.5;}
   }
   this.updatePrompt();
  }
  animateActor(this.world.keeper,this.time,0,0);
  if(!this.paused)for(const actor of this.actorList)if(actor.group.visible)actor.visual?.present(rawDt,height(actor.group.position.x,actor.group.position.z),this.reducedMotion);
  this.heroTrail?.update(this.time,this.reducedMotion||this.quality==='low');
  for(const e of this.enemies)e.trail.update(this.time,this.reducedMotion||this.quality==='low'||e.dead||!e.actor.group.visible);
  this.world.gates.forEach((g,i)=>{g.visible=!gateOpen(i,this.p);});
  const py=0,distance=window.innerWidth<600?7.8:7.2;
  const target=new T.Vector3(this.p.x,1.7,this.p.z);
  const desired=new T.Vector3(this.p.x+Math.sin(this.yaw)*distance*Math.cos(this.pitch),2.2+Math.sin(this.pitch)*distance,this.p.z+Math.cos(this.yaw)*distance*Math.cos(this.pitch));
  const hit=this.obstruction(target,desired);
  stopCameraAtWall(target,desired,hit);
  if(this.cameraNeedsSnap){this.camera.position.copy(desired);this.cameraNeedsSnap=false;}else this.camera.position.lerp(desired,cameraFollowAlpha(dt,(this.keys.has('shift')||this.touchSprint)&&this.moving>.05&&!this.combat.swing,Number.isFinite(hit)));
  // Check the interpolated camera too: smoothing must not pass through a corner.
  const cameraHit=this.obstruction(target,this.camera.position);
  stopCameraAtWall(target,this.camera.position,cameraHit);
  this.camera.lookAt(target);
  if(this.benchmarkView){const v=BENCHMARK_VIEWS[this.benchmarkView];this.camera.position.set(v.camera[0],v.camera[1],v.camera[2]);this.camera.lookAt(new T.Vector3(...v.target));}
  this.cameraImpact.apply(this.camera,rawDt,this.graphicsPreferences.impactShake&&!this.paused&&!this.benchmarkView);
  this.world.water.uniforms.time.value=this.time;
  this.renderer.toneMappingExposure=1.35*this.graphics.brightness*lightingAt(this.p.z).exposure;
  this.dungeonLighting?.update(target,this.time,dt,this.reducedMotion,this.quality!=='low');
  this.flames?.update(this.time,this.camera,this.reducedMotion);this.impacts?.update(dt,this.reducedMotion);
  this.characters?.update(this.camera,this.p.z,this.renderer.domElement.height,this.world.hero);this.roster?.update(this.world.hero.group.position);
  this.dungeonAssets?.update(this.p.z);
  this.props?.update(this.camera,this.p.z,this.renderer.domElement.height,dt);
  this.shrineAssets?.update(this.camera,this.p.x,this.p.z,this.renderer.domElement.height,dt);
  this.architectureAssets?.update(this.camera,this.p.z,this.renderer.domElement.height,dt,{draws:10-(this.props?.status.draws??0)-(this.shrineAssets?.status.draws??0),triangles:25000-(this.props?.status.triangles??0)-(this.shrineAssets?.status.triangles??0)});
  const ea=this.world.embers.geometry.attributes.position;for(let i=0;i<ea.count;i++){ea.setY(i,(ea.getY(i)+dt*(.3+i%4*.1))%8);}ea.needsUpdate=true;this.world.embers.position.set(this.p.x,py,this.p.z);
  for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.age+=dt;const mat=e.mesh.material as T.MeshBasicMaterial;mat.opacity=Math.max(0,1-e.age/e.life);if(e.expand)e.mesh.scale.setScalar(1+e.age/e.life*e.expand);const v=e.mesh.userData.velocity as T.Vector3|undefined;if(v){e.mesh.position.addScaledVector(v,dt);v.y-=dt*6;}if(e.age>=e.life){this.world.scene.remove(e.mesh);e.mesh.geometry.dispose();mat.dispose();this.effects.splice(i,1);}}
  this.metrics.begin(this.renderer);
  if(this.composer&&this.quality!=='low')this.composer.render();else this.renderer.render(this.world.scene,this.camera);
  const renderStateAt=performance.now(),classification:FrameClass=this.paused?'paused':stopped>0?'hit-pause':(this.dungeonAssets?.status.pending.length||this.characters?.pendingLoads||this.roster?.pendingLoads||this.props?.status.state==='loading'||this.shrineAssets?.status.state==='loading'||this.architectureAssets?.status.state==='loading'||this.surfaces.pending||renderStateAt<this.assetWarmupUntil)?'loading':'steady';
  this.metrics.captureRenderState(this.renderer,this.world.scene,this.quality,renderStateAt,classification,()=>this.renderHistoryContext(renderStateAt));
  const sampledAt=performance.now(),cpuMs=sampledAt-cpuStarted;
  this.metrics.end(this.renderer,elapsed,rafInterval,cpuMs,classification,sampledAt);
  if(this.mobile&&this.quality==='auto'){const decision=this.adaptive.sample({nowMs:sampledAt,pacedIntervalMs:elapsed,cpuSubmissionMs:cpuMs,classification});if(decision)this.applyAdaptiveDecision(decision);}
  this.hudClock+=dt;if(this.hudClock>(this.mobile ? .2 : .12)||this.paused){this.hudClock=0;this.emit();}

 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.loop?.dispose();if(this.resizeTimer)clearTimeout(this.resizeTimer);this.resizeObserver?.disconnect();this.cleanup.forEach(fn=>fn());this.sound.close();this.props?.dispose();this.shrineAssets?.dispose();this.architectureAssets?.dispose();this.roster?.dispose();this.characters?.dispose();this.impacts?.dispose();this.flames?.dispose();this.surfaces?.dispose();this.lighting?.dispose();
  this.heroTrail?.dispose();this.enemies.forEach(e=>e.trail.dispose());this.dungeonLighting?.dispose();this.dungeonAssets?.dispose();
  this.composer?.passes.forEach(p=>p.dispose());this.composer?.dispose();
  if(this.world){
   this.world.architecture.geometry.boundsTree=undefined;this.world.sky.geometry.dispose();(this.world.sky.material as T.Material).dispose();this.world.water.uniforms.waterNormals.value.dispose();this.world.reflector.dispose();
   const mats=new Set<T.Material>(),textures=new Set<T.Texture>(),geos=new Set<T.BufferGeometry>();
   this.world.scene.traverse(o=>{const m=o as T.Mesh;if(m.geometry)geos.add(m.geometry);if(m.material)(Array.isArray(m.material)?m.material:[m.material]).forEach(a=>mats.add(a));if(o instanceof T.Light&&'shadow' in o)(o as T.DirectionalLight).shadow?.dispose();});
   for(const m of mats){for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);m.dispose();}textures.forEach(t=>t.dispose());geos.forEach(g=>g.dispose());
  }
  this.renderer?.dispose();if(this.renderer&&!this.contextLost)this.renderer.forceContextLoss();this.renderer?.domElement.remove();
 }
}
