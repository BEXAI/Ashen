import os from 'node:os';
import assert from 'node:assert/strict';import test from 'node:test';import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const game=process.env.GAME_ROOT||process.cwd(),proposal=process.env.PROPOSAL_ROOT||game;
const outputDir=path.join(os.tmpdir(),'ashen-feedback-tests');
fs.mkdirSync(outputDir,{recursive:true});
const {build}=await import(pathToFileURL(path.join(game,'node_modules/esbuild/lib/main.js')));
const mods=[];
for(const [name,entry] of [['proposal',proposal]]){
 const out=path.join(outputDir,`engine-${name}.mjs`);
 await build({stdin:{contents:`export {GameEngine} from ${JSON.stringify(path.join(entry,'app/game/engine.ts'))};export {knight} from ${JSON.stringify(path.join(game,'app/game/character-skins.ts'))};export {newProgress} from ${JSON.stringify(path.join(game,'app/game/model.ts'))};export * from ${JSON.stringify(path.join(game,'app/game/combat.ts'))};export * as T from 'three';`,resolveDir:game},nodePaths:[path.join(game,'node_modules')],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent',plugins:[{name:'read-only-game-fallback',setup(b){b.onResolve({filter:/^\./},args=>{if(!args.importer.startsWith(fs.realpathSync(proposal)))return;for(const suffix of ['.ts','.tsx','']){const candidate=path.resolve(path.dirname(args.importer),args.path)+suffix;if(fs.existsSync(candidate))return {path:candidate};const fallback=path.resolve(game,'app/game',args.path)+suffix;if(fs.existsSync(fallback))return {path:fallback};}});}}]});
 mods.push(await import(pathToFileURL(out)));
}
function fixture(m){const {GameEngine,newProgress,AttackSequence,knight,T}=m,g=Object.create(GameEngine.prototype);Object.assign(g,{p:newProgress(),paused:false,combat:new AttackSequence(),facing:0,yaw:0,attackAnim:0,bladeBase:new T.Vector3(),bladeTip:new T.Vector3(),bladeOrigin:new T.Vector3(),contactPosition:new T.Vector3(),castCd:0,dodgeCd:0,dodgeTime:0,stamina:100,time:0,enemies:[],effects:[],keys:new Set(),actorList:[],world:{scene:new T.Scene(),hero:knight()},sound:{tone(){},suspend(){}},events:[],onHud(){},emit(){},reducedMotion:false,graphics:{version:1,brightness:1,impactShake:false},quality:'auto',hitPause:0});g.p.x=g.p.z=0;g.event=e=>g.events.push(e);g.contacts=[];g.kicks=[];g.impacts={contact(...args){g.contacts.push(args);},burst(){},reset(){}};g.cameraImpact={trigger(...args){if(args[2])g.kicks.push(args);},reset(){}};return g;}
function enemy(m,id='w1'){return {id,x:0,z:2,hp:80,max:80,dead:false,hit:0,cool:0,swing:null,stagger:0,ring:{visible:true},actor:m.knight(true,id==='king')};}
function sweep(m,frames,blocked=false){const g=fixture(m),e=enemy(m,blocked?'king':'w1');g.enemies=[e];g.attack();const swing=g.combat.swing;g.world.hero.group.rotation.y=swing.facing;for(let i=0;i<frames;i++)g.resolveMelee(g.world.hero,swing,i*.58/frames,(i+1)*.58/frames,null);return {health:g.p.health,stamina:g.stamina,hp:e.hp,hits:[...swing.hits],pause:g.hitPause,facing:g.facing,contacts:g.contacts,kicks:g.kicks};}
test('Proposal preserves baseline damage, stamina, target deduplication and hit-pause against recorded 30/60/120 Hz fixtures',()=>{
 const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/combat-baseline.json',import.meta.url),'utf8'));for(const {samples:n,blocked,expected:a} of baseline.cases){const b=sweep(mods[0],n,blocked);for(const key of ['health','stamina','hp','hits','pause','facing'])assert.deepEqual(b[key],a[key]);assert.equal(b.contacts.length,blocked?0:1);assert.equal(b.kicks.length,0);}
});
test('Shake and impact spawn only after an accepted hit; shielded bosses, dodge and dead targets are excluded',()=>{
 const m=mods[0],g=fixture(m),e=enemy(m);g.graphics.impactShake=true;const point=new m.T.Vector3(.2,1.1,2);
 assert.equal(g.hurtEnemy(e,10,0,point),true);assert.equal(e.hp,70);assert.equal(g.contacts.length,1);assert.deepEqual(g.contacts[0].slice(0,3),point.toArray());assert.equal(g.kicks.length,1);
 const boss=enemy(m,'king');assert.equal(g.hurtEnemy(boss,10,0,point),false);e.dead=true;assert.equal(g.hurtEnemy(e,10,0,point),false);g.dodgeTime=.2;assert.equal(g.hitPlayer(10,point),false);assert.equal(g.contacts.length,1);assert.equal(g.kicks.length,1);
 g.dodgeTime=0;assert.equal(g.hitPlayer(10,point),true);assert.equal(g.contacts.length,2);assert.equal(g.kicks.length,2);
});
test('Reduced motion suppresses optional shake while preserving accepted stationary contact feedback',()=>{
 const m=mods[0],g=fixture(m),e=enemy(m);g.graphics.impactShake=true;g.reducedMotion=true;g.hurtEnemy(e,10,0,new m.T.Vector3(0,1,2));assert.equal(g.kicks.length,0);assert.equal(g.contacts.length,1);assert.equal(g.contacts[0].at(-1),true);
});
test('No impact occurs in windup; clipped wall obstruction prevents collision and contact feedback',()=>{
 const m=mods[0],g=fixture(m),e=enemy(m);g.enemies=[e];g.attack();const swing=g.combat.swing;g.resolveMelee(g.world.hero,swing,0,.16,null);assert.equal(e.hp,80);assert.equal(g.contacts.length,0);g.obstruction=()=>0;g.resolveMelee(g.world.hero,swing,.17,.33,null);assert.equal(e.hp,80);assert.equal(g.contacts.length,0);
});


test('Auto decisions change optional render work without changing combat clocks or asset tiers',()=>{
 const {GameEngine,T}=mods[0],g=Object.create(GameEngine.prototype),calls=[],marks=[];
 const geometry=new T.BufferGeometry();Object.assign(g,{metrics:{markRenderStateChanged(reason){marks.push(reason);}},adaptiveTransitions:[],bloom:{enabled:true},renderer:{capabilities:{maxTextureSize:4096}},world:{sun:{shadow:{map:{dispose(){calls.push('shadow disposal');}},mapSize:new T.Vector2(512,512)}},embers:{geometry}},loop:{setFps(fps){calls.push(['fps',fps]);}},props:{setSecondaryDetail(v){calls.push(['secondary',v]);}},actorList:[{group:{userData:{}}}],characters:{setQuality(){throw Error('Adaptive stage must not request replacement assets');}},resize(){calls.push('resize');},time:12.5,hitPause:.035,stamina:70,p:{x:3,z:4}});
 const before={stage:1,scale:1,fps:60,bloom:false,shadowSize:512,secondaryDetail:'reduced'},after={...before,stage:2,shadowSize:256};
 g.applyAdaptiveDecision({before,after,reason:'test',window:{}});assert.equal(g.bloom.enabled,false);assert.equal(g.world.sun.shadow.map,null);assert.equal(g.world.sun.shadow.mapSize.x,256);assert.equal(g.world.embers.geometry.drawRange.count,24);assert.equal(g.actorList[0].group.userData.reducedSecondary,true);assert.ok(!calls.includes('resize'));assert.equal(calls.filter(v=>Array.isArray(v)&&v[0]==='fps').length,0);
 g.applyAdaptiveDecision({before:{...after,stage:6,scale:.65},after:{...after,stage:6,scale:.65,fps:30},reason:'fallback',window:{}});assert.deepEqual(calls.at(-2),['fps',30]);assert.equal(g.time,12.5);assert.equal(g.hitPause,.035);assert.equal(g.stamina,70);assert.deepEqual(g.p,{x:3,z:4});assert.deepEqual(marks,['adaptive decision','adaptive decision']);geometry.dispose();
});


// These are capability mocks on Node, not physical-device performance measurements.
function withCoarsePointer(coarse,run){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia(query){assert.equal(query,'(any-pointer: coarse)');return {matches:coarse};}}});
 try{return run();}finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window;}
}
test('Rendering profile override has no effect outside validation mode',()=>{
 const {GameEngine}=mods[0],g=Object.create(GameEngine.prototype);
 Object.assign(g,{validationMode:false,mobile:false,benchmarkMobileOverride:false,quality:'auto',setQuality(){assert.fail('Production must not reconfigure from the lab override');}});
 const before={...g};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,get(){assert.fail('Production lab calls must not inspect device capabilities');}});
 try{g.benchmarkDeviceProfile(true);g.benchmarkDeviceProfile(false);assert.deepEqual({...g},before);}
 finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window;}
});
test('Lab profile switch reconfigures unchanged Auto quality and false restores the detected device',()=>{
 const {GameEngine,T}=mods[0];
 for(const coarse of [false,true])withCoarsePointer(coarse,()=>{
  const g=Object.create(GameEngine.prototype),calls={anisotropy:[],textures:[],characters:[],lighting:[],measurements:[],output:[],post:0,fps:[]},geometry=new T.BufferGeometry();
  geometry.setDrawRange(0,24);
  Object.assign(g,{
   validationMode:true,mobile:coarse,benchmarkMobileOverride:false,quality:'auto',contextLost:false,disposed:false,last:7,
   adaptive:{resetSamples(){}},adaptiveTransitions:[{reason:'old session'}],actorList:[{group:{userData:{reducedSecondary:true}}}],
   metrics:{measurements:{reset(reason){calls.measurements.push(reason);}}},
   container:{clientWidth:1920,clientHeight:1080},viewportKey:'',resizeKey:'',camera:new T.PerspectiveCamera(),
   renderer:{capabilities:{maxTextureSize:4096,getMaxAnisotropy(){return 8;}},shadowMap:{enabled:true},getContext(){return {MAX_RENDERBUFFER_SIZE:1,getParameter(){return 4096;}};},setSize(w,h){calls.output.push([w,h]);}},
   world:{embers:{geometry},sun:{shadow:{map:null,mapSize:new T.Vector2(1024,1024)}},reflector:{userData:{},visible:true,getRenderTarget(){return {setSize(){}};}}},
   surfaces:{setAnisotropy(v){calls.anisotropy.push(v);},setQuality(v){calls.textures.push(v);return Promise.resolve();}},
   characters:{setQuality(...args){calls.characters.push(args);}},dungeonLighting:{setQuality(...args){calls.lighting.push(args);}},
   loop:{setFps(fps){calls.fps.push(fps);},invalidate(){}},
   // Postprocessing is the WebGL allocation boundary; run the real reset, quality,
   // world-quality and resolution methods against lightweight renderer resources.
   configurePostprocessing(){calls.post++;this.resizeKey='';},
  });
  try{
   g.benchmarkDeviceProfile(true);
   assert.equal(g.mobile,true);assert.equal(g.benchmarkMobileOverride,true);assert.equal(g.quality,'auto');
   assert.deepEqual(calls.characters,[['auto',true]]);assert.deepEqual(calls.textures,['low']);assert.deepEqual(calls.anisotropy,[4]);
   assert.deepEqual(calls.lighting,[['auto',true]]);assert.equal(g.world.sun.shadow.mapSize.x,512);assert.equal(g.world.reflector.visible,false);
   assert.ok(calls.output[0][0]*calls.output[0][1]<=800000);assert.equal(calls.output.length,1);
   assert.equal(g.actorList[0].group.userData.reducedSecondary,false);assert.equal(geometry.drawRange.count,Infinity);assert.deepEqual(g.adaptiveTransitions,[]);
   assert.equal(g.adaptive.current.stage,0);assert.equal(g.last,0);
   g.benchmarkDeviceProfile(false);
   assert.equal(g.mobile,coarse);assert.equal(g.benchmarkMobileOverride,false);assert.equal(g.quality,'auto');
   assert.deepEqual(calls.characters,[['auto',true],['auto',coarse]]);
   assert.deepEqual(calls.textures,['low',coarse?'low':'medium']);assert.deepEqual(calls.anisotropy,[4,coarse?4:8]);
   assert.deepEqual(calls.lighting,[['auto',true],['auto',coarse]]);assert.equal(g.world.sun.shadow.mapSize.x,coarse?512:1024);assert.equal(g.world.reflector.visible,!coarse);
   assert.equal(calls.output.length,2);if(coarse)assert.ok(calls.output[1][0]*calls.output[1][1]<=800000);else assert.deepEqual(calls.output[1],[1920,1080]);
   assert.deepEqual(calls.measurements,['quality:auto','quality:auto']);assert.equal(calls.post,2);assert.deepEqual(calls.fps,[60,60]);
  }finally{geometry.dispose();}
 });
});
