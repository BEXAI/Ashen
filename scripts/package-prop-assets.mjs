// Package reviewed, locally baked Higgsfield exports. This never submits a cloud job.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import validator from 'gltf-validator';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const source='assets-source/props/v1/sconce',ledger=JSON.parse(await readFile(`${source}/production-ledger.json`)),shape=JSON.parse(await readFile(`${source}/runtime-manifest.json`));
const hash=b=>createHash('sha256').update(b).digest('hex');
const variants={};
for(const [kind,file] of [['compressed','sconce-pilot.glb'],['fallback','sconce-pilot-fallback.glb']]){
 const bytes=await readFile(`public/assets/props/v1/${file}`),expected=ledger.runtime_files[file];
 if(hash(bytes)!==expected.sha256)throw Error(`Reviewed source mismatch: ${file}`);
 const doc=await io.readBinary(bytes),root=doc.getRoot();
 if(root.listMaterials().length!==1||root.listTextures().length!==3)throw Error('Shared sconce atlas contract');
 const lods=root.listNodes().filter(n=>Number.isInteger(n.getExtras().lod)).sort((a,b)=>a.getExtras().lod-b.getExtras().lod);
 if(lods.length!==3)throw Error('Missing prop LOD');
 for(const [i,n] of lods.entries()){const triangles=n.getMesh().listPrimitives().reduce((sum,p)=>sum+p.getIndices().getCount()/3,0);if(triangles>[1500,600,200][i])throw Error('Prop triangle ceiling');}
 for(const name of ['Mount','FlameOrigin','LightOrigin'])if(!root.listNodes().some(n=>n.getName()===name))throw Error(`Missing ${name}`);
 const validation=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});if(validation.issues.numErrors)throw Error(JSON.stringify(validation.issues));
 variants[kind]={url:`/assets/props/v1/${file}`,sha256:hash(bytes),bytes:bytes.length,validation:validation.issues};
}
const manifest={version:'props-v1',assets:{sconce:{asset_id:'A01',content_version:1,source_project_id:ledger.project_id,source_revision:ledger.committed_revision,source_hash:ledger.source_files['cloud-source.blend'].sha256,license_record:'Original authored output; no catalog inputs. See source production-ledger.json and THIRD_PARTY_NOTICES.txt.',units:'metres',bounds:shape.lods.map(l=>l.bounds_gltf_size),pivot:'Mount',anchors:shape.anchors_gltf,lods:[0,1,2],triangles:shape.lods.map(l=>l.triangles),draw_primitives:[1,1,1],texture_dimensions:shape.texture_contract,color_spaces:{basecolor:'sRGB',normal:'linear',orm:'linear'},compressed_url:variants.compressed.url,fallback_url:variants.fallback.url,sha256:variants.compressed.sha256,fallback_sha256:variants.fallback.sha256,download_bytes:variants.compressed.bytes,fallback_bytes:variants.fallback.bytes,estimated_texture_mib:2,validation_report:'assets-source/props/v1/sconce/final-export-audit.json',validation:{compressed:variants.compressed.validation,fallback:variants.fallback.validation}}}};
await writeFile('public/assets/props/v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Packaged reviewed sconce: shared atlas, three bounded LODs, exact source hashes.');
