"""Complete only the provider-fused missing lower staff shaft, preserving original source."""
import json,struct,hashlib
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
ns={'__file__':str(BASE/'tools/qa-equipment-points.py')};exec((BASE/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns)
source=BASE/'derived/frost-mage-rigged.glb';j,b=ns['read'](source);acc=lambda i:ns['acc'](j,b,i)
recipe=json.loads((BASE/'review/animated/frost-mage/staff-segmentation.json').read_text())['lowerShaftRepair'];top=np.array(recipe['replacementAxisCanonicalMeters']['top']);bottom=np.array(recipe['replacementAxisCanonicalMeters']['bottom']);axis=top-bottom;axis/=np.linalg.norm(axis);u=np.cross(axis,[0,0,1]);u/=np.linalg.norm(u);v=np.cross(axis,u);radius=recipe['suggestedRadiusMeters'];positions=[];normals=[];indices=[];count=12
for point in [bottom,top+axis*.012]:
 for n in range(count):
  normal=u*np.cos(n/count*np.pi*2)+v*np.sin(n/count*np.pi*2);positions.append(point+normal*radius);normals.append(normal)
for n in range(count):
 a=n;c=(n+1)%count;indices.extend([a,c,c+count,a,c+count,a+count])
positions.extend([bottom,top+axis*.012]);normals.extend([-axis,axis])
for n in range(count):indices.extend([24,(n+1)%count,n,25,n+count,(n+1)%count+count])
p=j['meshes'][0]['primitives'][0];ps=acc(p['attributes']['POSITION']);uv=acc(p['attributes']['TEXCOORD_0']);nearest=np.argmin(np.linalg.norm(ps-top,axis=1));uvs=np.repeat(uv[nearest:nearest+1],len(positions),axis=0)
names=[j['nodes'][x]['name']for x in j['skins'][0]['joints']];hand=names.index('RightHand');js=np.tile([hand,0,0,0],(len(positions),1));ws=np.tile([1,0,0,0],(len(positions),1));parts=[b];size=len(b)
def append(array,typ,component):
 global size
 array=np.array(array,dtype={5126:'<f4',5123:'<u2'}[component]);pad=(-size)%4
 if pad:parts.append(bytes(pad));size+=pad
 raw=array.tobytes();view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':size,'byteLength':len(raw)});parts.append(raw);size+=len(raw);ai=len(j['accessors']);a={'bufferView':view,'componentType':component,'count':len(array),'type':typ}
 if typ=='VEC3':a.update(min=array.min(0).tolist(),max=array.max(0).tolist())
 j['accessors'].append(a);return ai
prim={'attributes':{'POSITION':append(positions,'VEC3',5126),'NORMAL':append(normals,'VEC3',5126),'TEXCOORD_0':append(uvs,'VEC2',5126),'JOINTS_0':append(js,'VEC4',5123),'WEIGHTS_0':append(ws,'VEC4',5126)},'indices':append(np.array(indices).reshape(-1,1),'SCALAR',5123),'material':p['material'],'extras':{'heldEquipment':True,'authoredRepair':'Complete missing AI-fused lower staff shaft'}};pi=len(j['meshes'][0]['primitives']);j['meshes'][0]['primitives'].append(prim)
j['buffers'][0]['byteLength']=size;encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);data=b''.join(parts);data+=bytes((-len(data))%4);output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data;source.write_bytes(output)
mp=BASE/'derived/frost-mage-rigging.json';meta=json.loads(mp.read_text());meta['lowerShaftCompletion']={**recipe,'vertices':len(positions),'triangles':len(indices)//3,'material':p['material'],'colorUVSourceVertex':int(nearest),'parent':'RightHand'};meta['groundingExclusions']['vertexSets'].append({'mesh':0,'primitive':pi,'vertices':list(range(len(positions)))});meta['output']['sha256']=hashlib.sha256(output).hexdigest();meta['output']['bytes']=len(output);mp.write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta['lowerShaftCompletion']))
