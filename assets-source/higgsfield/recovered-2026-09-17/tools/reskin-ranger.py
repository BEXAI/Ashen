"""Smooth anatomical skin weights on the recovered Reaper's unchanged topology."""
import json,struct,hashlib,sys
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
slug='ranger'
SOURCE=BASE/'derived'/f'{slug}-rigged.glb'
raw=SOURCE.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);binary=raw[28+length:]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
 return np.frombuffer(binary,dtype=dt,count=a['count']*dim,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,dim)
p=j['meshes'][0]['primitives'][0];ps=acc(p['attributes']['POSITION']);tri=acc(p['indices']).reshape(-1,3).copy()
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
# Green cloth texture separates the rear cape from brown boots and sleeves.
import io
from PIL import Image
im=j['images'][j['textures'][j['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];iv=j['bufferViews'][im['bufferView']];image=np.array(Image.open(io.BytesIO(binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])).convert('RGB')).astype(float);uv=acc(p['attributes']['TEXCOORD_0']);rgb=image[np.clip((uv[:,1]*image.shape[0]).astype(int),0,image.shape[0]-1),np.clip((uv[:,0]*image.shape[1]).astype(int),0,image.shape[1]-1)];green=(rgb[:,1]>rgb[:,0]*1.025)&(rgb[:,1]>rgb[:,2]*1.08);cape=np.zeros(count,dtype=bool);cape[mapping[green]]=True
spine=sorted([index[x]for x in ['Hips','Spine02','Spine01','Spine','neck','Head']],key=lambda x:bp[x,1])
for vi,v in enumerate(points):
 y=v[1];below=[x for x in spine if bp[x,1]<=y];a=below[-1]if below else spine[0];ai=spine.index(a);b=spine[min(ai+1,len(spine)-1)];u=np.clip((y-bp[a,1])/max(bp[b,1]-bp[a,1],1e-8),0,1)if a!=b else 0;weights[vi,a]=1-u;weights[vi,b]+=u
 # The flowing lower robe is one garment; do not pull adjacent strips to independent knees/hands.
 if y<.86 and slug in ['sage','lich']:weights[vi]=0;weights[vi,index['Hips']]=1;fixed[vi]=True
 if y>1.53 and abs(v[0])<.38:weights[vi]=0;weights[vi,index['Head']]=1;fixed[vi]=True
 if abs(v[0])<.10 and v[2]<.04 and 1.02<y<1.37:fixed[vi]=True
 if slug=='ranger' and v[2]<-.12 and v[1]>.34 and cape[vi]:
  fixed[vi]=True # Cape/quiver lie behind the arm field and follow the vertical torso.
 if slug not in ['sage','lich'] and y<.95 and not fixed[vi]:
  side='Left' if v[0]>0 else 'Right'
  leg=[index[side+x]for x in ['UpLeg','Leg','Foot']]
  weights[vi]=0
  if y>=bp[leg[1],1]:
   u=np.clip((y-bp[leg[1],1])/max(bp[leg[0],1]-bp[leg[1],1],.001),0,1);weights[vi,leg[0]]=u;weights[vi,leg[1]]=1-u
  else:
   u=np.clip((y-bp[leg[2],1])/max(bp[leg[1],1]-bp[leg[2],1],.001),0,1);weights[vi,leg[1]]=u;weights[vi,leg[2]]=1-u
  if y<.18:fixed[vi]=True
for side in ['Left','Right']:
 arm=[index[side+x]for x in ['Arm','ForeArm','Hand']]
 distances=[]
 for a,b in zip(arm[:-1],arm[1:]):
  delta=bp[b]-bp[a];t=np.clip(np.einsum('ij,j->i',points-bp[a],delta)/max(float(np.sum(delta*delta)),1e-12),0,1);distances.append(np.linalg.norm(points-(bp[a]+t[:,None]*delta),axis=1))
 distances.append(np.linalg.norm(points-bp[arm[-1]],axis=1))
 distances=np.array(distances).T;closest=np.argmin(distances,axis=1);dist=distances[np.arange(count),closest]
 for vi,v in enumerate(points):
  if fixed[vi]or v[1]<.83:continue
  strength=np.exp(-(dist[vi]/.13)**4)
  if strength<.001:continue
  local=(distances[vi]**2+.001)**-2;local/=local.sum();weights[vi]*=1-strength
  for k,bi in enumerate(arm):weights[vi,bi]+=strength*local[k]
  if dist[vi]<.05 and abs(v[0])>.17 and v[2]>-.08:
   weights[vi]=0;weights[vi,arm[closest[vi]]]=1;fixed[vi]=True
meta=json.loads((BASE/'derived'/f'{slug}-rigging.json').read_text());equipment=meta['groundingExclusions']['vertexSets'][0]['vertices'];
# Fit the curved wooden limb and the offset pale string using actual surface colors.
arc=meta['equipment']['polylines'][0][0]; string=meta['equipment']['polylines'][1][0]
def path_distance(line):
 result=np.full(len(ps),1e9)
 for a,b in zip(line[:-1],line[1:]):
  a=np.array(a);delta=np.array(b)-a;t=np.clip(((ps-a)*delta).sum(axis=1)/(delta*delta).sum(),0,1);result=np.minimum(result,np.linalg.norm(ps-(a+t[:,None]*delta),axis=1))
 return result
string_color=(rgb[:,0]>45)&(rgb[:,0]>rgb[:,1]*.98)&(rgb[:,0]<rgb[:,1]*1.55)&(rgb[:,1]<rgb[:,2]*2.3)
wood_color=~green
mask=((path_distance(arc)<.052)&wood_color)|((path_distance(string)<.045)&string_color)
# Grip and finger vertices may share LeftHand; preserve them rather than cut at the palm.
weldMask=np.zeros(count,dtype=bool);weldMask[mapping[mask]]=True;mask=weldMask[mapping]
equipment=np.where(mask)[0].tolist();meta['groundingExclusions']['vertexSets'][0]['vertices']=equipment;meta['equipment']['vertexGroups'][0]['vertices']=equipment
meta['equipment']['maskMethod']='Measured three-dimensional arc and offset string with original texture-color discrimination; explicit vertex IDs retained'
# Split the fused bow/string surfaces away from sleeve/cape except at the true grip.
labels=mask[tri];mixed=labels.any(axis=1)&~labels.all(axis=1);centers=ps[tri].mean(axis=1);grip=bp[index['LeftHand']];bridge=mixed
# The provider fused parts of the green cape to the sleeve. Open only that narrow seam.
capemask=cape[mapping]&(ps[:,2]<.01)&(ps[:,1]>.34);cross=capemask[tri].any(axis=1)&~capemask[tri].all(axis=1);cape_bridge=cross&(np.abs(centers[:,0])>.22)&(centers[:,1]>.85)&(centers[:,1]<1.39)&(centers[:,2]<.04)&~mask[tri].any(axis=1)
cape_bridge[:]=False
removed=np.where(bridge|cape_bridge)[0];meta['derivativeSeamCuts']={'reason':'Split source-fused bow/string/body boundary vertices without dropping any source triangles; duplicate attributes and assign coherent ownership to each side','triangleIds':removed.tolist(),'bowBridgeCount':int(bridge.sum()),'capeSleeveBridgeCount':int(cape_bridge.sum()),'sourceTriangles':len(tri)}
for group in meta['equipment'].get('vertexGroups',[{'hand':meta['equipment']['hand'],'vertices':equipment}]):
 weapon=np.unique(mapping[group['vertices']]);weights[weapon]=0;weights[weapon,index[group['hand']]]=1;fixed[weapon]=True
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
fixed[valid.sum(axis=1)==0]=True
den=np.maximum(valid.sum(axis=1,keepdims=True),1);original=weights.copy()
for step in range(100):
 average=(weights[neighbors]*valid[:,:,None]).sum(axis=1)/den
 weights=.35*weights+.65*average;weights[fixed]=original[fixed]
 if step%25==0:print('Smoothing',step,flush=True)
outWeights=weights[mapping]
# Split seam vertices in-place geometrically: no triangle or original surface point removed.
body_neighbors={}
for t in tri[mixed]:
 body=t[~mask[t]]
 for v in t[mask[t]]:body_neighbors.setdefault(int(v),[]).extend(body.tolist())
dup_ids=[];dup_weights=[];duplicates={};rigid_dups=[]
def duplicate(v,owner):
 key=(int(v),owner)
 if key in duplicates:return duplicates[key]
 idx=len(ps)+len(dup_ids);duplicates[key]=idx;dup_ids.append(int(v))
 if owner=='gear':
  weight=np.zeros(len(names),dtype=np.float32);weight[index['LeftHand']]=1;rigid_dups.append(idx)
 else:
  nearby=body_neighbors.get(int(v),[]);weight=outWeights[nearby].mean(axis=0)if nearby else outWeights[v].copy();weight/=weight.sum()
 dup_weights.append(weight);return idx
for ti in np.where(mixed)[0]:
 t=tri[ti].copy();gear=mask[t].sum()>=2
 for k,v in enumerate(t):
  if mask[v]!=gear:tri[ti,k]=duplicate(v,'gear'if gear else'body')
if dup_weights:outWeights=np.vstack([outWeights,np.array(dup_weights)])
equipment+=rigid_dups;meta['groundingExclusions']['vertexSets'][0]['vertices']=equipment;meta['equipment']['vertexGroups'][0]['vertices']=equipment
meta['derivativeSeamCuts']['method']='duplicate boundary vertices and remap original triangles, no face removal';meta['derivativeSeamCuts']['duplicatedVertices']=len(dup_ids);meta['derivativeSeamCuts']['removedTriangles']=0
js=np.argsort(outWeights,axis=1)[:,-4:][:,::-1];ws=np.take_along_axis(outWeights,js,axis=1);ws/=ws.sum(axis=1,keepdims=True);js[ws==0]=0
assert np.isfinite(ws).all()and np.all(ws.sum(axis=1)>.99999)
parts=[binary];size=len(binary)
def append(array,typ,component):
 global size
 array=np.array(array,dtype='<f4'if component==5126 else'<u4'if component==5125 else'<u2');pad=(-size)%4
 if pad:parts.append(bytes(pad));size+=pad
 data=array.tobytes();view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':size,'byteLength':len(data)});parts.append(data);size+=len(data);ai=len(j['accessors']);j['accessors'].append({'bufferView':view,'componentType':component,'count':len(array),'type':typ});return ai
for semantic,aid in list(p['attributes'].items()):
 if semantic.startswith(('JOINTS_','WEIGHTS_')):continue
 original=acc(aid);array=np.concatenate([original,original[dup_ids]],axis=0)if dup_ids else original
 p['attributes'][semantic]=append(array,j['accessors'][aid]['type'],j['accessors'][aid]['componentType'])
 if semantic=='POSITION':j['accessors'][p['attributes'][semantic]]['min']=array.min(axis=0).tolist();j['accessors'][p['attributes'][semantic]]['max']=array.max(axis=0).tolist()
p['indices']=append(tri.reshape(-1,1),'SCALAR',5125)
p['attributes']['JOINTS_0']=append(js,'VEC4',5123);p['attributes']['WEIGHTS_0']=append(ws,'VEC4',5126)
for n in j['nodes']:
 if n.get('children')==[]:del n['children']
j['buffers'][0]['byteLength']=size;encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);data=b''.join(parts);data+=bytes((-len(data))%4)
output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data
OUTPUT=BASE/'derived/ranger-reskinned.glb'
OUTPUT.write_bytes(output)
report={'input':str(SOURCE.relative_to(BASE)),'inputSHA256':hashlib.sha256(raw).hexdigest(),'output':str(OUTPUT.relative_to(BASE)),'outputSHA256':hashlib.sha256(output).hexdigest(),'sourceVertexGeometryUntouched':True,'topologyChangedOnlyForRecordedSeamCuts':True,'originalBinaryPrefixPreserved':True,'sourceVertices':len(ps),'vertices':len(outWeights),'triangles':len(tri),'virtualWeldedVertices':count,'hardPinnedVertices':int(fixed.sum()),'smoothingPasses':100,'equipmentVerticesRigidHand':len(equipment),'derivativeSeamCuts':meta['derivativeSeamCuts'],'weightSumMaxError':float(np.max(np.abs(ws.sum(axis=1)-1))),'method':'Continuous vertical torso/hood field with fitted arm capsules, preserved rigid bow/string anchors and seam-aware topological smoothing. Robed characters lower garment follows Hips; fitted arm capsule fields and seam-welded smoothing avoid transferred distant hand/leg islands.'}
meta['bodyWeightRepair']=report;meta['output']['sha256']=hashlib.sha256(output).hexdigest();meta['output']['bytes']=len(output)
(BASE/'derived'/f'{slug}-reskinned-rigging.json').write_text(json.dumps(meta,indent=2)+'\n')
(BASE/'ranger-grounding-exclusions.json').write_text(json.dumps(meta['groundingExclusions'],indent=2)+'\n')
(BASE/'ranger-reskin-qa.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
