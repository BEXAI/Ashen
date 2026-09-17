import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await mkdir('.sites-runtime/tests',{recursive:true});
const outfile=path.resolve('.sites-runtime/tests/graphics-preferences.mjs');
await build({stdin:{contents:'export * from "./app/game/graphics-preferences"; export * from "./app/game/lighting-profiles"; export * from "./app/game/frame-measurements";export {DungeonLighting} from "./app/game/dungeon-lighting";export * as T from "three";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',outfile,logLevel:'silent'});
const {readGraphics,writeGraphics,validateGraphics,effectiveGraphics,VISUAL_PREFERENCES_KEY,lightingAt,torchReachable,FrameMeasurements,DungeonLighting,T}=await import(pathToFileURL(outfile).href);

test('visual preferences survive corrupt, blocked and version-mismatched storage',()=>{
  const defaults={version:1,brightness:1,impactShake:false};
  for(const read of [()=>{throw Error('blocked');},()=>'{',()=>null,()=>'{"version":2,"brightness":1.3}'])assert.deepEqual(readGraphics(read),defaults);
  assert.deepEqual(validateGraphics({version:1,brightness:99,impactShake:'yes'}),{version:1,brightness:1.3,impactShake:false});
  assert.equal(validateGraphics({version:1,brightness:-1}).brightness,.85);
  assert.equal(validateGraphics({version:1,brightness:NaN}).brightness,1);
  assert.equal(writeGraphics(defaults,()=>{throw Error('quota');}),false);
  let key,value;writeGraphics({version:1,brightness:1.2,impactShake:true},(k,v)=>{key=k;value=v;});
  assert.equal(key,VISUAL_PREFERENCES_KEY);assert.equal(readGraphics(()=>value).brightness,1.2);
  assert.equal(effectiveGraphics(readGraphics(()=>value),true).impactShake,false);
  assert.equal(effectiveGraphics(readGraphics(()=>value),false).impactShake,true);
});

test('lighting holds each chamber and crosses every passage continuously',()=>{
  for(const [top,bottom] of [[38,32],[8,2],[-22,-28],[-48,-56]]){
    for(const z of [top,bottom])for(const key of ['exposure','ambient','environment','indirect','probe','torch','key','fog'])assert.ok(Math.abs(lightingAt(z+.0001)[key]-lightingAt(z-.0001)[key])<.00001);
    for(let i=0;i<=10;i++){const p=lightingAt(top+(bottom-top)*i/10);assert.ok(p.ambient>=1&&p.exposure>=1);}
  }
  assert.deepEqual(lightingAt(50),lightingAt(40));assert.deepEqual(lightingAt(-65),lightingAt(-78));
});

test('torch selection rejects sealed gates and room walls but keeps open passage sight lines',()=>{
  assert.equal(torchReachable({x:0,z:20},{x:12,z:20},[true,true,true]),true);
  assert.equal(torchReachable({x:0,z:8},{x:0,z:0},[true,false,false]),false);
  assert.equal(torchReachable({x:0,z:8},{x:0,z:0},[false,false,false]),true);
  assert.equal(torchReachable({x:8,z:38},{x:12,z:28},[false,false,false]),false);
  assert.equal(torchReachable({x:0,z:35},{x:0,z:20},[false,false,false]),true);
});

test('measurements separate pacing, CPU, loading and imposed pauses and reset without losing raw evidence',()=>{
  const m=new FrameMeasurements();m.reset('first',0,100);
  m.add(50,16,8,5,'steady');m.add(110,16,8,4,'steady');m.add(120,350,8,20,'loading');m.add(130,32,8,6,'hit-pause');m.add(140,5000,8,4,'paused');
  const first=m.report(true);assert.equal(first.framePacerIntervalMs.samples,1);assert.equal(first.cpuSubmissionMs.p50,4);assert.equal(first.rafIntervalBeforeRenderedFramesMs.p50,8);assert.equal(first.classes.loading.stallsOver100Ms,1);assert.equal(first.classes.paused.stallsOver100Ms,1);assert.equal(first.rawSamples.length,5);assert.equal(first.gpuTimeMs,null);
  m.reset('quality',150,30);m.add(160,16,8,4,'steady');assert.equal(m.report().framePacerIntervalMs.samples,0);assert.equal(m.export().previous[0].rawSamples.length,5);
  m.add(190,34,8,7,'steady');assert.equal(m.report().framePacerIntervalMs.p50,34);
});


test('paused comparison teleports select the new room lights immediately without growing the pool',()=>{
 const scene=new T.Scene(),ambient=new T.HemisphereLight(),sun=new T.DirectionalLight();scene.add(ambient,sun);scene.fog=new T.FogExp2();
 const fires=[];for(const [x,z]of [[-15,20],[15,20],[-18,-10],[18,-10]]){const light=new T.PointLight(0xffaa66,40);light.position.set(x,3.7,z);light.userData.baseIntensity=40;const flame=new T.Object3D();flame.userData.baseScale=1;scene.add(light,flame);fires.push({light,flame});}scene.updateMatrixWorld(true);
 const lighting=new DungeonLighting({scene,sun,fires,shrines:[],gates:[],surfaces:[]});lighting.setQuality('low',false);
 lighting.update(new T.Vector3(11,1.7,20),0,0,true,false);assert.ok(lighting.status.sourceIndices.includes(1));
 lighting.resetSelection();lighting.update(new T.Vector3(14,1.7,-10),0,0,true,false);assert.ok(lighting.status.sourceIndices.includes(3));assert.ok(!lighting.status.sourceIndices.includes(1));assert.equal(lighting.status.slots,3);assert.equal(lighting.status.shadowKey,3);lighting.dispose();
});
