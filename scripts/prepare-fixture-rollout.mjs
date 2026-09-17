import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
const hash=b=>createHash('sha256').update(b).digest('hex');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const manifest=JSON.parse(await readFile('public/assets/dungeon/v11/manifest.json','utf8'));
const widths={entry:20,cinder:32,dusk:38,crown:32,throne:38};
const audit=[];
for(const entry of manifest.rooms){
 if(!(entry.id in widths)||entry.id==='entry')continue;
 const input=await readFile('public'+entry.url);assert.equal(hash(input),entry.sha256);
 const doc=await io.readBinary(input),attributes=[];let removed=0,removedDraws=0;const sides=[0,0];
 const active=new Set();const visit=n=>{active.add(n);n.listChildren().forEach(visit);};doc.getRoot().listScenes().forEach(s=>s.listChildren().forEach(visit));
 for(const node of active)for(const primitive of node.getMesh()?.listPrimitives()??[]){
  for(const semantic of primitive.listSemantics())attributes.push({primitive,semantic,hash:hash(Buffer.from(primitive.getAttribute(semantic).getArray().buffer,primitive.getAttribute(semantic).getArray().byteOffset,primitive.getAttribute(semantic).getArray().byteLength))});
  const p=primitive.getAttribute('POSITION'),a=primitive.getIndices(),ids=a.getArray(),matrix=node.getWorldMatrix(),kept=[];
  const inside=(id,side)=>{const v=p.getElement(id,[]),x=matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],y=matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13],z=matrix[2]*v[0]+matrix[6]*v[1]+matrix[10]*v[2]+matrix[14];return Math.abs(x-side*(widths[entry.id]/2-1))<.315&&Math.abs(z-entry.z)<.315&&y>1.93&&y<3.04;};
  for(let i=0;i<ids.length;i+=3){const side=[-1,1].findIndex(s=>inside(ids[i],s)&&inside(ids[i+1],s)&&inside(ids[i+2],s));if(side>=0){removed++;sides[side]++;}else kept.push(ids[i],ids[i+1],ids[i+2]);}
  if(kept.length===0){assert.equal(node.getMesh().listPrimitives().length,1);node.dispose();removedDraws++;}else if(kept.length!==ids.length)a.setArray(new ids.constructor(kept));
 }
 assert.equal(removed,144,`${entry.id}: removal must match exactly two legacy fixtures`);assert.deepEqual(sides,[72,72]);
 // QUANTIZE here selects the lossless encoder path; no quantize() transform runs.
 // Lossless buffer compression only. No simplification, re-quantization or UV edits.
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 const output=await io.writeBinary(doc),decoded=await io.readBinary(output);
 for(const {primitive,semantic,hash:expected}of attributes){const meshIndex=doc.getRoot().listMeshes().findIndex(m=>m.listPrimitives().includes(primitive)),primitiveIndex=doc.getRoot().listMeshes()[meshIndex].listPrimitives().indexOf(primitive);const actual=decoded.getRoot().listMeshes()[meshIndex].listPrimitives()[primitiveIndex].getAttribute(semantic).getArray();assert.equal(hash(Buffer.from(actual.buffer,actual.byteOffset,actual.byteLength)),expected,`${entry.id} ${semantic} changed`);}
 await mkdir('public/assets/dungeon/v12',{recursive:true});await writeFile(`public/assets/dungeon/v12/${entry.id}.glb`,output);
 audit.push({id:entry.id,source:entry.url,sourceSha256:entry.sha256,removedTriangles:removed,removedPerSide:sides,preserved:'Every position, normal, UV0, UV1 and vertex-color array byte-identical after decoding'});
 Object.assign(entry,{url:`/assets/dungeon/v12/${entry.id}.glb`,bytes:output.length,sha256:hash(output),triangles:entry.triangles-removed,materialDraws:entry.materialDraws-removedDraws});
}
manifest.version='visual-v12-fixtures';manifest.fixtureDerivation='Legacy wall torch triangles removed for shared Higgsfield sconces; unchanged decoded attributes and v11 floor lightmaps.';
await writeFile('public/assets/dungeon/v12/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await mkdir('assets-source/dungeon-v12',{recursive:true});await writeFile('assets-source/dungeon-v12/fixture-removal.json',JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
