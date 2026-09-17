import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const root=process.env.GAME_ROOT||process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'ashen-lifecycle-dispatch-'));
after(()=>fs.rm(dir,{recursive:true,force:true}));
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const ts=(await import(pathToFileURL(path.join(root,'node_modules/typescript/lib/typescript.js')))).default;
// Extract the actual registration closure, not a handwritten copy of its handlers.
// This avoids constructing WebGL and asset loaders; it does not rewrite the constructor.
const source=ts.createSourceFile('engine.ts',await fs.readFile(path.join(root,'app/game/engine.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const engineClass=source.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='GameEngine'),constructor=engineClass.members.find(ts.isConstructorDeclaration);
const statements=constructor.body.statements.find(ts.isTryStatement).tryBlock.statements;
const first=statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='listen'));
const last=statements.findIndex(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&ts.isIdentifier(n.expression.expression)&&n.expression.expression.text==='listen'&&ts.isStringLiteral(n.expression.arguments[1])&&n.expression.arguments[1].text==='webglcontextlost');
assert.ok(first>=0&&last>first,'engine listener-registration block must be discoverable');
const registration=statements.slice(first,last+1).map(n=>n.getText(source)).join('\n'),out=path.join(dir,'runtime.mjs');
await build({stdin:{contents:`import * as T from 'three';export {T};export {GameEngine} from './app/game/engine';export {RenderLoop} from './app/game/mobile-runtime';export {knight} from './app/game/world';export {newProgress} from './app/game/model';export {AttackSequence,createSwing,STRIKES} from './app/game/combat';export function registerEngineListeners(){${registration}}`,loader:'ts',resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {GameEngine,RenderLoop,knight,newProgress,AttackSequence,createSwing,STRIKES,registerEngineListeners,T}=await import(pathToFileURL(out));
const STEP=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
class Surface extends EventTarget{
 listeners=new Map();captures=new Set();hidden=false;
 addEventListener(type,fn,options){super.addEventListener(type,fn,options);const set=this.listeners.get(type)??new Set();set.add(fn);this.listeners.set(type,set);}
 removeEventListener(type,fn,options){super.removeEventListener(type,fn,options);this.listeners.get(type)?.delete(fn);}
 setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
}
function dispatch(target,type,fields={}){const event=Object.assign(new Event(type,{cancelable:true}),fields);target.dispatchEvent(event);return event;}
function fakeFrames(){let serial=0;const pending=new Map();return {pending,request(cb){pending.set(++serial,cb);return serial;},cancel(id){pending.delete(id);},step(now){const work=[...pending.values()];pending.clear();for(const cb of work)cb(now);}};}
function fixture(){
 const oldWindow=globalThis.window,oldDocument=globalThis.document,win=new Surface(),doc=new Surface(),canvas=new Surface(),media=new Surface(),raf=fakeFrames(),frames=[];
 media.matches=false;win.matchMedia=()=>media;globalThis.window=win;globalThis.document=doc;
 const g=Object.create(GameEngine.prototype),hero=knight();let soundSuspends=0;
 Object.assign(g,{p:newProgress(),paused:false,disposed:false,contextLost:false,combat:new AttackSequence(),facing:0,yaw:0,pitch:.47,drag:null,attackAnim:0,bladeBase:new T.Vector3(),bladeTip:new T.Vector3(),bladeOrigin:new T.Vector3(),castCd:1,dodgeCd:0,dodgeTime:0,stamina:70,time:0,last:0,flash:0,regen:0,moving:0,enemies:[],effects:[],keys:new Set(),stick:{x:0,y:0},touchSprint:false,attackHeld:false,actorList:[hero],world:{scene:new T.Scene(),hero,shrines:[],chests:[]},renderer:{domElement:canvas},sound:{tone(){},ensure(){},suspend(){soundSuspends++;}},events:[],emits:0,reducedMotion:false,graphics:{version:1,brightness:1,impactShake:false},quality:'low',mobile:false,deathPresentations:new Map(),metrics:{measurements:{reset(){}}},adaptive:{resetSamples(){}},cleanup:[]});
 Object.assign(g.p,{x:0,z:20,shrines:['cinder','dusk','crown']});g.event=e=>g.events.push(e);g.emit=()=>g.emits++;g.onHud=()=>{};g.impacts={contact(){},reset(){},burst(){}};g.cameraImpact={reset(){},trigger(){}};
 const boss={id:'king',x:5,z:20,spawnX:5,spawnZ:20,hp:620,max:620,dead:false,hit:0,cool:100,swing:null,attackIndex:0,stagger:100,ring:{visible:true},actor:knight(true,true)};g.enemies.push(boss);g.actorList.push(boss.actor);
 // Same thin timestamp adapter as the existing engine timing tests. The actual
 // listeners own last=0/reset/suspend; production RenderLoop and admission run here.
 g.loop=new RenderLoop(now=>{const dt=Math.max(0,(g.last?now-g.last:0)/1000);g.last=now;frames.push(g.advanceFrameTime(dt));},raf.request,raf.cancel);
 registerEngineListeners.call(g);g.loop.invalidate();raf.step(1000);
 return {g,m:g.mechanicsState(),win,doc,canvas,media,raf,frames,get soundSuspends(){return soundSuspends;},dispose(){g.loop.dispose();for(const cleanup of g.cleanup)cleanup();globalThis.window=oldWindow;globalThis.document=oldDocument;}};
}
function warning(f){assert.equal(f.m.hazards.start({id:'sentry',ownerId:'king',actionId:'1',kind:'eruption',center:{x:0,z:20},radius:1.2,warningSeconds:.05,activeSeconds:.35,damageMultiplier:1},f.m.clock.gameTime),true);}
function pendingInput(f){dispatch(f.win,'keydown',{key:'j',repeat:false});dispatch(f.win,'keydown',{key:'w',repeat:false});f.g.setStick(.6,.2,true);dispatch(f.canvas,'pointerdown',{pointerId:7,pointerType:'touch',button:0,clientX:20,clientY:30});assert.ok(f.m.commands.size);assert.ok(f.g.drag);}
function noInput(f){assert.equal(f.m.commands.size,0);assert.equal(f.g.attackHeld,false);assert.equal(f.g.keys.size,0);assert.deepEqual(f.g.stick,{x:0,y:0});assert.equal(f.g.touchSprint,false);assert.equal(f.g.drag,null);assert.equal(f.canvas.captures.size,0);}
function state(f){const {g,m}=f;return {p:structuredClone(g.p),age:g.combat.swing?.elapsed,dodge:g.dodgeTime,stamina:g.stamina,cooldown:g.castCd,tick:m.clock.nextTick,time:m.clock.gameTime,hazard:m.hazards.snapshot()};}

test('Registered visibility handlers suspend windup/warning/hit-stop, clear captured input, and resume with a fresh timestamp',()=>{
 const f=fixture(),{g,m,doc,raf}=f;try{
  g.combat.swing=createSwing(STRIKES[0],0);g.combat.swing.elapsed=.08;warning(f);g.advanceFrameTime(.007);m.clock.requestHitStop();pendingInput(f);const before=state(f),draws=f.frames.length;
  doc.hidden=true;dispatch(doc,'visibilitychange');noInput(f);assert.equal(g.last,0);assert.equal(m.clock.frozenRemaining,0);assert.equal(raf.pending.size,0);assert.equal(f.soundSuspends,1);raf.step(60000);assert.equal(f.frames.length,draws);assert.deepEqual(state(f),before);
  doc.hidden=false;dispatch(doc,'visibilitychange');assert.equal(raf.pending.size,1);raf.step(120000);assert.equal(f.frames.at(-1).dt,0);assert.deepEqual(state(f),before);raf.step(120000+1000/60);
  near(g.combat.swing.elapsed,.08+STEP);near(g.castCd,1-STEP);assert.equal(m.clock.nextTick,before.tick+1);assert.equal(g.p.health,before.p.health);assert.equal(m.hazards.snapshot().pulseEmitted,false);assert.equal(m.commands.size,0);assert.equal(g.attackHeld,false);
 }finally{f.dispose();}
});

test('Registered pagehide/pageshow preserves dodge and hazard time while dropping the hidden interval and queued edges',()=>{
 const f=fixture(),{g,m,win,raf}=f;try{
  g.dodgeTime=.25;m.dodgeDirection={x:0,z:1};warning(f);pendingInput(f);const before=state(f),draws=f.frames.length;
  dispatch(win,'pagehide');noInput(f);assert.equal(raf.pending.size,0);raf.step(45000);assert.equal(f.frames.length,draws);assert.deepEqual(state(f),before);
  dispatch(win,'pageshow');raf.step(90000);assert.equal(f.frames.at(-1).dt,0);assert.deepEqual(state(f),before);raf.step(90000+1000/60);near(g.dodgeTime,.25-STEP);near(g.p.z,20+14*STEP);near(g.stamina,70+18*STEP);assert.equal(g.combat.swing,null);assert.equal(m.hazards.snapshot().pulseEmitted,false);assert.equal(m.commands.size,0);
 }finally{f.dispose();}
});

test('Registered context loss during active contact suspends once, preserves warning/action, and cannot resume through pageshow',()=>{
 const f=fixture(),{g,m,canvas,win,doc,raf}=f;try{
  g.combat.swing=createSwing(STRIKES[3],0);g.combat.swing.elapsed=.36;warning(f);pendingInput(f);m.clock.requestHitStop();const before=state(f),draws=f.frames.length;
  assert.equal(dispatch(canvas,'webglcontextlost').defaultPrevented,true);assert.equal(dispatch(canvas,'webglcontextlost').defaultPrevented,true);assert.equal(g.contextLost,true);assert.equal(g.paused,true);noInput(f);assert.equal(m.clock.frozenRemaining,0);assert.equal(raf.pending.size,0);assert.deepEqual(g.events,[{type:'graphics-lost'}]);assert.deepEqual(state(f),before);
  dispatch(win,'pageshow');dispatch(doc,'visibilitychange');raf.step(120000);assert.equal(raf.pending.size,0);assert.equal(f.frames.length,draws);assert.deepEqual(state(f),before);dispatch(win,'keydown',{key:'j',repeat:false});assert.equal(m.commands.size,0);
 }finally{f.dispose();}
 assert.ok([...f.canvas.listeners.values(),...f.win.listeners.values(),...f.doc.listeners.values(),...f.media.listeners.values()].every(set=>set.size===0),'registered teardown must remove every listener');
});

test('Registered canvas cancellation/lost capture prevents ghost clicks; keyboard release retains buffer but blur cancels it',()=>{
 const f=fixture(),{g,m,win,canvas}=f;try{
  for(const type of ['pointercancel','lostpointercapture']){dispatch(canvas,'pointerdown',{pointerId:11,pointerType:'mouse',button:0,clientX:20,clientY:30});dispatch(canvas,type,{pointerId:99});assert.equal(g.drag.id,11);dispatch(canvas,type,{pointerId:11});assert.equal(g.drag,null);dispatch(canvas,'pointerup',{pointerId:11,pointerType:'mouse',button:0});assert.equal(m.commands.size,0);canvas.releasePointerCapture(11);}
  dispatch(canvas,'pointerdown',{pointerId:12,pointerType:'mouse',button:0,clientX:20,clientY:30});dispatch(canvas,'pointerup',{pointerId:12,pointerType:'mouse',button:0});assert.equal(m.commands.size,1,'ordinary uncancelled click still queues its attack');canvas.releasePointerCapture(12);g.clearInput();
  g.combat.swing=createSwing(STRIKES[0],0);const old=g.combat.swing;dispatch(win,'keydown',{key:'j',repeat:false});g.drainCommands(m.clock.nextTick);dispatch(win,'keyup',{key:'j'});g.drainCommands(m.clock.nextTick);assert.equal(g.attackHeld,false);g.time=.1;g.combat.finish(g.time);g.startPlayerSwing();assert.ok(g.combat.swing);assert.notEqual(g.combat.swing,old,'normal release must preserve one buffered action');
  dispatch(win,'keydown',{key:'j',repeat:false});g.drainCommands(m.clock.nextTick);dispatch(win,'blur');noInput(f);g.combat.finish(g.time);g.startPlayerSwing();assert.equal(g.combat.swing,null,'lifecycle cancellation must clear the buffer');
 }finally{f.dispose();}
});
