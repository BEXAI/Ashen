import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.GAME_ROOT||process.cwd();
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const out=path.join(await mkdtemp(path.join(os.tmpdir(),'ashen-engine-hazards-')),'engine.mjs');
await build({stdin:{contents:`export {GameEngine} from './app/game/engine';export {knight} from './app/game/world';export {newProgress,maxHealth} from './app/game/model';export {AttackSequence,STRIKES,createSwing} from './app/game/combat';export * as T from 'three';`,resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'silent'});
const {GameEngine,knight,newProgress,maxHealth,AttackSequence,STRIKES,createSwing,T}=await import(pathToFileURL(out));
const STEP=1/60;
function fixture(){
 const g=Object.create(GameEngine.prototype),hero=knight();
 Object.assign(g,{p:newProgress(),paused:false,disposed:false,combat:new AttackSequence(),facing:0,yaw:0,attackAnim:0,bladeBase:new T.Vector3(),bladeTip:new T.Vector3(),bladeOrigin:new T.Vector3(),castCd:0,dodgeCd:0,dodgeTime:0,stamina:100,time:0,flash:0,regen:0,moving:0,enemies:[],effects:[],keys:new Set(),stick:{x:0,y:0},touchSprint:false,attackHeld:false,actorList:[hero],world:{scene:new T.Scene(),hero,shrines:[],chests:[]},sound:{tone(){},suspend(){}},events:[],emits:0,reducedMotion:false,graphics:{version:1,brightness:1,impactShake:false},quality:'low',mobile:false,deathPresentations:new Map(),metrics:{measurements:{reset(){}}},adaptive:{resetSamples(){}},loopCalls:[]});
 g.p.x=0;g.p.z=20;g.p.shrines=['cinder','dusk','crown'];g.event=e=>g.events.push(e);g.emit=()=>g.emits++;g.onHud=()=>{};
 g.loop={pause:v=>g.loopCalls.push(['pause',v]),setPresentationActive:v=>g.loopCalls.push(['present',v])};g.impacts={contact(){},reset(){},burst(){}};g.cameraImpact={reset(){},trigger(){}};
 const boss={id:'king',x:5,z:20,spawnX:5,spawnZ:20,hp:620,max:620,dead:false,hit:0,cool:100,swing:null,attackIndex:0,stagger:100,ring:{visible:true},actor:knight(true,true)};g.enemies.push(boss);g.actorList.push(boss.actor);return {g,boss,m:g.mechanicsState()};
}
function near(a,b,message){assert.ok(Math.abs(a-b)<1e-8,`${message??''}: ${a} != ${b}`);}
function advance(g,count=1){for(let n=0;n<count;n++)g.advanceFrameTime(STEP);}
function startHazard({g,m},warningSeconds=.05,activeSeconds=.35,center={x:g.p.x,z:g.p.z}){const actionId=String(++m.serial);m.hazardHits.set(actionId,new Set());assert.equal(m.hazards.start({id:`${actionId}:floor`,ownerId:'king',actionId,kind:'eruption',center,radius:1.2,warningSeconds,activeSeconds,damageMultiplier:1},m.clock.gameTime),true);return actionId;}
function pulses(m){return m.eventTrace.filter(e=>e.kind==='hazard');}

test('Engine warning is harmless, exact tick-boundary pulse belongs to the next interval, and damage occurs once without melee freeze',()=>{
 const f=fixture(),{g,m}=f;startHazard(f);advance(g,3);near(m.clock.gameTime,.05);assert.equal(g.p.health,140);assert.equal(m.hazards.snapshot().pulseEmitted,false);
 advance(g);assert.equal(g.p.health,113);assert.equal(pulses(m).length,1);near(pulses(m)[0].time,.05);assert.equal(pulses(m)[0].tick,4);assert.equal(pulses(m)[0].outcome,'damaged');assert.equal(m.clock.frozenRemaining,0);
 advance(g,30);assert.equal(g.p.health,113);assert.equal(pulses(m).length,1);assert.equal(m.hazards.snapshot(),null);near(g.p.playtime,34*STEP);
});

test('Actual accepted melee freezes hazard warning and cooldowns while playtime counts admission; ordinary pause freezes both clocks',()=>{
 const f=fixture(),{g,m}=f;startHazard(f,.1);g.castCd=1;advance(g,2);assert.equal(g.hitPlayer(10,new T.Vector3(0,1.5,20)),true);const warning=m.hazards.snapshot(),gameTime=m.clock.gameTime,playtime=g.p.playtime,cooldown=g.castCd;
 const frozen=g.advanceFrameTime(2*STEP);assert.equal(frozen.stopped,2);assert.deepEqual(m.hazards.snapshot(),warning);assert.equal(m.clock.gameTime,gameTime);assert.equal(g.castCd,cooldown);near(g.p.playtime,playtime+2*STEP);assert.equal(pulses(m).length,0);
 g.pause(true);const pausedPlaytime=g.p.playtime;assert.equal(g.advanceFrameTime(10).dt,0);assert.deepEqual(m.hazards.snapshot(),warning);assert.equal(g.p.playtime,pausedPlaytime);assert.equal(m.clock.gameTime,gameTime);
 g.pause(false);advance(g,5);assert.equal(pulses(m).length,1);near(pulses(m)[0].time,.1);assert.equal(g.p.health,103);assert.equal(m.clock.frozenRemaining,0);near(g.p.playtime,9*STEP);
});

test('A real queued dodge evades the pulse at its inclusive protection boundary, which cannot replay after returning to the active disk',()=>{
 const f=fixture(),{g,m}=f;startHazard(f,.05,2);g.dodge();advance(g,4);assert.equal(pulses(m).length,1);assert.equal(pulses(m)[0].outcome,'evaded');near(pulses(m)[0].time,.05);assert.equal(g.p.health,140);assert.equal(m.clock.frozenRemaining,0);
 advance(g,23);assert.equal(g.dodgeTime,0);near(g.p.z,25.25);g.keys.add('w');advance(g,60);g.keys.clear();assert.ok(Math.abs(g.p.z-20)<1.2,'hero returns inside the still-active warning footprint after dodge protection ends');assert.equal(m.hazards.snapshot().phase,'active');assert.equal(m.hazards.snapshot().pulseEmitted,true);assert.equal(g.p.health,140);assert.equal(pulses(m).length,1);
});

test('Earlier owner death cancels a later same-tick pulse; terminal presentation advances only finite corpse time',()=>{
 const f=fixture(),{g,boss,m}=f;boss.hp=40;startHazard(f,.01);g.cast();advance(g);assert.equal(boss.dead,true);assert.equal(g.p.health,maxHealth(g.p));assert.equal(pulses(m).length,0);assert.equal(m.hazards.snapshot(),null);assert.equal(m.terminal,'victory');assert.deepEqual(g.events.filter(e=>e.type==='victory'||e.type==='death').map(e=>e.type),['victory']);assert.equal(g.events.filter(e=>e.type==='milestone').length,1);
 const gameTime=m.clock.gameTime,playtime=g.p.playtime,resources={mana:g.p.mana,stamina:g.stamina,castCd:g.castCd},age=m.deaths.get('king');g.advanceFrameTime(.1);near(m.deaths.get('king'),age+.1);near(m.terminalAge,.1);assert.equal(m.clock.gameTime,gameTime);assert.equal(g.p.playtime,playtime);assert.deepEqual({mana:g.p.mana,stamina:g.stamina,castCd:g.castCd},resources);
 for(let i=0;i<46;i++)g.advanceFrameTime(.1);const finalAge=m.deaths.get('king');assert.ok(m.terminalAge>=4.55);assert.deepEqual(g.loopCalls.at(-1),['present',false]);assert.equal(g.advanceFrameTime(10).dt,0);assert.equal(m.deaths.get('king'),finalAge);assert.equal(g.p.souls,250);assert.equal(g.events.filter(e=>e.type==='milestone').length,1);
});

test('An actual melee contact and owner hazard at equal time trade lethally without reward-healing resurrection',()=>{
 const f=fixture(),{g,boss,m}=f;boss.x=0;boss.z=22;boss.hp=10;g.p.health=20;startHazard(f,.005);
 g.world.hero.visual={beginFrame(){},locomotion(){},strike(){},segment(base,tip){base.set(0,1.2,21.8);tip.set(0,1.2,22.2);}};g.combat.swing=createSwing(STRIKES[0],0);g.combat.swing.elapsed=.165;advance(g);
 assert.equal(boss.dead,true);assert.equal(g.p.health,0);assert.equal(g.p.won,true);assert.equal(pulses(m).length,1);assert.equal(pulses(m)[0].lethal,true);near(pulses(m)[0].time,.005);const melee=m.eventTrace.find(e=>e.kind==='melee');assert.ok(melee?.lethal);near(melee.time,.005);assert.equal(m.terminal,'victory');assert.deepEqual(g.events.filter(e=>e.type==='victory'||e.type==='death').map(e=>e.type),['victory']);assert.equal(g.events.filter(e=>e.type==='milestone').length,1);assert.equal(g.p.xp,360);assert.equal(g.p.souls,250);assert.equal(m.hazards.snapshot(),null);
});

test('Hazard pulse tests the moving hero at contact time rather than the later committed endpoint',()=>{
 const f=fixture(),{g,m}=f;g.p.z=21.16;g.keys.add('s');m.velocity.set('hero',{x:0,z:5.4});startHazard(f,.005,.35,{x:0,z:20});advance(g);
 assert.ok(g.p.z>21.2,'committed endpoint is outside the disk');assert.equal(g.p.health,113,'hero was still inside at the earlier pulse');assert.equal(pulses(m).length,1);near(pulses(m)[0].point.z,21.187);near(pulses(m)[0].time,.005);assert.equal(m.clock.frozenRemaining,0);
});

test('Actual hazard entry/exit and pulse outcomes agree at 20/30/60/120 Hz and 100ms jitter',()=>{
 const schedule=(pattern)=>{const frames=[];let remaining=2,index=0;while(remaining>1e-10){const dt=Math.min(remaining,pattern[index++%pattern.length]);frames.push(dt);remaining-=dt;}return frames;};
 const replay=(frames)=>{
  const f=fixture(),{g,m}=f;startHazard(f,1);const trace=[],step=g.stepSimulation.bind(g);
  g.stepSimulation=(dt,tick)=>{g.keys.clear();if(tick.tick<=25)g.keys.add('s');else if(tick.tick<=50)g.keys.add('w');step(dt,tick);trace.push({tick:tick.tick,x:g.p.x,z:g.p.z,health:g.p.health,hazard:m.hazards.snapshot(),events:pulses(m).slice()});};
  for(const dt of frames)g.advanceFrameTime(dt);
  return {trace,hp:g.p.health,pulses:pulses(m),playtime:g.p.playtime,dropped:m.clock.totalDroppedTime};
 };
 const expected=replay(schedule([1/60]));assert.equal(expected.hp,113);assert.equal(expected.pulses.length,1);assert.ok(expected.trace.some(t=>Math.abs(t.z-20)>1.2),'trace must actually leave the disk');assert.ok(Math.abs(expected.pulses[0].point.z-20)<1.2,'trace must re-enter before its pulse');
 for(const [name,pattern] of [['20Hz',[1/20]],['30Hz',[1/30]],['120Hz',[1/120]],['jitter',[.1,1/120,.033,.017,.08]]]){const actual=replay(schedule(pattern));assert.deepEqual(actual.trace,expected.trace,name);near(actual.playtime,2,name);assert.equal(actual.dropped,0);}
});
