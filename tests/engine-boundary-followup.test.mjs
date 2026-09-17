import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.GAME_ROOT||process.cwd();
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const dir=await mkdtemp(path.join(os.tmpdir(),'ashen-engine-boundary-followup-')),out=path.join(dir,'engine.mjs');
after(()=>rm(dir,{recursive:true,force:true}));
await build({stdin:{contents:`export {GameEngine} from './app/game/engine';export {knight} from './app/game/world';export {newProgress,maxHealth} from './app/game/model';export * from './app/game/combat';export * from './app/game/kinematic';export * from './app/game/action-rules';export * from './app/game/dungeon';export {ENEMY_ROSTER} from './app/game/character-roster';export * as T from 'three';`,resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'silent'});
const {GameEngine,knight,newProgress,AttackSequence,buildCollisionWorld,canOccupy,sampleMotionPath,movementRadius,ENEMY_ROSTER,BONE_THRONE,GATES,T}=await import(pathToFileURL(out));
const STEP=1/60;
function fixture(){
 const g=Object.create(GameEngine.prototype),hero=knight();
 Object.assign(g,{p:newProgress(),paused:false,disposed:false,combat:new AttackSequence(),facing:0,yaw:0,attackAnim:0,bladeBase:new T.Vector3(),bladeTip:new T.Vector3(),bladeOrigin:new T.Vector3(),castCd:0,dodgeCd:0,dodgeTime:0,stamina:100,time:0,flash:0,regen:0,moving:0,enemies:[],effects:[],keys:new Set(),stick:{x:0,y:0},touchSprint:false,attackHeld:false,actorList:[hero],world:{scene:new T.Scene(),hero,shrines:[],chests:[]},sound:{tone(){},suspend(){}},events:[],contacts:[],emits:0,reducedMotion:false,graphics:{version:1,brightness:1,impactShake:false},quality:'low',mobile:false,deathPresentations:new Map(),metrics:{measurements:{reset(){}}},adaptive:{resetSamples(){}},loopCalls:[]});
 g.p.x=0;g.p.z=20;g.obstruction=()=>Infinity;g.visibleTarget=()=>true;g.event=e=>g.events.push(e);g.emit=()=>g.emits++;g.onHud=()=>{};
 g.loop={pause:v=>g.loopCalls.push(['pause',v]),setPresentationActive:v=>g.loopCalls.push(['present',v])};
 g.impacts={contact(...args){g.contacts.push(args);},reset(){},burst(){}};g.cameraImpact={reset(){},trigger(){}};return g;
}
function enemy(g,id='w1',x=0,z=22){const e={id,x,z,spawnX:x,spawnZ:z,hp:80,max:80,dead:false,hit:0,cool:100,swing:null,attackIndex:0,stagger:0,ring:{visible:true},actor:knight(true,id==='king')};g.enemies.push(e);g.actorList.push(e.actor);return e;}
function frame(g,elapsed=STEP){return g.mechanicsState().clock.advanceFrame(elapsed,(dt,tick)=>g.stepSimulation(dt,tick));}

const evidence=[];
after(()=>{if(process.env.BOUNDARY_EVIDENCE)writeFileSync(process.env.BOUNDARY_EVIDENCE,JSON.stringify(evidence,null,2)+"\n");});
const near=(a,b,epsilon=2e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
function bodies(g){return [{id:'hero',x:g.p.x,z:g.p.z,radius:.45},...g.enemies.filter(e=>!e.dead).map(e=>({id:e.id,x:e.x,z:e.z,radius:movementRadius(ENEMY_ROSTER[e.id])}))];}
function legalTrace(g){
 const world=buildCollisionWorld(g.p),state=g.mechanicsState();
 for(const body of bodies(g)){
  assert.ok(Number.isFinite(body.x+body.z));assert.ok(canOccupy(world,body.x,body.z,body.radius),`illegal endpoint ${JSON.stringify(body)}`);
  const path=state.paths.get(body.id);if(!path)continue;
  for(let i=0;i<=20;i++){const p=sampleMotionPath(path,i/20);assert.ok(canOccupy(world,p.x,p.z,body.radius),`illegal timed path ${body.id}@${i/20}`);}
  for(const c of path.corrections)for(let i=0;i<=8;i++){const f=i/8;assert.ok(canOccupy(world,c.from.x+(c.to.x-c.from.x)*f,c.from.z+(c.to.z-c.from.z)*f,body.radius),'correction crosses blocked floor');}
 }
 assert.deepEqual(state.pairReport.invalidBodies,[]);
 for(const a of bodies(g))for(const b of bodies(g))if(a.id<b.id&&Math.hypot(a.x-b.x,a.z-b.z)<a.radius+b.radius-1e-6){assert.ok(state.pairReport.unresolved.some(p=>p.a===a.id&&p.b===b.id),'overlap must be explicitly reported');}
}

test('A4 actual engine crowd pressure at the closed Cinder gate stays legal and preserves pre-correction contact paths',()=>{
 function run(reverse){
  const g=fixture();g.p.x=0;g.p.z=8.4;g.keys.add('w');g.keys.add('shift');
  for(const [id,x,z] of [['w1',-.36,5.48],['w2',.36,5.65],['w3',0,6.5]]){const e=enemy(g,id,x,z);e.stagger=100;}
  if(reverse)g.enemies.reverse();
  const state=g.mechanicsState(),flush=g.flushContacts.bind(g);let snapshots=[],corrections=0;
  g.flushContacts=()=>{snapshots=[...state.paths].map(([id,p])=>({id,path:p,segments:JSON.stringify(p.segments),early:[.1,.5,.99].map(a=>sampleMotionPath(p,a))}));return flush();};
  const trace=[];
  for(let tick=0;tick<120;tick++){
   frame(g);legalTrace(g);
   for(const s of snapshots){assert.equal(JSON.stringify(s.path.segments),s.segments,'pair resolution rewrote an already-resolved trajectory');assert.deepEqual([.1,.5,.99].map(a=>sampleMotionPath(s.path,a)),s.early);corrections+=s.path.corrections.length;}
   for(const b of bodies(g))assert.ok(b.z>=GATES[0].z+.15+b.radius-1e-6,'crowd passed through the closed gate');
   trace.push(bodies(g).sort((a,b)=>a.id.localeCompare(b.id)).map(b=>[b.id,b.x,b.z]));
  }
  assert.ok(corrections>0,'fixture never exercised crowd correction');assert.equal(g.p.health,140);assert.equal(state.eventTrace.length,0);
  evidence.push({scenario:"closed-gate crowd",reverse,ticks:120,corrections,finalBodies:bodies(g),pairReport:state.pairReport});
  return trace;
 }
 assert.deepEqual(run(false),run(true),'engine crowd result depends on enemy iteration order');
});

test('A4 queued dodge into the boss cannot cross its living body; dead boss ceases blocking',()=>{
 function run(dead){
  const g=fixture();g.p.won=true;g.p.x=0;g.p.z=-65;g.facing=Math.PI;g.keys.add('w');const boss=enemy(g,'king',0,-68);boss.stagger=100;boss.dead=dead;
  const beforeBoss=boss.z;g.dodge();let corrections=0;
  for(let i=0;i<27;i++){frame(g);legalTrace(g);corrections+=g.mechanicsState().paths.get('hero').corrections.length;if(!dead)assert.ok(g.p.z-boss.z>=1.35-1e-6,'dodge crossed the boss instead of resolving weighted separation');}
  assert.equal(g.dodgeTime,0);return {hero:g.p.z,boss:boss.z,beforeBoss,corrections};
 }
 const living=run(false),dead=run(true);evidence.push({scenario:'dodge into boss',living,dead});
 assert.ok(living.corrections>0);assert.ok(living.hero>-70.25+1,'living boss did not shorten dodge');near(dead.hero,-70.25);near(dead.boss,dead.beforeBoss);
 assert.ok(living.boss<living.beforeBoss,'weighted boss must respond to pressure');assert.ok(living.beforeBoss-living.boss<(-65-living.hero),'heavier boss displaced more than the dodging hero');
});

const sides=[
 {name:'east/reverse X',start:{x:BONE_THRONE.x+BONE_THRONE.halfWidth+.45+.08,z:BONE_THRONE.z},direction:{x:-1,z:0},tangent:{x:0,z:1},facing:-Math.PI/2,bound:BONE_THRONE.x+BONE_THRONE.halfWidth+.45,axis:'x',sign:1},
 {name:'back/reverse Z',start:{x:BONE_THRONE.x,z:BONE_THRONE.z-BONE_THRONE.halfDepth-.45-.08},direction:{x:0,z:1},tangent:{x:1,z:0},facing:0,bound:BONE_THRONE.z-BONE_THRONE.halfDepth-.45,axis:'z',sign:-1},
];
for(const side of sides)test(`A3 real engine capped recoil and authored lunge stop/slide on Bone Throne ${side.name}`,()=>{
 for(const mode of ['recoil','lunge']){
  const g=fixture();g.p.won=true;Object.assign(g.p,side.start);g.facing=side.facing;g.world.hero.group.position.set(g.p.x,0,g.p.z);const state=g.mechanicsState();
  if(mode==='recoil'){
   const direction={x:(side.direction.x+side.tangent.x)*Math.SQRT1_2,z:(side.direction.z+side.tangent.z)*Math.SQRT1_2};
   for(let i=0;i<3;i++)g.submitContact({actionId:++state.serial,attackerId:'fixture',allowAbsentSource:true,targetId:'hero',time:0,damage:1,stagger:0,kind:'spell',point:{x:g.p.x,y:1,z:g.p.z},direction,hits:new Set(),targetLimit:1});
   near(Math.hypot(state.recoil.get('hero').x,state.recoil.get('hero').z),3);assert.equal(state.eventTrace.filter(e=>e.outcome==='damaged').length,3);
  }else g.attack();
  let touched=false;
  for(let i=0;i<40;i++){frame(g);legalTrace(g);assert.ok((g.p[side.axis]-side.bound)*side.sign>=-1e-6,'movement crossed the rendered throne proxy');if(Math.abs(g.p[side.axis]-side.bound)<1e-5)touched=true;}
  evidence.push({scenario:side.name,mode,start:side.start,end:{x:g.p.x,z:g.p.z},recoil:state.recoil.get('hero'),bound:side.bound});
  assert.ok(touched,`${mode} fixture never reached the throne`);near(g.p[side.axis],side.bound);
  if(mode==='recoil'){assert.ok((g.p.x-side.start.x)*side.tangent.x+(g.p.z-side.start.z)*side.tangent.z>.1,'tangential recoil was lost');near(state.recoil.get('hero')[side.axis],0);}
  else{assert.equal(g.combat.swing,null);near(Math.hypot(g.p.x-side.start.x,g.p.z-side.start.z),.08);assert.equal(state.eventTrace.length,0);}
 }
});
