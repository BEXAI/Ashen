import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const sibling = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const game = process.env.GAME_ROOT || process.env.ASHEN_ASSET_DEPS || process.cwd();
const source = process.env.HAZARD_SOURCE_ROOT || (fs.existsSync(path.join(sibling,'hazards.ts')) ? sibling : path.join(game,'app/game'));
const { build } = await import(pathToFileURL(path.join(game, 'node_modules/esbuild/lib/main.js')));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ashen-hazards-'));
const bundled = path.join(temporary, 'hazards.mjs');
await build({ stdin: { contents: ['hazards.ts','enemy-patterns.ts','hazard-presentation.ts'].map(n => `export * from ${JSON.stringify(path.join(source,n))};`).join('\n')+'\nexport * as T from "three";', resolveDir: game }, nodePaths:[path.join(game,'node_modules')], bundle:true,format:'esm',platform:'node',outfile:bundled,logLevel:'silent' });
const { HazardSystem, insideHazardDisk, findWalkEscape, BossPatternController, bossPatternPhase, HazardPresentation, T } = await import(pathToFileURL(bundled));
process.on('exit', () => fs.rmSync(temporary,{recursive:true,force:true}));
const point = (x=0,z=0)=>({x,z});
const spec = (overrides={})=>({id:'floor-1',ownerId:'king',actionId:'king:1',kind:'eruption',center:point(),radius:1.2,warningSeconds:1,activeSeconds:.35,damageMultiplier:1,...overrides});
const query = (overrides={})=>({heroAt:()=>({id:'hero',x:0,z:0,alive:true}),ownerAliveAt:()=>true,lineOfSight:()=>true,...overrides});
const context = (gameTime=0, overrides={})=>({gameTime,ownerId:'king',boss:point(),hero:point(0,2.5),alive:true,heroAlive:true,shielded:false,encounterActive:true,hazardAvailable:true,lineOfSight:()=>true,legalFloor:()=>true,canEscape:()=>true,slamReachable:()=>true,...overrides});

test('TypeScript modules satisfy the repository strict compiler settings without modifying its checkout',async()=>{
 const ts=(await import(pathToFileURL(path.join(game,'node_modules/typescript/lib/typescript.js')))).default;
 const program=ts.createProgram(['hazards.ts','enemy-patterns.ts','hazard-presentation.ts'].map(n=>path.join(source,n)),{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,types:[],baseUrl:game,paths:{three:['node_modules/@types/three/index.d.ts']}});
 const errors=ts.getPreEmitDiagnostics(program);assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>source,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
});
test('Warning radius matches the ROOT center predicate; tangent hits and no hidden body inflation',()=>{
 assert.equal(insideHazardDisk(point(1.2,0),point(),1.2),true);
 assert.equal(insideHazardDisk(point(1.199,0),point(),1.2),true);
 assert.equal(insideHazardDisk(point(1.201,0),point(),1.2),false);
 assert.equal(insideHazardDisk(point(1.7,0),point(),1.2),false); // even though a .60 hurt capsule overlaps
 assert.equal(insideHazardDisk(point(NaN,0),point(),1.2),false);
});
test('Warning never hits, pulse is exact-time and once only, expiry removes the visual state',()=>{
 const h=new HazardSystem();assert.equal(h.start(spec()),true);
 assert.deepEqual(h.advance(.999,query()),[]);assert.equal(h.snapshot().phase,'warning');
 const hits=h.advance(1,query());assert.equal(hits.length,1);assert.equal(hits[0].time,1);assert.equal(hits[0].targetId,'hero');assert.equal(hits[0].requestsMeleeHitStop,false);
 assert.equal(h.snapshot().phase,'active');assert.deepEqual(h.advance(1,query()),[]);assert.deepEqual(h.advance(1.25,query()),[]);
 assert.deepEqual(h.advance(1.35,query()),[]);assert.equal(h.snapshot(),null);
});
test('Missed or wall-blocked pulse cannot replay if hero enters or wall opens during VFX',()=>{
 for(const reason of ['outside','blocked','dead','no-hero']){
  const h=new HazardSystem();h.start(spec());
  const q=query({heroAt:()=>reason==='no-hero'?null:({id:'hero',alive:reason!=='dead',x:reason==='outside'?2:0,z:0}),lineOfSight:()=>reason!=='blocked'});
  assert.deepEqual(h.advance(1,q),[]);assert.deepEqual(h.advance(1.1,query()),[],reason);
 }
});
test('Geometry emits candidate for central protection resolver once, without mutating hero health',()=>{
 const hero={id:'hero',alive:true,x:0,z:0,health:100,dodgeElapsed:.1};const h=new HazardSystem();h.start(spec());
 const hits=h.advance(1,query({heroAt:()=>hero}));assert.equal(hits.length,1);assert.equal(hero.health,100);
 // Simulate resolver rejection as evaded. The same pulse must never be retried after protection ends.
 hero.dodgeElapsed=.4;assert.deepEqual(h.advance(1.1,query({heroAt:()=>hero})),[]);
});
test('Frame partitions sample moving hero at pulse time, including a hitch crossing expiry',()=>{
 const run=(deltas,insideAtPulse)=>{
  const h=new HazardSystem();h.start(spec());const hits=[];let t=0;const sampled=[];
  const q=query({heroAt:time=>{sampled.push(time);return {id:'hero',alive:true,x:insideAtPulse?Math.abs(time-1)*10:2+Math.abs(time-1),z:0};}});
  for(const dt of deltas){t+=dt;hits.push(...h.advance(t,q));}return {hits,sampled};
 };
 for(const inside of [false,true]){
  const ref=run([2],inside);
  for(const rate of [20,30,60,120]){const got=run(Array(rate*2).fill(1/rate),inside);assert.deepEqual(got,ref);}
  assert.deepEqual(run([.16,.33,.51,.9,.1],inside),ref);assert.equal(ref.hits.length,inside?1:0);assert.deepEqual(ref.sampled,[1]);
 }
});
test('One hazard slot, immutable placement and explicit cancellation/reset/disposal',()=>{
 const input=spec(),h=new HazardSystem();assert.equal(h.start(input),true);input.center.x=8;
 assert.equal(h.snapshot().center.x,0);assert.equal(h.start(spec({id:'other'})),false);
 h.cancelOwner('other');assert.ok(h.snapshot());h.cancelOwner('king');assert.equal(h.snapshot(),null);assert.deepEqual(h.advance(2,query()),[]);
 h.reset(0);assert.equal(h.start(spec()),true);h.dispose();assert.equal(h.snapshot(),null);assert.equal(h.start(spec(),0),false);
});
test('Owner death before pulse removes warning; contact-time ownership is used across a large interval',()=>{
 const h=new HazardSystem();h.start(spec());assert.deepEqual(h.advance(.5,query({ownerAliveAt:()=>false})),[]);assert.equal(h.snapshot(),null);
 const j=new HazardSystem();j.start(spec());assert.deepEqual(j.advance(2,query({ownerAliveAt:(_id,t)=>t<.8})),[]);
 const k=new HazardSystem();k.start(spec());assert.equal(k.advance(2,query({ownerAliveAt:(_id,t)=>t<1.1})).length,1); // resolver may reject if a prior sorted event killed owner
});
test('Pause/hit-stop leave warning progress unchanged; invalid and backward clocks are rejected',()=>{
 const h=new HazardSystem();h.start(spec());h.advance(.4,query());const before=h.snapshot();
 for(let i=0;i<100;i++)assert.deepEqual(h.advance(.4,query()),[]);
 assert.deepEqual(h.snapshot(),before);assert.throws(()=>h.advance(.3,query()),RangeError);assert.throws(()=>h.advance(NaN,query()),RangeError);
 assert.throws(()=>new HazardSystem().start(spec({radius:Infinity})),RangeError);
});

// Fixture controller includes acceleration, existing action time and collision. Production injects its real implementation.
function escapeAdapter(overrides={}){
 const data={x:0,z:0,vx:0,vz:0,t:0,activeUntil:0};const telemetry=[];
 return {snapshot:data,currentIntent:point(),clone:s=>({...s}),position:s=>point(s.x,s.z),legal:s=>Math.abs(s.x)<10&&Math.abs(s.z)<10,
  step:(s,dt,intent)=>{telemetry.push({t:s.t,dt,intent:{...intent}});const cap=s.t<s.activeUntil?5.4*.25:5.4;const desired=point(intent.x*cap,intent.z*cap);for(const axis of ['x','z']){const k=axis==='x'?'vx':'vz',diff=desired[axis]-s[k];s[k]+=Math.sign(diff)*Math.min(Math.abs(diff),48*dt);s[axis]+=s[k]*dt;}s.t+=dt;},telemetry,...overrides};
}
test('Walk escape preserves source state, holds intent for reaction time and uses controller acceleration',()=>{
 const a=escapeAdapter(),before={...a.snapshot};const escape=findWalkEscape(a,point(),1.2,1);
 assert.ok(escape);assert.deepEqual(a.snapshot,before);assert.equal(escape.headingIndex,0);assert.ok(escape.end.z>1.35);
 assert.ok(a.telemetry.filter(s=>s.t<.2-1e-8).every(s=>s.intent.x===0&&s.intent.z===0));
 assert.ok(a.telemetry.every(s=>s.dt<=1/60+1e-12));assert.ok(a.telemetry.filter(s=>s.t>=.2-1e-8).some(s=>s.intent.z===1));
});
test('Committed slow action can make placement unfair although nominal speed budget would pass',()=>{
 const slow=escapeAdapter();slow.snapshot.activeUntil=2;
 assert.ok(5.4*(1-.2)>1.4+.15);assert.equal(findWalkEscape(slow,point(),1.4,1),null);
 assert.ok(findWalkEscape(escapeAdapter(),point(),1.4,1));
});
test('Sixteen deterministic candidates obey full collision; no escape by passing through a blocker',()=>{
 let count=0;const trapped=escapeAdapter({clone:s=>{count++;return {...s};},legal:s=>Math.hypot(s.x,s.z)<.5});
 assert.equal(findWalkEscape(trapped,point(),1.2,1),null);assert.equal(count,16);
 const blockedNorth=escapeAdapter({legal:s=>s.z<.5});const escape=findWalkEscape(blockedNorth,point(),1.2,1);assert.ok(escape);assert.notEqual(escape.headingIndex,0);
});
test('Escape rejects tangent plus safety margin, invalid controller positions and short warning',()=>{
 const stuck=escapeAdapter({step:()=>{},snapshot:{x:1.35,z:0},position:s=>s,legal:()=>true});assert.equal(findWalkEscape(stuck,point(),1.2,1),null);
 assert.equal(findWalkEscape(escapeAdapter({position:()=>point(NaN,0)}),point(),1.2,1),null);
 assert.equal(findWalkEscape(escapeAdapter(),point(),1.2,.2),null);
});

test('Boss selects a deterministic sweep/slam/eruption cycle with neutral recovery and immutable aim',()=>{
 const b=new BossPatternController(),c=context();const first=b.tryStart(c);assert.equal(first.pattern.id,'sweep');c.hero.x=20;
 assert.deepEqual(first.target,point(0,2.5));assert.equal(b.tryStart(context(.5)),null);assert.equal(bossPatternPhase(first,.8),'active');
 assert.equal(b.tryStart(context(first.endsAt+.349)),null);
 const second=b.tryStart(context(first.endsAt+.35));assert.equal(second.pattern.id,'slam');assert.equal(second.hazard.radius,1.4);assert.equal(second.pattern.contact,'hazard');
 const third=b.tryStart(context(second.endsAt+.35));assert.equal(third.pattern.id,'eruption');assert.equal(third.hazard.warningSeconds,1);
 const fourth=b.tryStart(context(third.endsAt+.35));assert.equal(fourth.pattern.id,'sweep');
});
test('Boss gates shield/death/encounter and does not drift locked floor placement',()=>{
 for(const changes of [{shielded:true},{alive:false},{heroAlive:false},{encounterActive:false}])assert.equal(new BossPatternController().tryStart(context(0,changes)),null);
 const b=new BossPatternController();const action=b.tryStart(context(0,{hero:point(0,6)}));assert.equal(action.pattern.id,'eruption');
 b.tryStart(context(.5,{hero:point(4,4)}));assert.deepEqual(action.hazard.center,point(0,6));
 b.tryStart(context(.6,{shielded:true}));assert.equal(b.action,null);
});
test('Invalid floor/escape/socket placements are suppressed and back off instead of rerolling every frame',()=>{
 for(const changes of [{legalFloor:()=>false},{canEscape:()=>false},{hazardAvailable:false}]){
  const b=new BossPatternController();assert.equal(b.tryStart(context(0,{hero:point(0,6),...changes})),null);assert.equal(b.nextDecisionAt,.35);
  assert.equal(b.tryStart(context(.1,{hero:point(0,6)})),null);assert.equal(b.tryStart(context(.35,{hero:point(0,6)})).pattern.id,'eruption');
 }
 const b=new BossPatternController();const a=b.tryStart(context(0,{sweepReachable:()=>false,slamReachable:()=>false}));assert.equal(a.pattern.id,'eruption');
});
test('Eruption cooldown is start-to-start game time and IDs cannot alias across reset',()=>{
 const b=new BossPatternController();const a=b.tryStart(context(0,{hero:point(0,6)}));
 assert.equal(b.tryStart(context(2.4,{hero:point(0,6)})),null);assert.equal(b.tryStart(context(3.9,{hero:point(0,6)})),null);
 const second=b.tryStart(context(4.25,{hero:point(0,6)}));assert.equal(second.pattern.id,'eruption');assert.notEqual(a.id,second.id);
 b.reset();assert.notEqual(b.tryStart(context()).id,a.id);
});
test('Boss pattern completion is frame-partition independent and no new action starts during recovery',()=>{
 for(const rate of [20,30,60,120]){
  const b=new BossPatternController(),a=b.tryStart(context());for(let i=1;i<rate;i++)assert.equal(b.tryStart(context(i/rate)),null);
  b.advance(a.endsAt);assert.equal(b.action,null);assert.equal(b.nextDecisionAt,a.endsAt+.35);
 }
});

function visualFixture(surface={groundHeight:()=>0,triangleAllowed:()=>true}){
 const scene=new T.Scene(),p=new HazardPresentation(scene,surface),h=new HazardSystem();h.start(spec());return {scene,p,h};
}
test('Authoritative warning survives low quality, disabled particles and reduced motion without clock drift',()=>{
 const {p,h}=visualFixture();h.advance(.5,query());const s=h.snapshot();p.update(s,{quality:'low',particlesDisabled:true,reducedMotion:true});
 assert.equal(p.group.visible,true);assert.equal(p.warning.visible,true);assert.equal(p.eruption.visible,false);
 const progress=p.group.getObjectByName('warning game-time fill'),count=progress.geometry.drawRange.count;assert.ok(count>0);
 for(let i=0;i<120;i++)p.update(s,{quality:'low',reducedMotion:true});assert.equal(progress.geometry.drawRange.count,count);assert.equal(p.group.userData.gameTime,.5);
 p.dispose();
});
test('Active marker and expiry use snapshot, with no rendering callback able to generate damage',()=>{
 const {p,h,scene}=visualFixture();const hits=h.advance(1,query());assert.equal(hits.length,1);p.update(h.snapshot(),{quality:'low',particlesDisabled:true});
 assert.equal(p.warning.visible,false);assert.equal(p.eruption.visible,true);assert.equal(p.eruption.children.filter(x=>x.visible).length,1);
 h.advance(1.35,query());p.update(h.snapshot());assert.equal(p.group.visible,false);p.dispose();assert.equal(scene.children.length,0);p.dispose();
});
test('Warning and eruption geometry obey floor-clipping callback and remain within drawn disk',()=>{
 const surface={groundHeight:()=>.3,triangleAllowed:(...pts)=>pts.every(p=>p.x<=.01)};const {p,h}=visualFixture(surface);p.update(h.snapshot());
 for(const mesh of p.warning.children){const a=mesh.geometry.attributes.position;assert.ok(a.count>0);for(let i=0;i<a.count;i++){
  assert.ok(a.getX(i)<=.01001);assert.ok(Math.hypot(a.getX(i),a.getZ(i))<=1.2+1e-6);assert.ok(a.getY(i)>.3);
 }}
 p.dispose();const none=visualFixture({groundHeight:()=>0,triangleAllowed:()=>false});none.h.advance(1,query());none.p.update(none.h.snapshot());
 assert.equal(none.p.eruption.children.filter(x=>x.visible).length,0);assert.ok(none.p.warning.children.every(x=>x.geometry.attributes.position.count===0));none.p.dispose();
});
test('Dispose releases pooled geometry/materials exactly once and ignores later render updates',()=>{
 const {p,h}=visualFixture();p.update(h.snapshot());let disposed=0;const geometries=new Set(),materials=new Set();p.group.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
 for(const object of [...geometries,...materials])object.addEventListener('dispose',()=>disposed++);
 p.dispose();p.dispose();p.update(h.snapshot());assert.equal(disposed,geometries.size+materials.size);assert.equal(p.group.parent,null);
});

test('A pulse on a half-open tick endpoint waits for the next corrected-root sample',()=>{
 const h=new HazardSystem();h.start(spec());
 assert.deepEqual(h.advance(1,query(),true),[]);
 let sampled;
 const next=h.advance(1+1/60,query({heroAt:t=>{sampled=t;return {id:'hero',x:2,z:0,alive:true};}}),true);
 assert.equal(sampled,1);assert.deepEqual(next,[],'the hero had left the disk at the corrected next-tick start');
 assert.deepEqual(h.advance(1.1,query(),true),[],'a missed boundary pulse cannot replay');
});
