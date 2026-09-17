import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.GAME_ROOT||process.cwd();
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const out=path.join(await mkdtemp(path.join(os.tmpdir(),'ashen-engine-mechanics-')),'engine.mjs');
await build({stdin:{contents:`export {GameEngine} from './app/game/engine';export {knight} from './app/game/world';export {newProgress,maxHealth} from './app/game/model';export * from './app/game/combat';export * from './app/game/kinematic';export * from './app/game/action-rules';export * as T from 'three';`,resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'silent'});
const {GameEngine,knight,newProgress,maxHealth,AttackSequence,STRIKES,createSwing,stationaryMotionPath,sampleMotionPath,DODGE_RULES,T}=await import(pathToFileURL(out));
const STEP=1/60;
function fixture(){
 const g=Object.create(GameEngine.prototype),hero=knight();
 Object.assign(g,{p:newProgress(),paused:false,disposed:false,combat:new AttackSequence(),facing:0,yaw:0,attackAnim:0,bladeBase:new T.Vector3(),bladeTip:new T.Vector3(),bladeOrigin:new T.Vector3(),castCd:0,dodgeCd:0,dodgeTime:0,stamina:100,time:0,flash:0,regen:0,moving:0,enemies:[],effects:[],keys:new Set(),stick:{x:0,y:0},touchSprint:false,attackHeld:false,actorList:[hero],world:{scene:new T.Scene(),hero,shrines:[],chests:[]},sound:{tone(){},suspend(){}},events:[],contacts:[],emits:0,reducedMotion:false,graphics:{version:1,brightness:1,impactShake:false},quality:'low',mobile:false,deathPresentations:new Map(),metrics:{measurements:{reset(){}}},adaptive:{resetSamples(){}},loopCalls:[]});
 g.p.x=0;g.p.z=20;g.event=e=>g.events.push(e);g.emit=()=>g.emits++;g.onHud=()=>{};
 g.loop={pause:v=>g.loopCalls.push(['pause',v]),setPresentationActive:v=>g.loopCalls.push(['present',v])};
 g.impacts={contact(...args){g.contacts.push(args);},reset(){},burst(){}};g.cameraImpact={reset(){},trigger(){}};return g;
}
function enemy(g,id='w1',x=0,z=22){const e={id,x,z,spawnX:x,spawnZ:z,hp:80,max:80,dead:false,hit:0,cool:100,swing:null,attackIndex:0,stagger:0,ring:{visible:true},actor:knight(true,id==='king')};g.enemies.push(e);g.actorList.push(e.actor);return e;}
function drain(g){g.drainCommands(g.mechanicsState().clock.nextTick);}
function frame(g,elapsed=STEP){return g.mechanicsState().clock.advanceFrame(elapsed,(dt,tick)=>g.stepSimulation(dt,tick));}
function close(actual,expected,message){assert.ok(Math.abs(actual-expected)<1e-8,`${message??''}: ${actual} != ${expected}`);}
function candidate(attackerId,targetId,time,damage=20,extras={}){return {actionId:attackerId==='hero'?1:2,attackerId,targetId,time,damage,stagger:.2,kind:'melee',point:{x:0,y:1,z:21},direction:{x:0,z:attackerId==='hero'?1:-1},hits:new Set(),targetLimit:1,...extras};}
function batch(g,candidates,{start=0,end=STEP,windows=[]}={}){const m=g.mechanicsState();m.tickStart=start;m.tickEnd=end;m.collecting=true;m.windows=new Map(windows);m.dodgeStartRemaining=g.dodgeTime;m.spawnStartRemaining=m.spawnRemaining;m.candidates.push(...candidates);g.time=end;try{g.flushContacts();}finally{m.collecting=false;}return m.eventTrace;}

test('Public commands mutate only on one unfrozen tick; two frozen slots preserve queued edges and all gameplay timers',()=>{
 const g=fixture(),m=g.mechanicsState();g.castCd=1;g.p.mana=50;g.attack();g.setAttackHeld(true);g.setAttackHeld(false);assert.equal(m.commands.size,3);assert.equal(g.combat.swing,null);assert.equal(g.stamina,100);
 m.clock.requestHitStop();const first=frame(g,2*STEP);assert.equal(first.frozenOpportunities,2);assert.equal(first.ticks,0);assert.equal(m.commands.size,3);assert.equal(g.castCd,1);assert.equal(g.p.mana,50);assert.equal(g.stamina,100);
 const resumed=frame(g);assert.equal(resumed.ticks,1);assert.equal(m.commands.size,0);assert.equal(g.combat.swing.strike.id,'side');assert.equal(g.attackHeld,false);close(g.stamina,92.1);close(g.castCd,1-STEP);close(g.p.mana,50+.1);
 const swing=g.combat.swing;frame(g,3*STEP);assert.equal(g.combat.swing,swing);close(g.stamina,92.4,'catch-up must not recharge the strike');
});
test('Same-tick dodge takes start priority over attack regardless of input ordering; dodge taps never replay',()=>{
 for(const order of [['attack','dodge'],['dodge','attack']]){const g=fixture();for(const key of order)g[key]();frame(g);assert.equal(g.combat.swing,null);close(g.stamina,75.3);close(g.dodgeTime,DODGE_RULES.duration-STEP);assert.equal(g.mechanicsState().commands.size,0);g.attack();frame(g);assert.equal(g.combat.swing,null);for(let n=0;n<28;n++)frame(g);assert.equal(g.combat.swing,null);assert.equal(g.dodgeTime,0);}
});
test('Existing held intent survives dodge but release clears it; resumed combo starts fresh side',()=>{
 for(const release of [false,true]){const g=fixture();g.setAttackHeld(true);drain(g);g.combat.swing.elapsed=.4;g.dodge();drain(g);assert.equal(g.combat.swing,null);assert.equal(g.attackHeld,true);if(release)g.setAttackHeld(false);for(let n=0;n<29;n++)frame(g);assert.equal(g.attackHeld,!release);assert.equal(g.combat.swing?.strike.id??null,release?null:'side');}
});
test('Ordinary mutual lethal trade latches death before level-up rewards and pays one save/terminal event',()=>{
 const g=fixture(),e=enemy(g);g.p.health=20;g.p.xp=150;e.hp=26;batch(g,[candidate(e.id,'hero',.005,20),candidate('hero',e.id,.005,26)]);
 assert.equal(g.p.health,0);assert.equal(e.hp,0);assert.equal(e.dead,true);assert.equal(g.p.xp,215);assert.equal(g.p.souls,28);assert.deepEqual(g.p.defeated,['w1']);assert.equal(g.p.won,false);assert.deepEqual(g.events.filter(e=>e.type==='death'||e.type==='victory').map(e=>e.type),['death']);assert.equal(g.events.filter(e=>e.type==='milestone').length,1);assert.equal(g.emits,1);assert.equal(g.paused,true);assert.deepEqual(g.loopCalls.slice(-2),[['pause',true],['present',true]]);
 batch(g,[candidate('hero',e.id,.01,26)]);assert.equal(g.p.xp,215);assert.equal(g.p.souls,28);assert.equal(g.events.filter(e=>e.type==='milestone').length,1);
});
test('King mutual lethal trade awards victory at zero HP, suppresses death overlay and survives shrine return',()=>{
 const g=fixture(),e=enemy(g,'king');g.p.shrines=['cinder','dusk','crown'];g.p.health=20;e.hp=26;batch(g,[candidate('hero','king',.005,26),candidate('king','hero',.005,20)]);
 assert.equal(g.p.won,true);assert.equal(g.p.health,0);assert.equal(g.p.xp,360);assert.equal(g.p.souls,250);assert.deepEqual(g.events.filter(e=>e.type==='death'||e.type==='victory').map(e=>e.type),['victory']);assert.equal(g.events.filter(e=>e.type==='milestone').length,1);
 g.respawn();assert.equal(g.p.health,maxHealth(g.p));assert.equal(g.p.won,true);assert.deepEqual(g.p.defeated,['king']);assert.equal(e.dead,true);assert.equal(g.p.souls,250);assert.equal(g.mechanicsState().terminal,null);assert.equal(g.paused,false);
});
test('Earlier death removes later attacks independent of candidate insertion',()=>{
 for(const reverse of [false,true]){const g=fixture(),e=enemy(g);e.hp=26;const contacts=[candidate('hero',e.id,.003,26),candidate(e.id,'hero',.012,200)];batch(g,reverse?contacts.reverse():contacts);assert.equal(g.p.health,140);assert.equal(e.dead,true);assert.equal(g.mechanicsState().eventTrace.length,1);}
});
test('Contact-time windup snapshot cancels later attack even when tick ends in active phase',()=>{
 const g=fixture(),e=enemy(g);g.attack();drain(g);const swing=g.combat.swing;swing.elapsed=.18;
 const events=batch(g,[candidate('hero',e.id,.013,26),candidate(e.id,'hero',.002,10)],{windows:[['hero',{swing,actor:g.world.hero,from:.165,to:.18166666666666667,done:false}]]});assert.equal(g.p.health,130);assert.equal(e.hp,80);assert.equal(g.combat.swing,null);assert.equal(events.length,1);assert.equal(events[0].interrupted,true);
});
test('Dodge and spawn immunity use contact timestamps on both sides of exact boundaries',()=>{
 for(const [age,protectedNow] of [[.049,false],[.050,true],[.299,true],[.300,false]]){const g=fixture(),e=enemy(g);g.dodgeTime=.45-(age-.001);batch(g,[candidate(e.id,'hero',.001,10)]);assert.equal(g.p.health,protectedNow?140:130,`dodge age ${age}`);assert.equal(g.mechanicsState().eventTrace[0].outcome,protectedNow?'evaded':'damaged');}
 for(const [time,protectedNow] of [[.004,true],[.005,false],[.006,false]]){const g=fixture(),e=enemy(g);g.mechanicsState().spawnRemaining=.005;batch(g,[candidate(e.id,'hero',time,10)]);assert.equal(g.p.health,protectedNow?140:130,`spawn contact ${time}`);}
});
function pathBetween(from,to){return {start:{...from},end:{...to},segments:[{t0:0,t1:1,from:{...from},to:{...to},kind:'move'}],corrections:[]};}
function shortWeapon(g){g.world.hero.visual={strike(){},segment(base,tip){const p=g.world.hero.group.position;base.set(p.x,1.2,p.z+.8);tip.set(p.x,1.2,p.z+1.1);}};}
function tracePathContact(g,e,heroPath,targetPath){const m=g.mechanicsState(),swing=createSwing(STRIKES[0],0);m.collecting=true;m.tickStart=0;m.tickEnd=.16;m.paths.set('hero',heroPath);m.paths.set(e.id,targetPath);g.combat.swing=swing;try{g.resolveMelee(g.world.hero,swing,.17,.33,null);const pending=m.candidates.map(c=>({...c}));g.time=.16;g.flushContacts();return pending;}finally{m.collecting=false;}}
test('Articulated contacts sample both moving roots at candidate time and restore the presentation root',()=>{
 const g=fixture(),e=enemy(g,'w1',0,22);shortWeapon(g);g.p.z=22;g.world.hero.group.position.set(0,0,22);const heroPath=pathBetween({x:0,z:20},{x:0,z:22}),targetPath=pathBetween({x:0,z:24},{x:0,z:22});
 const pending=tracePathContact(g,e,heroPath,targetPath);assert.equal(pending.length,1);assert.ok(pending[0].time>.08&&pending[0].time<.16);assert.equal(e.hp,54);assert.equal(g.world.hero.group.position.z,22);assert.equal(g.p.z,22);const sampled=sampleMotionPath(heroPath,pending[0].time/.16);assert.ok(pending[0].point.z>=sampled.z+.8-1e-8&&pending[0].point.z<=sampled.z+1.1+1e-8);
});
test('Endpoint body projection cannot retroactively move a target through a blade or enter its contact path',()=>{
 const g=fixture(),e=enemy(g,'w1',0,21);shortWeapon(g);const path=stationaryMotionPath({x:0,z:24});path.end={x:0,z:21};path.corrections.push({from:{x:0,z:24},to:{x:0,z:21}});const pending=tracePathContact(g,e,stationaryMotionPath(g.p),path);assert.equal(pending.length,0);assert.equal(e.hp,80);assert.equal(sampleMotionPath(path,1).z,21);assert.equal(sampleMotionPath(path,1-1e-10).z,24);
});
test('Recoil is queued by contact and changes only the next unfrozen tick, not the committed motion path',()=>{
 const g=fixture(),e=enemy(g),m=g.mechanicsState(),path=stationaryMotionPath(e);m.paths.set(e.id,path);const before=structuredClone(path);batch(g,[candidate('hero',e.id,.005,10)]);assert.deepEqual(path,before);assert.equal(e.z,22);assert.ok(m.recoil.get(e.id).z>0);assert.equal(m.clock.frozenRemaining,2);frame(g,2*STEP);assert.equal(e.z,22);frame(g);assert.ok(e.z>22);assert.equal(e.hp,70);
});
test('Pause retains an in-flight action, clears captured edges/freeze and never charges them on resume',()=>{
 const g=fixture(),m=g.mechanicsState();g.attack();drain(g);const swing=g.combat.swing;swing.elapsed=.24;g.setAttackHeld(true);g.dodge();g.setStick(1,0,true);m.clock.requestHitStop();g.pause(true);assert.equal(g.combat.swing,swing);assert.equal(swing.elapsed,.24);assert.equal(m.commands.size,0);assert.equal(m.clock.frozenRemaining,0);assert.equal(g.attackHeld,false);assert.equal(g.touchSprint,false);assert.deepEqual(g.stick,{x:0,y:0});assert.deepEqual(g.loopCalls.slice(-2),[['pause',true],['present',false]]);g.pause(false);frame(g);assert.equal(g.combat.swing,swing);close(swing.elapsed,.24+STEP);assert.equal(g.dodgeTime,0);close(g.stamina,92.1);
});
test('Respawn clears transient movement/actions and grants one-second protection without dodge travel',()=>{
 const g=fixture(),m=g.mechanicsState();g.p.health=0;g.p.won=true;g.p.defeated=['king'];m.terminal='victory';m.velocity.set('hero',{x:8,z:0});m.recoil.set('hero',{x:2,z:0});g.dodgeTime=.3;g.attack();g.respawn();assert.equal(g.dodgeTime,0);assert.equal(m.spawnRemaining,1);assert.equal(m.commands.size,0);assert.equal(m.velocity.size,0);assert.equal(m.recoil.size,0);assert.equal(g.p.won,true);const spawn={x:g.p.x,z:g.p.z};frame(g);assert.equal(g.p.x,spawn.x);assert.equal(g.p.z,spawn.z);assert.equal(g.stamina,100);assert.equal(g.hitPlayer(20),false);for(let n=1;n<60;n++)frame(g);assert.equal(g.p.x,spawn.x);assert.equal(g.p.z,spawn.z);assert.equal(g.hitPlayer(20),true);
});
test('Reduced motion changes optional feedback only, never accepted melee hit stop',()=>{
 for(const reduced of [false,true]){const g=fixture(),e=enemy(g);g.reducedMotion=reduced;batch(g,[candidate('hero',e.id,.005,10)]);assert.equal(e.hp,70);assert.equal(g.mechanicsState().clock.frozenRemaining,2);assert.equal(frame(g,2*STEP).ticks,0);}
});
test('Sprinting preserves prior regeneration then drain, including the full-stamina cap',()=>{for(const [before,after] of [[80,79.8],[100,99.5]]){const g=fixture();g.stamina=before;g.keys.add('w');g.keys.add('shift');frame(g);close(g.stamina,after,'18/s recovery is capped before 30/s sprint cost');}});

function elapsedSchedule(hz,seconds=5){const count=hz*seconds;return Array.from({length:count},()=>1/hz);}
function jitterSchedule(){const pattern=[.1,1/120,1/30,.02,1/60,.075,.011];const result=[];let remaining=5,index=0;while(remaining>1e-10){const dt=Math.min(remaining,pattern[index++%pattern.length]);result.push(dt);remaining-=dt;}return result;}
function rounded(value){return typeof value==='number'?Math.round(value*1e9)/1e9:Array.isArray(value)?value.map(rounded):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rounded(item)])):value;}
function replay(schedule){
 const g=fixture(),a=enemy(g,'w1',0,22),b=enemy(g,'w2',1.5,24),m=g.mechanicsState();a.cool=.2;b.cool=.7;g.p.xp=150;g.p.health=100;g.stamina=80;g.p.mana=60;
 const controls=[[1,{type:'attack'}],[28,{type:'dodge'}],[29,{type:'attack'}],[60,{type:'attack'}],[75,{type:'hold',pressed:true}],[120,{type:'hold',pressed:false}],[138,{type:'cast'}],[100,{type:'heal'}],[210,{type:'attack'}],[250,{type:'cast'}]];
 for(const [tick,payload] of controls)m.commands.enqueue(payload,tick);
 const trace=[],candidates=[];let admitted=0,frozen=0,dropped=0;
 const flush=g.flushContacts;g.flushContacts=function(){candidates.push(...m.candidates.map(c=>rounded({actionId:c.actionId,attackerId:c.attackerId,targetId:c.targetId,time:c.time,damage:c.damage,kind:c.kind,point:c.point,direction:c.direction})));return flush.call(this);};
 for(const elapsed of schedule){if(g.paused)break;const step=m.clock.advanceFrame(elapsed,(dt,tick)=>{
  g.keys.clear();if(tick.tick>=35&&tick.tick<48)g.keys.add('d');if(tick.tick>=100&&tick.tick<115)g.keys.add('w');if(tick.tick>=190&&tick.tick<205){g.keys.add('a');g.keys.add('shift');}
  g.stepSimulation(dt,tick);
  trace.push(rounded({tick:tick.tick,time:g.time,hero:{x:g.p.x,z:g.p.z,hp:g.p.health,mana:g.p.mana,stamina:g.stamina,dodge:g.dodgeTime,dodgeCd:g.dodgeCd,cast:g.castCd,attack:g.combat.swing?{id:g.combat.swing.strike.id,age:g.combat.swing.elapsed,facing:g.combat.swing.facing,hits:[...g.combat.swing.hits]}:null},enemies:g.enemies.map(e=>({id:e.id,x:e.x,z:e.z,hp:e.hp,dead:e.dead,cool:e.cool,stagger:e.stagger,attack:e.swing?{id:e.swing.strike.id,age:e.swing.elapsed,facing:e.swing.facing,hits:[...e.swing.hits]}:null})),progress:{xp:g.p.xp,souls:g.p.souls,potions:g.p.potions,defeated:g.p.defeated.slice(),won:g.p.won},events:m.eventTrace,terminal:m.terminal}));
 });admitted+=step.admittedTime;frozen+=step.frozenOpportunities;dropped+=step.droppedTime;}
 return {trace,candidates,admitted,frozen,dropped,final:trace.at(-1),events:g.events};
}
test('Full engine tick replay is invariant at 20/30/60/120 Hz and mixed frames including 100ms',()=>{
 const baseline=replay(elapsedSchedule(60));assert.ok(baseline.frozen>0,'trace must exercise real accepted melee hit stop');assert.ok(baseline.final.events.length>0,'trace must contain resolved contact events');assert.ok(baseline.final.progress.defeated.length>0,'trace must exercise death and reward progression');assert.equal(baseline.final.progress.potions,2,'trace must exercise an accepted healing command');assert.equal(baseline.final.terminal,null,'nonterminal fixture must run the full schedule');close(baseline.admitted,5);assert.equal(baseline.dropped,0);
 for(const [name,schedule] of [['20 Hz',elapsedSchedule(20)],['30 Hz',elapsedSchedule(30)],['120 Hz',elapsedSchedule(120)],['jitter',jitterSchedule()]]){const actual=replay(schedule);assert.deepEqual(actual.trace,baseline.trace,`${name} authoritative tick trace differs`);assert.deepEqual(actual.events,baseline.events,`${name} progression events differ`);assert.deepEqual(actual.candidates,baseline.candidates,`${name} candidate timestamps/geometry differ`);close(actual.admitted,5);assert.equal(actual.frozen,baseline.frozen);assert.equal(actual.dropped,0);}
 if(process.env.MECHANICS_REPLAY_OUT)writeFileSync(process.env.MECHANICS_REPLAY_OUT,JSON.stringify({method:'Actual stepSimulation with real fixed clock and tick-stamped commands; no renderer, ordinary procedural actor contact sockets; authoritative numbers rounded only to 1e-9 for comparison.',rates:['20 Hz','30 Hz','60 Hz','120 Hz','jitter incl 100ms'],seconds:5,ticks:baseline.trace.length,admittedSeconds:baseline.admitted,frozenOpportunities:baseline.frozen,droppedSeconds:baseline.dropped,candidateCount:baseline.candidates.length,traceSha256:createHash('sha256').update(JSON.stringify(baseline.trace)).digest('hex'),candidateSha256:createHash('sha256').update(JSON.stringify(baseline.candidates)).digest('hex'),final:baseline.final},null,2)+'\n');
});
