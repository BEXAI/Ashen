#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { sha, parseGLB } = require('./inspect-optimize-glb.cjs');
const base = path.resolve(__dirname, '..'), models = path.join(base, 'models');
const roster = [
  ['silver-knight','5cbfe6bf','blade','knight'], ['sage','880f9069','staff'],
  ['frost-mage','6017ddf3','staff'], ['ranger','0beed7ce','bow'],
  ['dusk-rogue','853d2fdc','blade'], ['skeleton-warrior','4bbdba2a','blade'],
  ['reaper','ae17a6dd','blade'], ['golem','496924e4','claws'],
  ['ember-dragon','5a3ddbf0','claws'], ['lich','3e9a9a70','staff'],
  ['knife-rogue','3e01be62','blade'], ['shrouded-skeleton','a732cfc0','claws'],
  ['lion-knight','db95c2d3','blade','knight'], ['spider','c4010a07','authored'],
  ['ogre','e4f73d18','club'], ['goblin','2cfd6662','blade']
];
const motions = ['forward','backward','strafe_left','strafe_right','dodge','hit','death'];
const strikes = ['side','diagonal','backhand','overhead'];
const json = v => JSON.stringify(v,null,2)+'\n';
async function read(p) { return JSON.parse(await fs.readFile(p,'utf8')); }
async function record(p) { const b=await fs.readFile(p); return {path:p,bytes:b.length,sha256:sha(b)}; }
async function run(script, args, logPath) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(__dirname,script),...args],{stdio:['ignore','pipe','pipe']});
    let log=''; child.stdout.on('data',b=>log+=b); child.stderr.on('data',b=>log+=b);
    child.on('error',reject); child.on('close',async code=>{ await fs.writeFile(logPath,log); code===0?resolve():reject(Error(`${script} failed (${code}); ${logPath}\n${log.slice(-1500)}`)); });
  });
}
async function main() {
  let saved={};const configPath=path.join(models,'runtime-source-overrides.json');try{saved=await read(configPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  const selected=[],overrides=new Map(Object.entries(saved.inputs||{})),derivations=new Map(Object.entries(saved.derivations||{}));for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(a==='--input'||a==='--derivation'){const value=process.argv[++i],eq=value?.indexOf('=')??-1;if(eq<1)throw Error(`${a} requires slug=/path/file`);(a==='--input'?overrides:derivations).set(value.slice(0,eq),path.resolve(value.slice(eq+1)));}else selected.push(a);}
  await fs.writeFile(configPath,json({inputs:Object.fromEntries(overrides),derivations:Object.fromEntries(derivations)}));
  const assets = (await read(path.join(base,'source-manifest.json'))).assets;
  await fs.mkdir(path.join(models,'provenance'),{recursive:true}); await fs.mkdir(path.join(models,'build-logs'),{recursive:true});
  const summaryPath=path.join(models,'runtime-build-summary.json');
  let summary; try { summary=await read(summaryPath); } catch { summary={schemaVersion:1,requiredClips:['idle',...motions,...strikes],models:[],unavailable:[{slug:'ogre',reason:'Provider returned nsfw for both authorized attempts; no output model'},{slug:'goblin',reason:'Provider returned nsfw for both authorized attempts; no output model'}]}; }
  for (const [slug,id,style,profile='nonmetal'] of roster) {
    if(selected.length&&!selected.includes(slug))continue;
    console.log(JSON.stringify({slug,state:'processing'}));
    const asset=assets.find(a=>a.asset_id_short===id); if(!asset)throw Error(`Missing exact source ${slug}`);
    const modelJob=await read(path.join(models,'jobs',`${slug}.json`));
    let originalPath=path.join(models,`${slug}-original.glb`);try{await fs.access(originalPath);}catch(e){if(e.code!=='ENOENT'||!overrides.has(slug))throw e;originalPath=overrides.get(slug);}
    const original=await record(originalPath); original.kind=modelJob.status==='completed'?'provider-generated':'locally-authored';
    const input=overrides.get(slug)||(style==='authored'?path.join(models,`${slug}-rigged.glb`):original.path);
    const derived=input!==original.path?await record(input):null;
    const derivation=derivations.has(slug)?await read(derivations.get(slug)):null;
    const provenance={schemaVersion:1,slug,originalArtwork:{assetId:asset.asset_id,filename:asset.filename,sha256:asset.sha256,bytes:asset.bytes,screenshot:asset.screenshot,filenameTimestampUTC:asset.filename_timestamp_utc,dateAmericaNewYork:asset.america_new_york_date},modelGeneration:{jobId:modelJob.id,jobType:modelJob.job_type,status:modelJob.status,producedModel:modelJob.status==='completed',resultURL:modelJob.result_url,sourceUpload:modelJob.params.medias},originalGLB:original,...(derived?{locallyDerivedInput:derived}:{}),attackStyle:style,attackAliasPolicy:style==='blade'?'Four distinct native sword clips':style==='authored'?'Original authored spider clips preserved':`Four canonical strike names alias genuine ${style} action; original timing preserved`,clipTimePolicy:'Native durations; runtime maps contact phases'};
    const provenancePath=path.join(models,'provenance',`${slug}.json`); await fs.writeFile(provenancePath,json(provenance));
    if(derivation){provenance.derivation={metadataPath:derivations.get(slug),...derivation};await fs.writeFile(provenancePath,json(provenance));}
    const runtime=path.join(models,`${slug}-runtime.glb`), args=[input,runtime,'--profile',profile,'--provenance-json',provenancePath,'--require-complete','--force'];
    const clipMap={idle:'own-original-idle'};
    if(style==='authored')args.push('--materials-only');
    else {
      for(const name of [...motions,...strikes]) { const donor=strikes.includes(name)&&style!=='blade'?style:name; clipMap[name]=donor; args.push('--clip',`${name}=${path.join(models,'animations',donor+'.glb')}`); }
      const contacts=derivation?.contactSockets||(derivation?.contactBaseExportedRightHandLocal?{parent:'RightHand',base:derivation.contactBaseExportedRightHandLocal,tip:derivation.contactTipExportedRightHandLocal}:null);
      args.push('--contact-bone',contacts?.parent||(style==='bow'?'LeftHand':'RightHand'),'--contact-base',(contacts?.base||[0,8,0]).join(','),'--contact-tip',(contacts?.tip||[0,98,0]).join(','));
    }
    await run('normalize-retarget-glb.cjs',args,path.join(models,'build-logs',`${slug}-normalize.log`));
    const rt=await read(runtime.replace('.glb','.retarget-report.json'));
    const entry={slug,status:'runtime-ready',style,originalArtworkAssetId:asset.asset_id,originalGLB:original,runtime:await record(runtime),runtimeReport:runtime.replace('.glb','.retarget-report.json'),provenancePath,rig:rt.rig,sockets:rt.sockets,restBounds:rt.normalizedSkinnedBounds.rest.bounds,clips:rt.clips.map(c=>({name:c.name,donor:style==='authored'?'authored-spider':clipMap[c.name],durationSeconds:c.outputDurationSeconds,actionId:c.provenance.sourceMetadata?.actionId??null,jobId:c.provenance.sourceMetadata?.jobId??null,sourceSHA256:c.provenance.sha256})),sampledClipBounds:rt.normalizedSkinnedBounds.clips.map(c=>({name:c.name,bounds:c.unionBounds})),validationErrors:rt.validation.numErrors};
    const ix=summary.models.findIndex(e=>e.slug===slug); if(ix<0)summary.models.push(entry);else summary.models[ix]=entry;
    summary.updatedAtUTC=new Date().toISOString(); await fs.writeFile(summaryPath,json(summary));
    console.log(JSON.stringify({slug,state:'runtime-ready',path:runtime}));
    const out=path.join(models,'optimized',slug);
    await run('inspect-optimize-glb.cjs',[runtime,out,'--force'],path.join(models,'build-logs',`${slug}-optimize.log`));
    const optimized=await read(path.join(out,`${slug}-runtime.report.json`));
    entry.variants=optimized.variants.map(v=>({name:v.name,path:path.join(out,v.filename),bytes:v.bytes,sha256:v.sha256,textureCap:v.textureCap,meshoptCompressedViews:v.meshoptCompressedViews,preservation:v.preservation}));
    const raw=parseGLB(await fs.readFile(runtime)); entry.triangles=(raw.json.meshes||[]).flatMap(m=>m.primitives).reduce((n,p)=>n+(p.indices==null?raw.json.accessors[p.attributes.POSITION].count:raw.json.accessors[p.indices].count)/3,0);
    entry.status='complete'; summary.updatedAtUTC=new Date().toISOString(); await fs.writeFile(summaryPath,json(summary));
    summary.unavailable=summary.unavailable.filter(m=>m.slug!==slug); await fs.writeFile(summaryPath,json(summary));
    console.log(JSON.stringify({slug,state:'complete',triangles:entry.triangles,clips:entry.clips.length,variants:entry.variants.map(v=>({name:v.name,bytes:v.bytes,sha256:v.sha256}))}));
  }
  const sums=summary.models.flatMap(m=>[m.runtime,...(m.variants||[])]).map(r=>`${r.sha256}  ${path.relative(models,r.path)}`).join('\n')+'\n';
  await fs.writeFile(path.join(models,'runtime-assets.SHA256SUMS'),sums);
  console.log(JSON.stringify({summary:summaryPath,complete:summary.models.filter(m=>m.status==='complete').length}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
