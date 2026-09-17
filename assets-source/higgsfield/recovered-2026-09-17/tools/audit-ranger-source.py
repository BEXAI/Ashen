"""Verify recorded seam splitting preserves every fitted source triangle surface."""
import json,struct,hashlib
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
def read(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return raw,json.loads(raw[20:20+n]),raw[28+n:]
def accessor(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],w),dtype,b,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()
s,sj,sb=read(BASE/'derived/ranger-rigged.glb');d,dj,db=read(BASE/'derived/ranger-reskinned.glb');sp=sj['meshes'][0]['primitives'][0];dp=dj['meshes'][0]['primitives'][0];si=accessor(sj,sb,sp['indices']).ravel();di=accessor(dj,db,dp['indices']).ravel();assert len(si)==len(di)
checks={}
for key in ['POSITION','NORMAL','TEXCOORD_0']:
 a=accessor(sj,sb,sp['attributes'][key]);b=accessor(dj,db,dp['attributes'][key]);difference=float(np.max(np.abs(a[si]-b[di])));assert difference==0;checks[key]={'maximumPerTriangleCornerDifference':difference,'sourceCount':len(a),'derivedCount':len(b)}
assert db.startswith(sb)
result={'source':'derived/ranger-rigged.glb','sourceSHA256':hashlib.sha256(s).hexdigest(),'derived':'derived/ranger-reskinned.glb','derivedSHA256':hashlib.sha256(d).hexdigest(),'originalBinaryPrefixPreserved':True,'originalTriangles':len(si)//3,'derivedTriangles':len(di)//3,'triangleCornerAttributes':checks,'interpretation':'Triangle order and surface coordinates/UVs/normals are exactly preserved; boundary vertex ownership is split for separate skinning.'};(BASE/'ranger-source-preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
