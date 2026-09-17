import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const game=process.env.GAME_ROOT||process.cwd(),modulePath=process.env.ENVIRONMENT_VERIFIER_SOURCE||path.join(game,'scripts/verify-environment.mjs');
const {createEnvironmentVerifier,parseGlb,packGlb,rgbaMipBytes,verifyRuntimePropBudget,verifyBoundBytes,sha256,containedFile}=await import(pathToFileURL(modulePath).href),verifier=await createEnvironmentVerifier(game);
const manifest=JSON.parse(await fs.readFile(path.join(game,'public/assets/props/v2/manifest.json'))),primary=await fs.readFile(containedFile(game,manifest.assets.shrine.compressed_url)),fallback=await fs.readFile(containedFile(game,manifest.assets.shrine.fallback_url));

// This exercises all active artifacts, not an earlier fixture report or hardcoded dungeon revision.
test('active prop and DungeonAssets manifests bind actual exports, source records, atlases and active geometry',async()=>{
 const r=await verifier.verify();assert.equal(r.pass,true,JSON.stringify(r.errors));assert.match(r.dungeon.manifest,/^\/assets\/dungeon\/v\d+\/manifest.json$/);assert.equal(Object.keys(r.props.assets).length,3);assert.ok(r.dungeon.rooms.length>=9);
 assert.ok(r.props.fallbackRgba8MipBytes<=16*1024*1024);assert.equal(r.props.fallbackRgba8MipBytes,15029576);assert.deepEqual(Object.fromEntries(Object.entries(r.props.assets).map(([n,a])=>[n,a.sourceEstimatedMipBytes/1048576])),{sconce:2,shrine:8+1/3,architecture:4});
 for(const a of Object.values(r.props.assets)){assert.equal(a.variants.compressed.geometrySha256,a.variants.fallback.geometrySha256);for(const [kind,v]of Object.entries(a.variants)){assert.equal(v.selfContained,true);assert.equal(v.lights,0);assert.equal(v.rawValidation.numErrors,0);assert.equal(v.decodedGeometryValidation.numErrors,0);assert.equal(v.decodedGeometryValidation.numWarnings,0);if(kind==='compressed'){assert.equal(v.rawValidation.numWarnings,6);assert.ok(v.warnings.filter(w=>w.severity===1).every(w=>w.kind==='validator-ktx2-support-limitation'));}else assert.equal(v.rawValidation.numWarnings,0);}}
 for(const room of r.dungeon.rooms){assert.equal(room.activeScene.triangles,room.declaredTriangles);assert.equal(room.activeScene.draws,room.declaredDraws);assert.equal(room.decodedGeometryValidation.numErrors,0);assert.equal(room.decodedGeometryValidation.numWarnings,0);assert.equal(room.lights,0);assert.ok(room.accessors>0&&room.accessorScalars>0);assert.ok(room.lightmap.bytes>0);}
});

test('hash, byte size and local URL binding reject stale or unapproved bytes before parsing',()=>{
 verifyBoundBytes(primary,manifest.assets.shrine.sha256,manifest.assets.shrine.download_bytes);const changed=Buffer.from(primary);changed[changed.length-1]^=1;assert.throws(()=>verifyBoundBytes(changed,manifest.assets.shrine.sha256,primary.length),/file hash/);assert.throws(()=>verifyBoundBytes(primary,sha256(primary),primary.length+4),/file bytes/);assert.throws(()=>containedFile(game,'https://example.org/asset.glb'),/local/);assert.throws(()=>containedFile(game,'/assets/../../outside.glb'),/escapes/);
});

test('external GLB buffer/image references are rejected without any network read',async()=>{
 const source=parseGlb(primary);let j=structuredClone(source.json);j.buffers[0].uri='https://example.invalid/geometry.bin';await assert.rejects(verifier.inspectGlb(packGlb(j,source.bin)),/external\/data buffer/);j=structuredClone(source.json);j.images[0].uri='extra.png';await assert.rejects(verifier.inspectGlb(packGlb(j,source.bin)),/external\/data image/);
});

test('fixture-removal zero accessors and embedded lights are rejected, including unused resources',async()=>{
 const {json,bin}=parseGlb(primary);let j=structuredClone(json);j.accessors.push({...j.accessors[0],count:0});await assert.rejects(verifier.inspectGlb(packGlb(j,bin)),/zero\/invalid accessor/);j=structuredClone(json);j.extensions={...j.extensions,KHR_lights_punctual:{lights:[{type:'point'}]}};await assert.rejects(verifier.inspectGlb(packGlb(j,bin)),/embedded lights/);
});

test('actual embedded KTX2 mip chain and payload bounds are checked independently of validator support',async()=>{
 const {json,bin}=parseGlb(primary),image=json.images.find(i=>i.mimeType==='image/ktx2'),view=json.bufferViews[image.bufferView],offset=view.byteOffset??0;let mutated=Buffer.from(bin);mutated.writeUInt32LE(mutated.readUInt32LE(offset+40)-1,offset+40);await assert.rejects(verifier.inspectGlb(packGlb(json,mutated)),/incomplete KTX2 mip/);mutated=Buffer.from(bin);mutated.writeBigUInt64LE(BigInt(bin.length*4),offset+80);await assert.rejects(verifier.inspectGlb(packGlb(json,mutated)),/mip 0 payload bounds/);
});

test('PNG fallback pixel decoding rejects a truncated image and discrete mip storage includes small tails',async()=>{
 const {json,bin}=parseGlb(fallback),j=structuredClone(json);j.bufferViews[j.images[0].bufferView].byteLength=8;await assert.rejects(verifier.inspectGlb(packGlb(j,bin)),/unsupported image format|corrupt|invalid|header|png/i);assert.equal(rgbaMipBytes(512,512),1398100);assert.equal(rgbaMipBytes(1024,1024),5592404);assert.equal(rgbaMipBytes(256,256),349524);
});

function tinyGlb({badIndex=false,nan=false,detached=false}={}){
 const positions=new Float32Array([0,0,0,1,0,0,0,1,0]);if(nan)positions[0]=NaN;const binary=Buffer.alloc(44);Buffer.from(positions.buffer).copy(binary);new Uint16Array(binary.buffer,binary.byteOffset+36,3).set([0,1,badIndex?9:2]);
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Active',mesh:0},...(detached?[{name:'Detached legacy fixture',mesh:0}]:[])],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{}],buffers:[{byteLength:44}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};return packGlb(json,binary);
}
test('decoded geometry catches out-of-range indices and nonfinite positions',async()=>{
 await assert.rejects(verifier.inspectGlb(tinyGlb({badIndex:true})),/index outside vertices/);await assert.rejects(verifier.inspectGlb(tinyGlb({nan:true})),/non-finite accessor/);
});

test('active-scene draw counts exclude valid detached legacy meshes without pretending the bytes are gone',async()=>{
 const actual=await verifier.inspectGlb(tinyGlb({detached:true}));assert.deepEqual(actual.activeScene,{triangles:1,draws:1});assert.deepEqual(actual.allGeometry,{triangles:2,draws:2});assert.equal(actual.geometry.filter(n=>!n.active).length,1);
});


test('optional captured runtime budget validates all families, sum integrity and the combined cap',()=>{
 const capture={props:{draws:4,triangles:9000},shrine:{draws:2,triangles:5936},architecture:{draws:3,triangles:9600},environmentProps:{drawsUpperBound:9,trianglesUpperBound:24536}};assert.equal(verifyRuntimePropBudget(capture).trianglesUpperBound,24536);let changed=structuredClone(capture);changed.environmentProps.trianglesUpperBound=20000;assert.throws(()=>verifyRuntimePropBudget(changed),/triangle sum/);changed=structuredClone(capture);changed.architecture.triangles=11000;changed.environmentProps.trianglesUpperBound=25936;assert.throws(()=>verifyRuntimePropBudget(changed),/budget exceeded/);assert.throws(()=>verifyRuntimePropBudget({environmentProps:capture.environmentProps}),/Missing captured/);
});
