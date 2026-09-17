import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// Works unchanged after installation; ASHEN_REPO_ROOT supplies dependencies for the isolated staging run.
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(process.env.ASHEN_REPO_ROOT??root,'package.json'));
const {build}=require('esbuild');
const testOutput=path.join(root,'.sites-runtime/tests');await mkdir(testOutput,{recursive:true});
const temporary=await mkdtemp(path.join(testOutput,'kinematic-'));
const out=path.join(temporary,'bundle.mjs');
await build({stdin:{contents:'export * from "./app/game/kinematic";export * from "./app/game/dungeon";',resolveDir:root},outfile:out,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const K=await import(pathToFileURL(out).href);await rm(temporary,{recursive:true,force:true});
const {createCollisionWorld,buildCollisionWorld,openFloorWorld,canOccupy,moveBody,sampleMotionPath,beginMotionPath,appendMotionPath,resolveBodyPairs,movementRadius,resistanceWeight,approachVelocity,dungeonMove,walkable,validDungeonSpawn,gateOpen,GATES,BONE_THRONE}=K;
const near=(actual,expected,epsilon=2e-6)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
const xy=(x,z)=>({x,z});
const room=(x=0,z=0,width=10,depth=10)=>({x,z,width,depth});
const box=(id,minX,maxX,minZ,maxZ)=>({id,minX,maxX,minZ,maxZ});
const progress=(extra={})=>({x:0,z:51,won:false,shrines:[],defeated:[],...extra});
const circle=(x,z,radius=.45)=>({x,z,radius});
function assertLegalPath(world,path,radius,samples=200){
  for(let i=0;i<=samples;i++){const p=sampleMotionPath(path,i/samples);assert.ok(canOccupy(world,p.x,p.z,radius),`illegal circle at alpha ${i/samples}: ${JSON.stringify(p)}`);}
}

test('Merged floor boundary keeps actual rooms/corridors joined for every movement size',()=>{
  const world=openFloorWorld();
  for(const radius of [.30,.45,.55,.65,.90]){
    for(let z=-80;z<=58;z+=.125)assert.ok(canOccupy(world,0,z,radius),`${radius} blocked at ${z}`);
    const result=moveBody(circle(0,58,radius),xy(0,-138),world);near(result.z,-80);assert.equal(result.blocked,false);assertLegalPath(world,result.path,radius);
  }
  for(const p of [{x:0,z:51},{x:11,z:12},{x:-13,z:-16},{x:11,z:-42},{x:-12,z:26},{x:14,z:-5},{x:-12,z:-31},{x:12,z:-60},{x:0,z:-69}])assert.ok(walkable(p.x,p.z));
});

test('Union construction removes touching and overlapping interior edges, not valid joins',()=>{
  const world=createCollisionWorld([room(-2,0,4,4),room(2,0,4,4),room(0,0,2,2)]);
  const moved=moveBody(circle(-3,0,.8),xy(6,0),world);near(moved.x,3);assert.equal(moved.blocked,false);
  assert.equal(world.boundaries.length,4);assertLegalPath(world,moved.path,.8);
});

test('Whole-circle validation rejects holes and concave gaps missed by simple center checks',()=>{
  const ring=createCollisionWorld([room(0,2,6,2),room(0,-2,6,2),room(-2,0,2,2),room(2,0,2,2)]);
  assert.equal(canOccupy(ring,0,0,.2),false);assert.equal(canOccupy(ring,0,1.2,.3),false);assert.equal(canOccupy(ring,0,1.5,.3),true);
  const plus=createCollisionWorld([room(0,0,8,1.5),room(0,0,1.5,8)]);
  assert.equal(canOccupy(plus,0,0,1),true);assert.equal(canOccupy(plus,0,0,1.2),false);
});

test('A long sweep cannot cross a floor gap even when its endpoint lies in another legal room',()=>{
  const world=createCollisionWorld([room(-4,0,4,4),room(4,0,4,4)]);
  assert.ok(canOccupy(world,4,0,.45));const moved=moveBody(circle(-4,0),xy(8,0),world);
  near(moved.x,-2.45);assert.equal(moved.blocked,true);assertLegalPath(world,moved.path,.45);
});

test('Continuous circle sweep stops at a very thin obstacle from either side',()=>{
  const world=createCollisionWorld([room(0,0,200,20)],[box('thin',-.001,.001,-8,8)]);
  for(const sign of [-1,1]){
    const moved=moveBody(circle(sign*80,0,.3),xy(-sign*160,0),world);near(moved.x,sign*.301);assert.equal(moved.contacts[0].obstacleId,'thin');assertLegalPath(world,moved.path,.3);
  }
});

test('All gate masks follow shrine+warden progression and their physical slabs block both directions',()=>{
  const p=progress();const closed=buildCollisionWorld(p);assert.equal(closed,buildCollisionWorld(p));
  for(let i=0;i<GATES.length;i++){
    const g=GATES[i];
    for(const side of [-1,1]){const moved=moveBody(circle(0,g.z+side),xy(0,-side*2),closed);near(moved.z,g.z+side*.60);assert.ok(moved.contacts.some(c=>c.obstacleId===`gate:${i}`));}
  }
  p.shrines.push('cinder');p.defeated.push('w1','w2');assert.equal(buildCollisionWorld(p),closed);
  p.defeated.push('w3');assert.equal(gateOpen(0,p),true);const opened=buildCollisionWorld(p);assert.notEqual(opened,closed);
  const moved=moveBody(circle(0,6),xy(0,-2),opened);near(moved.z,4);assert.equal(moved.blocked,false);
  assert.equal(buildCollisionWorld(progress({won:true})).obstacles.length,1);
});

test('Throne uses the shared rendered proxy and blocks long sweeps while allowing tangential travel',()=>{
  const world=openFloorWorld(),w=BONE_THRONE.halfWidth+.45,d=BONE_THRONE.halfDepth+.45;
  const x=moveBody(circle(-13,-77),xy(4,0),world);near(x.x,-11-w);assertLegalPath(world,x.path,.45);
  const z=moveBody(circle(-11,-75),xy(0,-4),world);near(z.z,-77+d);assertLegalPath(world,z.path,.45);
  const slide=moveBody(circle(-13,-77),xy(2,1.4),world);assert.ok(slide.z>-76);assertLegalPath(world,slide.path,.45);
  assert.equal(walkable(-11,-77),false);
});

test('Rounded obstacle corners allow a legal circle that a padded square would reject',()=>{
  const world=createCollisionWorld([room()],[box('cube',-1,1,-1,1)]);
  assert.ok(canOccupy(world,1.4,1.4,.45));const moved=moveBody(circle(1.4,3),xy(0,-1.6),world);near(moved.z,1.4);assert.equal(moved.blocked,false);
});

test('Wall slide records time of impact instead of interpolating directly to its final root',()=>{
  const world=createCollisionWorld([room()]),moved=moveBody(circle(0,0),xy(10,3),world);
  near(moved.x,4.55);near(moved.z,3);assert.ok(moved.path.segments.some(s=>s.kind==='slide'));
  near(sampleMotionPath(moved.path,.25).x,2.5);near(sampleMotionPath(moved.path,.25).z,.75);
  near(sampleMotionPath(moved.path,.75).x,4.55);near(sampleMotionPath(moved.path,.75).z,2.25);
  assertLegalPath(world,moved.path,.45);
});

test('Simultaneous corner contacts constrain both axes and tangency never traps outward motion',()=>{
  const world=createCollisionWorld([room()]);
  const corner=moveBody(circle(0,0),xy(10,10),world);near(corner.x,4.55);near(corner.z,4.55);assertLegalPath(world,corner.path,.45);
  const tangent=moveBody(circle(4.55,0),xy(1,2),world);near(tangent.x,4.55);near(tangent.z,2);
  const away=moveBody(circle(4.55,0),xy(-1,0),world);near(away.x,3.55);assert.equal(away.blocked,false);
});

test('Concave room-mouth sweeps and sampled slide paths remain on the legal floor',()=>{
  const world=createCollisionWorld([room(0,0,8,8),room(0,6,2,4)]);
  for(const x of [-3,-1.5,0,1.5,3]){const moved=moveBody(circle(x,2,.4),xy(-x,5),world);assertLegalPath(world,moved.path,.4);}
  const centered=moveBody(circle(0,2,.4),xy(0,5),world);near(centered.z,7);
});

test('Invalid starts fail closed and invalid numeric inputs are rejected',()=>{
  const world=createCollisionWorld([room()]);
  const invalid=moveBody(circle(20,0),xy(-20,0),world);assert.equal(invalid.invalidStart,true);near(invalid.x,20);assert.equal(invalid.blocked,true);
  assert.throws(()=>moveBody(circle(NaN,0),xy(1,0),world),RangeError);
  assert.throws(()=>moveBody(circle(0,0),xy(Infinity,0),world),RangeError);
  assert.throws(()=>createCollisionWorld([]),RangeError);assert.equal(canOccupy(world,0,0,NaN),false);
  assert.equal(validDungeonSpawn(progress()),true);assert.equal(validDungeonSpawn(progress({x:70,z:30})),false);
  assert.equal(validDungeonSpawn(progress({x:0,z:-10})),false);assert.equal(validDungeonSpawn(progress({x:0,z:-10,won:true})),true);
});

test('Seeded large-displacement sweeps preserve full circle clearance throughout their paths',()=>{
  const world=createCollisionWorld([room(0,0,24,24)],[box('a',-4,-3,-8,4),box('b',2,7,1,1.03),box('c',4,4.02,-10,-3)]);
  let seed=0x81f39a4c;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  for(let i=0;i<220;i++){
    const radius=.3+random()*.6;let start;do{start=circle(random()*22-11,random()*22-11,radius);}while(!canOccupy(world,start.x,start.z,radius));
    const result=moveBody(start,xy(random()*60-30,random()*60-30),world);
    assert.ok(Number.isFinite(result.x)&&Number.isFinite(result.z));assertLegalPath(world,result.path,radius,80);
  }
});

test('Phase-local motion paths compose exact normalized times and preserve stationary gaps',()=>{
  const world=createCollisionWorld([room(0,0,30,30)]),path=beginMotionPath(xy(0,0));
  const first=moveBody(circle(0,0),xy(1,0),world);appendMotionPath(path,first.path,0,.25);
  const second=moveBody(circle(1,0),xy(0,2),world);appendMotionPath(path,second.path,.5,1);
  assert.deepEqual(sampleMotionPath(path,.125),xy(.5,0));assert.deepEqual(sampleMotionPath(path,.4),xy(1,0));assert.deepEqual(sampleMotionPath(path,.75),xy(1,1));
  assert.throws(()=>appendMotionPath(path,second.path,.9,1),RangeError);
});

test('Coincident stationary bodies separate deterministically regardless of caller array order',()=>{
  const world=createCollisionWorld([room()]);
  const make=()=>[{id:'a',x:0,z:0,radius:.45},{id:'b',x:0,z:0,radius:.45}];
  const one=make(),two=make().reverse();const result=resolveBodyPairs(one,world);resolveBodyPairs(two,world);
  assert.equal(result.unresolved.length,0);assert.ok(Math.hypot(one[0].x-one[1].x,one[0].z-one[1].z)>=.9-1e-6);
  for(const body of one){const other=two.find(b=>b.id===body.id);near(body.x,other.x,1e-12);near(body.z,other.z,1e-12);assert.ok(canOccupy(world,body.x,body.z,body.radius));}
});

test('Crowd projections preserve earlier motion samples, are bounded and cannot generate an extra sweep',()=>{
  const world=createCollisionWorld([room()]),moved=moveBody(circle(-1,0),xy(1,0),world);
  const a={id:'a',x:moved.x,z:moved.z,radius:.45,path:moved.path},b={id:'b',x:.4,z:0,radius:.45};
  const before=[.1,.5,.99].map(t=>sampleMotionPath(a.path,t));resolveBodyPairs([a,b],world);
  assert.deepEqual([.1,.5,.99].map(t=>sampleMotionPath(a.path,t)),before);assert.deepEqual(sampleMotionPath(a.path,1),xy(a.x,a.z));
  assert.ok(a.path.corrections.length>0);assert.ok(Math.hypot(a.x-moved.x,a.z-moved.z)<=.48+1e-8);
  for(const correction of a.path.corrections)assert.ok(Math.hypot(correction.to.x-correction.from.x,correction.to.z-correction.from.z)<=.12+1e-8);
});

test('Pinned crowd remains inside walls and reports unresolved overlap instead of teleporting',()=>{
  const world=createCollisionWorld([room(0,0,2,4)]),a={id:'a',x:-.55,z:0,radius:.45,velocity:xy(2,0)},b={id:'b',x:-.35,z:0,radius:.45,velocity:xy(-2,0)};
  const result=resolveBodyPairs([a,b],world);assert.ok(result.unresolved.length>0);near(a.x,-.55);assert.ok(b.x<=.13+1e-6);
  near(a.velocity.x,0);near(b.velocity.x,0);assert.ok(canOccupy(world,a.x,a.z,.45));assert.ok(canOccupy(world,b.x,b.z,.45));
});

test('Resistance weights, dead admission and invalid-body reports are explicit',()=>{
  const world=createCollisionWorld([room()]);
  const a={id:'hero',x:0,z:0,radius:.45,weight:1},b={id:'king',x:1.15,z:0,radius:.9,weight:4};resolveBodyPairs([a,b],world);
  assert.ok(Math.abs(a.x)>Math.abs(b.x-1.15));
  const living={id:'living',x:0,z:0,radius:.45},dead={id:'dead',x:0,z:0,radius:.9,dead:true};resolveBodyPairs([living,dead],world);assert.deepEqual(xy(living.x,living.z),xy(0,0));
  const report=resolveBodyPairs([{id:'outside',x:30,z:0,radius:.45}],world);assert.deepEqual(report.invalidBodies,['outside']);
  assert.throws(()=>resolveBodyPairs([{...living},{...living}],world),RangeError);
});

test('Movement radii remain separate from hurt capsules and acceleration cannot boost diagonals',()=>{
  assert.deepEqual(['lion-knight','goblin','spider','ogre','golem','ember-dragon','reaper'].map(movementRadius),[.45,.3,.55,.65,.65,.9,.45]);
  assert.deepEqual(['lion-knight','ogre','golem','ember-dragon'].map(resistanceWeight),[1,2,2,4]);
  const diagonal=approachVelocity(xy(0,0),xy(5.4,5.4),1,{maxSpeed:5.4});near(Math.hypot(diagonal.x,diagonal.z),5.4);
  near(approachVelocity(xy(0,0),xy(5.4,0),.1).x,4.8);
  near(approachVelocity(xy(5.4,0),xy(0,0),.05).x,2.2);
  near(approachVelocity(xy(8.6,0),xy(8.6,0),0,{maxSpeed:5.4*.45}).x,2.43);
  near(approachVelocity(xy(8.6,0),xy(8.6,0),1/60,{maxSpeed:5.4*.25}).x,1.35);
  assert.throws(()=>approachVelocity(xy(0,0),xy(1,0),NaN),RangeError);
});

test('Legacy dungeonMove delegates to sweeps without changing the return shape or progression',()=>{
  const p=progress(),before=JSON.stringify(p),result=dungeonMove(0,6,0,4,p);assert.deepEqual(Object.keys(result).sort(),['x','z']);near(result.z,5.6);assert.equal(JSON.stringify(p),before);
  const wall=dungeonMove(15,20,16,19,p);near(wall.x,15.55);near(wall.z,19);
});
