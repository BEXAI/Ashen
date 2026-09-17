import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.GAME_ROOT||process.cwd();
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const out=path.join(await mkdtemp(path.join(os.tmpdir(),'ashen-engine-mechanics-')),'engine.mjs');
await build({stdin:{contents:`export {GameEngine} from './app/game/engine';export {knight} from './app/game/world';export {newProgress,maxHealth} from './app/game/model';export * from './app/game/combat';export * from './app/game/kinematic';export * from './app/game/action-rules';export * as T from 'three';`,resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'silent'});
const {GameEngine,knight,newProgress,AttackSequence,T}=await import(pathToFileURL(out));
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


test('Gate obstruction uses progress authority when visible is stale in either direction',()=>{
 const g=fixture();g.sightRay=new T.Raycaster();
 const architecture=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());architecture.position.set(100,100,100);architecture.updateMatrixWorld(true);
 const gate=new T.Mesh(new T.BoxGeometry(6,4,.3),new T.MeshBasicMaterial());gate.position.set(0,2,5);gate.updateMatrixWorld(true);g.world.architecture=architecture;g.world.gates=[gate];
 const from=new T.Vector3(0,1.4,6),to=new T.Vector3(0,1.4,4);
 try{gate.visible=false;close(g.obstruction(from,to),.85,'closed progress seal must block even before visibility redraw');g.p.shrines=['cinder'];g.p.defeated=['w1','w2','w3'];gate.visible=true;assert.equal(g.obstruction(from,to),Infinity,'newly opened progress seal must stop blocking immediately');}
 finally{architecture.geometry.dispose();architecture.material.dispose();gate.geometry.dispose();gate.material.dispose();}
});
test('Enemy attack admission samples hero LOS from the same start-of-tick root as distance/facing',()=>{
 for(const blockedAtStart of [true,false]){const g=fixture(),e=enemy(g,'w5',0,22);e.cool=0;g.keys.add('s');g.mechanicsState().velocity.set('hero',{x:0,z:5.4});const origins=[];
  g.obstruction=(from)=>{origins.push(from.z);return ((from.z<20.045)===blockedAtStart)?.5:Infinity;};frame(g);
  close(g.mechanicsState().paths.get('hero').start.z,20);close(g.mechanicsState().paths.get('hero').end.z,20.09);assert.equal(!!e.swing,!blockedAtStart,'AI must not read the already committed hero endpoint');assert.equal(origins[0],20,'first AI LOS ray must originate at the prior root');
 }
});

test('Missed hero and ordinary enemy attacks receive distinct action IDs at admission',()=>{
 const g=fixture(),m=g.mechanicsState();g.attack();drain(g);const first=g.combat.swing,firstId=m.actionIds.get(first);assert.ok(Number.isSafeInteger(firstId));assert.equal(m.eventTrace.length,0);
 for(let i=0;i<6;i++)frame(g,.1);assert.equal(g.combat.swing,null);assert.equal(first.hits.size,0);g.attack();drain(g);const secondId=m.actionIds.get(g.combat.swing);assert.ok(secondId>firstId);
 const e=enemy(g,'w5',0,22);e.cool=0;frame(g);assert.ok(e.swing);assert.ok(m.actionIds.get(e.swing)>secondId);assert.equal(m.eventTrace.length,0,'IDs must exist before any active contact occurs');
});
