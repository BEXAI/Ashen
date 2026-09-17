const fs=require('fs'),path=require('path'),crypto=require('crypto');
const req=require('module').createRequire(path.join(require('./resolve-deps.cjs')(__dirname),'package.json'));
const {NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),{MeshoptDecoder}=req('meshoptimizer'),T=req('three');
const {sampleSkinnedBounds}=require('./spider-pipeline/sample-skinned-bounds.cjs');
const base=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(n,j)=>fs.writeFileSync(path.join(base,n),JSON.stringify(j,null,2)+'\n');
(async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),variants={};
 for(const [variant,suffix]of [['hd','hd2048'],['mobile','mobile1024']]){
  const p=path.join(base,'optimized/spider/spider-runtime.'+suffix+'.glb'),bytes=fs.readFileSync(p),d=await io.readBinary(bytes),sampled=sampleSkinnedBounds(d,T,65);
  const checks={};for(const c of sampled.clips){
   for(const s of c.samples)if(!s.bounds.min.every(Number.isFinite)||!s.bounds.max.every(Number.isFinite))throw Error(c.name+' nonfinite');
   const maxExtent=Math.max(...c.samples.flatMap(s=>s.bounds.size));if(maxExtent>3)throw Error(c.name+' excessive extent');
   checks[c.name]={duration:c.duration,minY:c.minimumVertexY,maxExtent,maximumLift:Math.max(0,sampled.rest.bounds.min[1]-c.minimumVertexY),maxAdjacentMinimumYDelta:Math.max(...c.samples.slice(1).map((s,i)=>Math.abs(s.bounds.min[1]-c.samples[i].bounds.min[1])))};
  }
  const rest=sampled.rest.bounds;
  variants[variant]={path:p,bytes:bytes.length,sha256:sha(bytes),restBounds:rest,grounding:{restMinY:rest.min[1],clips:Object.fromEntries(sampled.clips.map(c=>[c.name,c.samples.map(s=>s.bounds.min[1])]))},checks};
  write('spider-'+variant+'-pose-samples.json',sampled);
 }
 const grounding={restMinY:Math.max(variants.hd.grounding.restMinY,variants.mobile.grounding.restMinY),clips:{}};
 for(const name of Object.keys(variants.hd.grounding.clips))grounding.clips[name]=variants.hd.grounding.clips[name].map((y,i)=>Math.min(y,variants.mobile.grounding.clips[name][i]));
 const compare={};for(const name of Object.keys(grounding.clips))compare[name]={maximumVariantMinYDifference:Math.max(...grounding.clips[name].map((_,i)=>Math.abs(variants.hd.grounding.clips[name][i]-variants.mobile.grounding.clips[name][i])))};
 write('spider-grounding.json',{spider:grounding});write('spider-grounding-qa.json',{sampleCountPerClip:65,samplesTotal:1560,method:'CPU skinning on actual decoded optimized variants; conservative shared minimum of both per absolute time fraction',limits:'Uniform samples, not continuous extrema. Renderer must apply interpolated nonnegative floor lift.',variants,compare});
 const inv=JSON.parse(fs.readFileSync(path.join(base,'inventory.json'))).assets.find(a=>a.slug==='spider');
 const contactPhase=Object.fromEntries(['side','diagonal','backhand','overhead'].map(n=>[n,[.34,.66]]));
 const entry={equipment:'embedded',contactSockets:'embedded',contentVersion:'recovered-september9-v1',sourceAssetId:inv.sourceArtwork.assetId,height:1.25,yaw:0,strikeYaw:0,contactPhase,contactPhaseBasis:'Locally authored attack envelope sin(pi*t)^3 peaks at .5; .34-.66 is the high-engagement window, subject to game collision test.',variants:Object.fromEntries(Object.entries(variants).map(([v,x])=>[v,{path:path.relative(base,x.path),sha256:x.sha256,bytes:x.bytes,textureCap:v==='mobile'?1024:2048,validationErrors:0}])),grounding,derivation:'recovered-september9-tripo-mesh-with-locally-authored-eight-leg-rig',sourceJobId:inv.jobId,sourceMeshSha256:inv.sha256,sourceCreatedAt:inv.createdAt,geometry:{hdTriangles:57158,mobileTriangles:24005,sourceTriangles:57158,hdGeometryPreserved:true,mobileGeometry:'Separate rest-pose collapse decimation with normalized maximum-four skin influences'},clipOrigin:'locally authored on this mesh; no donor clips',contacts:['ContactBase','ContactTip']};
 write('spider-manifest-entry.json',entry);
 console.log(JSON.stringify({variants:Object.fromEntries(Object.entries(variants).map(([v,x])=>[v,{path:x.path,bytes:x.bytes,sha256:x.sha256,restBounds:x.restBounds,maxLift:Math.max(...Object.values(x.checks).map(c=>c.maximumLift)),maxExtent:Math.max(...Object.values(x.checks).map(c=>c.maxExtent))}])),samples:1560},null,2));
})();
