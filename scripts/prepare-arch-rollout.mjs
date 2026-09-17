// Remove only the four generated doorway decorations replaced by the reviewed kit.
// The wall/camera BVH and six-metre navigation opening remain untouched.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';

const hash=b=>createHash('sha256').update(b).digest('hex');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const manifest=JSON.parse(await readFile('public/assets/dungeon/v12/manifest.json','utf8'));
const replacements={entry:38,cinder:8,dusk:-22,crown:-48},audit=[];
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],tolerance=.002;
const bucket=p=>p.map(x=>Math.floor(x/.01));
const centre=t=>[0,1,2].map(k=>t.reduce((s,v)=>s+v[k],0)/3);
const arrays=p=>p.listSemantics().map(s=>[s,hash(Buffer.from(p.getAttribute(s).getArray().buffer,p.getAttribute(s).getArray().byteOffset,p.getAttribute(s).getArray().byteLength))]);
function expectedTriangles(z,roomId){
 const torus=new T.TorusGeometry(3.2,.32,8,24,Math.PI);torus.scale(1,1,1.6);torus.translate(0,4,z);
 const geometries=[torus,...[-1,1].map(side=>new RoundedBoxGeometry(.7,4,1,2,.1).translate(side*3.25,2,z))],triangles=[];
 if(roomId==='crown')for(const depth of [-45,-33])for(const side of [-1,1])geometries.push(new RoundedBoxGeometry(.7,5.2,.9,2,.08).translate(side*15.65,2.6,depth),new RoundedBoxGeometry(1.1,.35,1.2,2,.06).translate(side*15.65,5.05,depth));
 for(const g of geometries){const p=g.attributes.position,count=g.index?.count??p.count;for(let i=0;i<count;i+=3)triangles.push([0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,g.index?.getX(i+j)??i+j).toArray()));g.dispose();}
 return triangles;
}
for(const entry of manifest.rooms){
 if(!(entry.id in replacements))continue;
 const z=replacements[entry.id],source=await readFile('public'+entry.url);assert.equal(hash(source),entry.sha256);
 const doc=await io.readBinary(source),expected=expectedTriangles(z,entry.id),grid=new Map(),matched=new Set();
 expected.forEach((t,i)=>{const key=bucket(centre(t)).join(',');grid.set(key,[...(grid.get(key)??[]),i]);});
 const active=new Set(),visit=n=>{active.add(n);n.listChildren().forEach(visit);};doc.getRoot().listScenes().forEach(s=>s.listChildren().forEach(visit));
 const original=doc.getRoot().listMeshes().map(m=>m.listPrimitives().map(arrays));let removed=0,removedDraws=0;
 for(const node of active)for(const p of node.getMesh()?.listPrimitives()??[]){
  const position=p.getAttribute('POSITION'),index=p.getIndices(),ids=index.getArray(),matrix=node.getWorldMatrix(),kept=[];
  const point=id=>{const v=position.getElement(id,[]);return [0,1,2].map(k=>matrix[k]*v[0]+matrix[k+4]*v[1]+matrix[k+8]*v[2]+matrix[k+12]);};
  for(let i=0;i<ids.length;i+=3){
   const triangle=[point(ids[i]),point(ids[i+1]),point(ids[i+2])],c=centre(triangle);let match=-1;
   if(c[1]<8){
    const b=bucket(c);
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let zz=-1;zz<=1;zz++)for(const j of grid.get([b[0]+x,b[1]+y,b[2]+zz].join(','))??[]){
     if(matched.has(j))continue;
     if(permutations.some(order=>triangle.every((v,k)=>v.every((value,axis)=>Math.abs(value-expected[j][order[k]][axis])<=tolerance)))){assert.equal(match,-1,'Ambiguous triangle match');match=j;}
    }
   }
   if(match>=0){matched.add(match);removed++;}else kept.push(ids[i],ids[i+1],ids[i+2]);
  }
  if(!kept.length){assert.equal(node.getMesh().listPrimitives().length,1);node.dispose();removedDraws++;}else if(kept.length!==ids.length)index.setArray(new ids.constructor(kept));
 }
 assert.equal(removed,expected.length,`${entry.id}: every original arch/post/pilaster triangle must match exactly once`);
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 const output=await io.writeBinary(doc),decoded=await io.readBinary(output);
 assert.deepEqual(decoded.getRoot().listMeshes().map(m=>m.listPrimitives().map(arrays)),original,'Decoded attribute arrays changed');
 await mkdir('public/assets/dungeon/v13',{recursive:true});await writeFile(`public/assets/dungeon/v13/${entry.id}.glb`,output);
 audit.push({id:entry.id,z,source:entry.url,sourceSha256:entry.sha256,removedTriangles:removed,matchToleranceMetres:tolerance,preserved:'All vertex attribute bytes and all nonmatched triangle indices; existing UV1 and v11 lightmaps'});
 Object.assign(entry,{url:`/assets/dungeon/v13/${entry.id}.glb`,bytes:output.length,sha256:hash(output),triangles:entry.triangles-removed,materialDraws:entry.materialDraws-removedDraws});
}
manifest.version='visual-v13-architecture';manifest.archDerivation='Four original torus/post decorations and four chapel pilasters matched by their generated triangle positions and removed. Wall/BVH geometry and all remaining vertex attribute arrays preserved.';
await writeFile('public/assets/dungeon/v13/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await mkdir('assets-source/dungeon-v13',{recursive:true});await writeFile('assets-source/dungeon-v13/arch-removal.json',JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
