// Floor-only irradiance derivation. Reads Site assets; writes only FLOOR_BAKE_OUT.
// Does not unwrap, edit, re-encode, or copy room GLBs. No network/cloud calls.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';
const game=process.env.ASHEN_GAME_ROOT||process.cwd(),out=process.env.FLOOR_BAKE_OUT||path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(game+'/package.json'),{build}=require('esbuild'),{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer'),sharp=require('sharp');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(out+'/lightmaps',{recursive:true});fs.mkdirSync(out+'/masks',{recursive:true});
if(path.resolve(out).startsWith(path.resolve(game)+path.sep))throw Error('Output must stay outside the game checkout');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),manifestPath=game+'/public/assets/dungeon/v10/manifest.json',manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
// Read-only compilation snapshots current authoring geometry and fixed fire positions.
await build({stdin:{contents:'export {createWorld} from "./app/game/world";export {newProgress} from "./app/game/model";export {ROOMS} from "./app/game/dungeon";export * as T from "three";export {MeshBVH} from "three-mesh-bvh";',resolveDir:game},outfile:out+'/authoring-snapshot.mjs',bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {createWorld,newProgress,ROOMS,T,MeshBVH}=await import(pathToFileURL(out+'/authoring-snapshot.mjs'));T.TextureLoader.prototype.load=()=>new T.Texture();
const world=createWorld(newProgress(),'low');world.scene.updateMatrixWorld(true);
const lights=world.fires.filter(f=>!world.shrines.some(s=>s.light===f.light)).map(f=>({position:f.light.getWorldPosition(new T.Vector3()),color:f.light.color.clone(),intensity:f.light.userData.baseIntensity}));
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),rooms=[],occluders=[];
const arrayHash=a=>sha(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
for(const entry of manifest.rooms){
 const bytes=fs.readFileSync(game+'/public'+entry.url);if(sha(bytes)!==entry.sha256)throw Error('Source GLB checksum mismatch: '+entry.id);
 const png=fs.readFileSync(game+'/public'+entry.lightmap);if(sha(png)!==entry.lightmapSha256)throw Error('Source lightmap checksum mismatch: '+entry.id);
 const doc=await io.readBinary(bytes),decoded=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true}),primitives=[],floor=[];
 const active=new Set();const visit=n=>{active.add(n);n.listChildren().forEach(visit);};doc.getRoot().listScenes().forEach(s=>s.listChildren().forEach(visit));
 // Include inactive legacy UV charts for exact original padding ownership only.
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())primitives.push(p);
 for(const node of active)if(node.getMesh())for(const p of node.getMesh().listPrimitives()){
  const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),matrix=new T.Matrix4().fromArray(node.getWorldMatrix()),nm=new T.Matrix3().getNormalMatrix(matrix),index=p.getIndices().getArray();
  const positions=new Float32Array(pos.getCount()*3),normals=new Float32Array(normal.getCount()*3);const v=new T.Vector3();
  for(let i=0;i<pos.getCount();i++){v.fromArray(pos.getElement(i,[])).applyMatrix4(matrix).toArray(positions,i*3);v.fromArray(normal.getElement(i,[])).applyMatrix3(nm).normalize().toArray(normals,i*3);}
  for(const i of index)occluders.push(positions[i*3],positions[i*3+1],positions[i*3+2]);
  if(p.getMaterial().getExtras().surfaceFamily==='floor')floor.push({p,positions,normals});
 }
 rooms.push({entry,bytes,png,decoded,primitives,floor,uv1Hashes:primitives.map(p=>arrayHash(p.getAttribute('TEXCOORD_1').getArray()))});
}
const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(occluders),3)),bvh=new MeshBVH(geometry),contactRay=new T.Ray(),axis=new T.Vector3(1,0,0),tangent=new T.Vector3(),bitangent=new T.Vector3(),direction=new T.Vector3();
const architectureRay=new T.Raycaster();architectureRay.firstHitOnly=true;
// One global field; region membership no longer changes the irradiance function.
const panels=[];
for(const chunk of world.chunks){
 const room=ROOMS.reduce((a,b)=>Math.abs(a.z-chunk.z)<Math.abs(b.z-chunk.z)?a:b),width=chunk.id.startsWith('passage')?6:room.width;
 for(const side of [-1,1])for(const offset of [-.3,0,.3]){
  const position=new T.Vector3(side*(width/2-.04),4.8,chunk.z+offset*chunk.depth),normal=new T.Vector3(-side,0,0),radiance=new T.Color(0,0,0);
  for(const light of lights){const delta=light.position.clone().sub(position),d2=Math.max(.3,delta.lengthSq()),distance=Math.sqrt(d2),cos=Math.max(0,delta.normalize().dot(normal));if(cos<.001)continue;architectureRay.set(position.clone().addScaledVector(normal,.04),delta);architectureRay.far=Math.max(0,distance-.1);if(architectureRay.intersectObject(world.architecture,false)[0])continue;radiance.add(light.color.clone().multiplyScalar(light.intensity*cos*.22/(4*Math.PI*d2*Math.PI)));}
  panels.push({position,normal,radiance,area:Math.min(18,chunk.depth*1.1)});
 }
}
const sampleDirections=Array.from({length:24},(_,i)=>{const r=Math.sqrt((i+.5)/24),a=i*2.399963229728653;return [Math.cos(a)*r,Math.sin(a)*r,Math.sqrt(1-r*r)];});
const lightDirection=new T.Vector3(),origin=new T.Vector3();
function irradiance(p,n){
 const c=new T.Color(.042,.047,.055).multiplyScalar(.6+.4*Math.max(0,n.y));
 for(const panel of panels){lightDirection.copy(panel.position).sub(p);const d2=lightDirection.lengthSq();if(d2<.04)continue;const distance=Math.sqrt(d2);lightDirection.divideScalar(distance);const cos=Math.max(0,n.dot(lightDirection))*Math.max(0,-panel.normal.dot(lightDirection));if(cos<.001)continue;architectureRay.set(origin.copy(p).addScaledVector(n,.025),lightDirection);architectureRay.far=Math.max(0,distance-.1);if(architectureRay.intersectObject(world.architecture,false)[0])continue;const weight=cos*panel.area/Math.max(.5,d2);c.r+=panel.radiance.r*weight;c.g+=panel.radiance.g*weight;c.b+=panel.radiance.b*weight;}
 axis.set(Math.abs(n.y)<.95?0:1,Math.abs(n.y)<.95?1:0,0);tangent.crossVectors(axis,n).normalize();bitangent.crossVectors(n,tangent);contactRay.origin.copy(p).addScaledVector(n,.006);let occlusion=0;
 for(const d of sampleDirections){direction.copy(tangent).multiplyScalar(d[0]).addScaledVector(bitangent,d[1]).addScaledVector(n,d[2]);contactRay.direction.copy(direction);const hit=bvh.raycastFirst(contactRay,T.DoubleSide,.004,.85);if(hit)occlusion+=1-hit.distance/.85;}
 const visibility=Math.max(.2,1-occlusion/24*.88);return [Math.min(.85,c.r)*visibility,Math.min(.85,c.g)*visibility,Math.min(.85,c.b)*visibility];
}
function raster(p,size,visit){
 const uv=p.getAttribute('TEXCOORD_1'),indices=p.getIndices().getArray(),a=[],b=[],c=[];
 for(let i=0;i<indices.length;i+=3){const ids=Array.from(indices.slice(i,i+3));uv.getElement(ids[0],a);uv.getElement(ids[1],b);uv.getElement(ids[2],c);const x0=a[0]*size,y0=a[1]*size,x1=b[0]*size,y1=b[1]*size,x2=c[0]*size,y2=c[1]*size,den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);if(Math.abs(den)<1e-8)continue;
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1,y2)));y<=Math.min(size-1,Math.ceil(Math.max(y0,y1,y2)));y++)for(let x=Math.max(0,Math.floor(Math.min(x0,x1,x2)));x<=Math.min(size-1,Math.ceil(Math.max(x0,x1,x2)));x++){const u=((y1-y2)*(x+.5-x2)+(x2-x1)*(y+.5-y2))/den,v=((y2-y0)*(x+.5-x2)+(x0-x2)*(y+.5-y2))/den,w=1-u-v;if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)visit(y*size+x,ids,u,v,w);}
 }
}
function propagateFloorPadding(pixels,owner,size){
 let edge=[];for(let p=0;p<owner.length;p++)if(owner[p]&&((p%size>0&&!owner[p-1])||(p%size<size-1&&!owner[p+1])||(p>=size&&!owner[p-size])||(p<owner.length-size&&!owner[p+size])))edge.push(p);
 for(let step=0;step<6&&edge.length;step++){const next=[];for(const p of edge){const neighbors=[];if(p%size>0)neighbors.push(p-1);if(p%size<size-1)neighbors.push(p+1);if(p>=size)neighbors.push(p-size);if(p<owner.length-size)neighbors.push(p+size);for(const q of neighbors)if(!owner[q]){owner[q]=owner[p];if(owner[p]===1)pixels.copy(pixels,q*4,p*4,p*4+4);next.push(q);}}edge=next;}
}
const report={sourceManifest:manifestPath,sourceManifestSha256:sha(manifestBytes),method:'Floor texel world-position irradiance, one shared 54-panel fixed-torch field and 24-ray geometric visibility. Existing UV1 and room GLBs unchanged. Only floor-chart interiors and their original six-step owned padding updated. Non-floor interiors, non-floor padding and background remain exact.',units:'linear RGB8 irradiance',notPathTraced:true,panels:panels.length,fixedLights:lights.length,rooms:[]};
const point=new T.Vector3(),normal=new T.Vector3();
for(const room of rooms){
 const {entry,decoded,primitives,floor}=room,size=entry.lightmapSize,original=decoded.data,pixels=Buffer.from(original),owner=new Uint8Array(size*size);const started=Date.now();
 for(const p of primitives){const label=p.getMaterial().getExtras().surfaceFamily==='floor'?1:2;raster(p,size,i=>{if(owner[i]&&owner[i]!==label)throw Error('Cross-family UV1 overlap');owner[i]=label;});}
 const floorInterior=owner.reduce((n,v)=>n+(v===1),0);let samples=0;
 for(const {p,positions,normals} of floor)raster(p,size,(pixel,ids,a,b,c)=>{point.set(0,0,0);normal.set(0,0,0);for(let k=0;k<3;k++){point.setComponent(k,positions[ids[0]*3+k]*a+positions[ids[1]*3+k]*b+positions[ids[2]*3+k]*c);normal.setComponent(k,normals[ids[0]*3+k]*a+normals[ids[1]*3+k]*b+normals[ids[2]*3+k]*c);}normal.normalize();const rgb=irradiance(point,normal);for(let k=0;k<3;k++)pixels[pixel*4+k]=Math.round(rgb[k]*255);pixels[pixel*4+3]=original[pixel*4+3];samples++;});
 propagateFloorPadding(pixels,owner,size);let changed=0,protectedChanges=0,floorOwned=0,alphaChanges=0;const mask=Buffer.alloc(size*size);
 for(let p=0;p<owner.length;p++){if(owner[p]===1){floorOwned++;mask[p]=255;}let diff=false;for(let k=0;k<4;k++)diff||=pixels[p*4+k]!==original[p*4+k];if(diff){changed++;if(owner[p]!==1)protectedChanges++;}if(pixels[p*4+3]!==original[p*4+3])alphaChanges++;}
 if(protectedChanges||alphaChanges)throw Error('Protected non-floor/alpha pixels changed');
 const png=await sharp(pixels,{raw:{width:size,height:size,channels:4}}).png().toBuffer(),file=out+'/lightmaps/'+entry.id+'-indirect.png';fs.writeFileSync(file,png);await sharp(mask,{raw:{width:size,height:size,channels:1}}).png().toFile(out+'/masks/'+entry.id+'-floor-owned.png');
 room.newPixels=pixels;room.owner=owner;
 const row={id:entry.id,output:file,oldLightmap:entry.lightmap,oldLightmapSha256:entry.lightmapSha256,newLightmapSha256:sha(png),newLightmapBytes:png.length,roomGlbSha256:sha(room.bytes),uv1Hashes:room.uv1Hashes,floorInteriorPixels:floorInterior,floorOwnedPaddingPixels:floorOwned-floorInterior,changedPixels:changed,protectedPixelsChanged:protectedChanges,alphaPixelsChanged:alphaChanges,texelSamples:samples,seconds:(Date.now()-started)/1000};report.rooms.push(row);console.log(entry.id,JSON.stringify(row));
}
function mapSample(room,pixels,x,z){for(const f of room.floor){const uv=f.p.getAttribute('TEXCOORD_1'),idx=f.p.getIndices().getArray(),pos=f.positions;for(let i=0;i<idx.length;i+=3){const ids=Array.from(idx.slice(i,i+3)),xx=ids.map(j=>pos[j*3]),zz=ids.map(j=>pos[j*3+2]),den=(zz[1]-zz[2])*(xx[0]-xx[2])+(xx[2]-xx[1])*(zz[0]-zz[2]);if(Math.abs(den)<1e-8)continue;const a=((zz[1]-zz[2])*(x-xx[2])+(xx[2]-xx[1])*(z-zz[2]))/den,b=((zz[2]-zz[0])*(x-xx[2])+(xx[0]-xx[2])*(z-zz[2]))/den,c=1-a-b;if(Math.min(a,b,c)<-.001)continue;const t=ids.map(j=>uv.getElement(j,[])),u=t[0][0]*a+t[1][0]*b+t[2][0]*c,v=t[0][1]*a+t[1][1]*b+t[2][1]*c,size=room.entry.lightmapSize,px=Math.max(0,Math.min(size-1,Math.floor(u*size))),py=Math.max(0,Math.min(size-1,Math.floor(v*size)));return Array.from(pixels.slice((py*size+px)*4,(py*size+px)*4+3));}}return null;}
report.joins=[];const sorted=[...rooms].sort((a,b)=>b.entry.z-a.entry.z);
for(let i=0;i<sorted.length-1;i++){const a=sorted[i],b=sorted[i+1],z=(a.entry.z-a.entry.depth/2+b.entry.z+b.entry.depth/2)/2;for(const x of [-2,0,2]){const oldA=mapSample(a,a.decoded.data,x,z+.035),oldB=mapSample(b,b.decoded.data,x,z-.035),newA=mapSample(a,a.newPixels,x,z+.035),newB=mapSample(b,b.newPixels,x,z-.035);report.joins.push({a:a.entry.id,b:b.entry.id,x,z,oldA,oldB,newA,newB,oldDelta:Math.max(...oldA.map((v,j)=>Math.abs(v-oldB[j]))),newDelta:Math.max(...newA.map((v,j)=>Math.abs(v-newB[j])))});}}
report.maxJoinDeltaBefore=Math.max(...report.joins.map(j=>j.oldDelta));report.maxJoinDeltaAfter=Math.max(...report.joins.map(j=>j.newDelta));
const proposed=structuredClone(manifest);proposed.version='visual-v11-floor-irradiance';proposed.derivation=(manifest.derivation||'')+' Floor-only shared-field irradiance resampling on preserved UV1; non-floor pixels unchanged.';proposed.floorBake=report.method;
for(const r of proposed.rooms){const row=report.rooms.find(x=>x.id===r.id);r.lightmap='/assets/dungeon/v11/'+r.id+'-indirect.png';r.lightmapBytes=row.newLightmapBytes;r.lightmapSha256=row.newLightmapSha256;}
// A manifest proposal only: root chooses the integration version and publishes it.
fs.writeFileSync(out+'/manifest-proposal.json',JSON.stringify(proposed,null,2));
for(const room of rooms){if(sha(fs.readFileSync(game+'/public'+room.entry.url))!==room.entry.sha256||sha(fs.readFileSync(game+'/public'+room.entry.lightmap))!==room.entry.lightmapSha256)throw Error('Source changed during derivation');}
report.outputManifestSha256=sha(fs.readFileSync(out+'/manifest-proposal.json'));report.rebuildScriptSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
// World-space strip: raw linear RGB8 values are multiplied by eight for visibility.
const width=240,height=720,strip=Buffer.alloc(width*2*height*4,255),top=59.9,bottom=-81.9;
for(let y=0;y<height;y++){const z=top+(bottom-top)*y/(height-1),room=rooms.find(r=>Math.abs(r.entry.z-z)<=r.entry.depth/2+.001);for(let x=0;x<width;x++){const px=-2.8+5.6*x/(width-1);for(let col=0;col<2;col++){const rgb=room?mapSample(room,col?room.newPixels:room.decoded.data,px,z):null,at=(y*width*2+col*width+x)*4;for(let k=0;k<3;k++)strip[at+k]=rgb?Math.min(255,rgb[k]*8):25;}}}
await sharp(strip,{raw:{width:width*2,height,channels:4}}).png().toFile(out+'/floor-strip-before-after.png');geometry.dispose();console.log('COMPLETE',JSON.stringify({maxJoinDeltaBefore:report.maxJoinDeltaBefore,maxJoinDeltaAfter:report.maxJoinDeltaAfter,rooms:report.rooms.length}));
