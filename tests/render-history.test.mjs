import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import path from 'node:path';import {existsSync} from 'node:fs';
const here=path.dirname(fileURLToPath(import.meta.url)),game=process.env.ASHEN_GAME||(existsSync(path.resolve(here,'../app/game/visual-bench.ts'))?path.resolve(here,'..'):'/Users/nathaniel/Documents/ChatGPT/Knight/game'),source=existsSync(path.join(here,'visual-bench.ts'))?here:path.join(game,'app/game');
const require=createRequire(path.join(game,'package.json')),{build}=require('esbuild');
const bundle=await build({stdin:{contents:`export * from '${source}/visual-bench';export * from '${source}/frame-measurements';export * from '${source}/render-state-history';export * as T from 'three';`,resolveDir:game},bundle:true,write:false,platform:'node',format:'esm',nodePaths:[path.join(game,'node_modules')],logLevel:'silent'});
const {FrameMeasurements,FrameDiagnostics,RenderStateHistory,estimateSceneResources,visibleCharacterLodCounts,T}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const counters=(changes={})=>({mainDraws:10,mainTriangles:1000,totalDraws:18,totalTriangles:1600,rendererGeometries:5,rendererTextures:7,rendererPrograms:3,drawingBufferWidth:800,drawingBufferHeight:1000,drawingBufferPixels:800000,...changes});
const state=(changes={})=>({quality:'auto',rendererSize:[800,1000],exposure:1.35,resources:{sceneGeometries:5,sceneTextureObjects:7,sceneTextureSources:7,estimatedTextureStorageGroups:7,estimatedSceneBufferBytes:100,estimatedAssetTextureBytes:200,unknownTextureStorageGroups:0},context:{characterLods:{visibleGroups:2,bySkin:{knight:{0:1,1:1}}},props:{architecture:{lods:{Arch:1},draws:1,triangles:2992}},streaming:{loaded:['entry'],pending:[]},adaptive:{profile:{stage:0,fps:60}}},...changes});

test('one real rendered sample per second, no catch-up records or lazy context calls on skipped frames',()=>{
 const h=new RenderStateHistory();h.reset(100,0);let reads=0;const read=()=>{reads++;return state();};
 for(let i=0;i<=120;i++)h.capture(100+i*1000/60,'steady',counters(),read,'stable');
 assert.equal(reads,3);assert.deepEqual(h.report(true).samples.map(s=>Math.round(s.atMs)),[0,1000,2000]);
 h.capture(20100,'paused',counters(),read,'stable');assert.equal(reads,4);assert.equal(h.report(true).samples.length,4);assert.equal(h.report(true).samples.at(-1).atMs,20000);
});

test('state changes are actual frames, throttled and coalesced without fabricated intermediate snapshots',()=>{
 const h=new RenderStateHistory();h.reset(0,0);let adaptiveStage=0;const read=()=>state({context:{adaptiveStage}});
 h.capture(0,'steady',counters(),read,'a');adaptiveStage=1;h.markChanged('adaptive stage');assert.equal(h.capture(100,'steady',counters(),read,'b'),false);
 adaptiveStage=2;h.markChanged('asset ready');assert.equal(h.capture(250,'loading',counters(),read,'b'),true);const samples=h.report(true).samples;
 assert.equal(samples.length,2);assert.equal(samples[1].state.context.adaptiveStage,2);assert.equal(samples[1].classification,'loading');assert.equal(samples[1].trigger,'state-change');assert.ok(samples[1].changes.includes('adaptive stage'));assert.ok(samples[1].changes.includes('asset ready'));
});

test('per-render counter high water retains brief peaks missed by periodic context samples',()=>{
 const h=new RenderStateHistory();h.reset(0,0);h.capture(0,'steady',counters(),()=>state(),'a');
 h.capture(100,'loading',counters({rendererTextures:80,rendererGeometries:30,totalDraws:200}),()=>{throw Error('no snapshot due');},'b');
 h.capture(200,'steady',counters(),()=>{throw Error('no snapshot due');},'a');h.capture(1000,'steady',counters(),()=>state(),'a');
 const report=h.report(true);assert.equal(report.samples.length,2);assert.ok(report.samples.every(s=>s.counters.rendererTextures===7));assert.deepEqual(report.counterHighWater.rendererTextures,{value:80,atMs:100});assert.deepEqual(report.counterHighWater.totalDraws,{value:200,atMs:100});assert.equal(report.lastObservedCounters.rendererTextures,7);assert.equal(report.observedRenderedFrames,4);assert.equal(report.sampledEstimateHighWater.estimatedAssetTextureBytes.value,200);
});

test('600 retained records plus three prior windows stay bounded and preserve warmup/reset sequence',()=>{
 const m=new FrameMeasurements();m.reset('first',100,2000);
 for(let i=0;i<650;i++)m.renderState.capture(100+i*1000,'steady',counters({rendererTextures:i===2?99:7}),()=>state(),'a');
 let out=m.export();assert.equal(out.current.renderState.samples.length,600);assert.equal(out.current.renderState.samplesEvicted,50);assert.equal(out.current.renderState.samples[0].atMs,50000);assert.equal(out.current.renderState.counterHighWater.rendererTextures.value,99);
 for(let n=1;n<=4;n++){m.reset('window-'+n,700000+n*1000,2000);m.renderState.capture(700000+n*1000,'steady',counters(),()=>state(),'a');}
 out=m.export();assert.equal(out.previous.length,3);assert.deepEqual(out.previous.map(w=>w.reason),['window-1','window-2','window-3']);assert.equal(out.current.reason,'window-4');assert.equal(out.current.renderState.samples[0].classification,'warmup');assert.equal(out.current.sequence,5);assert.equal(out.current.rawSamples.length,0,'a rendered paused/first frame survives even with no positive timing interval');
});

test('history detaches mutable loader arrays, context objects, and exported previous windows',()=>{
 const m=new FrameMeasurements(),live=state();m.reset('original',0,0);m.renderState.capture(0,'steady',counters(),()=>live,'a');live.context.streaming.loaded.push('throne');live.context.props.architecture.lods.Arch=2;
 m.reset('next',1000,0);let out=m.export();assert.deepEqual(out.previous[0].renderState.samples[0].state.context.streaming.loaded,['entry']);assert.equal(out.previous[0].renderState.samples[0].state.context.props.architecture.lods.Arch,1);
 out.previous[0].renderState.samples[0].state.context.streaming.loaded.push('corruption');out.previous[0].renderState.counterHighWater.rendererTextures.value=12345;out=m.export();assert.deepEqual(out.previous[0].renderState.samples[0].state.context.streaming.loaded,['entry']);assert.equal(out.previous[0].renderState.counterHighWater.rendererTextures.value,7);
});

test('resource estimate deduplicates interleaved/shared buffers and textures, includes instancing and data types',()=>{
 const scene=new T.Scene(),g=new T.BufferGeometry(),interleaved=new T.InterleavedBuffer(new Float32Array(18),6);g.setAttribute('position',new T.InterleavedBufferAttribute(interleaved,3,0));g.setAttribute('normal',new T.InterleavedBufferAttribute(interleaved,3,3));g.setIndex([0,1,2]);
 const tex=new T.DataTexture(new Float32Array(4*4*4),4,4,T.RGBAFormat,T.FloatType);tex.generateMipmaps=false;const mat=new T.MeshStandardMaterial({map:tex,roughnessMap:tex});const mesh=new T.Mesh(g,mat),instances=new T.InstancedMesh(g,mat,2);scene.add(mesh,instances);
 const target=new T.WebGLRenderTarget(1024,1024);scene.environment=target.texture;
 const r=estimateSceneResources(scene);assert.equal(r.sceneGeometries,1);assert.equal(r.sceneTextureObjects,1);assert.equal(r.estimatedSceneBufferBytes,18*4+3*2+2*16*4);assert.equal(r.estimatedAssetTextureBytes,4*4*4*4);assert.equal(r.unknownTextureStorageGroups,0);target.dispose();
});

function renderer(){return {domElement:{width:800,height:1000},toneMappingExposure:1.35,info:{memory:{geometries:3,textures:4},programs:[{},{}],render:{calls:0,triangles:0},autoReset:true,reset(){this.render.calls=0;this.render.triangles=0;}},getSize(target){return target.set(400,500);}};}
test('FrameDiagnostics samples current completed-render counters and performs no per-frame scene traversal',()=>{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),r=renderer(),m=new FrameDiagnostics();scene.add(mesh);m.hook(scene,camera);m.measurements.reset('test',0,0);
 let traversals=0,contexts=0;const original=scene.traverse.bind(scene);scene.traverse=(fn)=>{traversals++;original(fn);};
 const frame=(at,main,total)=>{m.begin(r);for(let i=0;i<main;i++)mesh.onBeforeRender(r,scene,camera,mesh.geometry,mesh.material,null);r.info.render.calls=total;r.info.render.triangles=total*12;const captured=m.captureRenderState(r,scene,'auto',at,'steady',()=>{contexts++;return {adaptiveStage:1};});m.end(r,16,16,2,'steady',at);return captured;};
 assert.equal(frame(0,2,9),true);for(let at=16;at<1000;at+=16)frame(at,1,3);assert.equal(contexts,1);assert.equal(traversals,1);assert.equal(frame(1000,4,12),true);assert.equal(contexts,2);assert.equal(traversals,2);
 const samples=m.measurements.export().current.renderState.samples;assert.equal(samples[1].counters.mainDraws,4);assert.equal(samples[1].counters.totalDraws,12);assert.equal(samples[1].counters.mainTriangles,48);assert.equal(samples[1].counters.totalTriangles,144);assert.deepEqual(samples[1].state.rendererSize,[400,500]);assert.equal(samples[1].counters.drawingBufferWidth,800);
});

test('sampling overhead is included when caller takes CPU finish timestamp after capture',()=>{
 const scene=new T.Scene(),r=renderer(),m=new FrameDiagnostics();m.measurements.reset('timing',0,0);let now=100;const cpuStarted=now;m.begin(r);now+=2;r.info.render.calls=10;
 m.captureRenderState(r,scene,'low',now,'steady',()=>{now+=7;return {};});const sampledAt=now;m.end(r,33.3,16.7,sampledAt-cpuStarted,'steady',sampledAt);
 const timing=m.measurements.export().current;assert.equal(timing.rawSamples[0].cpuSubmissionMs,9);assert.equal(timing.rawSamples[0].atMs,109);assert.equal(timing.renderState.samples[0].atMs,102);assert.equal(timing.gpuTimeMs,null);
});

test('active actor LOD summary excludes hidden groups and distinguishes procedural fallback from unselected imports',()=>{
 const actor=(visible,skin,lod,visual)=>({group:{visible,userData:{skin,activeLod:lod}},visual});const r=visibleCharacterLodCounts([actor(true,'ash-knight',0,{}),actor(true,'ash-knight',1,{}),actor(false,'crypt-warden',0,{}),actor(true,'crypt-warden',2,undefined),actor(true,'ember-sovereign',undefined,{})]);
 assert.equal(r.visibleGroups,4);assert.equal(r.bySkin['ash-knight']['0'],1);assert.equal(r.bySkin['ash-knight']['1'],1);assert.equal(r.bySkin['crypt-warden'].procedural,1);assert.equal(r.bySkin['crypt-warden']['2'],0);assert.equal(r.bySkin['ember-sovereign'].unselected,1);
});

test('flame-style texture clones share estimated storage only for identical Source and upload/sampling parameters',()=>{
 const scene=new T.Scene(),geometry=new T.PlaneGeometry(),base=new T.Texture({width:1024,height:1024});base.generateMipmaps=false;
 const sprites=Array.from({length:13},(_,i)=>{const texture=base.clone();texture.offset.set(i/13,0);texture.repeat.set(1/13,1);scene.add(new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture})));return texture;});
 let r=estimateSceneResources(scene);assert.equal(r.sceneTextureObjects,13);assert.equal(r.sceneTextureSources,1);assert.equal(r.estimatedTextureStorageGroups,1);assert.equal(r.estimatedAssetTextureBytes,4*1024*1024);
 sprites[0].magFilter=T.NearestFilter;r=estimateSceneResources(scene);assert.equal(r.estimatedTextureStorageGroups,2);assert.equal(r.estimatedAssetTextureBytes,8*1024*1024);
 const independent=new T.Texture(base.image);independent.generateMipmaps=false;scene.add(new T.Mesh(geometry,new T.MeshBasicMaterial({map:independent})));r=estimateSceneResources(scene);assert.equal(r.sceneTextureSources,2);assert.equal(r.estimatedTextureStorageGroups,3);assert.equal(r.estimatedAssetTextureBytes,12*1024*1024);
});
