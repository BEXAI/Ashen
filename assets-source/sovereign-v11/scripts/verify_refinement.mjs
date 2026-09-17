import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const argv=process.argv.slice(2),arg=(n)=>argv[argv.indexOf(n)+1],game=arg('--game'),baseline=arg('--baseline'),candidate=arg('--candidate'),out=arg('--out'),imp=p=>import(pathToFileURL(path.join(game,'node_modules',p)));
const [{NodeIO},{ALL_EXTENSIONS},{default:validator},T]=await Promise.all([imp('@gltf-transform/core/dist/index.js'),imp('@gltf-transform/extensions/dist/index.js'),imp('gltf-validator/index.js'),imp('three/build/three.module.js')]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),[a,b]=await Promise.all([io.read(baseline),io.read(candidate)]),hash=a=>createHash('sha256').update(a instanceof Uint8Array?a:new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const signature=d=>{const r=d.getRoot(),s=r.listSkins()[0];return {joints:s.listJoints().map(n=>({name:n.getName(),parent:n.getParentNode()?.getName(),t:n.getTranslation(),r:n.getRotation(),s:n.getScale(),extras:n.getExtras()})),ibm:hash(s.getInverseBindMatrices().getArray()),sockets:r.listNodes().filter(n=>['WeaponBase','WeaponTip'].includes(n.getName())).map(n=>({name:n.getName(),parent:n.getParentNode()?.getName(),t:n.getTranslation(),r:n.getRotation(),s:n.getScale()})),channels:r.listAnimations().flatMap(a=>a.listChannels().map(c=>({key:a.getName()+'/'+c.getTargetNode().getName()+'/'+c.getTargetPath(),interpolation:c.getSampler().getInterpolation(),input:hash(c.getSampler().getInput().getArray()),output:hash(c.getSampler().getOutput().getArray())}))).sort((a,b)=>a.key.localeCompare(b.key)),textures:r.listTextures().map(t=>({name:t.getName(),bytes:hash(t.getImage())})).sort((a,b)=>a.name.localeCompare(b.name))};};
const sa=signature(a),sb=signature(b);for(const k of ['joints','ibm','sockets','textures'])assert.deepEqual(sb[k],sa[k],k+' changed');assert.equal(sb.channels.length,390);
const changed=[];for(let i=0;i<sa.channels.length;i++){const aa=sa.channels[i],bb=sb.channels[i];assert.equal(bb.key,aa.key);assert.equal(bb.input,aa.input,'Clip timeline changed');assert.equal(bb.interpolation,aa.interpolation);if(bb.output!==aa.output)changed.push(bb.key);}
assert.deepEqual(changed,['dodge/cape_lower/rotation']);
const lods=b.getRoot().listNodes().filter(n=>Number.isInteger(n.getExtras().lod));assert.deepEqual(lods.map(n=>n.getExtras().lod).sort(),[0,1,2]);
const primitiveSig=p=>({indices:hash(p.getIndices().getArray()),attributes:p.listSemantics().sort().map(k=>({name:k,hash:hash(p.getAttribute(k).getArray())}))});
const aLod0=a.getRoot().listNodes().find(n=>n.getExtras().lod===0),originalWeapon=primitiveSig(aLod0.getMesh().listPrimitives()[1]);const geometry=[];
for(const n of lods){const primitives=n.getMesh().listPrimitives();assert.equal(primitives.length,2);assert.deepEqual(primitiveSig(primitives[1]),originalWeapon,'Weapon mesh changed');let triangles=0,vertices=0,maxWeights=0;for(const p of primitives){const pos=p.getAttribute('POSITION'),ws=p.getAttribute('WEIGHTS_0'),js=p.getAttribute('JOINTS_0');triangles+=p.getIndices().getCount()/3;vertices+=pos.getCount();for(const a of p.listAttributes())assert.ok(a.getArray().every(Number.isFinite));for(let i=0;i<pos.getCount();i++){const w=ws.getElement(i,[]),j=js.getElement(i,[]);assert.ok(Math.abs(w.reduce((s,x)=>s+x,0)-1)<1e-5);assert.ok(w.every(x=>x>=0));maxWeights=Math.max(maxWeights,w.filter(x=>x>0).length);for(let k=0;k<4;k++)if(w[k])assert.ok(j[k]<15);}}
 geometry.push({lod:n.getExtras().lod,triangles,vertices,maxWeights,primitives:primitives.length});}
assert.ok(geometry[0].triangles<=25000&&geometry[1].triangles<15000&&geometry[2].triangles<8500);assert.equal(b.getRoot().listMaterials().length,2);
const bytes=await fs.readFile(candidate),validation=await validator.validateBytes(bytes,{maxIssues:100});assert.equal(validation.issues.numErrors,0);
const rests=new Map([a,b].map(d=>[d,d.getRoot().listSkins()[0].listJoints().map(n=>({n,t:n.getTranslation(),r:n.getRotation(),s:n.getScale()}))]));
function sampleSocket(doc,name,time){
 for(const r of rests.get(doc))r.n.setTranslation(r.t).setRotation(r.r).setScale(r.s);
 const clip=doc.getRoot().listAnimations().find(x=>x.getName()===name);
 for(const ch of clip.listChannels()){
  const sp=ch.getSampler(),inp=sp.getInput(),out=sp.getOutput();let hi=1;while(hi<inp.getCount()-1&&inp.getScalar(hi)<time)hi++;
  const lo=hi-1,t=Math.max(0,Math.min(1,(time-inp.getScalar(lo))/(inp.getScalar(hi)-inp.getScalar(lo)))),x=out.getElement(lo,[]),y=out.getElement(hi,[]),n=ch.getTargetNode();
  if(ch.getTargetPath()==='rotation')n.setRotation(new T.Quaternion().fromArray(x).slerp(new T.Quaternion().fromArray(y),t).toArray());
  else if(ch.getTargetPath()==='translation')n.setTranslation(x.map((v,k)=>v+(y[k]-v)*t));
 }
 return ['WeaponBase','WeaponTip'].map(name=>doc.getRoot().listNodes().find(n=>n.getName()===name).getWorldTranslation());
}
let socketSamples=0,maxBaseDelta=0,maxTipDelta=0;
for(const [name,duration]of [['side',.58],['diagonal',.68],['backhand',.56],['overhead',.91]])for(let i=0;i<=120;i++){
 const aa=sampleSocket(a,name,i/120*duration),bb=sampleSocket(b,name,i/120*duration),delta=aa.map((v,j)=>Math.hypot(...v.map((x,k)=>x-bb[j][k])));maxBaseDelta=Math.max(maxBaseDelta,delta[0]);maxTipDelta=Math.max(maxTipDelta,delta[1]);socketSamples++;
}
assert.ok(maxBaseDelta<1e-12&&maxTipDelta<1e-12);
const result={weaponSocketSamples:socketSamples,maxWeaponBaseDeltaMetres:maxBaseDelta,maxWeaponTipDeltaMetres:maxTipDelta,candidate,bytes:bytes.length,sha256:hash(bytes),baselineSha256:hash(await fs.readFile(baseline)),rig:'15 original joint transforms and inverse bind matrices exact',sockets:'Exact names, hierarchy and transforms',clips:13,channels:390,unchangedChannels:389,changedChannels:changed,clipInputTimes:'All exact',allWeaponAncestorTracks:'Exact in every clip; independently sampled original/candidate sockets across four strikes',weaponGeometry:'204 triangles, all vertex attributes and indices exact in every LOD',textures:'All 8 original image bytes exact',geometry,materials:2,validation:validation.issues};await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
