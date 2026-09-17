import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';

const root=process.cwd(),source=root+'/assets-source/higgsfield/recovered-2026-09-17';
const inventory=JSON.parse(await fs.readFile(source+'/inventory.json','utf8'));
const manifest=JSON.parse(await fs.readFile(root+'/public/assets/roster/recovered-2026-09-17/manifest.json','utf8'));
const review=JSON.parse(await fs.readFile(source+'/review/animated/review-summary.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
test('All 14 recovered originals are bound to active mobile/HD derivatives, without duplicate built-in equipment',async()=>{
 assert.equal(inventory.assets.length,14);assert.equal(new Set(inventory.assets.map(a=>a.jobId)).size,14);
 assert.equal(review.acceptedCount,14);
 const authored=new Set(['lion-knight','silver-knight','dusk-rogue','knife-rogue']);
 for(const asset of inventory.assets){
  const original=await fs.readFile(source+'/models/'+asset.slug+'-original.glb'),entry=manifest.characters[asset.slug];
  assert.equal(entry.variants.mobile.sha256,review.acceptedMobileHashes[asset.slug],asset.slug+' differs from its reviewed delivery');
  assert.equal(hash(original),asset.sha256);assert.equal(original.length,asset.bytes);assert.equal(entry.sourceJobId,asset.jobId);assert.equal(entry.sourceMeshSha256,asset.sha256);assert.equal(entry.sourceAssetId,asset.sourceArtwork.assetId);
  assert.equal(entry.contentVersion,'recovered-september9-v1');assert.equal(entry.equipment,authored.has(asset.slug)?'authored':'embedded');
  for(const [tier,variant]of Object.entries(entry.variants)){
   assert.ok(variant.url.startsWith('/assets/roster/recovered-2026-09-17/'));const bytes=await fs.readFile(root+'/public'+variant.url);assert.equal(hash(bytes),variant.sha256);assert.equal(bytes.length,variant.bytes);
   const doc=await io.readBinary(bytes),r=doc.getRoot();assert.equal(r.listAnimations().length,12,asset.slug);assert.ok(r.listSkins().length>0,asset.slug);assert.ok(r.listNodes().some(n=>n.getName()==='ContactBase'));assert.ok(r.listNodes().some(n=>n.getName()==='ContactTip'));
   for(const clip of r.listAnimations()){let duration=0;for(const sampler of clip.listSamplers()){const input=sampler.getInput().getArray();for(const time of input){assert.ok(Number.isFinite(time));duration=Math.max(duration,time);}}assert.ok(duration>.1,`${asset.slug}/${clip.getName()} has no usable motion duration`);}
   for(const tex of r.listTextures()){const image=tex.getImage();assert.ok(image);const m=await sharp(image).metadata(),cap=tier==='mobile'?1024:2048;assert.ok(m.width<=cap&&m.height<=cap,`${asset.slug}/${tier} texture exceeds ${cap}`);}
   if(['sage','frost-mage','lich'].includes(asset.slug))assert.ok(r.listNodes().some(n=>n.getName()==='EquippedMuzzle'),asset.slug+' missing retained staff muzzle');
  }
 }
 for(const retained of ['golem','shrouded-skeleton'])assert.ok(!manifest.characters[retained].sourceJobId,'Unaffected character was replaced');
});
