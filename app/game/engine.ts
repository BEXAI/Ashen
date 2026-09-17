import { applyBossPose, restoreBossPose, bossGroundReachable, bossSlamTarget } from './boss-pose';
import { DamageNumbers } from './damage-numbers';
import { DeathPresentation } from './death-presentation';
import { clearCameraPosition, EncounterFraming } from './camera-clearance';
import { createMechanics, type Command, type MechanicsState } from './engine-mechanics';
import type { SimulationTick } from './simulation-clock';
import { DODGE_RULES, SPAWN_PROTECTION_SECONDS, canStartDodge, canStartStrike, dodgeDirection, isDodgeProtected, nextStrikeHeld } from './action-rules';
import { buildCollisionWorld, canOccupy, movementRadius, resistanceWeight, resolveBodyPairs, sampleMotionPath, stationaryMotionPath, type Body, type XZ } from './kinematic';
import { planMotion, type LocomotionState } from './locomotion';
import { resolveContacts, type Combatant, type ContactCandidate } from './combat-events';
import { findWalkEscape } from './hazards';
import { HazardPresentation } from './hazard-presentation';
import { RosterAssets } from './roster-assets';
import { ENEMY_ROSTER, DEFAULT_HERO, ROSTER, approachDistance, type HeroId, type RosterId } from './character-roster';
import { AutoController, type AutoDecision } from './auto-controller';
import type { FrameClass } from './frame-measurements';
import { DirectionalTelegraph, bladeContactPoint } from './combat-feedback';
import { ImpactRotation, cameraFollowAlpha } from './camera-feedback';
import { PropAssets } from './prop-assets';
import { ShrineAssets } from './shrine-assets';
import { ArchitectureAssets } from './architecture-assets';
import { ThroneAssets } from './throne-assets';
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
import { GATES, gateOpen, roomAt, validDungeonSpawn } from './dungeon';
import { architectureObstruction } from './architecture-collision';
import { CharacterAssets } from './character-assets';
import { ImpactPool, FlameAtlas } from './effects';
import { cryptEnvironment, DungeonLighting, DUNGEON_ENVIRONMENT_INTENSITY } from './dungeon-lighting';
import { DungeonAssets } from './dungeon-assets';
import { AttackSequence, STRIKES, activeInterval, bladeHitsCapsule, createSwing, swingPhase, swingStep, type Swing } from './combat';
import { applyStrikePose, bladeSegment, WeaponTrail } from './combat-animation';
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
 private damageNumbers:DamageNumbers|null=null;private deathPresentations=new Map<string,DeathPresentation>();private encounterFraming=new EncounterFraming();
 private mechanics?:MechanicsState;private hazardPresentation:HazardPresentation|null=null;
 private bloom:UnrealBloomPass|null=null;private adaptiveTransitions:AutoDecision[]=[];
 private cameraImpact=new ImpactRotation();private contactPosition=new T.Vector3();private cameraNeedsSnap=true;
 private metrics=new FrameDiagnostics();private benchmarkView:BenchmarkView|null=null;
 private dungeonLighting:DungeonLighting|null=null;
 private dungeonAssets:DungeonAssets|null=null;private props:PropAssets|null=null;private shrineAssets:ShrineAssets|null=null;private architectureAssets:ArchitectureAssets|null=null;private throneAssets:ThroneAssets|null=null;
 private world:WorldScene;private renderer:T.WebGLRenderer;private camera:T.PerspectiveCamera;private composer:EffectComposer|null=null;
 private roster:RosterAssets|null=null;
 private characters:CharacterAssets|null=null;private impacts:ImpactPool|null=null;private flames:FlameAtlas|null=null;private fxaa:ShaderPass|null=null;private ao:GTAOPass|null=null;private surfaces:SurfaceTextures;private lighting:T.WebGLRenderTarget|null=null;private sightRay=new T.Raycaster();
 private p:Progress;private enemies:Enemy[]=[];private actorList:Actor[]=[];private effects:Effect[]=[];private sound=new Sound();
 private keys=new Set<string>();private stick={x:0,y:0};private touchSprint=false;private attackHeld=false;private loop:RenderLoop|null=null;private last=0;private time=0;private hudClock=0;private paused=false;private disposed=false;
 private yaw=0;private pitch=.47;private drag:{id:number,x:number,y:number,startX:number,startY:number,moved:boolean}|null=null;
 private combat=new AttackSequence();private heroTrail:WeaponTrail|null=null;private bladeBase=new T.Vector3();private bladeTip=new T.Vector3();private bladeOrigin=new T.Vector3();private reducedMotion=false;private assetWarmupUntil=0;private graphics:GraphicsPreferences={...DEFAULT_GRAPHICS};
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
  this.throneAssets=new ThroneAssets(this.world.scene,()=>this.assetChanged());
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
  this.roster.register(this.world.hero,p.hero??DEFAULT_HERO,true,()=>this.canInstallRosterVisual());for(const enemy of this.enemies)this.roster.register(enemy.actor,ENEMY_ROSTER[enemy.id],false,()=>this.canInstallRosterVisual(enemy));this.roster.update(this.world.hero.group.position);
  this.damageNumbers=new DamageNumbers(this.world.scene);
  this.hazardPresentation=new HazardPresentation(this.world.scene,{groundHeight:height,triangleAllowed:(a,b,c)=>{const center={x:(a.x+b.x+c.x)/3,z:(a.z+b.z+c.z)/3},radius=Math.max(...[a,b,c].map(p=>Math.hypot(p.x-center.x,p.z-center.z)))+.00001;return canOccupy(buildCollisionWorld(this.p),center.x,center.z,radius);}});
  this.impacts=new ImpactPool(this.world.scene);this.flames=new FlameAtlas(this.world,()=>this.assetChanged());void this.flames.load();
  this.loop=new RenderLoop(this.frame);this.configurePostprocessing();this.configureWorldQuality();
  this.resizeObserver=new ResizeObserver(()=>{if(this.resizeTimer)clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>this.resize(),120);});this.resizeObserver.observe(container);this.resize();
  this.camera.position.set(p.x, height(p.x,p.z)+7,p.z+12);this.camera.lookAt(p.x,height(p.x,p.z)+1.8,p.z);
  const listen=(obj:Window|HTMLElement|Document,name:string,fn:EventListener,opts?:AddEventListenerOptions)=>{obj.addEventListener(name,fn,opts);this.cleanup.push(()=>obj.removeEventListener(name,fn,opts));};
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)'),motionChanged=()=>{this.reducedMotion=motion.matches;if(this.reducedMotion)this.cameraImpact.reset();this.loop?.invalidate();};motion.addEventListener('change',motionChanged);this.cleanup.push(()=>motion.removeEventListener('change',motionChanged));
  listen(window,'keydown',((e:KeyboardEvent)=>{if(this.paused||this.disposed)return;if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k))e.preventDefault();this.keys.add(k);if(!e.repeat){if(k==='j')this.setAttackHeld(true);if(k==='q')this.cast();if(k===' ')this.dodge();if(k==='r')this.heal();if(k==='e')this.interact();}}) as EventListener);
  listen(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.key.toLowerCase());if(e.key.toLowerCase()==='j')this.setAttackHeld(false);}) as EventListener);
  listen(window,'blur',(()=>this.clearInput()) as EventListener);
  listen(window,'orientationchange',(()=>this.clearInput()) as EventListener);
  const visibility=()=>{this.resetMeasurements(document.hidden?'hidden':'visible');this.last=0;this.mechanicsState().clock.reset();this.adaptive.resetSamples(performance.now());this.loop?.suspend(document.hidden||this.contextLost);if(document.hidden){this.clearInput();this.sound.suspend();}};
  listen(document,'visibilitychange',visibility as EventListener);
  listen(window,'pagehide',(()=>{this.mechanicsState().clock.reset();this.last=0;this.resetMeasurements('pagehide');this.loop?.suspend(true);this.sound.suspend();this.clearInput();}) as EventListener);
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
  const mechanics=this.mechanicsState();mechanics.spawnRemaining=SPAWN_PROTECTION_SECONDS;if(this.p.health<=0){mechanics.terminal=this.p.won?'victory':'death';mechanics.deaths.set('hero',0);}
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
  return Math.min(architectureObstruction(from,to),this.sightRay.intersectObjects([this.world.architecture,...this.world.gates.filter((_g,i)=>!gateOpen(i,this.p))],false)[0]?.distance??Infinity,this.throneAssets?.obstruction(this.sightRay.ray,distance)??Infinity);
 }
 private visibleTarget(x:number,z:number){return this.obstruction(new T.Vector3(this.p.x,1.4,this.p.z),new T.Vector3(x,1.4,z))===Infinity;}
 snapshot(){return structuredClone(this.p);}
 private renderHistoryContext(at:number){
  const sconce=this.props?.status,shrine=this.shrineAssets?.status,architecture=this.architectureAssets?.status,throne=this.throneAssets?.status;
  return {
   scenario:this.benchmarkView??'gameplay',player:{x:this.p.x,z:this.p.z,room:roomAt(this.p.x,this.p.z)?.id??'passage'},
   renderProfile:{mobileBudget:this.mobile,override:this.benchmarkMobileOverride?'mobile budget on current browser':'detected device',hardwareClaim:'unverified browser environment'},
   characterLods:visibleCharacterLodCounts(this.actorList),
   characterAssets:{states:{...this.characters?.status,...this.roster?.status},tiers:Object.fromEntries(Object.entries({...this.characters?.sources,...this.roster?.sources}).map(([skin,source])=>[skin,source.tier])),overlap:this.characters?.overlap??null},
   assetVersions:{roster:this.roster?.manifestVersion,characters:this.characters?.manifestVersion??null,dungeon:this.dungeonAssets?.manifestVersion??null,sconce:sconce?.version??null,shrine:shrine?.version??null,architecture:architecture?.version??null,throne:throne?.version??null},
   props:{sconce:sconce??null,shrine:shrine??null,architecture:architecture??null,throne:throne??null,budget:{draws:10,triangles:25000,reportedDrawsUpperBound:(sconce?.draws??0)+(shrine?.draws??0)+(architecture?.draws??0)+(throne?.draws??0),reportedTrianglesUpperBound:(sconce?.triangles??0)+(shrine?.triangles??0)+(architecture?.triangles??0)+(throne?.triangles??0)}},
   streaming:this.dungeonAssets?.status??null,
   loading:{roster:this.roster?.pendingLoads,rosterInstalls:this.roster?.pendingInstalls??0,characters:this.characters?.pendingLoads??0,surfaces:this.surfaces.pending,uploadWarmup:at<this.assetWarmupUntil},
   adaptive:this.mobile&&this.quality==='auto'?this.adaptive.status:null,
  };
 }
 diagnostics(){
  const targets=new Set<T.WebGLRenderTarget>();
  const inspect=(value:unknown,depth=0)=>{if(value instanceof T.WebGLRenderTarget){targets.add(value);return;}if(depth>1||!value||typeof value!=='object')return;for(const item of Object.values(value))if(item instanceof T.WebGLRenderTarget||Array.isArray(item))inspect(item,depth+1);};
  inspect(this.composer);for(const pass of this.composer?.passes??[])inspect(pass);inspect(this.lighting);inspect(this.world.reflector.getRenderTarget());inspect(this.world.sun.shadow.map);
  const renderTargets=[...targets].map(t=>({width:t.width,height:t.height,textures:t.textures.length,type:t.texture.type,estimatedColorBytes:t.width*t.height*t.textures.length*4*(t.texture.type===T.HalfFloatType?2:t.texture.type===T.FloatType?4:1),depthBuffer:t.depthBuffer,samples:t.samples}));
  return {camera:{position:this.camera.position.toArray(),direction:this.camera.getWorldDirection(new T.Vector3()).toArray(),yaw:this.yaw,pitch:this.pitch,near:this.camera.near,fov:this.camera.fov,aspect:this.camera.aspect},mechanics:{tick:this.mechanicsState().clock.nextTick-1,gameTime:this.mechanicsState().clock.gameTime,droppedTime:this.mechanicsState().clock.totalDroppedTime,pendingCommands:this.mechanicsState().commands.size,hitStop:this.mechanicsState().clock.frozenRemaining,bodyPairs:this.mechanicsState().pairReport,hazard:this.mechanicsState().hazards.snapshot(),bossPattern:this.mechanicsState().boss.action?.pattern.id??null,recentContacts:this.mechanicsState().eventTrace,terminal:this.mechanicsState().terminal},...this.metrics.report(this.renderer,this.world.scene,this.quality,{sourceRevision:import.meta.env.VITE_SOURCE_REVISION??'local-uncommitted',scenario:this.benchmarkView??'gameplay',environment:{userAgent:navigator.userAgent,coarsePointer:window.matchMedia('(any-pointer: coarse)').matches,mobileRenderingProfile:this.mobile,profileOverride:this.benchmarkMobileOverride?'mobile budget on current browser':'detected device',devicePixelRatio:window.devicePixelRatio,viewport:[window.innerWidth,window.innerHeight],hardwareClaim:'unverified browser environment'},assetVersions:{roster:this.roster?.manifestVersion,characters:this.characters?.manifestVersion,dungeon:this.dungeonAssets?.manifestVersion,props:this.props?.status.version,shrine:this.shrineAssets?.status.version,architecture:this.architectureAssets?.status.version,throne:this.throneAssets?.status.version},lights:this.dungeonLighting?.status,renderTargets,renderTargetCaveat:'Color attachments estimate only; depth/stencil, MSAA, driver storage and transient upload allocations are not measured.'}),characters:{...this.characters?.status,...this.roster?.status},characterSources:{...this.characters?.sources,...this.roster?.sources},characterLods:[this.world.hero,this.world.keeper,...this.enemies.map(e=>e.actor)].filter(a=>a.group.visible).map(a=>({skin:a.group.userData.visualId??a.group.userData.skin,lod:a.group.userData.activeLod??'procedural'})),streaming:this.dungeonAssets?.status,props:this.props?.status,shrine:this.shrineAssets?.status,architecture:this.architectureAssets?.status,throne:this.throneAssets?.status,environmentProps:{drawsUpperBound:(this.props?.status.draws??0)+(this.shrineAssets?.status.draws??0)+(this.architectureAssets?.status.draws??0)+(this.throneAssets?.status.draws??0),trianglesUpperBound:(this.props?.status.triangles??0)+(this.shrineAssets?.status.triangles??0)+(this.architectureAssets?.status.triangles??0)+(this.throneAssets?.status.triangles??0),drawBudget:10,triangleBudget:25000},transientAssetOverlap:this.characters?.overlap,loading:{roster:this.roster?.pendingLoads,rosterInstalls:this.roster?.pendingInstalls??0,characters:this.characters?.pendingLoads,surfaces:this.surfaces.pending,uploadWarmup:performance.now()<this.assetWarmupUntil},graphics:this.graphicsPreferences,adaptive:this.mobile&&this.quality==='auto'?{...this.adaptive.status,transitions:this.adaptiveTransitions}:null};
 }
 resetMeasurements(reason='manual scenario',warmupMs=2000){this.metrics.measurements.reset(reason,performance.now(),warmupMs);this.last=0;this.adaptive.resetSamples(performance.now(),warmupMs);}
 exportDiagnostics(){return {...this.diagnostics(),measurementWindows:this.metrics.measurements.export()};}
 benchmark(view:BenchmarkView){
  if(!this.validationMode)return;
  this.benchmarkView=view;const v=BENCHMARK_VIEWS[view];this.p.x=v.player[0];this.p.z=v.player[1];
  this.resetActions();
  for(const actor of this.actorList)actor.visual?.resetPresentation();
  this.world.hero.group.position.set(this.p.x,0,this.p.z);this.world.hero.group.rotation.y=Math.PI;
  this.camera.position.set(v.camera[0],v.camera[1],v.camera[2]);this.camera.lookAt(new T.Vector3(...v.target));this.dungeonLighting?.resetSelection();this.pause(true);this.resetMeasurements(`view:${view}`);
 }
 benchmarkDeviceProfile(mobileBudget:boolean){if(!this.validationMode)return;this.benchmarkMobileOverride=mobileBudget;this.mobile=mobileBudget||window.matchMedia('(any-pointer: coarse)').matches;this.surfaces?.setAnisotropy(Math.min(this.mobile?4:16,this.renderer.capabilities.getMaxAnisotropy()));this.setQuality(this.quality,true);}
 benchmarkProps(enabled:boolean){if(!this.validationMode)return;this.props?.setEnabled(enabled);this.shrineAssets?.setEnabled(enabled);this.architectureAssets?.setEnabled(enabled);this.throneAssets?.setEnabled(enabled);this.resetMeasurements('prop comparison');}
 benchmarkState(open:boolean){if(!this.validationMode)return;this.p.shrines=open?WORLD.shrines.map(s=>s.id):[];this.p.defeated=open?WORLD.enemies.filter(e=>e.id!=='king').map(e=>e.id):[];for(const shrine of this.world.shrines){const color=open?'#8cd6ec':'#d08239';shrine.light.color.set(color);(shrine.flame.material as T.MeshBasicMaterial).color.set(color);}this.shrineAssets?.setAwakened(this.p.shrines);this.dungeonLighting?.resetSelection();this.resetMeasurements('gate/shrine fixture');this.loop?.invalidate();}
 replace(p:Progress){if(p.x!==this.p.x||p.z!==this.p.z){this.resetActions();this.cameraNeedsSnap=true;}this.p=structuredClone(p);this.shrineAssets?.setAwakened(this.p.shrines);this.emit();}
 pause(value:boolean,terminalOverlay=false){
  const m=this.mechanicsState();m.clock.reset();m.terminalVisible=value&&terminalOverlay&&m.terminal!==null;
  this.resetCombatFeedback();this.resetMeasurements(value?'pause':'resume');this.paused=value;this.last=0;
  this.adaptive?.resetSamples(performance.now());this.clearInput();if(value)this.sound.suspend();
  this.loop?.pause(value);this.loop?.setPresentationActive(m.terminalVisible&&m.terminalAge<4.55);
 }
 clearInput(){this.resetCombatFeedback();this.keys.clear();this.stick={x:0,y:0};this.touchSprint=false;this.attackHeld=false;this.combat.clearInput();this.mechanicsState().commands.clear();const drag=this.drag;this.drag=null;const canvas=this.renderer?.domElement;try{if(drag&&canvas?.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);}catch{}}
 setStick(x:number,y:number,sprint=false){if(this.paused||this.disposed)return;this.stick={x,y};this.touchSprint=sprint;}
 setAttackHeld(value:boolean,cancelBuffered=false){
  if(this.disposed||this.paused||this.p.health<=0){if(!value)this.attackHeld=false;return;}
  if(this.enqueueCommand({type:'hold',pressed:value,cancelBuffered}))return;
  const next=nextStrikeHeld(this.attackHeld??false,value,this.dodgeTime>0),fresh=next&&!this.attackHeld;
  this.attackHeld=next;if(!value&&cancelBuffered)this.combat.clearInput();if(fresh)this.attack();
 }
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
 private mechanicsState(){return this.mechanics??=createMechanics();}
 private enqueueCommand(command:Command){
  const m=this.mechanicsState();if(m.executing)return false;
  if(!this.paused&&!this.disposed&&this.p.health>0)m.commands.enqueue(command,m.clock.nextTick);
  return true;
 }
 private drainCommands(tick:number){
  const m=this.mechanicsState(),commands=m.commands.drain(tick);
  // Dodge has start priority only; all remaining edges retain their sequence.
  commands.sort((a,b)=>Number(b.payload.type==='dodge')-Number(a.payload.type==='dodge')||a.sequence-b.sequence);
  m.executing=true;
  try{for(const {payload} of commands){if(this.paused||this.p.health<=0)break;
   if(payload.type==='hold')this.setAttackHeld(payload.pressed,payload.cancelBuffered);
   else this[payload.type]();
  }}finally{m.executing=false;}
 }
 private movementIntent(){
  const forward=(this.keys.has('w')||this.keys.has('arrowup')?1:0)-(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.stick?.y??0);
  const side=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0)+(this.stick?.x??0);
  const yaw=this.yaw??0,x=side*Math.cos(yaw)-forward*Math.sin(yaw),z=-forward*Math.cos(yaw)-side*Math.sin(yaw),length=Math.hypot(x,z);
  return {x:x/Math.max(1,length),z:z/Math.max(1,length)};
 }
 attack(){
  if(this.enqueueCommand({type:'attack'}))return;
  if(this.paused||this.disposed||this.p.health<=0||this.dodgeTime>0||this.attackAnim>0)return;
  this.combat.queue(this.time);this.startPlayerSwing();
 }
 private startPlayerSwing(){
  if(!canStartStrike({alive:this.p.health>0,paused:this.paused,action:this.combat.swing?'attack':this.dodgeTime>0?'dodge':this.attackAnim>0?'cast':'idle',stamina:this.stamina,staminaCost:this.combat.nextStrike(this.time).stamina}))return;
  const swing=this.combat.start(this.time,this.stamina,this.facing,this.attackHeld);if(!swing)return;
  // Aim assistance is limited to the forward hemisphere, then facing locks for the strike.
  const ranged=['staff','bow'].includes(ROSTER[this.p.hero??DEFAULT_HERO].style);
  const targets=this.enemies.filter(e=>{const dx=e.x-this.p.x,dz=e.z-this.p.z;return !e.dead&&Math.hypot(dx,dz)<(ranged?12:e.id==='king'?5.4:3.6)&&dx*Math.sin(this.facing)+dz*Math.cos(this.facing)>0&&this.visibleTarget(e.x,e.z);}).sort((a,b)=>Math.hypot(a.x-this.p.x,a.z-this.p.z)-Math.hypot(b.x-this.p.x,b.z-this.p.z));
  if(targets[0])swing.facing=Math.atan2(targets[0].x-this.p.x,targets[0].z-this.p.z);
  this.facing=swing.facing;this.stamina-=swing.strike.stamina;this.actionId(swing);this.heroTrail?.reset();
 }
 private actorPosition(id:string,at:number):XZ {
  const m=this.mechanicsState(),path=m.paths.get(id);
  if(m.collecting&&path)return sampleMotionPath(path,T.MathUtils.clamp((at-m.tickStart)/Math.max(1e-9,m.tickEnd-m.tickStart),0,1-1e-12));
  if(id==='hero')return {x:this.p.x,z:this.p.z};const e=this.enemies.find(e=>e.id===id);return {x:e?.x??0,z:e?.z??0};
 }
 private actionId(swing:Swing){const m=this.mechanicsState();let id=m.actionIds.get(swing);if(id===undefined){id=++m.serial;m.actionIds.set(swing,id);}return id;}
 private submitContact(candidate:ContactCandidate){const m=this.mechanicsState();m.candidates.push(candidate);if(!m.collecting)this.flushContacts();}
 private resolveMelee(actor:Actor,swing:Swing,from:number,to:number,trail:WeaponTrail|null,enemy?:Enemy){
  const interval=activeInterval(swing.strike,from,to),m=this.mechanicsState(),source=enemy?.id??'hero';
  const id=enemy?ENEMY_ROSTER[enemy.id]:this.p.hero??DEFAULT_HERO,style=ROSTER[id].style;
  const at=(age:number)=>m.collecting?m.tickStart+(age-from)/swing.speed:this.time;
  const saved=actor.group.position.clone(),savedYaw=actor.group.rotation.y;
  const pose=(age:number)=>{const p=this.actorPosition(source,at(age));actor.group.position.set(p.x,height(p.x,p.z),p.z);actor.group.rotation.y=swing.facing;applyStrikePose(actor,swing.strike,age);};
  try{
   if(style==='staff'||style==='bow'){
    if(interval&&!swing.sounded){swing.sounded=true;pose(interval[0]);this.releaseBolt(actor,swing,id,at(interval[0]),enemy);}
    return;
   }
   if(!interval)return;
   if(!swing.sounded){swing.sounded=true;this.sound.tone(swing.strike.id==='overhead'?95:165,.16,'sawtooth',enemy?.09:.16);}
   const candidates=enemy?[{id:'hero',boss:false}]:this.enemies.filter(e=>!e.dead).map(e=>({id:e.id,boss:e.id==='king'}));
   const touched=new Set<string>();
   const evaluate=(age:number)=>{pose(age);bladeSegment(actor,this.bladeBase,this.bladeTip);return {age,base:this.bladeBase.clone(),tip:this.bladeTip.clone()};};
   type Sample=ReturnType<typeof evaluate>;
   const samples:Sample[]=[];
   const subdivide=(a:Sample,b:Sample,depth=0)=>{
    if(depth<9&&((b.age-a.age)/swing.speed>1/120+1e-10||Math.max(a.base.distanceTo(b.base),a.tip.distanceTo(b.tip))>.12)){
     const mid=evaluate((a.age+b.age)/2);subdivide(a,mid,depth+1);subdivide(mid,b,depth+1);
    }else samples.push(b);
   };
   const first=evaluate(interval[0]),last=evaluate(Math.max(interval[0],interval[1]-1e-10));samples.push(first);subdivide(first,last);
   for(const sample of samples){
    const time=at(sample.age),root=this.actorPosition(source,time),base=sample.base,tip=sample.tip;
    this.bladeOrigin.set(root.x,height(root.x,root.z)+(enemy?.id==='king'?2.7:1.6),root.z);
    if(Number.isFinite(this.obstruction(this.bladeOrigin,base)))continue;
    const wall=this.obstruction(base,tip),length=base.distanceTo(tip);
    if(Number.isFinite(wall)&&length>.001)tip.lerpVectors(base,tip,Math.max(0,wall-.02)/length);
    trail?.sample(base,tip,time);
    for(const target of candidates){
     if(touched.has(target.id)||swing.hits.has(target.id))continue;
     const p=this.actorPosition(target.id,time),dx=p.x-root.x,dz=p.z-root.z,low=enemy?.4:target.boss?.65:.35,high=enemy?2.3:target.boss?4.7:2.4;
     if(!enemy&&(dx*Math.sin(swing.facing)+dz*Math.cos(swing.facing)<0||Math.hypot(dx,dz)>(target.boss?5.4:3.6)))continue;
     if(Number.isFinite(this.obstruction(new T.Vector3(root.x,1.4,root.z),new T.Vector3(p.x,1.4,p.z))))continue;
     if(!bladeHitsCapsule(base,tip,p.x,p.z,enemy?.60:target.boss?1.15:.62,low,high))continue;
     touched.add(target.id);const contact=bladeContactPoint(base,tip,p.x,p.z,low,high,new T.Vector3());
     this.submitContact({actionId:this.actionId(swing),attackerId:source,targetId:target.id,time,damage:Math.round((enemy?(enemy.id==='king'?27:14):damage(this.p))*swing.strike.damage),stagger:swing.strike.stagger,kind:'melee',point:{x:contact.x,y:contact.y,z:contact.z},direction:{x:dx,z:dz},hits:swing.hits,targetLimit:enemy?1:swing.strike.targets});
    }
   }
  }finally{actor.group.position.copy(saved);actor.group.rotation.y=savedYaw;applyStrikePose(actor,swing.strike,to);}
 }
 private releaseBolt(actor:Actor,swing:Swing,id:RosterId,time:number,enemy?:Enemy){
  const bow=ROSTER[id].style==='bow',color=bow?'#d7c799':id==='frost-mage'?'#83deff':id==='lich'?'#c497ff':'#ffac55',source=enemy?.id??'hero';
  const start=new T.Vector3(actor.group.position.x,actor.group.position.y+1.55,actor.group.position.z),end=start.clone().add(new T.Vector3(Math.sin(swing.facing)*12,0,Math.cos(swing.facing)*12));
  const targets=(enemy?[{id:'hero',boss:false}]:this.enemies.filter(e=>!e.dead).map(e=>({id:e.id,boss:e.id==='king'}))).map(t=>({...t,...this.actorPosition(t.id,time)}));
  const hits=(a:T.Vector3,b:T.Vector3)=>targets.filter(t=>bladeHitsCapsule(a,b,t.x,t.z,t.id==='hero'?.60:t.boss?1.15:.62,t.id==='hero'?.4:.35,t.id==='hero'?2.3:t.boss?4.7:2.4)).sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z));
  const aim=hits(start,end)[0];if(aim)end.set(aim.x,1.55,aim.z);
  const bodyOrigin=start.clone();actor.visual?.muzzle?.(start);
  if(Number.isFinite(this.obstruction(bodyOrigin,start)))return;
  const rayLength=start.distanceTo(end);if(rayLength>12)end.lerpVectors(start,end,12/rayLength);
  const wall=this.obstruction(start,end);if(Number.isFinite(wall))end.lerpVectors(start,end,Math.max(0,wall-.04)/Math.max(.001,start.distanceTo(end)));
  const target=hits(start,end)[0];
  if(target){end.set(target.x,1.55,target.z);this.submitContact({actionId:this.actionId(swing),attackerId:source,targetId:target.id,time,damage:Math.round((enemy?14:damage(this.p))*swing.strike.damage),stagger:swing.strike.stagger,kind:'ranged',point:{x:end.x,y:end.y,z:end.z},direction:{x:end.x-start.x,z:end.z-start.z},hits:swing.hits,targetLimit:1});}
  const distance=start.distanceTo(end),direction=end.clone().sub(start).normalize();
  const mesh=new T.Mesh(new T.CylinderGeometry(bow?.025:.045,bow?.025:.045,Math.max(.01,distance),6),new T.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
  mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);
  this.world.scene.add(mesh);this.effects.push({mesh,age:0,life:bow?.09:.16,expand:0});this.sound.tone(bow?240:460,.13,bow?'triangle':'sine',.12);
 }
 cast(){
  if(this.enqueueCommand({type:'cast'}))return;
  if(this.paused||this.p.health<=0||this.castCd>0||this.combat.swing||this.dodgeTime>0)return;if(this.p.mana<25){this.notice('Not enough mana. It recovers over time.');return;}
  this.p.mana-=25;this.castCd=2.8;this.attackAnim=.4;this.sound.tone(580,.6,'sine',.22);this.ring(this.p.x,this.p.z,12,'#89dbe8',.6);this.burst(this.p.x,height(this.p.x,this.p.z)+1,this.p.z,'#9beafa',24);
  const actionId=++this.mechanicsState().serial,hits=new Set<string>();for(const e of this.enemies)if(!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<12&&this.visibleTarget(e.x,e.z))this.submitContact({actionId,attackerId:'hero',targetId:e.id,time:this.time,damage:42+this.p.blade*5,stagger:0,kind:'spell',point:{x:e.x,y:1.55,z:e.z},direction:{x:e.x-this.p.x,z:e.z-this.p.z},hits,targetLimit:Infinity});
 }
 dodge(){
  if(this.enqueueCommand({type:'dodge'}))return;
  if(!canStartDodge({alive:this.p.health>0,paused:this.paused,action:this.dodgeTime>0?'dodge':this.combat.swing?'attack':this.attackAnim>0?'cast':'idle',attackPhase:this.combat.swing?swingPhase(this.combat.swing):undefined,stamina:this.stamina,cooldown:this.dodgeCd}))return;
  const intent=this.movementIntent();this.mechanicsState().dodgeDirection=dodgeDirection(intent.x,intent.z,this.facing);
  this.combat.cancel();this.heroTrail?.reset();this.attackAnim=0;this.stamina-=DODGE_RULES.staminaCost;this.dodgeTime=DODGE_RULES.duration;this.dodgeCd=DODGE_RULES.cooldown;this.sound.tone(95,.2,'triangle',.12);
 }
 heal(){if(this.enqueueCommand({type:'heal'}))return;if(this.paused||this.p.health<=0)return;if(this.p.health>=maxHealth(this.p))return this.notice('Your health is already full.');if(!this.p.potions)return this.notice('Rest at a shrine to refill your flasks.');this.p.potions--;this.p.health=Math.min(maxHealth(this.p),this.p.health+85);this.ring(this.p.x,this.p.z,2.5,'#bbda9a');this.sound.tone(660,.55,'sine',.16);this.notice('Crimson flask · +85 health');this.event({type:'milestone'});this.emit();}
 interact(){
  if(this.enqueueCommand({type:'interact'}))return;
  if(this.paused||this.p.health<=0)return;
  if(!this.near){this.notice('Move closer to a shrine, chest, seal, or the Keeper.');return;}
  if(this.near.startsWith('seal:')){const i=Number(this.near.slice(5));this.notice(`${GATES[i].name}: defeat the chamber wardens and awaken its shrine.`);return;}
  if(this.near==='keeper'){this.p.talked=true;this.event({type:'keeper'});this.event({type:'milestone'});this.emit();return;}
  if(this.near==='camp'){this.rest('camp');return;}
  const s=WORLD.shrines.find(s=>s.id===this.near);if(s){const first=!this.p.shrines.includes(s.id);if(first){this.p.shrines.push(s.id);this.shrineAssets?.setAwakened(this.p.shrines);this.p.souls+=35;this.p.xp+=60;this.p.talked=true;const f=this.world.shrines.find(a=>a.id===s.id)!;f.light.color.set('#8cd6ec');(f.flame.material as T.MeshBasicMaterial).color.set('#8cd6ec');this.burst(s.x,height(s.x,s.z)+2,s.z,'#a5eafa',25);this.notice(`${s.name} awakened · +35 embers`);}this.rest(s.id as Progress['checkpoint'],first);return;}
  const c=WORLD.chests.find(c=>c.id===this.near);if(c&&!this.p.chests.includes(c.id)){this.p.chests.push(c.id);this.p.souls+=55;this.p.potions=Math.min(5,this.p.potions+1);this.world.chests.find(x=>x.id===c.id)!.lid.rotation.x=-1.2;this.sound.tone(780,.35,'triangle',.2);this.notice('Relic cache · +55 embers · +1 flask');this.event({type:'milestone'});this.emit();}
 }
 private rest(checkpoint:Progress['checkpoint'],quiet=false){if(this.enemies.some(e=>!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<8)){this.notice('Defeat nearby enemies before resting.');return;}this.p.checkpoint=checkpoint;this.p.health=maxHealth(this.p);this.p.mana=100;this.stamina=100;this.p.potions=Math.max(3,this.p.potions);this.sound.tone(440,.6,'sine',.18);if(!quiet)this.notice('Restored · health, mana, and flasks replenished');this.event({type:'milestone'});this.emit();}
 private flushContacts(){
  const m=this.mechanicsState(),candidates=m.candidates.splice(0);if(!candidates.length)return;
  const phase=(id:string,time:number)=>{
   const window=m.collecting?m.windows.get(id):undefined,swing=window?.swing??(id==='hero'?this.combat.swing:this.enemies.find(e=>e.id===id)?.swing);
   if(!swing)return id==='hero'&&this.dodgeTime>0?'dodge' as const:'idle' as const;
   const elapsed=window?window.from+(time-m.tickStart)*swing.speed:swing.elapsed;
   return elapsed<swing.strike.windup-1e-10?'windup':elapsed<swing.strike.windup+swing.strike.active-1e-10?'active':'recovery';
  };
  const core=new Map<string,Combatant>([['hero',{id:'hero',hp:this.p.health,armor:this.p.armor,hero:true,shielded:false,dead:this.p.health<=0,phaseAt:t=>phase('hero',t),protectedAt:t=>{
   const offset=m.collecting?t-m.tickStart:0,remaining=m.collecting?m.dodgeStartRemaining:this.dodgeTime,spawn=m.collecting?m.spawnStartRemaining:m.spawnRemaining;
   return spawn-offset>1e-10||(remaining>0&&isDodgeProtected(DODGE_RULES.duration-remaining+offset));
  }}],...this.enemies.map(e=>[e.id,{id:e.id,hp:e.hp,armor:0,hero:false,shielded:e.id==='king'&&this.p.shrines.length<3,dead:e.dead,phaseAt:(t:number)=>phase(e.id,t),protectedAt:()=>false}] as [string,Combatant])]);
  let kingFell=false,milestone=false;
  const events=resolveContacts(candidates,core,batch=>{
   // Latch every lethal result before awarding XP; a level gain cannot revive a trade.
   this.p.health=core.get('hero')!.hp;
   for(const e of this.enemies)e.hp=core.get(e.id)!.hp;
   for(const id of batch.deaths){
    m.deaths.set(id,0);
    if(id==='hero'){this.combat.cancel();this.heroTrail?.reset();}
    else{const e=this.enemies.find(e=>e.id===id)!;e.dead=true;e.swing=null;e.trail?.reset();e.telegraph?.reset();e.ring.visible=false;m.hazards.cancelOwner(id);if(id==='king'){m.boss.cancel(Math.max(m.tickStart,this.time));kingFell=true;}}
   }
   for(const event of batch.events){
    if(event.outcome==='shielded'){this.notice('The King is shielded. Awaken all three shrines.');continue;}
    if(event.healthDelta<=0)continue;
    const hero=event.targetId==='hero',enemy=this.enemies.find(e=>e.id===event.targetId);
    if(event.interrupted){if(hero)this.combat.cancel();else if(enemy){enemy.swing=null;enemy.stagger=event.stagger;enemy.cool=Math.max(enemy.cool,.55);enemy.trail?.reset();}}
    if(hero){this.flash=.75;this.regen=0;this.sound.tone(48,.28,'sawtooth',.3);}else if(enemy){enemy.hit=.2;this.sound.tone(enemy.id==='king'?72:95,.12,'triangle',.28);}
    const color=hero?'#ffbb85':event.targetId==='king'?'#f38538':'#c9b79b';
    this.acceptedContact(event.point.x,event.point.y,event.point.z,-event.direction.x,-event.direction.z,color,hero?1:.55);
    // Floor hazards keep their true spark/contact point; label above the 2.65m hero instead of behind its legs.
    const numberAnchor=hero&&event.kind==='hazard'?{x:event.point.x,y:height(event.point.x,event.point.z)+2.8,z:event.point.z}:undefined;
    this.damageNumbers?.emit(event,numberAnchor);
    if(event.kind==='melee')m.clock.requestHitStop();
    if(event.targetId!=='king'&&!event.lethal){
     const rosterId=hero?this.p.hero??DEFAULT_HERO:ENEMY_ROSTER[enemy!.id],weight=resistanceWeight(rosterId);
     const swing=m.windows.get(event.attackerId)?.swing??(event.attackerId==='hero'?this.combat.swing:this.enemies.find(e=>e.id===event.attackerId)?.swing);
     const impulse=(hero?1.2:swing?.strike.id==='overhead'?2:1.2)/weight,direction=event.direction,length=Math.hypot(direction.x,direction.z),recoil=m.recoil.get(event.targetId)??{x:0,z:0};
     if(length>1e-6){recoil.x+=direction.x/length*impulse;recoil.z+=direction.z/length*impulse;const speed=Math.hypot(recoil.x,recoil.z);if(speed>3){recoil.x*=3/speed;recoil.z*=3/speed;}m.recoil.set(event.targetId,recoil);}
    }
   }
   for(const id of batch.deaths){
    if(id==='hero'){milestone=true;continue;}
    if(this.p.defeated.includes(id as Enemy['id']))continue;
    this.p.defeated.push(id as Enemy['id']);const before=level(this.p);this.p.xp+=id==='king'?360:65;this.p.souls+=id==='king'?250:28;milestone=true;
    if(level(this.p)>before&&!core.get('hero')!.dead){this.p.health=maxHealth(this.p);core.get('hero')!.hp=this.p.health;this.notice(`Level ${level(this.p)} · Vitality restored`);}
    else this.notice(id==='king'?'The Hollow King has fallen.':'Warden vanquished · +28 embers');
    if(id==='king')this.p.won=true;
   }
  });
  m.eventTrace.push(...events);if(m.eventTrace.length>80)m.eventTrace.splice(0,m.eventTrace.length-80);
  if((this.p.health<=0||kingFell)&&!m.terminal){
   m.terminal=kingFell?'victory':'death';m.terminalAge=0;this.combat.cancel();m.hazards.cancel();m.boss.cancel(Math.max(m.tickStart,this.time));this.pause(true,true);this.event({type:m.terminal});
  }
  if(milestone)this.event({type:'milestone'});this.emit();
 }
 private hurtEnemy(e:Enemy,amount:number,stagger=0,contact?:T.Vector3){
  const before=e.hp;this.submitContact({actionId:++this.mechanicsState().serial,attackerId:'hero',targetId:e.id,time:this.time,damage:amount,stagger,kind:contact?'melee':'spell',point:contact??{x:e.x,y:1.6,z:e.z},direction:{x:e.x-this.p.x,z:e.z-this.p.z},hits:new Set(),targetLimit:1});return e.hp<before;
 }
 private resetActions(){
  const m=this.mechanicsState();m.clock.reset();m.commands.clear();m.paths.clear();m.windows.clear();m.velocity.clear();m.recoil.clear();m.candidates=[];m.hazards.reset(m.clock.gameTime);m.boss.reset(m.clock.gameTime);m.hazardHits.clear();
  this.hazardPresentation?.reset();this.damageNumbers?.reset();for(const e of this.enemies){restoreBossPose(e.actor);e.swing=null;e.cool=Math.max(e.cool,.35);e.telegraph?.reset();}this.combat.cancel();this.heroTrail?.reset();this.dodgeTime=0;this.attackAnim=0;this.clearInput();
 }
 chooseHero(id:HeroId){this.p.hero=id;this.resetActions();this.roster?.setHero(id);this.event({type:'milestone'});this.emit();}
 respawn(){
  this.cameraNeedsSnap=true;const s=WORLD.shrines.find(s=>s.id===this.p.checkpoint),x=s?s.x:0,z=s?s.z+3:51;this.p.x=x;this.p.z=z;
  if(!validDungeonSpawn(this.p)){this.p.x=0;this.p.z=51;}
  this.p.health=maxHealth(this.p);this.p.mana=100;this.p.potions=Math.max(3,this.p.potions);this.stamina=100;this.flash=0;this.resetActions();
  const m=this.mechanicsState();m.spawnRemaining=SPAWN_PROTECTION_SECONDS;m.terminal=null;m.terminalAge=0;m.deaths.delete('hero');delete this.world.hero.group.userData.deathAge;this.deathPresentations?.get('hero')?.reset();this.deathPresentations?.get('hero')?.dispose();this.deathPresentations?.delete('hero');this.world.hero.visual?.resetPresentation();this.world.hero.body.position.set(0,0,0);this.world.hero.body.rotation.set(0,0,0);this.world.hero.group.visible=true;
  for(const e of this.enemies){if(e.dead)continue;e.x=e.spawnX;e.z=e.spawnZ;e.hp=e.max;e.cool=2;e.swing=null;e.stagger=0;e.hit=0;e.trail?.reset();e.ring.visible=true;}
  this.pause(false);this.event({type:'milestone'});this.emit();
 }
 private hitPlayer(damage:number,contact?:T.Vector3){
  const before=this.p.health;this.submitContact({actionId:++this.mechanicsState().serial,attackerId:'direct',allowAbsentSource:true,targetId:'hero',time:this.time,damage,stagger:0,kind:contact?'melee':'spell',point:contact??{x:this.p.x,y:1.5,z:this.p.z},direction:{x:0,z:1},hits:new Set(),targetLimit:1});return this.p.health<before;
 }
 private updatePrompt(){const p=this.p;this.near='';this.prompt='';let d=4.6;
  const check=(id:string,x:number,z:number,text:string)=>{const distance=Math.hypot(p.x-x,p.z-z);if(distance<d&&this.visibleTarget(x,z)){d=distance;this.near=id;this.prompt=text;}};
  GATES.forEach((g,i)=>{if(!gateOpen(i,this.p)&&Math.abs(this.p.z-g.z)<4.6){this.near=`seal:${i}`;this.prompt=`${g.name} · wardens + shrine`;}});
  check('camp',0,45,'Rest at the campfire');check('keeper',-4,43,'Speak to the Keeper');
  for(const s of WORLD.shrines)check(s.id,s.x,s.z,p.shrines.includes(s.id)?'Rest at '+s.name:'Awaken '+s.name);
  for(const c of WORLD.chests)if(!p.chests.includes(c.id))check(c.id,c.x,c.z,'Open relic cache');
 }
 private emit(){const boss=this.enemies.find(e=>e.id==='king'&&!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<24);this.onHud({p:this.snapshot(),healthMax:maxHealth(this.p),stamina:this.stamina,castCd:this.castCd,dodgeCd:this.dodgeCd,prompt:this.prompt,region:(roomAt(this.p.x,this.p.z)?.name??'SEALED PASSAGE').toUpperCase(),boss:boss?{hp:boss.hp,max:boss.max}:null,heading:this.yaw,enemies:this.enemies.filter(e=>!e.dead).map(e=>({x:e.x,z:e.z})),damageFlash:this.flash,renderSize:{width:this.renderer.domElement.width,height:this.renderer.domElement.height}});}
 private motionState(id:string,point:XZ,radius:number,swing:Swing|null):LocomotionState {
  const m=this.mechanicsState();return {x:point.x,z:point.z,radius,velocity:{...m.velocity.get(id)??{x:0,z:0}},recoil:{...m.recoil.get(id)??{x:0,z:0}},dodgeAge:id==='hero'&&this.dodgeTime>0?DODGE_RULES.duration-this.dodgeTime:-1,dodgeDirection:m.dodgeDirection,swing};
 }
 private planActorMotion(id:string,state:LocomotionState,intent:XZ,speed:number,dt:number){
  const m=this.mechanicsState(),path=planMotion(state,intent,speed,dt,buildCollisionWorld(this.p));m.paths.set(id,path);m.velocity.set(id,state.velocity);m.recoil.set(id,state.recoil);return path;
 }
 private escapeAvailable(center:Readonly<XZ>,radius:number,warning:number,snapshot:LocomotionState){
  const world=buildCollisionWorld(this.p),blockers=this.enemies.filter(e=>!e.dead).map(e=>({...this.mechanicsState().paths.get(e.id)!.start,radius:movementRadius(ENEMY_ROSTER[e.id])}));
  return !!findWalkEscape({snapshot,clone:s=>({...s,velocity:{...s.velocity},recoil:{...s.recoil},swing:s.swing?{...s.swing,hits:new Set(s.swing.hits)}:null}),currentIntent:this.movementIntent(),position:s=>s,
   step:(s,dt,intent)=>{planMotion(s,intent,5.4,dt,world);if(s.swing&&swingStep(s.swing,dt).done)s.swing=null;if(s.dodgeAge>=0){s.dodgeAge+=dt;if(s.dodgeAge>=DODGE_RULES.duration-1e-10)s.dodgeAge=-1;}},
   legal:s=>canOccupy(world,s.x,s.z,s.radius)&&blockers.every(b=>Math.hypot(s.x-b.x,s.z-b.z)>=s.radius+b.radius-1e-6),
  },center,radius,warning);
 }
 /** A downloaded rig must not change the sockets of an action already in flight. */
 private canInstallRosterVisual(enemy?:Enemy){
  return enemy?!enemy.dead&&!enemy.swing&&enemy.stagger<=0:this.p.health>0&&!this.combat.swing&&this.dodgeTime<=0&&this.attackAnim<=0;
 }
 private stepSimulation(dt:number,tick:SimulationTick){
  const m=this.mechanicsState();if(this.paused||this.p.health<=0)return;
  // Install between actions, before this tick can drain input or start an AI swing.
  // A held combo may start again this tick, so frame-end installation is too late.
  this.roster?.flushPendingInstalls();
  this.time=tick.startTime;m.tickStart=tick.startTime;m.tickEnd=tick.endTime;m.paths.clear();m.windows.clear();m.candidates=[];m.collecting=true;
  for(const actor of this.actorList){actor.visual?.beginFrame();restoreBossPose(actor);}
  this.world.hero.group.position.set(this.p.x,height(this.p.x,this.p.z),this.p.z);
  m.paths.set('hero',stationaryMotionPath(this.p));for(const e of this.enemies){e.actor.group.position.set(e.x,height(e.x,e.z),e.z);m.paths.set(e.id,stationaryMotionPath(e));}
  try{
   this.drainCommands(tick.tick);if(this.paused)return;
   m.dodgeStartRemaining=this.dodgeTime;m.spawnStartRemaining=m.spawnRemaining;
   this.startPlayerSwing();
   const intent=this.movementIntent(),len=Math.hypot(intent.x,intent.z),sprinting=!this.combat.swing&&this.dodgeTime<=0&&(this.keys.has('shift')||this.touchSprint)&&this.stamina>12&&len>0;
   const hero=this.world.hero,swing=this.combat.swing,heroState=this.motionState('hero',this.p,.45,swing),heroSnapshot={...heroState,velocity:{...heroState.velocity},recoil:{...heroState.recoil},swing:swing?{...swing,hits:new Set(swing.hits)}:null},path=this.planActorMotion('hero',heroState,intent,sprinting?8.6:5.4,dt);
   this.p.x=path.end.x;this.p.z=path.end.z;
   const moved=Math.hypot(path.end.x-path.start.x,path.end.z-path.start.z);this.moving=Math.min(1,moved/(5.4*dt));
   if(len>.05&&!swing&&this.dodgeTime<=0)this.facing=Math.atan2(intent.x,intent.z);
   const diff=Math.atan2(Math.sin(this.facing-hero.group.rotation.y),Math.cos(this.facing-hero.group.rotation.y));
   hero.group.rotation.y=swing?swing.facing:hero.group.rotation.y+diff*Math.min(1,dt*15);hero.group.position.set(this.p.x,height(this.p.x,this.p.z),this.p.z);
   hero.group.userData.localMoveX=intent.x*Math.cos(hero.group.rotation.y)-intent.z*Math.sin(hero.group.rotation.y);hero.group.userData.localMoveZ=intent.x*Math.sin(hero.group.rotation.y)+intent.z*Math.cos(hero.group.rotation.y);hero.group.userData.turn=diff;
   hero.group.userData.gaitTime=Number(hero.group.userData.gaitTime??0)+moved/5.4;hero.body.rotation.x=0;animateActor(hero,this.moving>.05?hero.group.userData.gaitTime:this.time,this.moving,this.attackAnim/.4);
   if(swing){const step=swingStep(swing,dt);m.windows.set('hero',{swing,actor:hero,...step});}
   m.boss.advance(tick.startTime);
   for(const e of this.enemies){
    if(e.dead)continue;
    const dx=path.start.x-e.x,dz=path.start.z-e.z,dist=Math.hypot(dx,dz),boss=e.id==='king',active=dist<(boss?25:22)&&(!boss||this.p.shrines.length===3)&&this.obstruction(new T.Vector3(path.start.x,1.4,path.start.z),new T.Vector3(e.x,1.4,e.z))===Infinity;
    e.actor.group.visible=dist<36;e.ring.visible=dist<36;
    e.cool=Math.max(0,e.cool-dt);e.hit=Math.max(0,e.hit-dt);e.stagger=Math.max(0,e.stagger-dt);
    if(dist>=36){e.swing=null;e.trail?.reset();e.cool=Math.max(e.cool,.5);if(boss){m.boss.cancel(tick.startTime);m.hazards.cancelOwner(e.id);}continue;}
    let direction={x:0,z:0};
    if(!e.swing&&e.stagger<=0&&active){
     if(boss){
      const action=m.boss.tryStart({gameTime:tick.startTime,ownerId:e.id,boss:e,hero:path.start,alive:true,heroAlive:this.p.health>0,shielded:this.p.shrines.length<3,encounterActive:active,hazardAvailable:!m.hazards.occupied,
       lineOfSight:(a,b)=>this.obstruction(new T.Vector3(a.x,1.4,a.z),new T.Vector3(b.x,1.4,b.z))===Infinity,
       legalFloor:p=>canOccupy(buildCollisionWorld(this.p),p.x,p.z,.01),canEscape:(c,r,w)=>this.escapeAvailable(c,r,w,heroSnapshot),
       slamTarget:(_boss,hero)=>bossSlamTarget(e.actor,hero,height(e.x,e.z)),slamReachable:p=>bossGroundReachable(e.actor,new T.Vector3(p.x,height(p.x,p.z),p.z),height(p.x,p.z)),allocateActionId:()=>String(++m.serial)});
      if(action){e.swing=createSwing({id:action.pattern.pose,label:action.pattern.id,windup:action.pattern.windup,active:action.pattern.active,recovery:action.pattern.recovery,stamina:0,damage:action.pattern.damageMultiplier,targets:1,stagger:0,travel:action.pattern.travel},action.facing);m.actionIds.set(e.swing,Number(action.id));e.trail?.reset();
       if(action.hazard){m.hazardHits.clear();m.hazardHits.set(action.id,new Set());m.hazards.start(action.hazard,tick.startTime);}}
     }else if(dist<=approachDistance(ENEMY_ROSTER[e.id])&&e.cool<=0){const strike=STRIKES[e.attackIndex++%STRIKES.length];e.swing=createSwing({...strike,windup:.55},Math.atan2(dx,dz));this.actionId(e.swing);e.trail?.reset();}
     if(!e.swing&&dist>approachDistance(ENEMY_ROSTER[e.id])&&dist>.001)direction={x:dx/dist,z:dz/dist};
     e.actor.group.rotation.y=e.swing?.facing??Math.atan2(dx,dz);
    }
    const state=this.motionState(e.id,e,movementRadius(ENEMY_ROSTER[e.id]),e.swing),motion=this.planActorMotion(e.id,state,direction,boss?2.4:2.35,dt),distance=Math.hypot(motion.end.x-motion.start.x,motion.end.z-motion.start.z);
    e.x=motion.end.x;e.z=motion.end.z;e.actor.group.position.set(e.x,height(e.x,e.z),e.z);e.actor.group.userData.gaitTime=Number(e.actor.group.userData.gaitTime??0)+distance/(boss?2.4:2.35);
    animateActor(e.actor,distance>.001?e.actor.group.userData.gaitTime:this.time,Math.min(.8,distance/(2.35*dt)),0);
    if(e.swing){const swing=e.swing,step=swingStep(swing,dt);m.windows.set(e.id,{swing,actor:e.actor,...step});e.actor.group.rotation.y=swing.facing;}
    else if(e.hit>0)e.actor.visual?.reaction('hit',(.2-e.hit)/.2*.3);
   }
   // All roots now have time-aligned paths. Build candidates without changing HP.
   for(const [id,window] of m.windows){const e=id==='hero'?undefined:this.enemies.find(e=>e.id===id);
    if(id==='king'&&m.boss.action?.pattern.contact==='hazard')continue;
    this.resolveMelee(window.actor,window.swing,window.from,window.to,id==='hero'?this.heroTrail:e!.trail,e);
   }
   for(const pulse of m.hazards.advance(tick.endTime,{heroAt:t=>({id:'hero',...this.actorPosition('hero',t),alive:this.p.health>0}),ownerAliveAt:id=>this.enemies.some(e=>e.id===id&&!e.dead),lineOfSight:(a,b)=>this.obstruction(new T.Vector3(a.x,.15,a.z),new T.Vector3(b.x,.15,b.z))===Infinity},true)){
    const owner=this.actorPosition(pulse.ownerId,pulse.time);
    if(pulse.kind==='slam'){
     const boss=this.enemies.find(e=>e.id===pulse.ownerId)!,action=m.boss.action,saved=boss.actor.group.position.clone();
     boss.actor.group.position.set(owner.x,height(owner.x,owner.z),owner.z);
     const pose=applyBossPose(boss.actor,'slam',pulse.time-(action?.startedAt??pulse.time-1.1),{target:new T.Vector3(pulse.center.x,height(pulse.center.x,pulse.center.z),pulse.center.z),groundY:height(pulse.center.x,pulse.center.z)});
     restoreBossPose(boss.actor);boss.actor.group.position.copy(saved);
     if(!pose.grounded){m.hazards.cancelOwner(pulse.ownerId);continue;}
    }
    m.candidates.push({actionId:Number(pulse.actionId),attackerId:pulse.ownerId,targetId:'hero',time:pulse.time,damage:Math.round(27*pulse.damageMultiplier),stagger:0,kind:'hazard',point:{x:pulse.target.x,y:.2,z:pulse.target.z},direction:{x:pulse.target.x-owner.x,z:pulse.target.z-owner.z},hits:m.hazardHits.get(pulse.actionId)??new Set(),targetLimit:1});
   }
   this.time=tick.endTime;this.flushContacts();
   for(const [id,w] of m.windows)if(w.done||w.to>=w.swing.strike.windup+w.swing.strike.active+w.swing.strike.recovery-1e-10){if(id==='hero'&&this.combat.swing===w.swing)this.combat.finish(tick.endTime);else{const e=this.enemies.find(e=>e.id===id);if(e?.swing===w.swing){e.swing=null;e.cool=id==='king'?.35:1.25;}}}
   m.boss.advance(tick.endTime);
   const bodies:Body[]=[{id:'hero',x:this.p.x,z:this.p.z,radius:.45,weight:1,dead:this.p.health<=0,velocity:m.velocity.get('hero'),recoilVelocity:m.recoil.get('hero'),path:m.paths.get('hero')},...this.enemies.map(e=>({id:e.id,x:e.x,z:e.z,radius:movementRadius(ENEMY_ROSTER[e.id]),weight:resistanceWeight(ENEMY_ROSTER[e.id]),dead:e.dead,velocity:m.velocity.get(e.id),recoilVelocity:m.recoil.get(e.id),path:m.paths.get(e.id)}))];
   m.pairReport=resolveBodyPairs(bodies,buildCollisionWorld(this.p));
   for(const body of bodies){if(body.id==='hero'){this.p.x=body.x;this.p.z=body.z;}else{const e=this.enemies.find(e=>e.id===body.id)!;e.x=body.x;e.z=body.z;}}
   this.attackAnim=this.attackAnim-dt>1e-10?this.attackAnim-dt:0;this.castCd=this.castCd-dt>1e-10?this.castCd-dt:0;this.dodgeCd=this.dodgeCd-dt>1e-10?this.dodgeCd-dt:0;this.dodgeTime=this.dodgeTime-dt>1e-10?this.dodgeTime-dt:0;m.spawnRemaining=Math.max(0,m.spawnRemaining-dt);this.flash=Math.max(0,this.flash-dt*1.8);
   this.p.mana=Math.min(100,this.p.mana+dt*6);this.stamina=Math.min(100,this.stamina+dt*(swing?6:18));if(sprinting)this.stamina=Math.max(0,this.stamina-dt*30);this.regen+=dt;
   for(const [id,age] of m.deaths)m.deaths.set(id,age+dt);
   this.updatePrompt();
  }finally{m.collecting=false;}
 }
 private presentActors(alpha:number,dt:number){
  const m=this.mechanicsState();
  for(const [id,actor] of [['hero',this.world.hero] as const,...this.enemies.map(e=>[e.id,e.actor] as const)]){
   const path=m.paths.get(id);if(path){const p=sampleMotionPath(path,alpha);actor.group.position.set(p.x,height(p.x,p.z),p.z);}
   if(m.deaths.has(id)){
    restoreBossPose(actor);
    const age=m.deaths.get(id)!;actor.group.userData.deathAge=age;
    if(age>=4.55){actor.group.visible=false;this.deathPresentations.get(id)?.dispose();this.deathPresentations.delete(id);continue;}
    let death=this.deathPresentations.get(id);if(!death){death=new DeathPresentation(actor,height(actor.group.position.x,actor.group.position.z));this.deathPresentations.set(id,death);}
    death.sample(m.deaths.get(id)!);continue;
   }
   const w=m.windows.get(id),running=id==='hero'?this.combat.swing:this.enemies.find(e=>e.id===id)?.swing;
   if(w&&running===w.swing){
    const age=w.from+(w.to-w.from)*alpha,action=id==='king'?m.boss.action:null;
    if(action)applyBossPose(actor,action.pattern.id,age,{target:new T.Vector3(action.target.x,height(action.target.x,action.target.z),action.target.z),groundY:height(action.target.x,action.target.z)});
    else applyStrikePose(actor,w.swing.strike,age);
   }
   if(id==='hero'&&this.dodgeTime>0){if(actor.visual)actor.visual.reaction('dodge',(DODGE_RULES.duration-this.dodgeTime)/DODGE_RULES.duration*.5);else actor.body.rotation.x=-.45;}
   if(actor.group.visible)actor.visual?.present(dt,height(actor.group.position.x,actor.group.position.z),this.reducedMotion);
  }
  for(const e of this.enemies)if(!e.dead)e.telegraph?.update(e.id==='king'&&m.boss.action?.pattern.contact==='hazard'?null:e.swing,e.actor.group.position.x,height(e.x,e.z),e.actor.group.position.z,e.actor.group.scale.x,this.reducedMotion);
 }
 private advanceFrameTime(rawDt:number){
  const m=this.mechanicsState();let dt=0,stopped=0,alpha=1;
  // Static validation views have no simulation ticks; existing action guards
  // still preserve a pose frozen mid-swing until the view is explicitly reset.
  if(this.validationMode&&this.benchmarkView&&this.paused)this.roster?.flushPendingInstalls();
  if(!this.paused){const frame=m.clock.advanceFrame(rawDt,(step,tick)=>this.stepSimulation(step,tick));dt=frame.admittedTime;this.p.playtime+=frame.admittedTime;stopped=frame.frozenOpportunities;alpha=frame.holdPresentation?1:frame.alpha;this.time=m.clock.gameTime;}
  else if(m.terminalVisible&&m.terminalAge<4.55){const presentationDt=Math.min(.1,rawDt);m.terminalAge+=presentationDt;for(const [id,age] of m.deaths)m.deaths.set(id,age+presentationDt);this.loop?.setPresentationActive(m.terminalAge<4.55);dt=presentationDt;}
  return {dt,stopped,alpha};
 }
 private frame=(now:number,rafInterval=0)=>{
  const cpuStarted=performance.now();
  if(this.disposed||this.contextLost)return;
  const elapsed=this.last?now-this.last:0,rawDt=Math.max(0,elapsed/1000);this.last=now;
  const m=this.mechanicsState(),{dt,stopped,alpha}=this.advanceFrameTime(rawDt);
  animateActor(this.world.keeper,this.time,0,0);
  if(!this.paused||m.terminalVisible)this.presentActors(alpha,dt);
  this.hazardPresentation?.update(m.hazards.snapshot(),{reducedMotion:this.reducedMotion,quality:this.quality==='low'?'low':'high'});this.damageNumbers?.update(dt,this.reducedMotion);
  this.heroTrail?.update(this.time,this.reducedMotion||this.quality==='low');
  for(const e of this.enemies)e.trail.update(this.time,this.reducedMotion||this.quality==='low'||e.dead||!e.actor.group.visible);
  this.world.gates.forEach((g,i)=>{g.visible=!gateOpen(i,this.p);});
  const py=0,heroPosition=this.world.hero.group.position,king=this.enemies.find(e=>e.id==='king'&&!e.dead&&Math.hypot(e.x-this.p.x,e.z-this.p.z)<18&&this.p.shrines.length===3);
  const framing=this.encounterFraming.update(new T.Vector3(heroPosition.x,1.7,heroPosition.z),king?new T.Vector3(king.actor.group.position.x,2.7,king.actor.group.position.z):null,dt,this.reducedMotion),target=framing.focus;
  const distance=(window.innerWidth<600?7.8:7.2)+framing.extraDistance;
  const desired=new T.Vector3(target.x+Math.sin(this.yaw)*distance*Math.cos(this.pitch),target.y+.5+Math.sin(this.pitch)*distance,target.z+Math.cos(this.yaw)*distance*Math.cos(this.pitch));
  const clearance={near:this.camera.near,fovDegrees:this.camera.fov,aspect:this.camera.aspect};
  const hit=clearCameraPosition(target,desired,(a,b)=>this.obstruction(a,b),clearance);
  if(this.cameraNeedsSnap){this.camera.position.copy(desired);this.cameraNeedsSnap=false;}else this.camera.position.lerp(desired,cameraFollowAlpha(dt,(this.keys.has('shift')||this.touchSprint)&&this.moving>.05&&!this.combat.swing,hit.obstructed));
  clearCameraPosition(target,this.camera.position,(a,b)=>this.obstruction(a,b),clearance);
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
  this.throneAssets?.update(this.camera,this.p.x,this.p.z);
  this.architectureAssets?.update(this.camera,this.p.z,this.renderer.domElement.height,dt,{draws:10-(this.props?.status.draws??0)-(this.shrineAssets?.status.draws??0)-(this.throneAssets?.status.draws??0),triangles:25000-(this.props?.status.triangles??0)-(this.shrineAssets?.status.triangles??0)-(this.throneAssets?.status.triangles??0)});
  const ea=this.world.embers.geometry.attributes.position;for(let i=0;i<ea.count;i++){ea.setY(i,(ea.getY(i)+dt*(.3+i%4*.1))%8);}ea.needsUpdate=true;this.world.embers.position.set(this.p.x,py,this.p.z);
  for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.age+=dt;const mat=e.mesh.material as T.MeshBasicMaterial;mat.opacity=Math.max(0,1-e.age/e.life);if(e.expand)e.mesh.scale.setScalar(1+e.age/e.life*e.expand);const v=e.mesh.userData.velocity as T.Vector3|undefined;if(v){e.mesh.position.addScaledVector(v,dt);v.y-=dt*6;}if(e.age>=e.life){this.world.scene.remove(e.mesh);e.mesh.geometry.dispose();mat.dispose();this.effects.splice(i,1);}}
  this.metrics.begin(this.renderer);
  if(this.composer&&this.quality!=='low')this.composer.render();else this.renderer.render(this.world.scene,this.camera);
  const renderStateAt=performance.now(),classification:FrameClass=this.paused?'paused':stopped>0?'hit-pause':(this.dungeonAssets?.status.pending.length||this.characters?.pendingLoads||this.roster?.pendingLoads||this.roster?.pendingInstalls||this.props?.status.state==='loading'||this.shrineAssets?.status.state==='loading'||this.architectureAssets?.status.state==='loading'||this.throneAssets?.status.state==='loading'||this.surfaces.pending||renderStateAt<this.assetWarmupUntil)?'loading':'steady';
  this.metrics.captureRenderState(this.renderer,this.world.scene,this.quality,renderStateAt,classification,()=>this.renderHistoryContext(renderStateAt));
  const sampledAt=performance.now(),cpuMs=sampledAt-cpuStarted;
  this.metrics.end(this.renderer,elapsed,rafInterval,cpuMs,classification,sampledAt);
  if(this.mobile&&this.quality==='auto'){const decision=this.adaptive.sample({nowMs:sampledAt,pacedIntervalMs:elapsed,cpuSubmissionMs:cpuMs,classification});if(decision)this.applyAdaptiveDecision(decision);}
  this.hudClock+=dt;if(this.hudClock>(this.mobile ? .2 : .12)||this.paused){this.hudClock=0;this.emit();}

 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.mechanics?.hazards.dispose();this.hazardPresentation?.dispose();this.damageNumbers?.dispose();this.deathPresentations?.forEach(d=>d.dispose());this.loop?.dispose();if(this.resizeTimer)clearTimeout(this.resizeTimer);this.resizeObserver?.disconnect();this.cleanup.forEach(fn=>fn());this.sound.close();this.props?.dispose();this.shrineAssets?.dispose();this.architectureAssets?.dispose();this.throneAssets?.dispose();this.roster?.dispose();this.characters?.dispose();this.impacts?.dispose();this.flames?.dispose();this.surfaces?.dispose();this.lighting?.dispose();
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
