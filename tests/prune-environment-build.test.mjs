import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const script=process.env.ENVIRONMENT_PRUNER_SOURCE||path.join(process.cwd(),'scripts/prune-environment-build.mjs'),{planEnvironmentPrune,applyEnvironmentPrune,pruneEnvironmentBuild}=await import(pathToFileURL(script));
const sha=b=>createHash('sha256').update(b).digest('hex'),exists=async p=>fs.access(p).then(()=>true,()=>false);
function glb({bufferUri,imageUri}={}){const data=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],...(bufferUri?{buffers:[{uri:bufferUri,byteLength:4}]}:{}),...(imageUri?{images:[{uri:imageUri}]}:{})})),json=Buffer.alloc(Math.ceil(data.length/4)*4,32);data.copy(json);const out=Buffer.alloc(20+json.length);out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);return out;}
async function fixture(t,dependencies={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ashen-prune-test-'))),client=path.join(root,'dist/client'),write=async(rel,data)=>{const file=path.join(root,rel);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));return file;};t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const [file,constant,url]of [['dungeon-assets','DUNGEON_MANIFEST_URL','/assets/dungeon/v13/manifest.json'],['prop-assets','PROP_MANIFEST_URL','/assets/props/v2/manifest.json'],['shrine-assets','SHRINE_MANIFEST_URL','/assets/props/v2/manifest.json'],['architecture-assets','ARCHITECTURE_MANIFEST_URL','/assets/props/v2/manifest.json'],['throne-assets','THRONE_MANIFEST_URL','/assets/props/v3/manifest.json']])await write(`app/game/${file}.ts`,`export const ${constant}='${url}';`);
 const variants={sconce:['v1/sconce.glb','v1/sconce-fallback.glb'],shrine:['v2/shrine.glb','v2/shrine-fallback.glb'],architecture:['v2/architecture.glb','v2/architecture-fallback.glb']},props={version:'props-v2',assets:{}};
 for(const [name,urls]of Object.entries(variants)){const a=glb(name==='shrine'?dependencies:{}),b=glb();await write('dist/client/assets/props/'+urls[0],a);await write('dist/client/assets/props/'+urls[1],b);props.assets[name]={compressed_url:'/assets/props/'+urls[0],fallback_url:'/assets/props/'+urls[1],sha256:sha(a),fallback_sha256:sha(b),download_bytes:a.length,fallback_bytes:b.length};}
 await write('dist/client/assets/props/v3/manifest.json',{version:'bone-throne-v1',assets:{boneThrone:props.assets.architecture}});
 const dungeon={version:'visual-v13',rooms:[]};for(const[id,version]of [['entry','v13'],['throne','v12'],['passage-0','v9']]){const a=glb(),b=Buffer.from('lightmap-'+id),url=`/assets/dungeon/${version}/${id}.glb`,lightmap=`/assets/dungeon/v11/${id}.png`;await write('dist/client'+url,a);await write('dist/client'+lightmap,b);dungeon.rooms.push({id,url,lightmap,bytes:a.length,sha256:sha(a),lightmapBytes:b.length,lightmapSha256:sha(b)});}
 const propsManifest=await write('dist/client/assets/props/v2/manifest.json',props),dungeonManifest=await write('dist/client/assets/dungeon/v13/manifest.json',dungeon),legacy=[];
 for(const rel of ['assets/dungeon/v8/room.glb','assets/dungeon/v12/manifest.json','assets/props/v1/manifest.json','assets/props/v2/unreferenced.png'])legacy.push(await write('dist/client/'+rel,'legacy '+rel));
 const protectedFiles=[];for(const rel of ['public/assets/props/v1/master.glb','assets-source/shrine/master.blend','dist/client/assets/decoders/three-r180/basis.wasm','dist/client/assets/shared/unreferenced.png','dist/client/assets/characters/v9/master.glb'])protectedFiles.push(await write(rel,'protected '+rel));
 return {root,client,write,props,dungeon,propsManifest,dungeonManifest,legacy,protectedFiles};
}
async function assertLegacyIntact(f){for(const file of f.legacy)assert.equal(await exists(file),true,'Preflight failure removed a legacy file');}

test('mixed versions and exact GLB dependencies survive; only generated dungeon/prop legacy files are removed',async t=>{
 const f=await fixture(t,{bufferUri:'../shared/mesh.bin',imageUri:'/assets/shared/image.png'});await f.write('dist/client/assets/props/shared/mesh.bin',Buffer.from([1,2,3,4]));await f.write('dist/client/assets/shared/image.png','external image');const protectedBefore=await Promise.all(f.protectedFiles.map(p=>fs.readFile(p)));const plan=await planEnvironmentPrune(f.root);
 assert.equal(plan.manifests.length,3);assert.equal(plan.remove.length,4);assert.ok(plan.keep.some(k=>k.url==='/assets/props/v1/sconce.glb'));assert.ok(plan.keep.some(k=>k.url==='/assets/dungeon/v12/throne.glb'));assert.ok(plan.keep.some(k=>k.url==='/assets/dungeon/v9/passage-0.glb'));assert.ok(plan.keep.some(k=>k.url==='/assets/dungeon/v11/entry.png'));assert.ok(plan.keep.some(k=>k.url==='/assets/props/shared/mesh.bin'));assert.ok(plan.keep.some(k=>k.url==='/assets/shared/image.png'&&!k.prunableFamily));
 const result=await applyEnvironmentPrune(plan);assert.equal(result.removedFiles,4);for(const file of f.legacy)assert.equal(await exists(file),false);for(const keep of plan.keep)assert.equal(sha(await fs.readFile(keep.file)),keep.sha256);for(let i=0;i<f.protectedFiles.length;i++)assert.deepEqual(await fs.readFile(f.protectedFiles[i]),protectedBefore[i]);
});

test('missing external image prevents every removal, even when manifests and primary files exist',async t=>{
 const f=await fixture(t,{imageUri:'missing.png'});await assert.rejects(pruneEnvironmentBuild({gameRoot:f.root}),/ENOENT/);await assertLegacyIntact(f);
});

test('remote, encoded traversal and escaped external dependencies abort before mutation',async t=>{
 for(const imageUri of ['https://example.invalid/image.png','//example.invalid/image.png','../../../../private.png','%2e%2e/%2e%2e/%2e%2e/%2e%2e/private.png','%2f%2fexample.invalid/image.png']){const f=await fixture(t,{imageUri});await assert.rejects(pruneEnvironmentBuild({gameRoot:f.root}),/Remote|escapes|Unsafe/);await assertLegacyIntact(f);}
});

test('both a stale hash and wrong declared size abort before deleting otherwise unneeded files',async t=>{
 const f=await fixture(t);const props=structuredClone(f.props);props.assets.sconce.sha256='0'.repeat(64);await fs.writeFile(f.propsManifest,JSON.stringify(props));await assert.rejects(pruneEnvironmentBuild({gameRoot:f.root}),/hash differs/);await assertLegacyIntact(f);props.assets.sconce.sha256=f.props.assets.sconce.sha256;props.assets.sconce.download_bytes++;await fs.writeFile(f.propsManifest,JSON.stringify(props));await assert.rejects(pruneEnvironmentBuild({gameRoot:f.root}),/size differs/);await assertLegacyIntact(f);
});

test('symlinked legacy entries and symlinked required resources are rejected before any mutation',async t=>{
 const f=await fixture(t);await fs.symlink(f.protectedFiles[1],path.join(f.client,'assets/props/legacy-link'));await assert.rejects(pruneEnvironmentBuild({gameRoot:f.root}),/Symlink/);await assertLegacyIntact(f);await fs.unlink(path.join(f.client,'assets/props/legacy-link'));const target=path.join(f.client,'assets/props/v1/sconce.glb');await fs.unlink(target);await fs.symlink(f.protectedFiles[1],target);await assert.rejects(pruneEnvironmentBuild({gameRoot:f.root}),/regular file/);await assertLegacyIntact(f);
});

test('changed active loader source or kept dependency invalidates a prepared plan before removal',async t=>{
 const f=await fixture(t),plan=await planEnvironmentPrune(f.root);await fs.appendFile(path.join(f.root,'app/game/dungeon-assets.ts'),'\n// changed during build');await assert.rejects(applyEnvironmentPrune(plan),/Preflight changed/);await assertLegacyIntact(f);
 const second=await fixture(t),secondPlan=await planEnvironmentPrune(second.root);await fs.appendFile(secondPlan.keep.find(f=>f.url.endsWith('throne.glb')).file,'changed');await assert.rejects(applyEnvironmentPrune(secondPlan),/Preflight changed/);await assertLegacyIntact(second);
});

test('data URI resources are embedded and do not become filesystem dependencies; dry run changes no assets',async t=>{
 const f=await fixture(t,{bufferUri:'data:application/octet-stream;base64,AQIDBA==',imageUri:'data:image/png;base64,AQIDBA=='});const result=await pruneEnvironmentBuild({gameRoot:f.root,dryRun:true});assert.equal(result.dryRun,true);assert.equal(result.embeddedUris.length,2);await assertLegacyIntact(f);for(const keep of result.keep)assert.equal(sha(await fs.readFile(keep.file)),keep.sha256);
});

test('each loader constant is resolved and all assets in every selected prop manifest form its closure',async t=>{
 const f=await fixture(t),other={version:'props-v4',assets:{shrine:{...f.props.assets.shrine},extra:{...f.props.assets.architecture}}};await f.write('dist/client/assets/props/v4/manifest.json',other);await f.write('app/game/shrine-assets.ts',"export const SHRINE_MANIFEST_URL='/assets/props/v4/manifest.json';");const plan=await planEnvironmentPrune(f.root);assert.equal(plan.manifests.length,4);assert.ok(plan.keep.some(k=>k.url==='/assets/props/v3/manifest.json'));await f.write('app/game/architecture-assets.ts','export const UNKNOWN=1;');await assert.rejects(planEnvironmentPrune(f.root),/Cannot resolve ARCHITECTURE_MANIFEST_URL/);await assertLegacyIntact(f);
});

test('standalone CLI dry run and explicit output work without deleting files',async t=>{
 const f=await fixture(t),output=path.join(f.root,'plan.json'),{stdout}=await promisify(execFile)(process.execPath,[script,'--game-root',f.root,'--dry-run','--out',output]);assert.match(stdout,/dry run/);assert.equal(JSON.parse(await fs.readFile(output)).dryRun,true);await assertLegacyIntact(f);
});
