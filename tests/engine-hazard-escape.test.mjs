import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const root=process.env.GAME_ROOT||process.cwd();
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ashen-engine-hazard-escape-'));after(()=>fs.rm(dir,{recursive:true,force:true}));
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const out=path.join(dir,'runtime.mjs');
await build({stdin:{contents:`export {GameEngine} from './app/game/engine';export {knight} from './app/game/world';export {newProgress} from './app/game/model';export {AttackSequence,STRIKES,createSwing} from './app/game/combat';export {buildCollisionWorld,canOccupy,movementRadius,stationaryMotionPath} from './app/game/kinematic';export {ENEMY_ROSTER} from './app/game/character-roster';export * as T from 'three';`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {GameEngine,knight,newProgress,AttackSequence,STRIKES,createSwing,buildCollisionWorld,canOccupy,movementRadius,stationaryMotionPath,ENEMY_ROSTER,T}=await import(pathToFileURL(out));
const STEP=1/60;

function fixture(phase,{openFloor=false,blockersDead=false}={}){
 const g=Object.create(GameEngine.prototype),hero=knight(),offset=openFloor?{x:-5,z:5}:{x:0,z:0};
 Object.assign(g,{p:newProgress(),paused:false,disposed:false,combat:new AttackSequence(),facing:0,yaw:0,attackAnim:0,bladeBase:new T.Vector3(),bladeTip:new T.Vector3(),bladeOrigin:new T.Vector3(),castCd:0,dodgeCd:0,dodgeTime:0,stamina:100,time:0,flash:0,regen:0,moving:0,enemies:[],effects:[],keys:new Set(),stick:{x:0,y:0},touchSprint:false,attackHeld:false,actorList:[hero],world:{scene:new T.Scene(),hero,shrines:[],chests:[]},sound:{tone(){},suspend(){}},events:[],emits:0,reducedMotion:false,graphics:{version:1,brightness:1,impactShake:false},quality:'low',mobile:false,deathPresentations:new Map(),metrics:{measurements:{reset(){}}},adaptive:{resetSamples(){}}});
 Object.assign(g.p,{x:18.4+offset.x,z:-81.4+offset.z,shrines:['cinder','dusk','crown']});
 g.event=e=>g.events.push(e);g.emit=()=>g.emits++;g.onHud=()=>{};g.loop={pause(){},setPresentationActive(){}};g.impacts={contact(){},reset(){},burst(){}};g.cameraImpact={reset(){},trigger(){}};
 const add=(id,x,z)=>{const actor=knight(true,id==='king'),e={id,x:x+offset.x,z:z+offset.z,spawnX:x+offset.x,spawnZ:z+offset.z,hp:id==='king'?620:80,max:id==='king'?620:80,dead:blocks(id)&&blockersDead,hit:0,cool:100,swing:null,attackIndex:0,stagger:id==='king'?0:100,ring:{visible:true},actor};g.enemies.push(e);g.actorList.push(actor);return e;};
 // Both .65-radius blockers are legal, mutually separated, and do not overlap
 // the .45-radius hero. The actual throne-room east/south walls close the other exits.
 add('w6',17.15,-81.3);add('w7',18.3,-80.15);const boss=add('king',13,-77);
 const swing=createSwing(STRIKES[3],Math.PI/2);swing.elapsed=phase==='active'?swing.strike.windup:swing.strike.windup+swing.strike.active;g.combat.swing=swing;
 const m=g.mechanicsState();for(const e of g.enemies)m.paths.set(e.id,stationaryMotionPath(e));
 return {g,boss,m,swing};
}
const blocks=id=>id==='w6'||id==='w7';
function assertValidStart(g){
 const world=buildCollisionWorld(g.p),bodies=[{id:'hero',x:g.p.x,z:g.p.z,radius:.45},...g.enemies.map(e=>({...e,radius:movementRadius(ENEMY_ROSTER[e.id])}))];
 for(const body of bodies)assert.equal(canOccupy(world,body.x,body.z,body.radius),true,`${body.id} must start fully inside real floor`);
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)assert.ok(Math.hypot(bodies[i].x-bodies[j].x,bodies[i].z-bodies[j].z)>bodies[i].radius+bodies[j].radius,`${bodies[i].id}/${bodies[j].id} must not start overlapping`);
}

test('Actual engine escape rejects overhead active/recovery trapped jointly by real corner walls and living body starts',()=>{
 for(const phase of ['active','recovery']){
  const {g,m,swing}=fixture(phase);assertValidStart(g);const snapshot=g.motionState('hero',g.p,.45,swing),before=structuredClone(snapshot),progress=structuredClone(g.p),paths=structuredClone([...m.paths]);
  assert.equal(g.escapeAvailable(g.p,1.2,1,snapshot),false,phase);assert.deepEqual(snapshot,before,'escape search cannot advance live action or motion');assert.deepEqual(g.p,progress);assert.deepEqual([...m.paths],paths);
  // AI may already have planned endpoints before boss admission. Those endpoints
  // cannot be substituted for the shared start-of-tick stationary-body constraints.
  for(const e of g.enemies.filter(e=>blocks(e.id))){e.x-=6;m.paths.get(e.id).end.x=e.x;}
  assert.equal(g.escapeAvailable(g.p,1.2,1,snapshot),false,'later body endpoints must not manufacture an escape');
  for(const e of g.enemies.filter(e=>blocks(e.id)))e.dead=true;
  assert.equal(g.escapeAvailable(g.p,1.2,1,snapshot),true,'wall alone permits a real one-second walking escape');
  const free=fixture(phase,{openFloor:true});assertValidStart(free.g);
  assert.equal(free.g.escapeAvailable(free.g.p,1.2,1,free.g.motionState('hero',free.g.p,.45,free.swing)),true,'same living body arrangement allows escape away from the actual corner walls');
 }
});

test('Real boss AI suppresses no-escape eruption for overhead active/recovery, but accepts the same placement after blockers are defeated',()=>{
 for(const phase of ['active','recovery'])for(const blockersDead of [false,true]){
  const {g,m,swing}=fixture(phase,{blockersDead});assertValidStart(g);const startAge=swing.elapsed,seen=[],escape=g.escapeAvailable.bind(g);
  g.escapeAvailable=(center,radius,warning,snapshot)=>{const before=structuredClone(snapshot),result=escape(center,radius,warning,snapshot);assert.deepEqual(snapshot,before);seen.push({center:{...center},radius,warning,age:snapshot.swing?.elapsed,result});return result;};
  g.advanceFrameTime(STEP);
  assert.equal(seen.length,1,'out-of-melee-range boss evaluates its real eruption escape gate once');assert.equal(seen[0].radius,1.2);assert.equal(seen[0].warning,1);assert.equal(seen[0].age,startAge,'AI uses the pre-plan hero action snapshot');assert.deepEqual(seen[0].center,{x:18.4,z:-81.4});assert.equal(seen[0].result,blockersDead);
  if(blockersDead){assert.equal(m.boss.action?.pattern.id,'eruption');assert.equal(m.hazards.snapshot()?.phase,'warning');assert.equal(m.hazards.snapshot()?.pulseEmitted,false);assert.deepEqual(m.hazards.snapshot()?.center,seen[0].center);}
  else{assert.equal(m.boss.action,null);assert.equal(m.hazards.snapshot(),null);assert.equal(m.boss.nextDecisionAt,.35,'unsafe placement backs off rather than rerolling every tick');assert.equal(m.eventTrace.some(e=>e.kind==='hazard'),false);}
 }
});
