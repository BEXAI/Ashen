// Offline-only UV, visibility and raster tools. Never included in the game bundle.
import * as watlas from 'watlas';
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
await watlas.Initialize();

export function unwrap(primitives,document,buffer,resolution=1024,padding=6){
 const atlas=new watlas.Atlas();
 try{
  for(const p of primitives){
   const position=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL');
   atlas.addMesh({vertexCount:position.getCount(),vertexPositionData:position.getArray(),vertexPositionStride:12,vertexNormalData:normal.getArray(),vertexNormalStride:12,indexData:p.getIndices()?.getArray(),indexCount:p.getIndices()?.getCount()});
  }
  atlas.generate({maxIterations:2,normalSeamWeight:4},{resolution,padding,bilinear:true,blockAlign:true});
  if(atlas.atlasCount!==1)throw Error(`Expected one UV atlas, received ${atlas.atlasCount}`);
  const report={width:atlas.width,height:atlas.height,charts:atlas.chartCount,padding,paddingAtRequestedResolution:padding*resolution/Math.max(atlas.width,atlas.height),utilization:0};
  const utilization=new Float32Array(1);atlas.getUtilization(utilization);report.utilization=utilization[0];
  for(let i=0;i<primitives.length;i++){
   const p=primitives[i],mesh=atlas.getMesh(i),vertices=Array.from({length:mesh.vertexCount},(_,j)=>mesh.getVertex(j));
   for(const semantic of p.listSemantics()){
    const src=p.getAttribute(semantic),n=src.getElementSize(),array=new (src.getArray().constructor)(vertices.length*n),source=src.getArray();
    vertices.forEach((v,j)=>{for(let k=0;k<n;k++)array[j*n+k]=source[v.xref*n+k];});
    p.setAttribute(semantic,document.createAccessor().setType(src.getType()).setArray(array).setBuffer(buffer));
   }
   const uv=new Float32Array(vertices.length*2),indices=new Uint32Array(mesh.indexCount);
   vertices.forEach((v,j)=>uv.set([v.uv[0]/atlas.width,v.uv[1]/atlas.height],j*2));mesh.getIndexArray(indices);
   p.setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer));
   p.setAttribute('TEXCOORD_1',document.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer));
  }
  return report;
 }finally{atlas.delete();}
}

export function visibilitySampler(positions,indices){
 const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(positions),3));
 if(indices)geometry.setIndex(new T.BufferAttribute(new Uint32Array(indices),1));
 const bvh=new MeshBVH(geometry),ray=new T.Ray(),axis=new T.Vector3(),tangent=new T.Vector3(),bitangent=new T.Vector3(),direction=new T.Vector3();
 const cache=new Map();
 return {
  sample(p,n,radius=.4,samples=32){
   const key=[...p.toArray().map(v=>v.toFixed(4)),...n.toArray().map(v=>v.toFixed(3)),radius,samples].join(',');
   if(cache.has(key))return cache.get(key);
   axis.set(Math.abs(n.y)<.95?0:1,Math.abs(n.y)<.95?1:0,0);tangent.crossVectors(axis,n).normalize();bitangent.crossVectors(n,tangent);
   let occlusion=0;ray.origin.copy(p).addScaledVector(n,.006);
   for(let i=0;i<samples;i++){
    const r=Math.sqrt((i+.5)/samples),a=i*2.399963229728653;
    direction.copy(tangent).multiplyScalar(Math.cos(a)*r).addScaledVector(bitangent,Math.sin(a)*r).addScaledVector(n,Math.sqrt(1-r*r));
    ray.direction.copy(direction);const hit=bvh.raycastFirst(ray,T.DoubleSide,.004,radius);
    if(hit)occlusion+=1-hit.distance/radius;
   }
   const value=Math.max(.2,1-occlusion/samples*.88);cache.set(key,value);return value;
  },
  dispose(){geometry.dispose();cache.clear();}
 };
}

// Half-open rasterization and barycentric interpolation preserve source coordinates.
export function raster(p,semantic,size,visit){
 const uv=p.getAttribute(semantic),indices=p.getIndices()?.getArray()??Array.from({length:uv.getCount()},(_,i)=>i),a=[],b=[],c=[];
 for(let i=0;i<indices.length;i+=3){
  const ids=[indices[i],indices[i+1],indices[i+2]];uv.getElement(ids[0],a);uv.getElement(ids[1],b);uv.getElement(ids[2],c);
  const x0=a[0]*size,y0=a[1]*size,x1=b[0]*size,y1=b[1]*size,x2=c[0]*size,y2=c[1]*size;
  const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);if(Math.abs(den)<1e-8)continue;
  const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxX=Math.min(size-1,Math.ceil(Math.max(x0,x1,x2)));
  const minY=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxY=Math.min(size-1,Math.ceil(Math.max(y0,y1,y2)));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const u=((y1-y2)*(x+.5-x2)+(x2-x1)*(y+.5-y2))/den,v=((y2-y0)*(x+.5-x2)+(x0-x2)*(y+.5-y2))/den,w=1-u-v;
   if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)visit(y*size+x,ids,u,v,w,x,y);
  }
 }
}

export function dilate(buffers,mask,size,steps){
 let edge=[];
 for(let p=0;p<mask.length;p++)if(mask[p]&&((p%size>0&&!mask[p-1])||(p%size<size-1&&!mask[p+1])||(p>=size&&!mask[p-size])||(p<mask.length-size&&!mask[p+size])))edge.push(p);
 for(let s=0;s<steps&&edge.length;s++){
  const next=[];
  for(const p of edge){
   const neighbors=[];if(p%size>0)neighbors.push(p-1);if(p%size<size-1)neighbors.push(p+1);if(p>=size)neighbors.push(p-size);if(p<mask.length-size)neighbors.push(p+size);
   for(const q of neighbors)if(!mask[q]){mask[q]=1;for(const buffer of buffers)buffer.copy(buffer,q*4,p*4,p*4+4);next.push(q);}
  }
  edge=next;
 }
}
