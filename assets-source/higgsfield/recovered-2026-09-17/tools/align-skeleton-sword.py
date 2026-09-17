"""Rigidly align the recovered held sword to the native blade hand axis, with real sockets."""
import json,struct,hashlib
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
ns={'__file__':str(BASE/'tools/qa-equipment-points.py')};exec((BASE/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns)
source=BASE/'derived/skeleton-warrior-rigged.glb';j,b=ns['read'](source);acc=lambda i:ns['acc'](j,b,i);mp=BASE/'derived/skeleton-warrior-rigging.json';meta=json.loads(mp.read_text());world=ns['world'](j);node=next(i for i,n in enumerate(j['nodes'])if n.get('name')=='RightHand');m=world(node);pivot=m[:3,3];cb=np.array(meta['contactSockets']['baseWorld']);ct=np.array(meta['contactSockets']['tipWorld']);a=ct-cb;a/=np.linalg.norm(a);target=m[:3,1];target/=np.linalg.norm(target);v=np.cross(a,target);c=np.dot(a,target);K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);R=np.eye(3)+K+K@K/max(1+c,1e-12)
parts=[b];size=len(b)
def append(array,typ):
 global size
 array=np.array(array,dtype='<f4');pad=(-size)%4
 if pad:parts.append(bytes(pad));size+=pad
 raw=array.tobytes();view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':size,'byteLength':len(raw)});parts.append(raw);size+=len(raw);ai=len(j['accessors']);j['accessors'].append({'bufferView':view,'componentType':5126,'count':len(array),'type':typ,'min':array.min(0).tolist(),'max':array.max(0).tolist()});return ai
count=0
for group in meta['equipment']['vertexGroups']:
 if group['hand']!='RightHand':continue
 p=j['meshes'][group['mesh']]['primitives'][group['primitive']];ids=group['vertices'];ps=acc(p['attributes']['POSITION']);norm=acc(p['attributes']['NORMAL']);ps[ids]=(ps[ids]-pivot)@R.T+pivot;norm[ids]=norm[ids]@R.T;p['attributes']['POSITION']=append(ps,'VEC3');p['attributes']['NORMAL']=append(norm,'VEC3');count+=len(ids)
cb=R@(cb-pivot)+pivot;ct=R@(ct-pivot)+pivot;inv=np.linalg.inv(m);local=lambda x:(inv@np.r_[x,1])[:3].tolist();meta['contactSockets'].update(base=local(cb),tip=local(ct),baseWorld=cb.tolist(),tipWorld=ct.tolist());meta['embeddedWeaponAlignment']={'method':'Rigid rotation of exact held-sword vertex group about RightHand grip; native positive hand Y blade basis. Source design, UVs and images preserved.','vertices':count,'pivot':pivot.tolist(),'rotationMatrixRowMajor':R.tolist(),'sourceDirection':a.tolist(),'targetDirection':target.tolist(),'angleDegrees':float(np.arccos(np.clip(c,-1,1))*180/np.pi)}
j['buffers'][0]['byteLength']=size;encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);data=b''.join(parts);data+=bytes((-len(data))%4);output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data;source.write_bytes(output);meta['output'].update(sha256=hashlib.sha256(output).hexdigest(),bytes=len(output));mp.write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta['embeddedWeaponAlignment']))
