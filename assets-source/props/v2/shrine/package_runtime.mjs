// Reproducible local derivative: PNG PBR master -> bounded runtime variants.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(process.env.ASHEN_PACKAGE_JSON||'/Users/nathaniel/Documents/ChatGPT/Knight/game/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,KHRTextureBasisu}=require('@gltf-transform/extensions');
const {cloneDocument,meshopt,prune,dequantize,dedup}=require('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=require('meshoptimizer');
const sharp=require('sharp'),validator=require('gltf-validator');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const out=process.env.SHRINE_OUT||path.dirname(fileURLToPath(import.meta.url));
const toktx=process.env.ASHEN_TOKTX||'/Users/nathaniel/Documents/ChatGPT/Knight/.tools/ktx/bin/toktx';
const ktx=process.env.ASHEN_KTX||'/tmp/ashen-runtime-qa/bin/ktx';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'runtime-manifest.json')));
async function validate(bytes){const r=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:200});if(r.issues.numErrors)throw Error(JSON.stringify(r.issues));return r.issues;}
const base=await io.read(path.join(out,'shrine-combined-baked.glb'));
await base.transform(prune({keepLeaves:true}),dedup());
const ember=base.getRoot().listMaterials().find(m=>m.getExtras().surface_role==='ember');
if(!ember?.getEmissiveTexture())throw Error('Separate ember mask missing');
// Blender glTF exporter multiplies the material tint into the PNG. Restore the
// uncolored baked strength mask and put the tint in the runtime-editable factor.
ember.getEmissiveTexture().setImage(fs.readFileSync(path.join(out,'textures/shrine_emissive.png'))).setMimeType('image/png');
ember.setEmissiveFactor([.65,.22,.04]);
const textureStats=[];
for(const tex of base.getRoot().listTextures()){
 const name=tex.getName(),size=name.includes('basecolor')?1024:name.includes('emissive')?256:512;
 const png=await sharp(tex.getImage()).resize(size,size).removeAlpha().png({compressionLevel:9}).toBuffer();
 tex.setImage(png).setMimeType('image/png');
 fs.writeFileSync(path.join(out,`textures/runtime-${name}.png`),png);
 textureStats.push({name,width:size,height:size,sourceBytes:png.length,sha256:hash(png),encoding:name.includes('emissive')?'PNG':name.includes('basecolor')?'ETC1S':'UASTC',colorSpace:/basecolor|emissive/.test(name)?'sRGB':'linear'});
}
const fallback=cloneDocument(base);await fallback.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
const fb=await io.writeBinary(fallback);fs.writeFileSync(path.join(out,'ember-shrine-fallback.glb'),fb);
const compressed=cloneDocument(base);compressed.createExtension(KHRTextureBasisu).setRequired(true);
for(const tex of compressed.getRoot().listTextures()){
 const name=tex.getName();if(name.includes('emissive'))continue;
 const data=!name.includes('basecolor'),src=path.join(out,`textures/runtime-${name}.png`),dst=src+'.ktx2';
 const args=['--t2','--encode',data?'uastc':'etc1s','--threads','2','--genmipmap','--assign_oetf',data?'linear':'srgb'];
 if(data)args.push('--uastc_quality','2','--zcmp','9');
 execFileSync(toktx,[...args,dst,src],{stdio:'pipe'});
 const encoded=fs.readFileSync(dst);tex.setImage(encoded).setMimeType('image/ktx2');
 const stat=textureStats.find(x=>x.name===name);stat.compressedBytes=encoded.length;stat.compressedSha256=hash(encoded);stat.mipLevels=encoded.readUInt32LE(40);
}
await compressed.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
const cb=await io.writeBinary(compressed);fs.writeFileSync(path.join(out,'ember-shrine.glb'),cb);
const validations={};
for(const [kind,bytes] of [['compressed',cb],['fallback',fb]]){
 validations[kind]=await validate(bytes);
 const decoded=await io.readBinary(bytes);
 for(const tex of decoded.getRoot().listTextures()){
  if(tex.getMimeType()!=='image/ktx2')continue;
  const src=path.join(out,`textures/qa-${tex.getName()}.ktx2`),png=path.join(out,`textures/qa-${tex.getName()}.png`);
  fs.writeFileSync(src,tex.getImage());execFileSync(ktx,['extract','--transcode','rgba8',src,png],{stdio:'pipe'});
  tex.setImage(fs.readFileSync(png)).setMimeType('image/png');
 }
 await decoded.transform(dequantize());decoded.disposeExtension('EXT_meshopt_compression');decoded.disposeExtension('KHR_texture_basisu');
 const db=await io.writeBinary(decoded);validations[kind+'Decoded']=await validate(db);
 fs.writeFileSync(path.join(out,`ember-shrine-${kind}-decoded-qa.glb`),db);
}
manifest.primary={file:'ember-shrine.glb',fallback:'ember-shrine-fallback.glb',bytes:cb.length,fallbackBytes:fb.length,sha256:hash(cb),fallbackSha256:hash(fb)};
manifest.textures=textureStats;
manifest.validation=validations;
manifest.mobileEstimatedRgba8MipBytes=(1024*1024+2*512*512+256*256)*4*4/3;
manifest.compression='EXT_meshopt_compression; ETC1S basecolor, UASTC normal/ORM with complete mip chains; emissive retained as neutral lossless PNG. PNG fallback retains Meshopt.';
manifest.stateControl={material:'Shrine_StateEmber',surfaceRole:'ember',neutralEmissiveMask:true,defaultLinearEmissive:[.65,.22,.04],defaultEmissiveIntensity:1,activeState:'set emissive color/intensity on a clone for each independently stateful shrine; body unaffected',offState:'emissiveIntensity=0; base remains neutral dark gray'};
fs.writeFileSync(path.join(out,'runtime-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({primary:manifest.primary,textures:manifest.textures,mobileEstimatedRgba8MipBytes:manifest.mobileEstimatedRgba8MipBytes,validations},null,2));
