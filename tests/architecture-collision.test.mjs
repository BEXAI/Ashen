import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=await mkdtemp(join(tmpdir(),'ashen-masonry-'));after(()=>rm(dir,{recursive:true,force:true}));
const out=join(dir,'runtime.mjs');
await build({stdin:{contents:`export * from './app/game/architecture-collision';export * from './app/game/kinematic';export * from './app/game/dungeon';export {ROOM_ARCHITECTURE} from './app/game/dungeon-layout';export {newProgress,WORLD} from './app/game/model';export {ENEMY_ROSTER} from './app/game/character-roster';export {createWorld} from './app/game/world';export {GameEngine} from './app/game/engine';export {clearCameraPosition} from './app/game/camera-clearance';export * as T from 'three';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {T,architectureObstruction,ARCHITECTURE_BOUNDS,ARCHITECTURE_FLOOR_BOXES,ROOM_ARCHITECTURE,openFloorWorld,buildCollisionWorld,canOccupy,moveBody,sampleMotionPath,validDungeonSpawn,movementRadius,newProgress,WORLD,ENEMY_ROSTER,createWorld,GameEngine,clearCameraPosition}=await import(pathToFileURL(out));
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`${a} != ${b}`);
const world=openFloorWorld();
function pathClear(path,radius){for(let i=0;i<=120;i++){const p=sampleMotionPath(path,i/120);assert.ok(canOccupy(world,p.x,p.z,radius),`embedded at ${i/120}: ${JSON.stringify(p)}`);}}

test('Rendered pilasters and wall thickness reject the previously accepted embedded hero positions',()=>{
  for(const p of [{x:-18.55,z:-67.259},{x:-18.55,z:-56.45},{x:18.4,z:-81.4}]){
    assert.equal(canOccupy(world,p.x,p.z,.45),false);
    const saved={...newProgress(),...p,won:true,shrines:WORLD.shrines.map(s=>s.id),defeated:WORLD.enemies.map(e=>e.id)};assert.equal(validDungeonSpawn(saved),false,'old embedded saves must use the existing safe-spawn recovery');
  }
  for(const radius of [.3,.45,.55,.65,.9]){
    const dash=moveBody({x:-16,z:-67,radius},{x:-5,z:0},world);
    near(dash.x,-18.3+radius);assert.ok(dash.contacts.some(c=>c.obstacleId==='pilaster:throne:-1:-67'));pathClear(dash.path,radius);
    const slide=moveBody({x:-17.5,z:-66.1,radius:.45},{x:-3,z:2.5},world);pathClear(slide.path,.45);assert.ok(slide.z>-64,'tangent retreat remains possible');
    const north=moveBody({x:-17,z:-60,radius},{x:0,z:8},world);near(north.z,-56.47-radius);pathClear(north.path,radius);
  }
});

test('Door posts and end walls constrain bodies without closing joined center passages or native spawns',()=>{
  for(const e of WORLD.enemies)assert.ok(canOccupy(world,e.x,e.z,movementRadius(ENEMY_ROSTER[e.id])),e.id);
  for(const p of [...WORLD.shrines,...WORLD.chests,{x:0,z:51}])assert.ok(canOccupy(world,p.x,p.z,.45));
  for(const radius of [.3,.45,.55,.65,.9]){
    const center=moveBody({x:0,z:58,radius},{x:0,z:-138},world);near(center.z,-80);pathClear(center.path,radius);
    const post=moveBody({x:3.25,z:40,radius},{x:0,z:-4},world);assert.equal(post.invalidStart,false);assert.ok(post.blocked);assert.ok(post.contacts.some(c=>c.obstacleId.startsWith('post:entry:38:')));pathClear(post.path,radius);
  }
  for(const box of ARCHITECTURE_FLOOR_BOXES)assert.ok(buildCollisionWorld(newProgress()).obstacles.some(b=>b.id===box.id));
  assert.ok(ROOM_ARCHITECTURE.some(b=>b.id.startsWith('lintel:')));
  assert.equal(ARCHITECTURE_FLOOR_BOXES.some(b=>b.id.startsWith('lintel:')||b.id.startsWith('capital:')),false,'overhead masonry must not become an invisible floor barrier');
});

test('Finite obstruction agrees with actual visible masonry and blocks pillars missing from the old shell BVH',()=>{
  const load=T.TextureLoader.prototype.load;T.TextureLoader.prototype.load=()=>new T.Texture();
  let w;try{w=createWorld(newProgress(),'low');}finally{T.TextureLoader.prototype.load=load;}
  w.scene.updateMatrixWorld(true);
  const g=Object.create(GameEngine.prototype);Object.assign(g,{world:w,p:{...newProgress(),won:true},sightRay:new T.Raycaster()});
  for(const [from,to,expected] of [
    [[-17,1.4,-67],[-20,1.4,-67],1.3],
    [[3.25,1.4,40],[3.25,1.4,36],1.5],
    [[-17,1.4,-60],[-17,1.4,-54],3.53],
  ]){
    const a=new T.Vector3(...from),b=new T.Vector3(...to),direction=b.clone().sub(a).normalize(),ray=new T.Raycaster(a,direction,0,a.distanceTo(b));
    const visible=ray.intersectObjects(w.scene.children,true)[0];assert.ok(visible);near(visible.distance,expected);
    near(architectureObstruction(a,b),expected);near(g.obstruction(a,b),expected);
  }
  assert.equal(architectureObstruction({x:0,y:1.4,z:45},{x:0,y:1.4,z:25}),Infinity);
  near(architectureObstruction({x:0,y:8,z:45},{x:0,y:8,z:25}),6.55);
  assert.equal(architectureObstruction({x:-18.65,y:1.4,z:-67},{x:-17,y:1.4,z:-67}),0,'inside-solid starts cannot see through masonry');
  assert.equal(architectureObstruction({x:-17,y:1.4,z:-67},{x:-17.5,y:1.4,z:-67}),Infinity,'a solid beyond the finite segment is not a blocker');
  const geometries=new Set(),materials=new Set();w.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
});

test('Camera near-plane probes stop in front of a pilaster and remain clear after interpolation',()=>{
  const target=new T.Vector3(-16.8,1.7,-67),desired=new T.Vector3(-20,3,-67);
  const hit=clearCameraPosition(target,desired,architectureObstruction,{near:.1,fovDegrees:55,aspect:1.4});
  assert.equal(hit.obstructed,true);assert.ok(desired.x>-18.1,'camera radius stays in front of the pillar face');
  const interpolated=new T.Vector3(-18.7,2.1,-67).lerp(desired,.1);
  clearCameraPosition(target,interpolated,architectureObstruction,{near:.1,fovDegrees:55,aspect:1.4});
  assert.ok(interpolated.x>-18.1);assert.equal(architectureObstruction(target,interpolated),Infinity);
  assert.ok(ARCHITECTURE_BOUNDS.every(b=>[b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ].every(Number.isFinite)));
});
