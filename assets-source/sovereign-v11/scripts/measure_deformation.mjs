import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const argv=process.argv.slice(2),arg=(n,d)=>argv.includes(n)?argv[argv.indexOf(n)+1]:d,game=arg('--game'),base=arg('--baseline'),candidate=arg('--candidate'),out=arg('--out'),partfile=arg('--parts');
const imp=p=>import(pathToFileURL(path.join(game,'node_modules',p)));
const [{NodeIO},{ALL_EXTENSIONS},T,{MeshBVH}]=await Promise.all([imp('@gltf-transform/core/dist/index.js'),imp('@gltf-transform/extensions/dist/index.js'),imp('three/build/three.module.js'),imp('three-mesh-bvh/build/index.module.js')]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),partData=JSON.parse(await fs.readFile(partfile,'utf8')),names=new Map(partData.parts),part=partData.indices;
const docs=await Promise.all([io.read(base),io.read(candidate)]);
const cases=[['neutral',null,0],['idle','idle',.17],['walk','forward',.175],['walk-late','forward',.52],['turn','turn',.175],['dodge','dodge',.25],['hit','hit',.15],['death','death',.8],...['side','diagonal','backhand','overhead'].flatMap((n,i)=>{const wind=[.17,.23,.15,.34][i],active=[.16,.18,.16,.2][i];return [[n+'-windup',n,wind],[n+'-contact',n,wind+active/2],[n+'-follow',n,wind+active]];})];
const lerp=(a,b,t)=>a+(b-a)*t;
function prep(doc){const skin=doc.getRoot().listSkins()[0],joints=skin.listJoints(),p=doc.getRoot().listNodes().find(n=>n.getExtras().lod===0).getMesh().listPrimitives()[0],pos=p.getAttribute('POSITION'),js=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0'),ix=p.getIndices().getArray();
 if(part.length!==pos.getCount())throw Error('Part correspondence mismatch '+part.length+' '+pos.getCount());
 const bind=joints.map((j,i)=>new T.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[]))),rest=joints.map(j=>({t:j.getTranslation(),r:j.getRotation(),s:j.getScale()}));
 const cape=[],body=[],shoulder=[];
 for(let i=0;i<ix.length;i+=3){const ids=[ix[i],ix[i+1],ix[i+2]],nm=names.get(part[ids[0]]);if(/cape/.test(nm))cape.push(...ids);else body.push(...ids);if(/anatomical padded body/.test(nm)&&ids.every(j=>{const v=pos.getElement(j,[]);return v[1]>1.62&&v[1]<2.16&&Math.abs(v[0])>.22;}))shoulder.push(ids);}
 return {doc,joints,p,pos,js,weights,ix,bind,rest,cape,body,shoulder};}
function sample(a,clip,time){a.joints.forEach((j,i)=>j.setTranslation(a.rest[i].t).setRotation(a.rest[i].r).setScale(a.rest[i].s));if(clip){const animation=a.doc.getRoot().listAnimations().find(x=>x.getName()===clip);for(const ch of animation.listChannels()){const s=ch.getSampler(),input=s.getInput(),output=s.getOutput();let hi=1;while(hi<input.getCount()-1&&input.getScalar(hi)<time)hi++;const lo=hi-1,t=Math.max(0,Math.min(1,(time-input.getScalar(lo))/(input.getScalar(hi)-input.getScalar(lo)))),v0=output.getElement(lo,[]),v1=output.getElement(hi,[]),node=ch.getTargetNode(),p=ch.getTargetPath();if(p==='rotation'){const q=new T.Quaternion().fromArray(v0).slerp(new T.Quaternion().fromArray(v1),t);node.setRotation(q.toArray());}else if(p==='translation')node.setTranslation(v0.map((v,k)=>lerp(v,v1[k],t)));}}
 const mats=a.joints.map((j,i)=>new T.Matrix4().fromArray(j.getWorldMatrix()).multiply(a.bind[i])),arr=new Float32Array(a.pos.getCount()*3),v=new T.Vector3(),vv=new T.Vector3(),sum=new T.Vector3();
 for(let i=0;i<a.pos.getCount();i++){v.fromArray(a.pos.getElement(i,[]));const js=a.js.getElement(i,[]),ws=a.weights.getElement(i,[]);sum.set(0,0,0);for(let k=0;k<4;k++)if(ws[k])sum.addScaledVector(vv.copy(v).applyMatrix4(mats[js[k]]),ws[k]);sum.toArray(arr,i*3);}return arr;}
const identity=new T.Matrix4();
function measure(a,arr){
 const geom=(ix)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(arr,3));g.setIndex(ix);return g;};
 const cg=geom(a.cape),bg=geom(a.body),cb=new MeshBVH(cg,{indirect:true}),bb=new MeshBVH(bg,{indirect:true});const touched=new Set();let pairs=0;
 cb.bvhcast(bb,identity,{intersectsTriangles:(c,b,ci,bi)=>{if(c.intersectsTriangle(b)){const center=new T.Vector3();c.getMidpoint(center);if([0,1,2].reduce((s,k)=>s+a.pos.getElement(a.cape[cb.resolveTriangleIndex(ci)*3+k],[])[1],0)/3<1.92){pairs++;touched.add(ci);}}return false;}});
 let maxStretch=1;const edge=(ia,ib,values)=>Math.hypot(values[ia*3]-values[ib*3],values[ia*3+1]-values[ib*3+1],values[ia*3+2]-values[ib*3+2]);const rest=a.pos.getArray();
 for(const tri of a.shoulder)for(let i=0;i<3;i++){const r=edge(tri[i],tri[(i+1)%3],rest);if(r>.01)maxStretch=Math.max(maxStretch,edge(tri[i],tri[(i+1)%3],arr)/r);}
 cg.dispose();bg.dispose();return {capeBodyIntersectingPairsBelowAttachment:pairs,uniqueCapeTrianglesIntersectingBody:touched.size,shoulderUnderarmorMaxEdgeStretch:Number(maxStretch.toFixed(4)),finite:arr.every(Number.isFinite)};
}
const a=prep(docs[0]),b=prep(docs[1]),rows=[];
for(const [label,clip,time]of cases){const before=measure(a,sample(a,clip,time)),after=measure(b,sample(b,clip,time));const row={pose:label,clip,time,before,after};rows.push(row);console.log(JSON.stringify(row));}
await fs.writeFile(out,JSON.stringify({method:'Actual animated LOD0 triangles, BVH triangle/triangle intersections. Cape comparison excludes rest-space centers above1.92m to omit intentional shoulder attachment. Counts measure intersection severity, not physical penetration depth. Shoulder stretch covers anatomical underarmor edges >1cm with all triangle vertices in shoulder band.',rows},null,2));
