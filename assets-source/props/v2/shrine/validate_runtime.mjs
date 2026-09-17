// Validate the decoded buffers and hierarchy of the exact delivered GLBs.
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.ASHEN_PACKAGE_JSON||'/Users/nathaniel/Documents/ChatGPT/Knight/game/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer');
const validator=require('gltf-validator'),sharp=require('sharp');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const out=process.env.SHRINE_OUT||fileURLToPath(new URL('.',import.meta.url)).replace(/\/$/,''),audit={variants:{}};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const eq=(a,b,e=1e-5)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<e);
const expectedAnchors={Ground:[0,0,0],FlameOrigin:[0,1.9,0],LightOrigin:[0,2.2,0],EmberCore:[0,1.54,0]};
for(const kind of ['compressed','fallback']){
 const file=out+'/ember-shrine'+(kind==='fallback'?'-fallback':'')+'.glb',bytes=fs.readFileSync(file),doc=await io.read(file),root=doc.getRoot();
 const entry={file,bytes:bytes.length,sha256:sha(bytes),materials:root.listMaterials().length,textures:root.listTextures().map(t=>({name:t.getName(),size:t.getSize(),mime:t.getMimeType()})),lods:[],anchors:{}};
 assert.equal(root.listMaterials().length,2);assert.equal(root.listTextures().length,4);assert.equal(root.listAnimations().length,0);
 const asset=root.listNodes().find(n=>n.getName()==='EmberShrine_Runtime');assert.ok(asset);assert.ok(eq(asset.getTranslation(),[0,0,0]));assert.ok(eq(asset.getScale(),[1,1,1]));assert.ok(eq(asset.getRotation(),[0,0,0,1]));
 for(const [name,expected] of Object.entries(expectedAnchors)){
  const node=root.listNodes().find(n=>n.getName()===name);assert.ok(node);const w=node.getWorldMatrix();entry.anchors[name]=[w[12],w[13],w[14]];assert.ok(eq(entry.anchors[name],expected));
 }
 for(const n of root.listNodes())assert.equal(n.getExtension('KHR_lights_punctual'),null);
 const geom=crypto.createHash('sha256');
 for(const lod of [0,1,2]){
  const group=root.listNodes().find(n=>n.getName()===`EmberShrine_LOD${lod}`);assert.ok(group);assert.equal(group.getExtras().lod,lod);
  const meshNodes=group.listChildren().filter(n=>n.getMesh());assert.equal(meshNodes.length,2);
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0;const roles=[];let vertices=0;
  for(const n of meshNodes){
   const ps=n.getMesh().listPrimitives();assert.equal(ps.length,1);const p=ps[0],role=n.getExtras().surface_role;roles.push(role);
   assert.equal(n.getExtras().lod_index,lod);assert.equal(p.getMaterial().getExtras().surface_role,role);assert.ok(!('lod' in n.getExtras()));
   for(const attr of ['POSITION','NORMAL','TEXCOORD_0'])assert.ok(p.getAttribute(attr),`${n.getName()} missing ${attr}`);
   if(role==='body')assert.ok(p.getAttribute('TANGENT'));
   const pos=p.getAttribute('POSITION'),matrix=n.getWorldMatrix();vertices+=pos.getCount();
   for(let i=0;i<pos.getCount();i++){
    const v=pos.getElement(i,[]),w=[matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13],matrix[2]*v[0]+matrix[6]*v[1]+matrix[10]*v[2]+matrix[14]];
    for(let j=0;j<3;j++){assert.ok(Number.isFinite(w[j]));lo[j]=Math.min(lo[j],w[j]);hi[j]=Math.max(hi[j],w[j]);}
   }
   triangles+=p.getIndices().getCount()/3;
   geom.update(JSON.stringify({name:n.getName(),matrix}));
   for(const semantic of p.listSemantics().sort()){const a=p.getAttribute(semantic).getArray();geom.update(semantic).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
   const a=p.getIndices().getArray();geom.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  }
  assert.deepEqual(roles.sort(),['body','ember']);const size=hi.map((x,i)=>x-lo[i]);assert.ok(triangles<=[6000,3000,1200][lod]);assert.ok(size[0]<=3.6&&size[2]<=3.6&&size[1]<=1.8);assert.ok(lo[1]>=-.001&&lo[1]<=.003);
  entry.lods.push({lod,triangles,vertices,draws:2,worldBounds:{min:lo,max:hi,size}});
 }
 entry.geometrySha256=geom.digest('hex');
 for(const t of root.listTextures()){
  const size=t.getName().includes('basecolor')?1024:t.getName().includes('emissive')?256:512;assert.deepEqual(t.getSize(),[size,size]);
  if(t.getMimeType()==='image/ktx2')assert.equal(Buffer.from(t.getImage()).readUInt32LE(40),Math.log2(size)+1);
 }
 const body=root.listMaterials().find(m=>m.getExtras().surface_role==='body'),ember=root.listMaterials().find(m=>m.getExtras().surface_role==='ember');
 assert.ok(body.getNormalTexture()&&body.getOcclusionTexture()&&body.getBaseColorTexture()&&body.getMetallicRoughnessTexture());assert.equal(body.getOcclusionTexture(),body.getMetallicRoughnessTexture());assert.equal(body.getEmissiveTexture(),null);
 assert.ok(ember.getExtras().runtime_state_controlled);assert.equal(ember.getEmissiveTexture().getMimeType(),'image/png');assert.ok(eq(ember.getEmissiveFactor(),[.65,.22,.04]));
 const mask=await sharp(ember.getEmissiveTexture().getImage()).removeAlpha().raw().toBuffer();let min=255,max=0;
 for(let i=0;i<mask.length;i+=3){assert.equal(mask[i],mask[i+1]);assert.equal(mask[i],mask[i+2]);min=Math.min(min,mask[i]);max=Math.max(max,mask[i]);}assert.ok(max>100);entry.emissiveMaskRange=[min,max];
 const decoded=fs.readFileSync(`${out}/ember-shrine-${kind}-decoded-qa.glb`);const validation=await validator.validateBytes(new Uint8Array(decoded),{maxIssues:100});entry.decodedValidation=validation.issues;assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
 audit.variants[kind]=entry;
}
audit.geometryEqual=audit.variants.compressed.geometrySha256===audit.variants.fallback.geometrySha256;assert.ok(audit.geometryEqual);
assert.deepEqual(audit.variants.compressed.anchors,audit.variants.fallback.anchors);
const docs=await Promise.all(['compressed','fallback'].map(s=>io.read(`${out}/ember-shrine-${s}-decoded-qa.glb`)));audit.textureMeanAbsoluteError8Bit={};
for(const t of docs[0].getRoot().listTextures()){
 const other=docs[1].getRoot().listTextures().find(o=>o.getName()===t.getName()),a=await sharp(t.getImage()).removeAlpha().raw().toBuffer(),b=await sharp(other.getImage()).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);audit.textureMeanAbsoluteError8Bit[t.getName()]=sum/a.length;
}
audit.mobileTextureRgbaMipBytes=(1024*1024+2*512*512+256*256)*4*4/3;
fs.writeFileSync(out+'/final-export-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit,null,2));
