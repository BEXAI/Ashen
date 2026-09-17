// Inspect actual encoded delivery, applying full node matrices to decoded vertices.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire('/Users/nathaniel/Documents/ChatGPT/Knight/game/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer');
const validator=require('gltf-validator'),sharp=require('sharp');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const out=process.env.KIT_OUT||path.dirname(fileURLToPath(import.meta.url)),audit={variants:{}};
const budgets={Arch:[6000,3000,1200],Pillar:[1200,600,240],Trim:[600,300,120]},limits={Arch:[7.8,8.9,1],Pillar:[.7,5.2,.9],Trim:[2,.35,.5]};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const snapshot=d=>{const r=d.getRoot();return {materials:r.listMaterials().length,textures:r.listTextures().map(t=>({name:t.getName(),size:t.getSize(),mime:t.getMimeType()})),nodes:r.listNodes().map(n=>({name:n.getName(),extras:n.getExtras(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale()}))};};
function clip(poly,axis,value,sign){const output=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-value)*sign,db=(b[axis]-value)*sign;if(da>=0)output.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);output.push(a.map((x,j)=>x+(b[j]-x)*t));}}return output;}
function entersKeepout(tri){let p=tri;for(const [a,v,s] of [[0,-2.9999,1],[0,2.9999,-1],[1,.0001,1],[1,6.7999,-1],[2,-.6,1],[2,.6,-1]]){p=clip(p,a,v,s);if(!p.length)return false;}return p.length>=3;}
for(const suffix of ['', '-fallback']){
 const file=out+'/architecture-kit'+suffix+'.glb',bytes=fs.readFileSync(file),doc=await io.read(file),root=doc.getRoot();const entry={file,bytes:bytes.length,sha256:sha(bytes),...snapshot(doc)};
 if(root.listMaterials().length!==1||root.listTextures().length!==3)throw Error('Shared atlas contract failed');
 if(root.listTextures().some(t=>JSON.stringify(t.getSize())!=='[512,512]'))throw Error('Actual embedded image size exceeds the 4 MiB runtime texture budget');
 if(root.listCameras().length||root.listAnimations().length||root.listSkins().length)throw Error('Static runtime contract failed');
 const asset=root.listNodes().find(n=>n.getName()==='AshenArchitectureKit');if(JSON.stringify(asset.getTranslation())!=='[0,0,0]'||JSON.stringify(asset.getScale())!=='[1,1,1]'||JSON.stringify(asset.getRotation())!=='[0,0,0,1]')throw Error('Identity root contract failed');
 entry.meshes=[];const geom=crypto.createHash('sha256');
 for(const n of root.listNodes().filter(n=>n.getMesh())){
  const m=n.getMesh(),ps=m.listPrimitives();if(ps.length!==1)throw Error('Draw budget failed');
  const p=ps[0],pos=p.getAttribute('POSITION'),matrix=n.getWorldMatrix();const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],world=[];
  for(let i=0;i<pos.getCount();i++){const v=pos.getElement(i,[]);const w=[matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13],matrix[2]*v[0]+matrix[6]*v[1]+matrix[10]*v[2]+matrix[14]];if(w.some(v=>!Number.isFinite(v)))throw Error('Nonfinite position');world.push(w);for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],w[j]);hi[j]=Math.max(hi[j],w[j]);}}
  const size=hi.map((x,i)=>x-lo[i]),triangles=p.getIndices().getCount()/3,{lod,module}=n.getExtras();
  if(triangles>budgets[module][lod]||size.some((v,i)=>v>limits[module][i]+.001))throw Error('Geometry budget or bounds failed '+n.getName());
  const sem=p.listSemantics();for(const s of ['POSITION','NORMAL','TANGENT','TEXCOORD_0'])if(!sem.includes(s))throw Error('Missing '+s);
  let keepoutIntersections=0,degenerateTriangles=0;const indices=p.getIndices().getArray();
  for(let i=0;i<indices.length;i+=3){const t=[world[indices[i]],world[indices[i+1]],world[indices[i+2]]];if(module==='Arch'&&entersKeepout(t))keepoutIntersections++;const u=t[1].map((x,j)=>x-t[0][j]),v=t[2].map((x,j)=>x-t[0][j]);const a=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(a.reduce((s,x)=>s+x*x,0)<1e-18)degenerateTriangles++;}
  if(keepoutIntersections)throw Error('Arch enters keepout '+n.getName());
  for(const semantic of sem.sort()){const a=p.getAttribute(semantic).getArray();geom.update(semantic).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}geom.update(Buffer.from(indices.buffer,indices.byteOffset,indices.byteLength));
  entry.meshes.push({name:n.getName(),module,lod,triangles,draws:ps.length,worldBounds:{min:lo,max:hi,size},attributes:sem,keepoutIntersections,degenerateTriangles});
 }
 if(entry.meshes.length!==9)throw Error('Expected three LOD meshes for each of three modules');
 entry.geometrySha256=geom.digest('hex');entry.anchors=entry.nodes.filter(n=>n.extras.semantic_anchor);
 const anchorExpected={Arch_Ground:[0,0,0],Pillar_Ground:[0,0,0],Trim_Ground:[0,0,0],OpeningLeft:[-3,0,0],OpeningRight:[3,0,0],OpeningTop:[0,6.8,0]};
 for(const [name,xyz] of Object.entries(anchorExpected)){const a=entry.anchors.find(a=>a.extras.semantic_name===name);if(!a||a.translation.some((v,i)=>Math.abs(v-xyz[i])>1e-5))throw Error('Missing or shifted anchor '+name);}
 entry.ktxMipLevels=root.listTextures().filter(t=>t.getMimeType()==='image/ktx2').map(t=>({name:t.getName(),levels:Buffer.from(t.getImage()).readUInt32LE(40)}));
 const decoded=fs.readFileSync(out+'/architecture-kit'+suffix+'-decoded-qa.glb');const validation=await validator.validateBytes(new Uint8Array(decoded),{maxIssues:100});entry.decodedValidation=validation.issues;if(validation.issues.numErrors||validation.issues.numWarnings)throw Error('Decoded validation not clean '+JSON.stringify(validation.issues));audit.variants[suffix||'compressed']=entry;
}
audit.geometryEqual=audit.variants.compressed.geometrySha256===audit.variants['-fallback'].geometrySha256;if(!audit.geometryEqual)throw Error('Variant geometry mismatch');audit.materialsAndAnchorsEqual=JSON.stringify(audit.variants.compressed.nodes)===JSON.stringify(audit.variants['-fallback'].nodes);
const docs=await Promise.all(['','-fallback'].map(s=>io.read(out+'/architecture-kit'+s+'-decoded-qa.glb')));audit.textureMeanAbsoluteError8Bit={};for(const t of docs[0].getRoot().listTextures()){const other=docs[1].getRoot().listTextures().find(o=>o.getName()===t.getName());const a=await sharp(t.getImage()).removeAlpha().raw().toBuffer(),b=await sharp(other.getImage()).removeAlpha().raw().toBuffer();let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);audit.textureMeanAbsoluteError8Bit[t.getName()]=sum/a.length;}
audit.mobileTextureRgbaMipBytes=(3*512*512)*4*4/3;audit.clearanceMethod='Sutherland-Hodgman clipping of every decoded Arch triangle after full world matrix against interior 6 × 6.8 m gate box through kit depth; 0.1 mm boundary tolerance.';
const raw=fs.readFileSync(out+'/cloud-source.glb'),rawDoc=await io.readBinary(raw);audit.cloudRaw={bytes:raw.length,sha256:sha(raw),meshCount:rawDoc.getRoot().listMeshes().length,primitiveCount:rawDoc.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().length,0),materials:rawDoc.getRoot().listMaterials().length,textures:rawDoc.getRoot().listTextures().length,triangles:rawDoc.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0),0)};
fs.writeFileSync(out+'/final-export-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify({geometryEqual:audit.geometryEqual,nodesEqual:audit.materialsAndAnchorsEqual,texturesMAE:audit.textureMeanAbsoluteError8Bit,raw:audit.cloudRaw,variants:Object.fromEntries(Object.entries(audit.variants).map(([k,v])=>[k,{bytes:v.bytes,sha256:v.sha256,meshes:v.meshes.map(m=>({name:m.name,triangles:m.triangles,clearanceIntersections:m.keepoutIntersections,degenerate:m.degenerateTriangles})),validation:v.decodedValidation}]))},null,2));
