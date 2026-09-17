import {fileURLToPath} from 'node:url';
// Read-only validation of the actual encoded combined delivery.
import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer');
const validator=require('gltf-validator'),sharp=require('sharp');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const out=process.env.SCONCE_OUT||fileURLToPath(new URL('.',import.meta.url)).replace(/\/$/,''),audit={variants:{}};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const snapshot=(doc)=>{const r=doc.getRoot();return {materials:r.listMaterials().length,textures:r.listTextures().map(t=>({name:t.getName(),size:t.getSize(),mime:t.getMimeType()})),nodes:r.listNodes().map(n=>({name:n.getName(),extras:n.getExtras(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale()}))};};
for(const suffix of ['', '-fallback']){
 const file=out+'/sconce-pilot'+suffix+'.glb',bytes=fs.readFileSync(file),doc=await io.read(file),root=doc.getRoot();const entry={file,bytes:bytes.length,sha256:sha(bytes),...snapshot(doc)};
 if(root.listMaterials().length!==1||root.listTextures().length!==3)throw Error('Shared atlas contract failed');
 const asset=root.listNodes().find(n=>n.getName()==='AshenSconce_Runtime');if(JSON.stringify(asset.getTranslation())!=='[0,0,0]'||JSON.stringify(asset.getScale())!=='[1,1,1]')throw Error('Identity root contract failed');
 entry.meshes=[];const geom=crypto.createHash('sha256');
 for(const n of root.listNodes().filter(n=>n.getMesh())){
  const m=n.getMesh(),ps=m.listPrimitives();if(ps.length!==1)throw Error('Draw budget failed');
  const p=ps[0],pos=p.getAttribute('POSITION'),matrix=n.getWorldMatrix();const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.getCount();i++){
   const v=pos.getElement(i,[]);const w=[matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13],matrix[2]*v[0]+matrix[6]*v[1]+matrix[10]*v[2]+matrix[14]];
   for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],w[j]);hi[j]=Math.max(hi[j],w[j]);}
  }
  const size=hi.map((x,i)=>x-lo[i]),triangles=p.getIndices().getCount()/3,lod=n.getExtras().lod;
  if(triangles>[1500,600,200][lod]||size[0]>.65||size[1]>1.1||size[2]>.5)throw Error('Geometry budget or bounds failed');
  for(const semantic of p.listSemantics().sort()){const a=p.getAttribute(semantic).getArray();geom.update(semantic).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
  const a=p.getIndices().getArray();geom.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  entry.meshes.push({name:n.getName(),lod,triangles,draws:ps.length,worldBounds:{min:lo,max:hi,size},attributes:p.listSemantics()});
 }
 entry.geometrySha256=geom.digest('hex');
 entry.ktxMipLevels=root.listTextures().filter(t=>t.getMimeType()==='image/ktx2').map(t=>({name:t.getName(),levels:Buffer.from(t.getImage()).readUInt32LE(40)}));
 const decoded=fs.readFileSync(out+'/sconce-pilot'+suffix+'-decoded-qa.glb');const validation=await validator.validateBytes(new Uint8Array(decoded),{maxIssues:100});entry.decodedValidation=validation.issues;
 if(validation.issues.numErrors||validation.issues.numWarnings)throw Error('Decoded glTF validation not clean');audit.variants[suffix||'compressed']=entry;
}
audit.geometryEqual=audit.variants.compressed.geometrySha256===audit.variants['-fallback'].geometrySha256;if(!audit.geometryEqual)throw Error('Encoded geometry differs between texture variants');
audit.materialsAndAnchorsEqual=JSON.stringify(audit.variants.compressed.nodes)===JSON.stringify(audit.variants['-fallback'].nodes);
const docs=await Promise.all(['','-fallback'].map(s=>io.read(out+'/sconce-pilot'+s+'-decoded-qa.glb')));audit.textureMeanAbsoluteError8Bit={};
for(const t of docs[0].getRoot().listTextures()){
 const other=docs[1].getRoot().listTextures().find(o=>o.getName()===t.getName());const a=await sharp(t.getImage()).removeAlpha().raw().toBuffer(),b=await sharp(other.getImage()).removeAlpha().raw().toBuffer();let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);audit.textureMeanAbsoluteError8Bit[t.getName()]=sum/a.length;
}
audit.mobileTextureRgbaMipBytes=(512*512+2*256*256)*4*4/3;
fs.writeFileSync(out+'/final-export-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit,null,2));
