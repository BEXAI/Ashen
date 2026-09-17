import {fileURLToPath} from 'node:url';
// Encode only the locally baked derivative; does not call Higgsfield or edit Site.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire('/Users/nathaniel/Documents/ChatGPT/Knight/game/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,KHRTextureBasisu}=require('@gltf-transform/extensions');
const {cloneDocument,meshopt,prune,dequantize,dedup}=require('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=require('meshoptimizer');
const sharp=require('sharp'),validator=require('gltf-validator');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const out=process.env.KIT_OUT||path.dirname(fileURLToPath(import.meta.url)),toktx='/Users/nathaniel/Documents/ChatGPT/Knight/.tools/ktx/bin/toktx',ktx='/tmp/ashen-runtime-qa/bin/ktx';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'runtime-manifest.json')));manifest.variants=[];
const textureCache=new Map();
async function validate(bytes){const r=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});if(r.issues.numErrors)throw Error(JSON.stringify(r.issues));return r.issues;}
for(const lod of ['combined']){
 const prefix='architecture-kit';
 const rawPath=path.join(out,`${prefix}-fallback.glb`),raw=fs.readFileSync(path.join(out,'architecture-kit-baked.glb'));
 const base=await io.readBinary(raw);await base.transform(prune({keepLeaves:true}),dedup());
 for(const tex of base.getRoot().listTextures()){tex.setImage(await sharp(tex.getImage()).removeAlpha().png({compressionLevel:9}).toBuffer());}
 const fallback=cloneDocument(base);await fallback.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const fb=await io.writeBinary(fallback);fs.writeFileSync(rawPath,fb);const fallbackValidation=await validate(fb);
 if(lod==='combined'){const fdec=await io.readBinary(fb);await fdec.transform(dequantize());fdec.disposeExtension('EXT_meshopt_compression');await io.write(path.join(out,'architecture-kit-fallback-decoded-qa.glb'),fdec);}
 const doc=cloneDocument(base);doc.createExtension(KHRTextureBasisu).setRequired(true);
 for(const [i,tex] of doc.getRoot().listTextures().entries()){
  const data=!tex.getName().includes('basecolor'),key=hash(tex.getImage());
  if(!textureCache.has(key)){
   const source=path.join(out,`textures/runtime-${i}.png`),target=source+'.ktx2';fs.writeFileSync(source,tex.getImage());
   const args=['--t2','--encode',data?'uastc':'etc1s','--threads','2','--genmipmap','--assign_oetf',data?'linear':'srgb'];
   if(data)args.push('--uastc_quality','2','--zcmp','9');
   execFileSync(toktx,[...args,target,source],{stdio:'pipe'});textureCache.set(key,fs.readFileSync(target));
  }
  tex.setImage(textureCache.get(key)).setMimeType('image/ktx2');
 }
 await doc.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const bytes=await io.writeBinary(doc),dest=path.join(out,`${prefix}.glb`);fs.writeFileSync(dest,bytes);const validation=await validate(bytes);
 const entry={lod,file:path.basename(dest),fallback:path.basename(rawPath),bytes:bytes.length,fallbackBytes:fb.length,sha256:hash(bytes),fallbackSha256:hash(fb),validation,fallbackValidation};
 // Decode the actual shipped candidate for independent offline Blender review.
 const decoded=await io.read(dest);
 for(const [i,tex] of decoded.getRoot().listTextures().entries()){
  if(tex.getMimeType()!=='image/ktx2')continue;
  const src=path.join(out,`textures/qa-${i}.ktx2`),png=path.join(out,`textures/qa-${i}.png`);fs.writeFileSync(src,tex.getImage());execFileSync(ktx,['extract','--transcode','rgba8',src,png],{stdio:'pipe'});tex.setImage(fs.readFileSync(png)).setMimeType('image/png');
 }
 await decoded.transform(dequantize());decoded.disposeExtension('EXT_meshopt_compression');decoded.disposeExtension('KHR_texture_basisu');await io.write(path.join(out,`${prefix}-decoded-qa.glb`),decoded);
 manifest.variants.push(entry);console.log(lod,entry.bytes,entry.fallbackBytes);
}
manifest.mobileEstimatedRgba8MipBytes=(3*512*512)*4*4/3;
manifest.primary=manifest.variants.find(v=>v.lod==='combined');
manifest.compression='EXT_meshopt_compression; ETC1S base color, UASTC normal and ORM, complete mipmaps; PNG fallback with meshopt';
fs.writeFileSync(path.join(out,'runtime-manifest.json'),JSON.stringify(manifest,null,2));
