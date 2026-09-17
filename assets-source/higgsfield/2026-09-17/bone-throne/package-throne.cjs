#!/usr/bin/env node
// Asset-only, deterministic conversion. No geometry remesh or simplification.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const requireDeps=require('module').createRequire(process.env.ASHEN_PACKAGE_JSON||path.resolve(__dirname,'../../../..','package.json'));
const {NodeIO,getBounds}=requireDeps('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTMeshoptCompression}=requireDeps('@gltf-transform/extensions');
const {cloneDocument}=requireDeps('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=requireDeps('meshoptimizer');
const validator=requireDeps('gltf-validator');
const dir=__dirname,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const writeJSON=(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n');
const expected='5055af6df7d4dbcb64ae4a631d311da019a7f94cc8991c064a6cda73f2793857';
const projectId='02765069-6a15-4d44-852b-025f53032fdf',catalogId='65b31468-5c24-440c-9a95-99db1b195b67';
(async()=>{
 await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
 fs.mkdirSync(path.join(dir,'qa'),{recursive:true});
 const input=fs.readFileSync(path.join(dir,'source/bone-throne-r1.glb'));
 if(hash(input)!==expected)throw Error('Unexpected source hash');
 const source=await io.readBinary(input),base=cloneDocument(source),scene=base.getRoot().getDefaultScene();
 const originalBounds=getBounds(scene),centerX=(originalBounds.min[0]+originalBounds.max[0])/2,centerZ=(originalBounds.min[2]+originalBounds.max[2])/2;
 const translation=[-centerX,-originalBounds.min[1],-centerZ];
 const holder=base.createNode('BoneThroneRoot').setTranslation(translation).setExtras({asset_id:'BoneThrone',source_project_id:projectId,source_revision:1,source_hash:expected,source_catalog_asset_id:catalogId,normalization:'translation only; geometry, normals, vertex colors and source node metadata unchanged',front_axis:'+Z',up_axis:'+Y'});
 for(const n of [...scene.listChildren()]){scene.removeChild(n);holder.addChild(n);}scene.addChild(holder);
 // Ground is a separate identity root: world-space anchor stays exactly at the normalized pivot.
 const ground=base.createNode('Ground').setExtras({anchor:'Ground'});scene.addChild(ground);
 const bounds=getBounds(scene),dimensions=bounds.max.map((v,i)=>v-bounds.min[i]);
 const front=base.createNode('Front').setTranslation([0,0,bounds.max[2]]).setExtras({anchor:'Front',axis:'+Z'});scene.addChild(front);
 for(const n of base.getRoot().listNodes())if(n.getMesh())n.setExtras({...n.getExtras(),lod:0,lod_index:0,asset_id:'BoneThrone',surface_role:'vertex-colored bone, cushion and stone'});
 const fallbackBytes=await io.writeBinary(base);fs.writeFileSync(path.join(dir,'bone-throne-fallback.glb'),fallbackBytes);
 const compressed=cloneDocument(base);
 // Direct Meshopt byte coding avoids quantization and preserves every float exactly.
 compressed.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 const compressedBytes=await io.writeBinary(compressed);fs.writeFileSync(path.join(dir,'bone-throne.glb'),compressedBytes);
 const validations={},decodedDocs={};
 for(const [kind,bytes] of Object.entries({source:input,compressed:compressedBytes,fallback:fallbackBytes})){
  const result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});
  if(result.issues.numErrors)throw Error(JSON.stringify(result.issues));validations[kind]=result.issues;
  decodedDocs[kind]=await io.readBinary(bytes);
 }
 function snapshot(d){return d.getRoot().listMeshes().flatMap(m=>m.listPrimitives().map(p=>({mode:p.getMode(),attributes:Object.fromEntries(p.listSemantics().map(s=>{const a=p.getAttribute(s),v=a.getArray();return[s,{type:a.getType(),normalized:a.getNormalized(),componentType:a.getComponentType(),count:a.getCount(),sha256:hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))}]})),indices:(()=>{const a=p.getIndices(),v=a.getArray(),canonical=[];for(let i=0;i<v.length;i+=3){const tri=Array.from(v.slice(i,i+3));const start=tri.indexOf(Math.min(...tri));canonical.push(...[0,1,2].map(j=>tri[(start+j)%3]));}const c=new Uint32Array(canonical);return {count:a.getCount(),sha256:hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength)),orientedTrianglesSha256:hash(Buffer.from(c.buffer))};})()})));}
 const sourceSnap=snapshot(source),preservation={source:sourceSnap};
 for(const [kind,d]of Object.entries(decodedDocs)){
  preservation[kind]=snapshot(d);
  if(!preservation[kind].every((p,i)=>JSON.stringify(p.attributes)===JSON.stringify(sourceSnap[i].attributes)&&p.mode===sourceSnap[i].mode&&p.indices.count===sourceSnap[i].indices.count&&p.indices.orientedTrianglesSha256===sourceSnap[i].indices.orientedTrianglesSha256))throw Error(kind+' mesh geometry changed');
 }
 // Decoder round trip for Blender QA, which does not read Meshopt directly.
 decodedDocs.compressed.disposeExtension('EXT_meshopt_compression');
 fs.writeFileSync(path.join(dir,'qa/bone-throne-compressed-decoded.glb'),await io.writeBinary(decodedDocs.compressed));
 const primitives=base.getRoot().listMeshes().flatMap(m=>m.listPrimitives()),triangles=primitives.reduce((a,p)=>a+p.getIndices().getCount()/3,0),vertices=primitives.reduce((a,p)=>a+p.getAttribute('POSITION').getCount(),0);
 const placement={roomId:'throne',position:[-11,0,-77],yaw:0,scale:1.45,front:'+Z toward the chamber entrance',role:'side crypt relic',replaces:[],retains:['existing central throne baked into throne v12','hanging red standards','architecture rear wall pillars and crown trim'],reason:'Side placement clears the boss at [0,-69] and main route; do not overlap the baked central throne.'};
 const worldBounds={min:bounds.min.map((v,i)=>v*placement.scale+placement.position[i]),max:bounds.max.map((v,i)=>v*placement.scale+placement.position[i])};
 const collision={localAabb:bounds,worldAabb:worldBounds,conservativeCircle:{x:placement.position[0],z:placement.position[2],r:Math.hypot(dimensions[0]/2,dimensions[2]/2)*placement.scale},preferred:'Use the XZ AABB for body movement with actor radius expansion. The conservative circle fits the existing collider data type, but is more restrictive.',implementationCaveat:'Current world.colliders is declared and returned but is not consumed by engine/dungeon movement. Adding entries alone does not create collision; wire resolution and test hero/enemy movement. Do not assume render mesh creates collision.'};
 const sourceBlend=fs.readFileSync(path.join(dir,'source/bone-throne-r1.blend'));
 const provenance={projectId,revision:1,sceneSequence:1,catalogAssetId:catalogId,entityId:'a6a3a32a-21c6-49e9-b96f-fd088d9e71de',projectUrl:'https://higgsfield.ai/3d-jutsu/'+projectId,sourceGLB:{file:'source/bone-throne-r1.glb',bytes:input.length,sha256:hash(input)},sourceBlend:{file:'source/bone-throne-r1.blend',bytes:sourceBlend.length,sha256:hash(sourceBlend)},license:{status:'not provided in available project/export receipts',statement:'Imported catalog asset; do not label as original-authored, public domain, CC0, or any other license without an actual source record.'},catalogIdentityEvidence:'Catalog ID and entity ID are embedded in the revision-1 GLB node extras. A different current search-result ID is not evidence that this committed source is a different mesh.',normalization:{translation,rotation:[0,0,0,1],scale:1,sourceBounds:originalBounds,bounds,geometryPreserved:true,materialPreserved:true,vertexColorsPreserved:true},visualAssessment:'Low-poly bone throne with skulls, ribs, vertebrae, red-brown seat cushion and gray stepped plinth. No claim of photorealism or equivalence to a source illustration.'};
 const asset={asset_id:'BoneThrone',content_version:1,source_project_id:projectId,source_revision:1,source_hash:expected,source_catalog_asset_id:catalogId,license_record:'See provenance.json: catalog source, license terms absent from available receipts.',units:'metres (glTF units; original scale preserved)',bounds:[dimensions],aabb:bounds,pivot:'Ground',front_axis:'+Z',anchors:{Ground:[0,0,0],Front:[0,0,bounds.max[2]]},lods:[0],triangles:[triangles],vertices:[vertices],draw_primitives:[1],materials:1,texture_dimensions:{},estimated_texture_mib:0,compressed_url:'/assets/props/v3/bone-throne.glb',fallback_url:'/assets/props/v3/bone-throne-fallback.glb',sha256:hash(compressedBytes),fallback_sha256:hash(fallbackBytes),download_bytes:compressedBytes.length,fallback_bytes:fallbackBytes.length,validation_report:'final-export-audit.json',compression:'Lossless EXT_meshopt_compression byte coding; no quantization, decimation, remeshing or texture conversion. Fallback uses glTF core only.'};
 writeJSON('provenance.json',provenance);writeJSON('runtime-manifest.json',{version:'bone-throne-v1',assets:{boneThrone:asset},placement,collision});
 writeJSON('final-export-audit.json',{validations,accessorPreservation:preservation,allVertexAttributeBytesIdentical:true,allOrientedTrianglesIdentical:true,triangleIndexNote:'Meshopt may cyclically rotate each triangle; oriented geometry and winding remain identical.',compressedRoundTripBounds:getBounds(decodedDocs.compressed.getRoot().getDefaultScene()),triangles,vertices,materials:base.getRoot().listMaterials().length,textures:0,skins:0,animations:0,sourceUnchanged:hash(fs.readFileSync(path.join(dir,'source/bone-throne-r1.glb')))===expected});
 fs.writeFileSync(path.join(dir,'SHA256SUMS'),[['bone-throne.glb',compressedBytes],['bone-throne-fallback.glb',fallbackBytes],['source/bone-throne-r1.glb',input],['source/bone-throne-r1.blend',sourceBlend]].map(([n,b])=>hash(b)+'  '+n).join('\n')+'\n');
 console.log(JSON.stringify({asset,placement,collision},null,2));
})();
