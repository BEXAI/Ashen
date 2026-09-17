import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import sharp from 'sharp';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import validator from 'gltf-validator';

await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const previous=JSON.parse(await readFile('public/assets/characters/v9/manifest.json'));
const manifest=JSON.parse(await readFile('public/assets/characters/v11/manifest.json'));
const character=manifest.characters['ember-sovereign'];
const reference=await io.read('assets-source/characters/ember-sovereign.glb');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const typedHash=a=>hash(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
function rigSignature(doc){
  return {
    joints:doc.getRoot().listSkins()[0].listJoints().map(n=>({name:n.getName(),parent:n.getParentNode()?.getName(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),semantic:n.getExtras().semantic})),
    sockets:doc.getRoot().listNodes().filter(n=>['WeaponBase','WeaponTip'].includes(n.getName())).map(n=>({name:n.getName(),parent:n.getParentNode()?.getName(),translation:n.getTranslation(),rotation:n.getRotation()})),
    clips:doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().map(c=>({node:c.getTargetNode().getName(),path:c.getTargetPath(),interpolation:c.getSampler().getInterpolation(),times:typedHash(c.getSampler().getInput().getArray()),values:typedHash(c.getSampler().getOutput().getArray())})).sort((a,b)=>(a.node+a.path).localeCompare(b.node+b.path))})).sort((a,b)=>a.name.localeCompare(b.name)),
  };
}
const originalRig=rigSignature(reference);
const refinedMaster=await io.read('assets-source/sovereign-v11/ember-sovereign-rigged-master.glb'),refinedRig=rigSignature(refinedMaster);
test('Refinement changes only the documented dodge cape channel, preserving all contact tracks',()=>{
 assert.deepEqual(refinedRig.joints,originalRig.joints);assert.deepEqual(refinedRig.sockets,originalRig.sockets);
 const changes=[];for(const clip of refinedRig.clips){const old=originalRig.clips.find(c=>c.name===clip.name);assert.ok(old);assert.equal(clip.channels.length,old.channels.length);for(const channel of clip.channels){const before=old.channels.find(c=>c.node===channel.node&&c.path===channel.path);assert.ok(before);assert.equal(channel.times,before.times);assert.equal(channel.interpolation,before.interpolation);if(channel.values!==before.values)changes.push(`${clip.name}/${channel.node}/${channel.path}`);}}
 assert.deepEqual(changes,['dodge/cape_lower/rotation']);
 const a=refinedMaster.getRoot().listAnimations().find(a=>a.getName()==='dodge').listChannels().find(c=>c.getTargetNode().getName()==='cape_lower'&&c.getTargetPath()==='rotation').getSampler().getOutput().getArray();
 const b=reference.getRoot().listAnimations().find(a=>a.getName()==='dodge').listChannels().find(c=>c.getTargetNode().getName()==='cape_lower'&&c.getTargetPath()==='rotation').getSampler().getOutput().getArray();
 for(let i=0;i<a.length;i+=4){let dot=0;for(let j=0;j<4;j++)dot+=a[i+j]*b[i+j];assert.ok(2*Math.acos(Math.min(1,Math.abs(dot)))<=.181);}
});
await mkdir('.sites-runtime/tests',{recursive:true});
const output=process.cwd()+'/.sites-runtime/tests/sovereign-mobile.mjs';
await build({stdin:{contents:'export * from "./app/game/character-assets";export * from "./app/game/combat-animation";export * from "./app/game/combat";export {knight} from "./app/game/character-skins";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export * as T from "three";',resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {T,GLTFLoader,knight,installActorVisual,applyStrikePose,bladeSegment,STRIKES,strikeDuration,CHARACTER_MANIFEST_URL}=await import(pathToFileURL(output));
function geometryOnly(bytes){
  const size=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size);
  delete j.materials;delete j.textures;delete j.images;delete j.samplers;
  for(const mesh of j.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  for(const key of ['extensionsRequired','extensionsUsed'])j[key]=(j[key]??[]).filter(x=>x!=='KHR_texture_basisu');
  const json=Buffer.from(JSON.stringify(j)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const out=Buffer.alloc(28+padded.length+bin.length);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);out.writeUInt32LE(bin.length,20+padded.length);out.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(out,28+padded.length);
  return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
}
async function loadGeometry(bytes){return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(geometryOnly(bytes),'');}

test('The active release replaces Sovereign and retains the other two character variants',()=>{
  assert.equal(CHARACTER_MANIFEST_URL,'/assets/characters/v11/manifest.json');
  for(const id of ['ash-knight','crypt-warden'])assert.deepEqual(manifest.characters[id],previous.characters[id]);
  assert.equal(character.boneCount,15);assert.equal(character.clips.length,13);
  assert.ok(character.triangles[0]<=25000);assert.ok(character.triangles[0]>character.triangles[1]);assert.ok(character.triangles[1]>character.triangles[2]);
  assert.ok(character.materialDrawsPerLod<=2);
  assert.ok(character.variants.mobile.estimatedRgba8MipMiB<10);assert.ok(character.variants.low.estimatedRgba8MipMiB<3);
});

for(const [tier,variant] of Object.entries(character.variants))for(const fallback of [false,true]){
  const url=fallback?variant.fallback:variant.url;
  test(`Sovereign ${tier} ${fallback?'PNG fallback':'KTX2'} preserves rig and combat while bounding mobile costs`,async()=>{
    const bytes=await readFile('public'+url),doc=await io.readBinary(bytes);
    assert.equal(hash(bytes),fallback?variant.fallbackSha256:variant.sha256);
    assert.deepEqual(rigSignature(doc),refinedRig,'Encoding must preserve the reviewed refined master exactly');
    const result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues.messages));
    let allocation=0;
    for(const texture of doc.getRoot().listTextures()){
      const image=Buffer.from(texture.getImage());let width,height;
      if(fallback||texture.getName().endsWith('_emissive')){assert.equal(texture.getMimeType(),'image/png');({width,height}=await sharp(image).metadata());assert.ok(width<=1024&&height<=1024);}
      else {assert.equal(texture.getMimeType(),'image/ktx2');assert.equal(image.readUInt32LE(12),0);assert.ok([1,2].includes(image.readUInt32LE(44)));width=image.readUInt32LE(20);height=image.readUInt32LE(24);assert.ok(image.readUInt32LE(40)>1);}
      allocation+=width*height*4*4/3/1048576;
    }
    assert.ok(Math.abs(allocation-(fallback?variant.fallbackRgba8MipMiB:variant.estimatedRgba8MipMiB))<.001);
    if(tier==='low')assert.ok(allocation<3);if(tier==='mobile'||fallback)assert.ok(allocation<10);
    const template=await loadGeometry(bytes),actor=knight(true,true),other=knight(true,true),baseline=knight(true,true);
    installActorVisual(actor,template);installActorVisual(other,template);
    const otherArm=other.arms[1].quaternion.clone();
    const lods=[];actor.group.traverse(o=>{if(Number.isInteger(o.userData.lod))lods.push(o);});assert.equal(lods.length,3);
    for(const [distance,pixels,expected]of [[0,300,0],[15,100,1],[40,20,2]]){
      actor.visual.lod(distance,pixels);assert.deepEqual(lods.filter(o=>o.visible).map(o=>o.userData.lod),[expected]);
    }
    actor.visual.lod(0,300);
    for(const strike of STRIKES)for(let step=0;step<=30;step++){
      const time=step/30*strikeDuration(strike);applyStrikePose(actor,strike,time);applyStrikePose(baseline,strike,time);
      const base=new T.Vector3(),tip=new T.Vector3(),originalBase=new T.Vector3(),originalTip=new T.Vector3();bladeSegment(actor,base,tip);bladeSegment(baseline,originalBase,originalTip);
      assert.ok(base.distanceTo(originalBase)<.04&&tip.distanceTo(originalTip)<.04,'Weapon reach changed');
      if(step%10===0){
        const box=new T.Box3().makeEmpty();actor.group.updateMatrixWorld(true);
        actor.group.traverse(o=>{if(!(o instanceof T.SkinnedMesh))return;for(let i=0;i<o.geometry.attributes.position.count;i+=3){const v=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));box.expandByPoint(v);}});
        assert.ok(box.min.y>-.7&&box.max.y<9&&box.getSize(new T.Vector3()).length()<15,'Invalid deformed bounds');
      }
    }
    assert.ok(other.arms[1].quaternion.equals(otherArm));actor.visual.dispose();other.visual.dispose();
  });
}

test('Missing locomotion clips reject a replacement before disposing the current actor',async()=>{
  const bytes=await readFile('public'+character.variants.mobile.fallback),template=await loadGeometry(bytes),actor=knight(true,true);
  const originalChildren=[...actor.group.children];template.animations=template.animations.filter(a=>a.name!=='forward');
  assert.throws(()=>installActorVisual(actor,template),/Missing character clip forward/);assert.deepEqual(actor.group.children,originalChildren);
});
