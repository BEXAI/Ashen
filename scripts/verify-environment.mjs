import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const MiB=1024*1024;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyBoundBytes(bytes,expectedHash,expectedSize,label='asset'){assert.equal(sha256(bytes),expectedHash,`${label}: file hash`);assert.equal(bytes.length,expectedSize,`${label}: file bytes`);}
export function verifyRuntimePropBudget(diagnostics){
  const snapshot=diagnostics.environmentProps;assert.ok(snapshot,'Missing captured environmentProps diagnostics');let draws=0,triangles=0;
  for(const name of ['props','shrine','architecture',...(diagnostics.throne?['throne']:[])]){const family=diagnostics[name];assert.ok(family&&Number.isFinite(family.draws)&&Number.isFinite(family.triangles),`Missing captured ${name} counts`);assert.ok(family.draws>=0&&family.triangles>=0,'Negative captured counts');draws+=family.draws;triangles+=family.triangles;}
  assert.equal(snapshot.drawsUpperBound,draws,'Captured family draw sum');assert.equal(snapshot.trianglesUpperBound,triangles,'Captured family triangle sum');assert.ok(draws<=10&&triangles<=25000,'Captured combined prop budget exceeded');return {source:'user-supplied browser diagnostics snapshot',drawsUpperBound:draws,trianglesUpperBound:triangles,drawLimit:10,triangleLimit:25000};
}
export function parseGlb(bytes){
  assert.ok(bytes.length>=28,'GLB too short');assert.equal(bytes.readUInt32LE(0),0x46546c67,'GLB magic');assert.equal(bytes.readUInt32LE(4),2,'GLB version');assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB declared size');
  let json,bin=Buffer.alloc(0);for(let p=12;p<bytes.length;){const n=bytes.readUInt32LE(p),type=bytes.readUInt32LE(p+4);assert.equal(n%4,0,'GLB chunk alignment');assert.ok(p+8+n<=bytes.length,'GLB truncated chunk');if(type===0x4e4f534a){assert.equal(json,undefined,'Duplicate JSON chunk');json=JSON.parse(bytes.subarray(p+8,p+8+n));}else if(type===0x004e4942){assert.equal(bin.length,0,'Duplicate binary chunk');bin=bytes.subarray(p+8,p+8+n);}p+=8+n;}
  assert.ok(json?.asset?.version==='2.0','glTF version');return {json,bin};
}
export function packGlb(json,bin){const source=Buffer.from(JSON.stringify(json)),j=Buffer.alloc(Math.ceil(source.length/4)*4,32);source.copy(j);const b=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(b);const out=Buffer.alloc(28+j.length+b.length);out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.writeUInt32LE(b.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);b.copy(out,28+j.length);return out;}
export function rgbaMipBytes(width,height){assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0,'Image dimensions');let bytes=0;for(;;){bytes+=width*height*4;if(width===1&&height===1)break;width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));}return bytes;}
export function containedFile(game,url){assert.ok(typeof url==='string'&&url.startsWith('/assets/')&&!url.includes('?')&&!url.includes('#'),'Expected local /assets URL');const base=path.resolve(game,'public'),file=path.resolve(base,'.'+url);assert.ok(file.startsWith(base+path.sep),'Asset path escapes public');return file;}
const activeNodes=scene=>{const result=[];function visit(n){assert.ok(!result.includes(n),'Repeated/cyclic scene node');result.push(n);n.listChildren().forEach(visit);}scene.listChildren().forEach(visit);return result;};
const descendants=node=>{const all=[];function visit(n){all.push(n);n.listChildren().forEach(visit);}visit(node);return all;};
const imageRole=name=>name.toLowerCase().includes('base')?'basecolor':name.toLowerCase().includes('emiss')?'emissive':name.toLowerCase().includes('normal')?'normal':'orm';

export async function createEnvironmentVerifier(gameRoot){
  const game=path.resolve(gameRoot),require=createRequire(path.join(game,'package.json'));
  const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer'),validator=require('gltf-validator'),sharp=require('sharp');await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  async function inspectGlb(input,{label='asset',requireLightmapUV=false}={}){
    const bytes=Buffer.from(input),{json,bin}=parseGlb(bytes),warnings=[];
    for(const [i,b]of(json.buffers??[]).entries()){assert.equal(b.uri,undefined,`${label}: external/data buffer ${i}`);if(i!==0)assert.equal(b.extensions?.EXT_meshopt_compression?.fallback,true,`${label}: nonembedded buffer ${i}`);}
    assert.ok((json.buffers?.[0]?.byteLength??0)<=bin.length,`${label}: binary buffer length`);
    for(const[i,b]of(json.bufferViews??[]).entries()){
      const ext=b.extensions?.EXT_meshopt_compression;if(ext){assert.equal(ext.buffer,0,`${label}: compressed source is not embedded`);assert.ok((ext.byteOffset??0)+ext.byteLength<=bin.length,`${label}: compressed view ${i} range`);}
      else{assert.equal(b.buffer,0,`${label}: uncompressed view ${i} is not embedded`);assert.ok((b.byteOffset??0)+b.byteLength<=bin.length,`${label}: view ${i} range`);}
    }
    assert.equal(json.extensions?.KHR_lights_punctual?.lights?.length??0,0,`${label}: embedded lights`);
    for(const n of json.nodes??[])assert.equal(n.extensions?.KHR_lights_punctual,undefined,`${label}: light node`);
    for(const a of json.accessors??[])assert.ok(Number.isInteger(a.count)&&a.count>0,`${label}: zero/invalid accessor count`);
    const images=[];
    for(const[i,image]of(json.images??[]).entries()){
      assert.equal(image.uri,undefined,`${label}: external/data image ${i}`);assert.ok(Number.isInteger(image.bufferView),`${label}: image not embedded`);const view=json.bufferViews[image.bufferView];assert.ok(view&&!view.extensions?.EXT_meshopt_compression,`${label}: malformed image bufferView`);
      const data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);let width,height,levels=1,format=image.mimeType;
      if(format==='image/ktx2'){
        assert.ok(data.subarray(0,12).equals(Buffer.from([0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a])),`${label}: KTX2 signature`);width=data.readUInt32LE(20);height=data.readUInt32LE(24);levels=data.readUInt32LE(40);assert.equal(data.readUInt32LE(28),0,`${label}: expected 2D KTX2`);assert.equal(data.readUInt32LE(36),1,`${label}: expected one KTX2 face`);assert.equal(levels,Math.floor(Math.log2(Math.max(width,height)))+1,`${label}: incomplete KTX2 mip chain`);
        for(let l=0;l<levels;l++){const start=Number(data.readBigUInt64LE(80+l*24)),length=Number(data.readBigUInt64LE(88+l*24));assert.ok(start>=80+levels*24&&length>0&&start+length<=data.length,`${label}: KTX2 mip ${l} payload bounds`);}
      }else{assert.ok(format==='image/png'||format==='image/jpeg',`${label}: unsupported embedded image ${format}`);const decoded=await sharp(data).ensureAlpha().raw().toBuffer({resolveWithObject:true});width=decoded.info.width;height=decoded.info.height;assert.ok(decoded.data.length===width*height*4,`${label}: image pixel decode`);}
      images.push({index:i,name:image.name??`image-${i}`,role:imageRole(image.name??''),mime:format,width,height,storedMipLevels:levels,rgba8FullMipBytes:rgbaMipBytes(width,height),embeddedBytes:data.length,sha256:sha256(data)});
    }
    const doc=await io.readBinary(new Uint8Array(bytes)),root=doc.getRoot(),scene=root.getDefaultScene()??root.listScenes()[0];assert.ok(scene,`${label}: missing active scene`);const active=activeNodes(scene);
    let accessorScalars=0;for(const a of root.listAccessors()){assert.ok(a.getCount()>0,`${label}: zero accessor ${a.getName()}`);const values=a.getArray();assert.ok(values?.length>0,`${label}: empty accessor`);for(const v of values)assert.ok(Number.isFinite(v),`${label}: non-finite accessor`);accessorScalars+=values.length;}
    const hash=createHash('sha256'),geometry=[];
    for(const n of root.listNodes()){
      if(!n.getMesh())continue;const matrix=n.getWorldMatrix();assert.ok(matrix.every(Number.isFinite),`${label}: invalid node transform`);const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0,vertices=0,draws=0;
      hash.update(JSON.stringify({name:n.getName(),matrix}));
      for(const p of n.getMesh().listPrimitives()){
        assert.equal(p.getMode(),4,`${label}: non-triangle primitive`);const pos=p.getAttribute('POSITION');assert.ok(pos&&pos.getCount()>0,`${label}: empty primitive`);assert.ok(p.getMaterial(),`${label}: missing material`);if(requireLightmapUV){const uv=p.getAttribute('TEXCOORD_1');assert.ok(uv&&uv.getCount()===pos.getCount(),`${label}: missing lightmap UV1`);}
        const indices=p.getIndices(),count=indices?.getCount()??pos.getCount();assert.ok(count>0&&count%3===0,`${label}: malformed triangles`);if(indices)for(const i of indices.getArray())assert.ok(i>=0&&i<pos.getCount(),`${label}: index outside vertices`);
        for(const semantic of p.listSemantics().sort()){const a=p.getAttribute(semantic);assert.equal(a.getCount(),pos.getCount(),`${label}: attribute count mismatch`);const array=a.getArray();hash.update(semantic).update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));}
        if(indices){const a=indices.getArray();hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
        for(let i=0;i<pos.getCount();i++){const v=pos.getElement(i,[]);for(let axis=0;axis<3;axis++){const w=matrix[axis]*v[0]+matrix[axis+4]*v[1]+matrix[axis+8]*v[2]+matrix[axis+12];assert.ok(Number.isFinite(w),`${label}: non-finite dequantized position`);bounds.min[axis]=Math.min(bounds.min[axis],w);bounds.max[axis]=Math.max(bounds.max[axis],w);}}
        triangles+=count/3;vertices+=pos.getCount();draws++;
      }
      geometry.push({name:n.getName(),extras:n.getExtras(),triangles,vertices,draws,active:active.includes(n),bounds});
    }
    const totals=list=>list.reduce((a,n)=>({triangles:a.triangles+n.triangles,draws:a.draws+n.draws}),{triangles:0,draws:0});
    const raw=(await validator.validateBytes(new Uint8Array(bytes),{maxIssues:1000})).issues;
    assert.equal(raw.numErrors,0,`${label}: raw glTF validator errors: ${JSON.stringify(raw.messages.filter(m=>m.severity===0))}`);
    for(const m of raw.messages.filter(m=>m.severity<=1)){
      const recognizedKtx=images.some(i=>i.mime==='image/ktx2')&&['VALUE_NOT_IN_LIST','IMAGE_UNRECOGNIZED_FORMAT'].includes(m.code)&&/^\/images\//.test(m.pointer??'');
      warnings.push({kind:recognizedKtx?'validator-ktx2-support-limitation':'validator-warning',...m});
    }
    // Validate a second GLB assembled from exact decoded accessor arrays. Textures are removed
    // only in this validation copy, because this validator cannot inspect KTX2 payloads.
    for(const t of root.listTextures())t.dispose();for(const extension of root.listExtensionsUsed())if(['EXT_meshopt_compression','KHR_texture_basisu'].includes(extension.extensionName))extension.dispose();
    const decoded=(await validator.validateBytes(await io.writeBinary(doc),{maxIssues:1000})).issues;assert.equal(decoded.numErrors,0,`${label}: decoded geometry validator errors`);
    return {bytes:bytes.length,sha256:sha256(bytes),selfContained:true,lights:0,images,rgba8FullMipBytes:images.reduce((n,i)=>n+i.rgba8FullMipBytes,0),geometry,activeScene:totals(geometry.filter(n=>n.active)),allGeometry:totals(geometry),geometrySha256:hash.digest('hex'),materialCount:root.listMaterials().length,accessors:root.listAccessors().length,accessorScalars,rawValidation:raw,decodedGeometryValidation:decoded,warnings,_doc:doc,_json:json};
  }
  function propContract(report,entry,name){
    const root=report._doc.getRoot(),nodes=root.listNodes(),expectedMaterials=name==='shrine'?2:1;
    const materials=report._json.materials,body=materials.find(m=>name!=='shrine'||m.extras?.surface_role==='body');assert.ok(body?.pbrMetallicRoughness?.baseColorTexture&&body.normalTexture&&body.occlusionTexture&&body.pbrMetallicRoughness.metallicRoughnessTexture,`${name}: incomplete PBR atlas material`);assert.equal(body.occlusionTexture.index,body.pbrMetallicRoughness.metallicRoughnessTexture.index,`${name}: ORM must be shared`);
    if(name==='shrine'){const ember=materials.find(m=>m.extras?.surface_role==='ember');assert.equal(ember?.extras?.runtime_state_controlled,true,'Shrine state material');assert.ok(ember.emissiveTexture,'Shrine emissive atlas');}assert.equal(report.materialCount,expectedMaterials,`${name}: shared material count`);assert.equal(root.listAnimations().length,0,`${name}: animated prop`);
    const source=nodes.find(n=>n.getExtras().source_project_id);if(source){assert.equal(source.getExtras().source_project_id,entry.source_project_id,`${name}: embedded source project`);assert.equal(source.getExtras().source_revision,entry.source_revision,`${name}: embedded source revision`);}else report.warnings.push({kind:'provenance-location',message:'Source project/revision are manifest + hash-bound source runtime record only; not embedded in GLB root.'});
    const groups=name==='architecture'?Object.keys(entry.modules):['asset'],seen=new Set(),lods=[];
    for(const group of groups)for(let lod=0;lod<3;lod++){
      const matches=nodes.filter(n=>n.getExtras().lod===lod&&(name!=='architecture'||n.getExtras().module===group));assert.equal(matches.length,1,`${name}/${group}: unique LOD ${lod}`);const node=matches[0];seen.add(node);
      const meshNodes=descendants(node).filter(n=>n.getMesh()),primitives=meshNodes.flatMap(n=>n.getMesh().listPrimitives());const expected=name==='architecture'?entry.modules[group]:entry;
      const triangles=primitives.reduce((s,p)=>s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0);assert.equal(triangles,expected.triangles[lod],`${name}/${group}/LOD${lod}: triangle manifest`);assert.equal(primitives.length,expected.draw_primitives[lod],`${name}/${group}/LOD${lod}: draw manifest`);
      if(name==='shrine'){assert.deepEqual(meshNodes.map(n=>n.getExtras().surface_role).sort(),['body','ember']);for(const n of meshNodes){assert.equal(n.getExtras().lod_index,lod);assert.equal(n.getExtras().lod,undefined);assert.equal(n.getMesh().listPrimitives()[0].getMaterial().getExtras().surface_role,n.getExtras().surface_role);}}
      lods.push({module:group,lod,triangles,draws:primitives.length});
    }
    assert.equal(nodes.filter(n=>Number.isInteger(n.getExtras().lod)).length,seen.size,`${name}: extra LOD markers`);
    for(const [name,point]of Object.entries(entry.anchors??{})){const node=nodes.find(n=>n.getName()===name);assert.ok(node,`Anchor ${name}`);const m=node.getWorldMatrix();assert.ok(point.every((v,i)=>Math.abs(v-m[12+i])<1e-5),`Anchor position ${name}`);}
    report.lods=lods;
  }
  async function verify({diagnostics}={}){
    const propsUrl='/assets/props/v2/manifest.json',source=await fs.readFile(path.join(game,'app/game/dungeon-assets.ts'),'utf8'),match=source.match(/DUNGEON_MANIFEST_URL\s*=\s*['"]([^'"]+)['"]/);assert.ok(match,'Cannot discover active DungeonAssets manifest');const dungeonUrl=match[1];
    const propsBytes=await fs.readFile(containedFile(game,propsUrl)),dungeonBytes=await fs.readFile(containedFile(game,dungeonUrl)),props=JSON.parse(propsBytes),dungeon=JSON.parse(dungeonBytes),report={schemaVersion:1,generatedAt:new Date().toISOString(),gameRoot:game,pass:true,errors:[],props:{manifest:propsUrl,manifestSha256:sha256(propsBytes),version:props.version,assets:{},fallbackRgba8MipBytes:0},dungeon:{manifest:dungeonUrl,manifestSha256:sha256(dungeonBytes),version:dungeon.version,rooms:[]},caveats:['Offline active-scene primitive counts are not observed GPU submissions or frame rates. Dungeon streaming/frustum visibility and runtime prop instancing must be measured in browser.','RGBA8 mip residency is exact discrete full-mip pixel storage for one allocation per embedded image, a conservative fallback bound; excludes driver/CPU upload copies, render targets and concurrent variant overlap.','KTX2 headers, dimensions, level count and payload bounds are inspected; no GPU KTX2 transcoding is claimed. Exact Meshopt-decoded accessor arrays are independently validated after removing images from a validation-only copy.']};
    const check=async(label,fn)=>{try{return await fn();}catch(error){report.pass=false;report.errors.push({label,message:error.message});return null;}};
    for(const name of ['sconce','shrine','architecture']){
      const entry=props.assets[name];await check(name,async()=>{
        assert.ok(entry,`Missing active ${name}`);const sourcePath=path.join(game,path.dirname(entry.validation_report),'runtime-manifest.json'),runtimeBytes=await fs.readFile(sourcePath),runtime=JSON.parse(runtimeBytes),sourceMip=runtime.mobileEstimatedRgba8MipBytes;
        assert.ok(Number.isFinite(sourceMip),`${name}: missing source mip estimate`);assert.ok(Math.abs(sourceMip/MiB-entry.estimated_texture_mib)<1e-5,`${name}: source/public texture estimate mismatch`);
        const assetReport=report.props.assets[name]={sourceProject:entry.source_project_id,sourceRevision:entry.source_revision,sourceRuntimeManifest:path.relative(game,sourcePath),sourceRuntimeManifestSha256:sha256(runtimeBytes),sourceEstimatedMipBytes:sourceMip,variants:{}};
        const primary=runtime.primary??runtime.variants?.find(v=>v.lod==='combined');assert.ok(primary,`${name}: source primary`);
        for(const kind of ['compressed','fallback'])await check(`${name}/${kind}`,async()=>{
          const fallback=kind==='fallback',url=entry[fallback?'fallback_url':'compressed_url'],bytes=await fs.readFile(containedFile(game,url));verifyBoundBytes(bytes,entry[fallback?'fallback_sha256':'sha256'],entry[fallback?'fallback_bytes':'download_bytes'],`${name}: public`);assert.equal(sha256(bytes),primary[fallback?'fallbackSha256':'sha256'],`${name}: source file hash`);assert.equal(bytes.length,primary[fallback?'fallbackBytes':'bytes'],`${name}: source file bytes`);
          const actual=await inspectGlb(bytes,{label:`${name}/${kind}`});propContract(actual,entry,name);
          const expected=name==='sconce'?{basecolor:512,normal:256,orm:256}:name==='shrine'?{basecolor:1024,normal:512,orm:512,emissive:256}:{basecolor:512,normal:512,orm:512};assert.equal(actual.images.length,Object.keys(expected).length,`${name}: atlas count`);for(const image of actual.images)assert.ok(image.width===expected[image.role]&&image.height===expected[image.role],`${name}: actual atlas size ${image.name}`);
          for(const image of actual.images){for(const [where,contract]of [['public',entry.texture_dimensions],['source',runtime.texture_contract??runtime.texture_sizes]]){assert.ok(contract,`${name}: missing ${where} texture contract`);const value=image.role==='basecolor'?(contract.runtime_basecolor??contract.basecolor):image.role==='orm'?(contract.ORM??contract.orm):contract[image.role],size=Array.isArray(value)?value.slice(0,2):[value,value];assert.deepEqual([image.width,image.height],size,`${name}: ${where} actual texture dimensions`);}}
          assert.ok(actual.rgba8FullMipBytes<=sourceMip+1,`${name}: actual mip storage exceeds source estimate`);if(fallback){assert.ok(actual.images.every(i=>i.mime==='image/png'),`${name}: fallback images must be PNG`);report.props.fallbackRgba8MipBytes+=actual.rgba8FullMipBytes;}
          delete actual._doc;delete actual._json;assetReport.variants[kind]={url,...actual};
        });
        const a=assetReport.variants.compressed,b=assetReport.variants.fallback;if(a&&b)assert.equal(a.geometrySha256,b.geometrySha256,`${name}: geometry differs by texture variant`);
      });
    }
    await check('props/source-estimated-total',async()=>{const sourceTotal=Object.values(report.props.assets).reduce((n,a)=>n+a.sourceEstimatedMipBytes,0)/MiB;assert.ok(Math.abs(sourceTotal-props.shared_set_estimated_texture_mib)<1e-5,'Shared-set public estimate differs from source manifests');});
    report.props.fallbackRgba8MipMiB=report.props.fallbackRgba8MipBytes/MiB;report.props.limitMiB=16;await check('props/residency',async()=>{assert.equal(Object.values(report.props.assets).filter(a=>a.variants.fallback).length,3,'Missing fallback residency contributor');assert.ok(report.props.fallbackRgba8MipBytes<=16*MiB,'Combined fallback texture residency exceeds 16MiB');});
    for(const entry of dungeon.rooms)await check(`dungeon/${entry.id}`,async()=>{
      const bytes=await fs.readFile(containedFile(game,entry.url)),lightBytes=await fs.readFile(containedFile(game,entry.lightmap));verifyBoundBytes(bytes,entry.sha256,entry.bytes,`${entry.id}: GLB`);verifyBoundBytes(lightBytes,entry.lightmapSha256,entry.lightmapBytes,`${entry.id}: lightmap`);
      const light=await sharp(lightBytes).raw().toBuffer({resolveWithObject:true});assert.equal(light.info.width,entry.lightmapSize);assert.equal(light.info.height,entry.lightmapSize);const actual=await inspectGlb(bytes,{label:`dungeon/${entry.id}`,requireLightmapUV:true});
      const countMatches=actual.activeScene.triangles===entry.triangles&&actual.activeScene.draws===entry.materialDraws;if(!countMatches){report.pass=false;report.errors.push({label:`dungeon/${entry.id}/active-counts`,message:`Manifest ${entry.triangles} triangles/${entry.materialDraws} draws differs from active scene ${actual.activeScene.triangles}/${actual.activeScene.draws}`});}
      delete actual._doc;delete actual._json;report.dungeon.rooms.push({id:entry.id,url:entry.url,declaredTriangles:entry.triangles,declaredDraws:entry.materialDraws,...actual,lightmap:{url:entry.lightmap,bytes:lightBytes.length,sha256:sha256(lightBytes),width:light.info.width,height:light.info.height,rgba8BytesNoMips:light.info.width*light.info.height*4}});
    });
    if(diagnostics)report.runtimePropBudget=await check('runtime/prop-budget',async()=>verifyRuntimePropBudget(diagnostics));
    report.dungeon.allRoomsActiveScenes=report.dungeon.rooms.reduce((s,r)=>({triangles:s.triangles+r.activeScene.triangles,draws:s.draws+r.activeScene.draws}),{triangles:0,draws:0});return report;
  }
  return {verify,inspectGlb};
}

if(process.argv[1]&&await fs.realpath(fileURLToPath(import.meta.url))===await fs.realpath(process.argv[1])){
  let game=process.env.GAME_ROOT||process.cwd(),output,diagnosticsFile;for(let i=2;i<process.argv.length;i++){if(process.argv[i]==='--game-root')game=process.argv[++i];else if(process.argv[i]==='--out')output=process.argv[++i];else if(process.argv[i]==='--diagnostics')diagnosticsFile=process.argv[++i];else throw Error('Usage: node verify-environment.mjs [--game-root PATH] [--out PATH] [--diagnostics PATH]');}
  const verifier=await createEnvironmentVerifier(game),report=await verifier.verify({diagnostics:diagnosticsFile?JSON.parse(await fs.readFile(diagnosticsFile,'utf8')):undefined}),serialized=JSON.stringify(report,null,2)+'\n';if(output)await fs.writeFile(path.resolve(output),serialized);else process.stdout.write(serialized);if(output)console.log(JSON.stringify({pass:report.pass,report:path.resolve(output),fallbackMipMiB:report.props.fallbackRgba8MipMiB,dungeon:report.dungeon.version,errors:report.errors}));if(!report.pass)process.exitCode=1;
}
