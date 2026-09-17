// Encode the rigged Blender retrofit without rebuilding the other characters.
// Usage: ASHEN_TOKTX=/path/to/toktx node scripts/package-sovereign-mobile.mjs INPUT.glb
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { cloneDocument, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import validator from 'gltf-validator';

const input=process.argv[2],encoder=process.env.ASHEN_TOKTX,version=process.argv[3]??'v10';
if(!/^v[0-9]+$/.test(version))throw Error('Invalid asset version');
if(!input||!encoder)throw Error('Supply a rigged master GLB and ASHEN_TOKTX encoder');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const master=await io.read(input),out=`public/assets/characters/${version}`,work=resolve(`.sites-runtime/sovereign-${version}`);
await mkdir(out,{recursive:true});await mkdir(work,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dimensions={low:{base:512,normal:256,orm:256,emissive:256},mobile:{base:1024,normal:512,orm:512,emissive:512},hd:{base:2048,normal:1024,orm:1024,emissive:512},high:{base:2048,normal:1024,orm:1024,emissive:512}};
const variants={};
async function resized(tier){
  const doc=cloneDocument(master),sizes={};
  for(const [index,texture] of doc.getRoot().listTextures().entries()){
    const name=texture.getName(),kind=name.split('_').pop();
    if(!Object.hasOwn(dimensions.mobile,kind))throw Error(`Unknown map channel: ${name}`);
    // The retained v9 sword uses a second material with a small shared atlas.
    const weapon=name.startsWith('retained_weapon_')||name.startsWith('ember-sovereign_');
    const cap=weapon?({base:256,normal:128,orm:128,emissive:64}[kind]):dimensions[tier][kind];
    const meta=await sharp(texture.getImage()).metadata(),size=Math.min(cap,meta.width,meta.height);
    texture.setImage(await sharp(texture.getImage()).resize(size,size).removeAlpha().png().toBuffer()).setMimeType('image/png');
    sizes[`${weapon?'weapon':'body'}_${kind}_${index}`]=size;
  }
  await doc.transform(prune({keepLeaves:true,keepAttributes:true}));
  return {doc,sizes};
}
async function validated(bytes,label){
  const result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});
  if(result.issues.numErrors)throw Error(`${label}: ${JSON.stringify(result.issues)}`);
  return {errors:result.issues.numErrors,warnings:result.issues.numWarnings};
}
for(const tier of Object.keys(dimensions)){
  const {doc,sizes}=await resized(tier);
  const {doc:fallbackDoc,sizes:fallbackSizes}=await resized(tier==='low'?'low':'mobile');
  await fallbackDoc.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const fallback=await io.writeBinary(fallbackDoc),fallbackName=`ember-sovereign-${tier}-fallback.glb`;
  const fallbackValidation=await validated(fallback,fallbackName);
  await writeFile(`${out}/${fallbackName}`,fallback);
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  for(const [i,texture] of doc.getRoot().listTextures().entries()){
    // Lossless sparse emission preserves narrow orange fissures. ETC1S visibly
    // desaturates these tiny maps while saving only a few kilobytes.
    if(texture.getName().endsWith('_emissive'))continue;
    const source=resolve(work,`${tier}-${i}.png`),target=source+'.ktx2';
    await writeFile(source,texture.getImage());
    const dataMap=/_normal$|_orm$/.test(texture.getName());
    const args=['--t2','--encode',dataMap?'uastc':'etc1s','--threads','2','--genmipmap','--assign_oetf',dataMap?'linear':'srgb'];
    if(dataMap)args.push('--uastc_quality','2','--zcmp','9');
    const result=spawnSync(encoder,[...args,target,source],{encoding:'utf8',timeout:120000});
    if(result.status!==0)throw Error(result.stderr||result.error?.message||'Texture encoding failed');
    texture.setImage(await readFile(target)).setMimeType('image/ktx2');
  }
  await doc.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const bytes=await io.writeBinary(doc),name=`ember-sovereign-${tier}.glb`;
  const validation=await validated(bytes,name);await writeFile(`${out}/${name}`,bytes);
  variants[tier]={url:`/assets/characters/${version}/${name}`,fallback:`/assets/characters/${version}/${fallbackName}`,sha256:hash(bytes),fallbackSha256:hash(fallback),bytes:bytes.length,fallbackBytes:fallback.length,textureSizes:sizes,fallbackTextureSizes:fallbackSizes,estimatedRgba8MipMiB:Object.values(sizes).reduce((n,s)=>n+s*s*4*4/3,0)/1048576,fallbackRgba8MipMiB:Object.values(fallbackSizes).reduce((n,s)=>n+s*s*4*4/3,0)/1048576,textureCompression:'KTX2 ETC1S base color; UASTC normal/ORM with mipmaps; lossless PNG emission',validation,fallbackValidation};
  console.log(tier,`${bytes.length} compressed bytes; ${fallback.length} fallback bytes`);
}
const old=JSON.parse(await readFile('public/assets/characters/v9/manifest.json','utf8'));
const nodes=master.getRoot().listNodes(),lods=nodes.filter(n=>Number.isInteger(n.getExtras().lod)).sort((a,b)=>a.getExtras().lod-b.getExtras().lod);
const triangles=lods.map(n=>n.getMesh().listPrimitives().reduce((sum,p)=>sum+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0));
const draws=lods.map(n=>n.getMesh().listPrimitives().length);
const skin=master.getRoot().listSkins()[0];
const metadata={status:'Blender anatomy and fitted armor retrofitted to the existing combat rig',source:`assets-source/sovereign-${version}`,masterSha256:hash(await readFile(input)),masterTextureSize:2048,boneCount:skin.listJoints().length,bones:skin.listJoints().map(n=>n.getName()),weightsPerVertex:4,triangles,materialDrawsPerLod:Math.max(...draws),sockets:['weapon','WeaponBase','WeaponTip'],clips:master.getRoot().listAnimations().map(a=>a.getName()),variants,limitations:'Procedural interpretation of the reference; practical skinning retrofit. No physical-phone frame-rate certification.'};
await writeFile(`${out}/manifest.json`,JSON.stringify({...old,version:`visual-${version}`,status:version==='v10'?'sovereign-mobile-update':'sovereign-deformation-update',method:version==='v10'?'Blender fitted armor with baked PBR; existing game combat rig, animations and weapon retained':'Continuous shoulder skinning, rigid plate attachment and cape clearance; active combat tracks and weapon retained; bounded dodge cape correction',license:'Sovereign anatomical foundation: Dan Ulrich, Blender Human Base Meshes 1.4.1, CC0. Original fitted armor and cloth. Other character and weapon provenance retained from visual-v9.',characters:{...old.characters,'ember-sovereign':metadata}},null,2)+'\n');
