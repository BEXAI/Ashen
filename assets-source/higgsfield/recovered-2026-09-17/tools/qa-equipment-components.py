"""Read-only position-welded component masks for independent equipment QA."""
import json,struct,hashlib,numpy as np,sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]
for slug in sys.argv[1:]:
 path=R/'derived'/f'{slug}-rigged.glb'
 if not path.exists():path=R/'models'/f'{slug}-original.glb'
 data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+n]);b=data[28+n:]
 def arr(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dt).itemsize*w),np.dtype(dt).itemsize)).copy()
 out=[]
 for mi,m in enumerate(j['meshes']):
  for pi,p in enumerate(m['primitives']):
   v=arr(p['attributes']['POSITION']);t=arr(p['indices']).reshape(-1,3);_,wel=np.unique(np.round(v,5),axis=0,return_inverse=True);par=np.arange(wel.max()+1)
   def find(x):
    while par[x]!=x:par[x]=par[par[x]];x=par[x]
    return x
   for tri in wel[t]:
    for x in tri[1:]:par[find(x)]=find(tri[0])
   components={}
   for i,x in enumerate(wel):components.setdefault(find(x),[]).append(i)
   for ci,ids in enumerate(sorted(components.values(),key=len,reverse=True)):
    out.append({'mesh':mi,'primitive':pi,'component':ci,'count':len(ids),'min':v[ids].min(0).tolist(),'max':v[ids].max(0).tolist(),'vertices':ids})
 dest=R/'review/animated'/slug;dest.mkdir(parents=True,exist_ok=True);(dest/'component-audit.json').write_text(json.dumps({'sourcePath':str(path),'sourceSha256':hashlib.sha256(data).hexdigest(),'components':out},indent=2)+'\n');print(slug,json.dumps([{k:v for k,v in x.items()if k!='vertices'}for x in out if x['count']>10]))
