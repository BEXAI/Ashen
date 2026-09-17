const fs=require('fs'),path=require('path'),crypto=require('crypto'),req=require('module').createRequire(path.join(require('./resolve-deps.cjs')(__dirname),'package.json'));
const{NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions');
const base=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),s=await io.read(path.join(base,'models/spider-original.glb')),d=await io.read(path.join(base,'runtime/spider-runtime.glb'));
 const a=s.getRoot().listMeshes()[0].listPrimitives()[0],b=d.getRoot().listMeshes()[0].listPrimitives()[0],pa=a.getAttribute('POSITION'),pb=b.getAttribute('POSITION');
 const points=[],groups=new Map(),grid=new Map(),sourceIds=[],derivedIds=[];
 for(let i=0;i<pa.getCount();i++){
  const p=pa.getElement(i,[]),v=[-p[2]*2,p[1]*2+.4708501994609833,p[0]*2],key=v.join(',');
  if(!groups.has(key)){const id=points.length;groups.set(key,id);points.push(v);const k=v.map(x=>Math.floor(x*10000)).join(',');if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}
  sourceIds.push(groups.get(key));
 }
 let maxError=0;
 for(let i=0;i<pb.getCount();i++){
  const v=pb.getElement(i,[]),cell=v.map(x=>Math.floor(x*10000));let best=Infinity,id=-1;
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const n of grid.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[]){const p=points[n],distance=Math.hypot(...v.map((q,j)=>q-p[j]));if(distance<best){best=distance;id=n;}}
  if(best>1e-6)throw Error('HD vertex differs from rigidly transformed source by '+best);maxError=Math.max(maxError,best);derivedIds.push(id);
 }
 function triangles(p,ids){const index=p.getIndices(),out=[];for(let i=0;i<index.getCount();i+=3){const t=[0,1,2].map(j=>ids[index.getScalar(i+j)]),start=t.indexOf(Math.min(...t));out.push([0,1,2].map(j=>t[(start+j)%3]).join(','));}return out.sort();}
 const ta=triangles(a,sourceIds),tb=triangles(b,derivedIds);if(JSON.stringify(ta)!==JSON.stringify(tb))throw Error('Oriented triangles changed');
 const imageHashes=x=>x.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),sourceImages=imageHashes(s),runtimeImages=imageHashes(d);
 if(JSON.stringify(sourceImages)!==JSON.stringify(runtimeImages))throw Error('Original texture bytes changed in runtime master');
 const report={sourceHash:hash(fs.readFileSync(path.join(base,'models/spider-original.glb'))),hdRuntimeHash:hash(fs.readFileSync(path.join(base,'runtime/spider-runtime.glb'))),sourceVertices:pa.getCount(),hdVertices:pb.getCount(),triangles:ta.length,maximumPositionRoundTripError:maxError,orientedTrianglesPreserved:true,originalTextureBytesPreserved:true,textureSHA256:sourceImages,positionTransform:'[x,y,z] -> [-2z,2y+0.4708501994609833,2x]',limits:'HD topology/geometry and original texture bytes audited. Mobile intentionally decimated; optimized image dimensions/formats differ by design.'};
 fs.writeFileSync(path.join(base,'spider-source-preservation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})();
