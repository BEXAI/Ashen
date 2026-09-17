#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{createRequire}=require('node:module');
const {sha}=require('./inspect-optimize-glb.cjs'),{sampleSkinnedBounds}=require('./sample-skinned-bounds.cjs');
const base=path.resolve(__dirname,'..'),deps=process.env.ASHEN_ASSET_DEPS||process.cwd();
const donors=process.env.ASHEN_DONOR_ROOT||path.resolve(base,'../higgsfield-september-8-2026/models/animations');
const req=createRequire(path.join(deps,'package.json')),{NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),T=req('three');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),json=x=>JSON.stringify(x,null,2)+'\n';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),rel=p=>path.relative(base,p);
async function record(p){const b=await fs.readFile(p);return {path:rel(p),bytes:b.length,sha256:sha(b)};}
async function run(script,args,log){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(__dirname,script),...args],{env:{...process.env,ASHEN_ASSET_DEPS:deps}});let text='';p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);p.on('error',reject);p.on('close',async code=>{await fs.writeFile(log,text);code?reject(Error(text.slice(-2000))):resolve();});});}
async function main(){
 const inventory=await read(path.join(base,'inventory.json')),config=await read(path.join(base,'runtime-config.json'));
 const selected=process.argv.slice(2),summaryPath=path.join(base,'dragon-runtime-build-summary.json');let summary={schemaVersion:1,models:[]},curves={},entries={};
 try{summary=await read(summaryPath);curves=await read(path.join(base,'dragon-runtime-grounding.json'));entries=await read(path.join(base,'dragon-manifest-entries.json'));}catch{}
 for(const source of inventory.assets.toSorted((a,b)=>selected.length?selected.indexOf(a.slug)-selected.indexOf(b.slug):0)){
  const slug=source.slug;if(slug==='spider'||selected.length&&!selected.includes(slug))continue;
  let input=path.join(base,'derived',slug+'-reskinned.glb');try{await fs.access(input);}catch{input=path.join(base,'models',slug+'-original.glb');}
  const doc=await io.read(input);if(!doc.getRoot().listSkins().length){console.log(JSON.stringify({slug,state:'awaiting-rig'}));continue;}
  const settings=config[slug],style=settings.style,derivedPath=path.join(base,'derived',slug+'-rigging.json');let derivation={};try{derivation=await read(derivedPath);}catch{}
  const provenance={schemaVersion:1,slug,originalArtwork:source.sourceArtwork,modelGeneration:{jobId:source.jobId,jobType:source.jobType,createdAt:source.createdAt},originalGLB:await record(path.join(base,'models',slug+'-original.glb')),riggedInput:await record(input),derivation,motion:'Genuine September 8 native motion library; rest-aware rotation retargeting. Static input clip replaced with genuine idle.'};
  const provenancePath=path.join(base,'provenance',slug+'.json');await fs.writeFile(provenancePath,json(provenance));
  const runtime=path.join(base,'runtime',slug+'-runtime.glb'),args=[input,runtime,'--profile',['lion-knight','silver-knight'].includes(slug)?'knight':'nonmetal','--deps-root',deps,'--provenance-json',provenancePath,'--require-complete','--force'];
  for(const name of ['idle','forward','backward','strafe_left','strafe_right','dodge','hit','death','side','diagonal','backhand','overhead']){const donor=['side','diagonal','backhand','overhead'].includes(name)&&style!=='blade'?style:name;args.push('--clip',name+'='+(slug==='sage'&&donor==='staff'?path.join(base,'derived','staff-left.glb'):path.join(donors,donor+'.glb')));}
  const handName=style==='bow'?'LeftHand':'RightHand',hand=doc.getRoot().listNodes().find(n=>n.getName()===handName);if(!hand)throw Error(slug+' missing '+handName);
  const m=new T.Matrix4().fromArray(hand.getWorldMatrix()),scale=new T.Vector3().setFromMatrixScale(m).y;
  const sockets=derivation.contactSockets||{parent:handName,base:[0,.08/scale,0],tip:[0,(style==='claws'?.38:.98)/scale,0]};
  args.push('--contact-bone',sockets.parent,'--contact-base',sockets.base.join(','),'--contact-tip',sockets.tip.join(','));
  if(derivation.muzzleSocket)args.push('--muzzle',derivation.muzzleSocket.translation.join(','));
  await run('normalize-retarget-glb.cjs',args,path.join(base,'qa',slug+'-normalize.log'));
  const rt=await read(runtime.replace('.glb','.retarget-report.json'));
  const compacted=require('./compact-runtime.cjs').compact(await fs.readFile(runtime));await fs.writeFile(runtime,compacted.bytes);rt.compaction=compacted.report;await fs.writeFile(runtime.replace('.glb','.retarget-report.json'),json(rt));console.log(JSON.stringify({slug,state:'retargeted',clips:rt.clips.length}));
  await run('inspect-optimize-glb.cjs',[runtime,path.join(base,'optimized',slug),'--deps-root',deps,'--force'],path.join(base,'qa',slug+'-optimize.log'));
  const opt=await read(path.join(base,'optimized',slug,slug+'-runtime.report.json'));
  const document=await io.read(runtime);let exclusions=derivation.groundingExclusions||{};
  const sampled=sampleSkinnedBounds(document,T,65,exclusions),ground={restMinY:sampled.rest.bounds.min[1],clips:{}},groundQa={sampleCount:65,rest:sampled.rest.bounds,exclusions,clips:{}};
  for(const c of sampled.clips){const ys=c.samples.map(s=>s.bounds.min[1]);if(ys.some(y=>!Number.isFinite(y)))throw Error(slug+' nonfinite grounding');ground.clips[c.name]=ys;groundQa.clips[c.name]={duration:c.duration,minimumY:Math.min(...ys),maximumY:Math.max(...ys),maximumExtent:Math.max(...c.samples.flatMap(s=>s.bounds.size)),finite:true};}
  await fs.writeFile(path.join(base,'qa',slug+'-grounding.json'),json(groundQa));curves[slug]=ground;
  const variants={};for(const v of opt.variants){const p=path.join(base,'optimized',slug,v.filename);variants[v.name==='mobile1024'?'mobile':'hd']={...await record(p),textureCap:v.textureCap,validationErrors:v.validation.direct.numErrors};}
  const entry={slug,status:'complete',sourceAssetId:source.sourceArtwork.assetId,sourceJobId:source.jobId,original:provenance.originalGLB,rigged:provenance.riggedInput,runtime:await record(runtime),variants,provenance:rel(provenancePath),rig:rt.rig,clips:rt.clips.map(c=>({name:c.name,duration:c.outputDurationSeconds,source:c.provenance})),sockets:rt.sockets,restBounds:sampled.rest.bounds,validationErrors:rt.validation.numErrors};
  const index=summary.models.findIndex(m=>m.slug===slug);if(index<0)summary.models.push(entry);else summary.models[index]=entry;
  const {style:discard,...manifest}=settings;entries[slug]={...manifest,...(derivation.bodyBounds?{bounds:derivation.bodyBounds}:{}),derivation:'recovered-provider-model-with-local-rigging-and-native-motion',variants,grounding:ground};
  if(slug==='ember-dragon')await fs.writeFile(path.join(base,'ember-dragon-manifest-entry.json'),json({...entries[slug],bounds:entry.restBounds,sourceJobId:source.jobId,sourceMeshSha256:provenance.originalGLB.sha256,sourceCreatedAt:source.createdAt,geometry:{sourceTriangles:16467,runtimeTriangles:opt.source.counts.uniqueMeshTriangles,removedSourceFusedBridgeTriangles:derivation.reskin?.removedFusedChainBridgeTriangles?.length||0},contacts:derivation.contactSockets}));
  summary.updatedAtUTC=new Date().toISOString();await fs.writeFile(summaryPath,json(summary));await fs.writeFile(path.join(base,'dragon-runtime-grounding.json'),JSON.stringify(curves)+'\n');await fs.writeFile(path.join(base,'dragon-manifest-entries.json'),json(entries));
  console.log(JSON.stringify({slug,state:'complete',variants}));
 }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
