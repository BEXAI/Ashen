#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createRequire}=require('node:module');
const {sampleSkinnedBounds}=require('./sample-skinned-bounds.cjs');
const req=createRequire('/Users/nathaniel/.cache/ashen-september-deps/package.json');
const {NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),T=req('three');
const models=path.resolve(__dirname,'../models');
async function main(){
  const summary=JSON.parse(await fs.readFile(path.join(models,'runtime-build-summary.json'),'utf8'));
  const names=process.argv.slice(2);let curves={},qa={};
  if(names.length){try{curves=JSON.parse(await fs.readFile(path.join(models,'runtime-grounding.json'),'utf8'));qa=JSON.parse(await fs.readFile(path.join(models,'runtime-grounding-qa.json'),'utf8'));}catch{}}
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for(const m of summary.models){
    if(names.length&&!names.includes(m.slug))continue;
    const exclusionPath=path.join(models,`${m.slug}-grounding-exclusions.json`);let exclusions={},exclusionSource=null;try{exclusions=JSON.parse(await fs.readFile(exclusionPath,'utf8'));exclusionSource=exclusionPath;}catch(e){if(e.code!=='ENOENT')throw e;}
    const document=await io.read(m.runtime.path),taggedNodes=document.getRoot().listNodes().filter(n=>n.getExtras().excludeFromGrounding===true).map(n=>n.getName()),taggedMeshes=document.getRoot().listMeshes().filter(n=>n.getExtras().excludeFromGrounding===true).map(n=>n.getName());
    if(taggedNodes.length||taggedMeshes.length)exclusions={...exclusions,reason:exclusions.reason||'Authored equipment explicitly tagged excludeFromGrounding:true',nodeNames:[...new Set([...(exclusions.nodeNames||[]),...taggedNodes])],meshNames:[...new Set([...(exclusions.meshNames||[]),...taggedMeshes])]};
    const sampled=sampleSkinnedBounds(document,T,65,exclusions),rest=sampled.rest.bounds;
    const clips={},checks={};
    for(const c of sampled.clips){
      const v=c.samples.map(s=>s.bounds.min[1]);if(v.some(y=>!Number.isFinite(y)))throw Error(`${m.slug} ${c.name}: nonfinite geometry`);
      clips[c.name]=v;
      const maxExtent=Math.max(...c.samples.flatMap(s=>s.bounds.size)),jumps=v.slice(1).map((y,i)=>Math.abs(y-v[i]));
      checks[c.name]={startSeconds:c.start,endSeconds:c.end,durationSeconds:c.duration,minimumY:Math.min(...v),maximumY:Math.max(...v),maximumLift:Math.max(0,rest.min[1]-Math.min(...v)),maxAdjacentMinimumYChange:Math.max(...jumps),maximumExtentMeters:maxExtent,extentToRestRatio:maxExtent/Math.max(...rest.size),finite:true};
    }
    curves[m.slug]={restMinY:rest.min[1],clips};qa[m.slug]={runtimePath:m.runtime.path,runtimeSHA256:m.runtime.sha256,sampleCount:65,sampleFractions:'index / 64; native clip durations unchanged',geometry:'Existing runtime input meshes, minus explicit held-equipment exclusions; no external equipped props added by game',exclusions:Object.keys(exclusions).length?{path:exclusionSource,nodeNames:exclusions.nodeNames||[],meshNames:exclusions.meshNames||[],vertexSets:(exclusions.vertexSets||[]).map(v=>({mesh:v.mesh,primitive:v.primitive,count:v.vertices.length})),reason:exclusions.reason}:null,restBounds:rest,clips:checks};
    console.log(JSON.stringify({slug:m.slug,clips:Object.keys(clips).length,maxLift:Math.max(...Object.values(checks).map(c=>c.maximumLift)),maxExtent:Math.max(...Object.values(checks).map(c=>c.maximumExtentMeters))}));
  }
  await fs.writeFile(path.join(models,'runtime-grounding.json'),JSON.stringify(curves)+'\n');
  await fs.writeFile(path.join(models,'runtime-grounding-qa.json'),JSON.stringify(qa,null,2)+'\n');
  console.log(JSON.stringify({path:path.join(models,'runtime-grounding.json'),models:Object.keys(curves).length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
