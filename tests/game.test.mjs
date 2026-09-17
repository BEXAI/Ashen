import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root=process.cwd();
await mkdir('.sites-runtime/tests',{recursive:true});
const outfile=path.join(root,'.sites-runtime/tests/game.mjs');
await build({stdin:{contents:'export { GET,PUT,POST } from "./app/api/progress/route"; export * from "./app/game/model"; export { GameEngine, stopCameraAtWall } from "./app/game/engine"; export * as THREE from "three"; export { createWorld, knight } from "./app/game/world"; export * from "./app/game/combat"; export { renderResolution, surfaceAsset } from "./app/game/graphics"; export * from "./app/game/dungeon";export {FrameDiagnostics} from "./app/game/visual-bench";export {AutoController} from "./app/game/auto-controller";',resolveDir:root},bundle:true,format:'esm',platform:'node',outfile,logLevel:'silent',plugins:[{name:'test-d1',setup(b){b.onResolve({filter:/^@\/db\/game$/},()=>({path:'db',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function gameDb(){return globalThis.__gameTestDb}',loader:'js'}));}}]});
const {GET,PUT,POST,newProgress,progressSchema,GameEngine,stopCameraAtWall,THREE:T,createWorld,knight,AttackSequence,renderResolution,surfaceAsset,ROOMS,CORRIDORS,GATES,gateOpen,walkable,dungeonMove,validDungeonSpawn,FrameDiagnostics,AutoController}=await import(pathToFileURL(outfile).href);
let sql;
beforeEach(async()=>{sql=new DatabaseSync(':memory:');sql.exec(await readFile('drizzle/0000_fine_fabian_cortez.sql','utf8'));globalThis.__gameTestDb={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)??null;}};}};}};});
afterEach(()=>sql.close());
function req(method,body,user='player-one',origin='https://realm.test'){const headers={'Content-Type':'application/json','Origin':origin};if(user)headers['oai-authenticated-user-id']=user;return new Request('https://realm.test/api/progress',{method,headers,...(body?{body:JSON.stringify(body)}:{})});}
async function create(user='player-one'){const r=await POST(req('POST',{action:'new',revision:0,name:'Wanderer'},user));assert.equal(r.status,200);return r.json();}
test('Guest access needs no sign-in and writes still reject a foreign origin',async()=>{const r=await GET(req('GET',null,null));assert.equal(r.status,200);assert.equal((await r.json()).guest,true);const cookie=r.headers.get('set-cookie');assert.match(cookie,/^__Host-ashen-guest=[a-f0-9]{64};/);assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);assert.equal((await PUT(req('PUT',{},null))).status,400);assert.equal((await POST(req('POST',{action:'new',revision:0},null,'https://evil.test'))).status,403);});
function guestReq(method,body,cookie){const r=req(method,body,null);if(cookie)r.headers.set('Cookie',cookie);return r;}
async function guestCreate(){const r=await POST(guestReq('POST',{action:'new',revision:0,name:'Guest knight'}));assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};}
test('Guests can start, save, and resume through the same browser session',async()=>{const a=await guestCreate();a.state.souls=150;a.state.shrines=['cinder'];assert.equal((await PUT(guestReq('PUT',{state:a.state,revision:a.revision},a.cookie))).status,200);const loaded=await(await GET(guestReq('GET',null,a.cookie))).json();assert.equal(loaded.state.runId,a.state.runId);assert.equal(loaded.state.souls,150);assert.deepEqual(loaded.state.shrines,['cinder']);assert.equal(loaded.guest,true);const stored=sql.prepare('SELECT user_id FROM game_saves').get();assert.match(stored.user_id,/^guest:[a-f0-9]{64}$/);assert.notEqual(stored.user_id.slice(6),a.cookie.split('=')[1]);});
test('Separate guest browsers cannot read or overwrite each other',async()=>{const a=await guestCreate(),b=await guestCreate();assert.notEqual(a.cookie,b.cookie);assert.notEqual(a.state.runId,b.state.runId);const loaded=await(await GET(guestReq('GET',null,b.cookie))).json();assert.equal(loaded.state.runId,b.state.runId);assert.equal((await PUT(guestReq('PUT',{state:a.state,revision:b.revision},b.cookie))).status,409);const invalid=await GET(guestReq('GET',null,'__Host-ashen-guest=player-one'));assert.equal((await invalid.json()).state,null);assert.match(invalid.headers.get('set-cookie'),/^__Host-ashen-guest=[a-f0-9]{64};/);});
test('Guest equipment purchases use the existing server-validated economy',async()=>{const a=await guestCreate();a.state.souls=150;await PUT(guestReq('PUT',{state:a.state,revision:1},a.cookie));const upgraded=await POST(guestReq('POST',{action:'upgrade',kind:'blade',revision:2},a.cookie));assert.equal(upgraded.status,200);const b=await upgraded.json();assert.equal(b.state.blade,1);assert.equal(b.state.souls,90);assert.equal(b.guest,true);});
test('Existing signed-in saves remain separate from guest cookies',async()=>{const account=await create(),guest=await guestCreate();const request=req('GET');request.headers.set('Cookie',guest.cookie);const r=await GET(request);const d=await r.json();assert.equal(d.state.runId,account.state.runId);assert.equal(d.guest,false);assert.equal(r.headers.get('set-cookie'),null);const anon=await(await GET(guestReq('GET',null,guest.cookie))).json();assert.equal(anon.state.runId,guest.state.runId);});
test('Progress persists in SQL and is isolated by authenticated owner',async()=>{const a=await create();a.state.souls=125;a.state.shrines=['cinder'];const r=await PUT(req('PUT',{state:a.state,revision:a.revision}));assert.equal(r.status,200);const loaded=await (await GET(req('GET'))).json();assert.equal(loaded.state.souls,125);assert.deepEqual(loaded.state.shrines,['cinder']);const other=await(await GET(req('GET',null,'player-two'))).json();assert.equal(other.state,null);});
test('Stale revision and wrong journey ID cannot overwrite a save',async()=>{const a=await create();const body={state:a.state,revision:a.revision};assert.equal((await PUT(req('PUT',body))).status,200);assert.equal((await PUT(req('PUT',body))).status,409);assert.equal((await PUT(req('PUT',{state:{...a.state,runId:crypto.randomUUID()},revision:2}))).status,409);});
test('A new journey cannot silently replace an existing revision',async()=>{await create();assert.equal((await POST(req('POST',{action:'new',revision:0}))).status,409);const reset=await POST(req('POST',{action:'new',revision:1,name:'New knight'}));assert.equal(reset.status,200);assert.equal((await reset.json()).state.name,'New knight');});
test('Equipment prices are calculated by server and insufficient funds are rejected',async()=>{const a=await create();assert.equal((await POST(req('POST',{action:'upgrade',kind:'blade',revision:1,price:0}))).status,400);a.state.souls=150;await PUT(req('PUT',{state:a.state,revision:1}));const r=await POST(req('POST',{action:'upgrade',kind:'blade',revision:2,price:0}));assert.equal(r.status,200);const b=await r.json();assert.equal(b.state.blade,1);assert.equal(b.state.souls,90);assert.equal(b.revision,3);assert.equal((await POST(req('POST',{action:'upgrade',kind:'blade',revision:3}))).status,400);});
test('Save validation rejects impossible fields, repeated rewards and malformed requests',async()=>{const a=await create();assert.equal((await PUT(req('PUT',{state:{...a.state,souls:-1},revision:1}))).status,400);assert.equal((await PUT(req('PUT',{state:{...a.state,shrines:['cinder','cinder']},revision:1}))).status,400);assert.equal(progressSchema.safeParse({...a.state,x:Infinity}).success,false);assert.equal(progressSchema.safeParse({...a.state,won:true}).success,false);const bad=new Request('https://realm.test/api/progress',{method:'PUT',headers:{'oai-authenticated-user-id':'player-one'},body:'{invalid'});assert.equal((await PUT(bad)).status,400);});
test('September heroes survive save and resume while old journeys remain valid',async()=>{const created=await POST(req('POST',{action:'new',revision:0,name:'Ranger',hero:'ranger'}));assert.equal(created.status,200);const a=await created.json();assert.equal(a.state.hero,'ranger');a.state.souls=42;assert.equal((await PUT(req('PUT',{state:a.state,revision:a.revision}))).status,200);const resumed=await(await GET(req('GET'))).json();assert.equal(resumed.state.hero,'ranger');assert.equal(resumed.state.souls,42);const legacy={...resumed.state};delete legacy.hero;assert.equal(progressSchema.safeParse(legacy).success,true);assert.equal((await PUT(req('PUT',{state:legacy,revision:resumed.revision}))).status,200);});
test('Unknown hero IDs cannot create or corrupt a journey',async()=>{assert.equal((await POST(req('POST',{action:'new',revision:0,name:'Invalid',hero:'spider'}))).status,400);assert.equal((await(await GET(req('GET'))).json()).state,null);const a=await create();assert.equal((await PUT(req('PUT',{state:{...a.state,hero:'unknown'},revision:a.revision}))).status,400);assert.equal((await(await GET(req('GET'))).json()).state.hero,'lion-knight');});
function game(){const g=Object.create(GameEngine.prototype);g.p=newProgress();g.p.x=0;g.p.z=0;g.paused=false;g.combat=new AttackSequence();g.facing=0;g.attackAnim=0;g.bladeBase=new T.Vector3();g.bladeTip=new T.Vector3();g.bladeOrigin=new T.Vector3();g.castCd=0;g.dodgeCd=0;g.dodgeTime=0;g.stamina=100;g.time=0;g.enemies=[];g.effects=[];g.keys=new Set();g.world={scene:new T.Scene(),hero:knight()};g.actorList=[g.world.hero];g.metrics=new FrameDiagnostics();g.adaptive=new AutoController();g.sound={tone(){},suspend(){}};g.events=[];g.event=e=>g.events.push(e);g.onHud=()=>{};g.emit=()=>{};return g;}
function enemy(id='w1',x=0){return {id,x,z:2,hp:80,max:80,dead:false,hit:0,cool:0,swing:null,stagger:0,ring:{visible:true},actor:knight(true,id==='king')};}
function contact(g){const s=g.combat.swing;g.world.hero.group.rotation.y=s.facing;g.resolveMelee(g.world.hero,s,s.strike.windup,s.strike.windup+s.strike.active,null);}
test('Melee spends stamina on wind-up, damages only on contact and hits each target once',()=>{const g=game(),e=enemy(),far=enemy('w2',20);g.enemies=[e,far];g.attack();assert.equal(e.hp,80);assert.equal(g.stamina,92);g.resolveMelee(g.world.hero,g.combat.swing,0,.16,null);assert.equal(e.hp,80);contact(g);assert.equal(e.hp,54);assert.equal(far.hp,80);contact(g);g.attack();assert.equal(e.hp,54);assert.equal(g.stamina,92);});
test('Holding strike starts one wind-up and cannot bypass recovery',()=>{const g=game(),e=enemy();g.enemies=[e];g.setAttackHeld(true);assert.equal(g.attackHeld,true);assert.equal(e.hp,80);contact(g);assert.equal(e.hp,54);g.setAttackHeld(true);assert.equal(e.hp,54);g.setAttackHeld(false);assert.equal(g.attackHeld,false);g.setAttackHeld(true);assert.equal(e.hp,54);assert.equal(g.stamina,92);});
test('Enemies behind the player cannot be silently acquired or damaged',()=>{const g=game(),e=enemy();e.z=-2;g.enemies=[e];g.attack();assert.equal(g.combat.swing.facing,0);contact(g);assert.equal(e.hp,80);});
test('Dodge cancels a wind-up without refunding stamina, but not an active blade',()=>{const g=game();g.attack();assert.equal(g.stamina,92);g.dodge();assert.equal(g.combat.swing,null);assert.equal(g.stamina,67);g.dodgeTime=0;g.dodgeCd=0;g.attack();g.combat.swing.elapsed=.2;g.dodge();assert.notEqual(g.combat.swing,null);assert.equal(g.dodgeTime,0);});
test('A normal tap release preserves one buffered strike while cancellation clears it',()=>{const g=game();g.attack();g.time=.5;g.setAttackHeld(true);g.setAttackHeld(false);g.combat.finish(.58);g.time=.59;g.startPlayerSwing();assert.equal(g.combat.swing.strike.id,'diagonal');g.time=1.1;g.setAttackHeld(true);g.setAttackHeld(false,true);g.combat.finish(1.2);g.time=1.21;g.startPlayerSwing();assert.equal(g.combat.swing,null);});
test('Pausing clears held attacks, sprint and movement; paused touches cannot restart them',()=>{const g=game();g.setStick(1,0,true);g.setAttackHeld(true);g.pause(true);assert.equal(g.attackHeld,false);assert.equal(g.touchSprint,false);assert.deepEqual(g.stick,{x:0,y:0});g.setStick(1,1,true);g.setAttackHeld(true);assert.equal(g.attackHeld,false);assert.deepEqual(g.stick,{x:0,y:0});g.pause(false);assert.equal(g.attackHeld,false);assert.equal(g.touchSprint,false);});
test('Magic consumes mana and damage is limited to the area of effect',()=>{const g=game(),near=enemy(),far=enemy('w2',20);g.enemies=[near,far];g.cast();assert.equal(g.p.mana,75);assert.equal(near.hp,38);assert.equal(far.hp,80);g.castCd=0;g.p.mana=10;g.cast();assert.equal(near.hp,38);});
test('Dodging grants temporary protection and death emits a recovery event',()=>{const g=game();g.dodge();assert.equal(g.stamina,75);g.hitPlayer(30);assert.equal(g.p.health,140);g.dodgeTime=0;g.hitPlayer(30);assert.equal(g.p.health,110);g.hitPlayer(200);assert.equal(g.p.health,0);assert.ok(g.events.some(e=>e.type==='death'));});
test('Boss shield requires all shrines and victory is recorded exactly once',()=>{const g=game(),e=enemy('king');g.enemies=[e];g.hurtEnemy(e,100);assert.equal(e.hp,80);g.p.shrines=['cinder','dusk','crown'];g.hurtEnemy(e,100);assert.equal(e.dead,true);assert.equal(g.p.won,true);assert.deepEqual(g.p.defeated,['king']);assert.ok(g.events.some(e=>e.type==='victory'));});

test('World generation has finite geometry and reachable shrine/checkpoint positions',()=>{const original=T.TextureLoader.prototype.load;T.TextureLoader.prototype.load=function(){return new T.Texture()};try{const w=createWorld(newProgress(),'low');let meshes=0;w.scene.traverse(o=>{if(!o.isMesh)return;meshes++;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.some(m=>m.vertexColors))assert.ok(o.geometry.attributes.color,'Shared vertex-color materials require color attributes on unbatched fallback geometry');const a=o.geometry.attributes.position.array;for(let i=0;i<a.length;i++)assert.ok(Number.isFinite(a[i]));});assert.ok(meshes>100);for(const point of [{x:0,z:51},...w.shrines.map(s=>({x:s.group.position.x,z:s.group.position.z}))])assert.ok(!w.colliders.some(c=>Math.hypot(c.x-point.x,c.z-point.z)<c.r+.6),'objective intersects a collider');}finally{T.TextureLoader.prototype.load=original;}});

test('4K mode renders 3840 by 2160 independently of viewport CSS pixels',()=>{assert.deepEqual(renderResolution(1920,1080,'high'),{ratio:2,width:3840,height:2160});assert.deepEqual(renderResolution(1280,720,'high'),{ratio:3,width:3840,height:2160});assert.deepEqual(renderResolution(1080,1920,'high'),{ratio:2,width:2160,height:3840});assert.equal(surfaceAsset('rock','diff','high'),'/assets/4k/rock-diff.webp');});
test('HD and performance output obey hardware and pixel-budget limits',()=>{assert.deepEqual(renderResolution(1920,1080,'medium'),{ratio:1,width:1920,height:1080});const capped=renderResolution(1920,1080,'high',2048);assert.equal(capped.width,2048);for(const [w,h] of [[800,800],[390,844],[7680,4320]]){const out=renderResolution(w,h,'high');assert.ok(out.width*out.height<=3840*2160);assert.ok(out.width<=3840&&out.height<=3840);}assert.equal(surfaceAsset('ground','normal','medium'),'/assets/4k/ground-normal-2k.webp');});


test('Dungeon rooms and passages join without collision seams',()=>{
 for(let z=-80;z<=58;z+=.25)assert.ok(walkable(0,z),`center route blocked at ${z}`);
 for(const point of [...WORLD_POINTS()])assert.ok(walkable(point.x,point.z),`unreachable objective ${JSON.stringify(point)}`);
 assert.equal(walkable(25,20),false);
});
function WORLD_POINTS(){return [{x:0,z:51},{x:11,z:12},{x:-13,z:-16},{x:11,z:-42},{x:-12,z:26},{x:14,z:-5},{x:-12,z:-31},{x:12,z:-60},{x:0,z:-69}];}
test('A chamber seal requires both all wardens and its shrine',()=>{
 const p=newProgress();p.shrines=['cinder'];p.defeated=['w1','w2'];
 assert.equal(gateOpen(0,p),false);assert.equal(dungeonMove(0,6,0,4,p).z,6);
 p.defeated.push('w3');assert.equal(gateOpen(0,p),true);assert.equal(dungeonMove(0,6,0,4,p).z,4);
 assert.equal(gateOpen(1,p),false);
});
test('Wall collision slides along the wall and retains character progress',()=>{
 const p=newProgress();const next=dungeonMove(15,20,16,19,p);
 assert.equal(next.x,15);assert.equal(next.z,19);
 p.x=70;p.z=30;p.souls=80;assert.equal(validDungeonSpawn(p),false);assert.equal(p.souls,80);
});
test('Every dungeon objective can be reached through the connected floor plan',()=>{
 const seen=new Set(['0,51']),queue=[[0,51]];
 for(let i=0;i<queue.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const [x,z]=queue[i],nx=x+dx,nz=z+dz,key=`${nx},${nz}`;
  if(!seen.has(key)&&walkable(nx,nz)){seen.add(key);queue.push([nx,nz]);}
 }
 for(const p of WORLD_POINTS())assert.ok(seen.has(`${p.x},${p.z}`));
});
test('BVH camera and combat rays hit solid walls but pass through open doorways',()=>{
 const original=T.TextureLoader.prototype.load;T.TextureLoader.prototype.load=function(){return new T.Texture()};
 try{
  const w=createWorld(newProgress(),'low'),ray=new T.Raycaster();ray.firstHitOnly=true;
  ray.set(new T.Vector3(0,1.5,20),new T.Vector3(1,0,0));ray.far=30;
  const hit=ray.intersectObject(w.architecture)[0];assert.ok(hit);assert.ok(hit.distance>15&&hit.distance<17);
  ray.set(new T.Vector3(0,1.5,45),new T.Vector3(0,0,-1));ray.far=20;assert.equal(ray.intersectObject(w.architecture).length,0);
  const g=game();g.world=w;g.sightRay=ray;g.p.x=2;g.p.z=35;
  const e=enemy('w1',4);e.z=35;g.enemies=[e];g.attack();contact(g);assert.equal(e.hp,80,'damage crossed a corridor wall');
 }finally{T.TextureLoader.prototype.load=original;}
});

test('A wall shortens camera distance without collapsing the camera onto the player',()=>{const target=new T.Vector3(0,1.7,0),position=new T.Vector3(8,4,0);stopCameraAtWall(target,position,2);assert.ok(Math.abs(position.distanceTo(target)-1.7)<1e-8);assert.ok(position.x>1);assert.ok(position.y>target.y);const clear=position.clone();stopCameraAtWall(target,position,Infinity);assert.deepEqual(position,clear);});

test('Changing graphics applies reflection and shadow settings to the existing world',()=>{
 const original=T.TextureLoader.prototype.load;T.TextureLoader.prototype.load=function(){return new T.Texture()};
 try{
  const g=game();g.world=createWorld(g.p,'low');g.mobile=true;g.renderer={capabilities:{maxTextureSize:4096},shadowMap:{enabled:false}};
  for(const quality of ['high','low','high','auto']){
   g.quality=quality;g.configureWorldQuality();
   assert.equal(g.world.reflector.visible,quality==='high');
   assert.equal(g.world.reflector.userData.enabled,quality==='high');
   assert.equal(g.world.sun.castShadow,quality!=='low');
   assert.equal(g.world.sun.shadow.mapSize.x,quality==='high'?2048:512);
   assert.equal(g.world.reflector.getRenderTarget().width,quality==='high'?512:384);
  }
  g.world.reflector.dispose();
 }finally{T.TextureLoader.prototype.load=original;}
});

test('A partially initialized renderer can be disposed once without leaking its context',()=>{
 const g=Object.create(GameEngine.prototype),released=[];
 g.cleanup=[()=>released.push('listeners')];g.enemies=[];g.sound={close:()=>released.push('audio')};
 g.renderer={dispose:()=>released.push('renderer'),forceContextLoss:()=>released.push('context'),domElement:{remove:()=>released.push('canvas')}};
 g.dispose();g.dispose();
 assert.deepEqual(released,['listeners','audio','renderer','context','canvas']);
});

test('Ranger and sage release one ranged hit per strike, after wind-up, stopping at the nearest target',()=>{
 for(const hero of ['ranger','sage']){const g=game();g.p.hero=hero;const near=enemy(),far=enemy('w2');near.z=6;far.z=10;g.enemies=[near,far];g.attack();g.resolveMelee(g.world.hero,g.combat.swing,0,.16,null);assert.equal(near.hp,80);contact(g);assert.equal(near.hp,54);assert.equal(far.hp,80);contact(g);assert.equal(near.hp,54);assert.equal(g.effects.length,1);}
});
test('Ranged strikes do not pass through walls, acquire targets behind, or hit beyond range',()=>{
 for(const obstruction of [true,false]){const g=game();g.p.hero='ranger';const target=enemy();target.z=obstruction?6:15;g.enemies=[target];if(obstruction)g.obstruction=()=>3;g.attack();contact(g);assert.equal(target.hp,80);}
 const g=game();g.p.hero='sage';const target=enemy();target.z=-4;g.enemies=[target];g.attack();contact(g);assert.equal(target.hp,80);
});
test('Changing wanderer preserves the active journey and clears an unfinished strike',()=>{
 const g=game();g.p.souls=123;g.p.x=4;g.p.potions=2;g.p.defeated=['w1'];const before=g.snapshot();let chosen;g.roster={setHero:id=>{chosen=id;}};g.attack();g.chooseHero('sage');assert.equal(chosen,'sage');assert.equal(g.combat.swing,null);assert.deepEqual({...g.snapshot(),hero:before.hero},before);
});

test('Staff beams start at the evaluated crystal and aim down at a nearby target',()=>{
 const g=game();g.p.hero='sage';const target=enemy();target.z=6;g.enemies=[target];
 const origin=new T.Vector3(-.4,3.1,-1.1);g.world.hero.visual={strike:()=>{},muzzle:out=>{out.copy(origin);return true;}};
 g.attack();contact(g);assert.equal(target.hp,54);assert.equal(g.effects.length,1);
 const mesh=g.effects[0].mesh,axis=new T.Vector3(0,1,0).applyQuaternion(mesh.quaternion),start=mesh.position.clone().addScaledVector(axis,-mesh.geometry.parameters.height/2);assert.ok(start.distanceTo(origin)<1e-7);
});
