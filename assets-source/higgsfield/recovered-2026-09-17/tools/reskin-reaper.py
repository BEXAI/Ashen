"""Smooth anatomical skin weights on the recovered Reaper's unchanged topology."""
import json,struct,hashlib
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
SOURCE=BASE/'derived/reaper-rigged.glb'
raw=SOURCE.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);binary=raw[28+length:]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];dim={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
 return np.frombuffer(binary,dtype=dt,count=a['count']*dim,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,dim)
p=j['meshes'][0]['primitives'][0];ps=acc(p['attributes']['POSITION']);tri=acc(p['indices']).reshape(-1,3)
def node_world(j):
 parents={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])};cache={}
 def w(i):
  if i in cache:return cache[i]
  n=j['nodes'][i]
  if 'matrix'in n:m=np.array(n['matrix']).reshape(4,4).T
  else:
   x,y,z,v=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*v),2*(x*z+y*v)],[2*(x*y+z*v),1-2*(x*x+z*z),2*(y*z-x*v)],[2*(x*z-y*v),2*(y*z+x*v),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
  cache[i]=(w(parents[i]) if i in parents else np.eye(4))@m;return cache[i]
 return w
world=node_world(j);skin=j['skins'][0];names=[j['nodes'][i]['name'] for i in skin['joints']];bp=np.array([world(i)[:3,3] for i in skin['joints']]);index={n:i for i,n in enumerate(names)}
keys={};mapping=[];unique=[]
for v in ps:
 key=tuple(round(float(x),5)for x in v)
 if key not in keys:keys[key]=len(unique);unique.append(v)
 mapping.append(keys[key])
mapping=np.array(mapping);points=np.array(unique);count=len(points);weights=np.zeros((count,len(names)),dtype=np.float32);fixed=np.zeros(count,dtype=bool)
spine=sorted([index[x]for x in ['Hips','Spine02','Spine01','Spine','neck','Head']],key=lambda x:bp[x,1])
for vi,v in enumerate(points):
 y=v[1];below=[x for x in spine if bp[x,1]<=y];a=below[-1]if below else spine[0];ai=spine.index(a);b=spine[min(ai+1,len(spine)-1)];u=np.clip((y-bp[a,1])/max(bp[b,1]-bp[a,1],1e-8),0,1)if a!=b else 0;weights[vi,a]=1-u;weights[vi,b]+=u
 # The flowing lower robe is one garment; do not pull adjacent strips to independent knees/hands.
 if y<.82:weights[vi]=0;weights[vi,index['Hips']]=1;fixed[vi]=True
 if y>1.55 and abs(v[0])<.38:weights[vi]=0;weights[vi,index['Head']]=1;fixed[vi]=True
 if abs(v[0])<.10 and v[2]<.04 and 1.02<y<1.37:fixed[vi]=True
for side in ['Left','Right']:
 arm=[index[side+x]for x in ['Arm','ForeArm','Hand']]
 distances=[]
 for a,b in zip(arm[:-1],arm[1:]):
  delta=bp[b]-bp[a];t=np.clip(((points-bp[a])@delta)/(delta@delta),0,1);distances.append(np.linalg.norm(points-(bp[a]+t[:,None]*delta),axis=1))
 distances.append(np.linalg.norm(points-bp[arm[-1]],axis=1))
 distances=np.array(distances).T;closest=np.argmin(distances,axis=1);dist=distances[np.arange(count),closest]
 for vi,v in enumerate(points):
  if fixed[vi]or v[1]<.90:continue
  strength=np.exp(-(dist[vi]/.13)**4)
  if strength<.001:continue
  local=(distances[vi]**2+.001)**-2;local/=local.sum();weights[vi]*=1-strength
  for k,bi in enumerate(arm):weights[vi,bi]+=strength*local[k]
  if dist[vi]<.05 and abs(v[0])>.17 and v[2]>-.08:
   weights[vi]=0;weights[vi,arm[closest[vi]]]=1;fixed[vi]=True
meta=json.loads((BASE/'derived/reaper-rigging.json').read_text());equipment=meta['groundingExclusions']['vertexSets'][0]['vertices'];
# Include the source shaft's flared tail, which extends past the prior capsule endpoint.
shaft_tail=np.where((ps[:,0]>.43)&(ps[:,1]>.74)&(ps[:,1]<.91)&(ps[:,2]>.16)&(ps[:,2]<.30))[0]
equipment=sorted(set(equipment)|set(int(v)for v in shaft_tail));weapon=np.unique(mapping[equipment]);weights[weapon]=0;weights[weapon,index['RightHand']]=1;fixed[weapon]=True
edges=set()
for t in tri:
 a=mapping[t]
 for k in range(3):
  x,y=int(a[k]),int(a[(k+1)%3]);
  if x!=y:edges.add((min(x,y),max(x,y)))
adj=[set()for _ in range(count)]
for a,b in edges:adj[a].add(b);adj[b].add(a)
width=max(map(len,adj));neighbors=np.repeat(np.arange(count)[:,None],width,axis=1);valid=np.zeros((count,width),dtype=np.float32)
for i,n in enumerate(adj):neighbors[i,:len(n)]=list(n);valid[i,:len(n)]=1
den=np.maximum(valid.sum(axis=1,keepdims=True),1);original=weights.copy()
for step in range(100):
 average=(weights[neighbors]*valid[:,:,None]).sum(axis=1)/den
 weights=.35*weights+.65*average;weights[fixed]=original[fixed]
 if step%25==0:print('Smoothing',step,flush=True)
outWeights=weights[mapping];js=np.argsort(outWeights,axis=1)[:,-4:][:,::-1];ws=np.take_along_axis(outWeights,js,axis=1);ws/=ws.sum(axis=1,keepdims=True)
assert np.isfinite(ws).all()and np.all(ws.sum(axis=1)>.99999)
parts=[binary];size=len(binary)
def append(array,typ,component):
 global size
 array=np.array(array,dtype='<f4'if component==5126 else'<u2');pad=(-size)%4
 if pad:parts.append(bytes(pad));size+=pad
 data=array.tobytes();view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':size,'byteLength':len(data)});parts.append(data);size+=len(data);ai=len(j['accessors']);j['accessors'].append({'bufferView':view,'componentType':component,'count':len(array),'type':typ});return ai
p['attributes']['JOINTS_0']=append(js,'VEC4',5123);p['attributes']['WEIGHTS_0']=append(ws,'VEC4',5126)
for n in j['nodes']:
 if n.get('children')==[]:del n['children']
j['buffers'][0]['byteLength']=size;encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);data=b''.join(parts);data+=bytes((-len(data))%4)
output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data
(BASE/'derived/reaper-reskinned.glb').write_bytes(output)
report={'input':str(SOURCE.relative_to(BASE)),'inputSHA256':hashlib.sha256(raw).hexdigest(),'output':'derived/reaper-reskinned.glb','outputSHA256':hashlib.sha256(output).hexdigest(),'sourceGeometryUntouched':True,'originalBinaryPrefixPreserved':True,'vertices':len(ps),'triangles':len(tri),'virtualWeldedVertices':count,'hardPinnedVertices':int(fixed.sum()),'smoothingPasses':100,'equipmentVerticesRigidRightHand':len(equipment),'weightSumMaxError':float(np.max(np.abs(ws.sum(axis=1)-1))),'method':'Continuous vertical torso/hood field with fitted arm capsules, preserved rigid scythe anchors and seam-aware topological smoothing. Lower flowing robe follows Hips as one garment, avoiding transferred hand/knee islands.'}
(BASE/'reaper-grounding-exclusions.json').write_text(json.dumps({'reason':'Rigid scythe mask including flared shaft tail; body/clothing retained','vertexSets':[{'mesh':0,'primitive':0,'vertices':equipment}]},indent=2)+'\n')
(BASE/'reaper-reskin-qa.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
