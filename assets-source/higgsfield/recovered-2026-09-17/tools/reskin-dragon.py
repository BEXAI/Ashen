"""Coherent anatomical weights for the unchanged recovered dragon surface."""
import json,struct,hashlib,math
from pathlib import Path
import numpy as np
import bpy
from mathutils import Matrix,Vector,Quaternion
R=Path(__file__).resolve().parents[1];source=R/'derived/ember-dragon-rigged.glb';raw=source.read_bytes();ns={'__file__':str(R/'tools/qa-equipment-points.py')};exec((R/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns);j,b=ns['read'](source);acc=lambda i:ns['acc'](j,b,i);world=ns['world'](j);skin=j['skins'][0];nodes=skin['joints'];names=[j['nodes'][i]['name']for i in nodes];ix={n:i for i,n in enumerate(names)};old=[world(i)for i in nodes];bone=np.array([m[:3,3]for m in old]);rot=[Matrix(m[:3,:3].tolist()).to_quaternion()for m in old]
land={'Hips':[0,.68,-.08],'Spine02':[0,.83,-.02],'Spine01':[0,.98,.015],'Spine':[0,1.135,.04],'neck':[0,1.255,.085],'Head':[0,1.39,.16],'head_end':[0,1.55,.13],'headfront':[0,1.29,.41]}
for side,sign in [('Left',1),('Right',-1)]:
 land.update({side+'Shoulder':[sign*.12,1.16,.025],side+'Arm':[sign*.225,1.14,.035],side+'ForeArm':[sign*.315,.91,.10],side+'Hand':[sign*.365,.735,.17],side+'UpLeg':[sign*.155,.66,-.02],side+'Leg':[sign*.24,.40,.075],side+'Foot':[sign*.295,.13,.14],side+'ToeBase':[sign*.31,.048,.30]})
for name,p in land.items():bone[ix[name]]=p
for side in ['Left','Right']:
 for a,c in [(side+'Arm',side+'ForeArm'),(side+'ForeArm',side+'Hand'),(side+'UpLeg',side+'Leg'),(side+'Leg',side+'Foot'),(side+'Foot',side+'ToeBase')]:
  ai,ci=ix[a],ix[c];before=Vector((old[ci][:3,3]-old[ai][:3,3]).tolist()).normalized();after=Vector((bone[ci]-bone[ai]).tolist()).normalized();rot[ai]=before.rotation_difference(after)@rot[ai]
new=[]
for p,q in zip(bone,rot):m=q.to_matrix().to_4x4();m.translation=Vector(p.tolist());new.append(np.array(m))
parents={c:i for i,n in enumerate(j['nodes'])for c in n.get('children',[])}
for ni,idx in enumerate(nodes):
 parent=parents.get(idx);m=np.linalg.inv(new[nodes.index(parent)])@new[ni]if parent in nodes else new[ni];mat=Matrix(m.tolist());n=j['nodes'][idx];n.pop('matrix',None);n['translation']=list(mat.to_translation());q=mat.to_quaternion();n['rotation']=[q.x,q.y,q.z,q.w];n['scale']=[1,1,1]
p=j['meshes'][0]['primitives'][0];ps=acc(p['attributes']['POSITION']);tri=acc(p['indices']).reshape(-1,3);unique,inverse=np.unique(np.round(ps,5),axis=0,return_inverse=True);points=unique;N=len(points);x,y,z=points.T;ax=np.abs(x);W=np.zeros((N,len(names)),np.float32);fixed=np.zeros(N,bool)
spine=[ix[n]for n in ['Hips','Spine02','Spine01','Spine','neck','Head']]
for vi,v in enumerate(points):
 below=[q for q in spine if bone[q,1]<=v[1]];a=below[-1]if below else spine[0];ai=spine.index(a);c=spine[min(ai+1,len(spine)-1)];u=np.clip((v[1]-bone[a,1])/max(bone[c,1]-bone[a,1],1e-6),0,1)if a!=c else 0;W[vi,a]=1-u;W[vi,c]+=u
# Distinct source appendages: rigid dorsal wings on chest, coiled tail on hips.
wingBoundary=np.interp(y,[0,.12,.65,1.10,1.25,1.4,1.85],[.44,.44,.425,.31,.205,.26,.27])
wing=((ax>wingBoundary)&(z<.125)&(z>-.47)&(y>.06))|((ax>.52)&(y>.17))|(y>1.56)
tail=(((z<-.28)&(y<.72))|((y<.16)&(z<-.055)))&~wing
head=(((y>1.345)&(y<1.56)&(ax<.225)&(z>.02))|((y>1.075)&(ax<.25)&(z>.18)))&~wing&~tail
for mask,bn in [(wing,'Hips'),(tail,'Hips'),(head,'Head')]:W[mask]=0;W[mask,ix[bn]]=1;fixed[mask]=True
# Coherent arm and leg capsule fields; blend only local adjacent anatomical bones.
chainMasks=[]
for side,sign in [('Left',1),('Right',-1)]:
 for family,bns,region,radius in [('arm',['Arm','ForeArm','Hand'],(x*sign>.18)&(y>.49)&(y<1.22)&(z>-.08),.135),('leg',['UpLeg','Leg','Foot','ToeBase'],(x*sign>.13)&(x*sign<.46)&(y<.70)&(z>-.09),.15)]:
  ids=[ix[side+n]for n in bns];dist=[]
  for ai,ci in zip(ids[:-1],ids[1:]):
   delta=bone[ci]-bone[ai];t=np.clip(((points-bone[ai])@delta)/(delta@delta),0,1);dist.append(np.linalg.norm(points-(bone[ai]+t[:,None]*delta),axis=1))
  dist.append(np.linalg.norm(points-bone[ids[-1]],axis=1));dist=np.array(dist).T;near=dist.min(1);strength=np.exp(-(near/radius)**4);eligible=region&~fixed
  # Fixed wing vertices never inherit adjacent forearm motion.
  local=1/(dist**2+.004)**2;local/=local.sum(1,keepdims=True)
  for i in np.where(eligible)[0]:
   amount=float(strength[i]);W[i]*=1-amount
   for k,bi in enumerate(ids):W[i,bi]+=amount*local[i,k]
   if near[i]<.065:fixed[i]=True
 # Actual claws/cuffs and hanging chains follow the corresponding hand, not pelvis/wing islands.
 hand=(x*sign>.29)&(x*sign<.465)&(y>.49)&(y<.83)&(z>.085)
 chain=(x*sign>.333)&(x*sign<.475)&(y<.55)&(y>.14)&(z>.11)&~wing&~tail
 chainMasks.append(chain)
 W[hand|chain]=0;W[hand|chain,ix[side+'Hand']]=1;fixed[hand|chain]=True
# Preserve central torso, muzzle, wing membrane, tail and claw anchor weights during seam smoothing.
fixed|=(ax<.12)&(y>.73)&(y<1.15)&(z>-.10)
chainMask=np.logical_or.reduce(chainMasks)[inverse];mixed=chainMask[tri].sum(1);bridgeFaces=(mixed>0)&(mixed<3)&(ps[tri,1].max(1)<.24)
kept=tri[~bridgeFaces]
fixed[(ax>.17)&(ax<.335)&(y>1.08)&(y<1.33)&(z>-.13)&~head]=False
fixed[(y>1.015)&(y<1.17)&(z>.17)&(z<.34)&~wing&~tail]=False
edges=np.concatenate([inverse[kept[:,[0,1]]],inverse[kept[:,[1,2]]],inverse[kept[:,[2,0]]]]);edges=np.unique(np.sort(edges,axis=1),axis=0);adj=[set()for _ in range(N)]
for a,c in edges:
 if a!=c:adj[a].add(c);adj[c].add(a)
width=max(map(len,adj));neighbors=np.repeat(np.arange(N)[:,None],width,1);valid=np.zeros((N,width),np.float32)
for i,a in enumerate(adj):neighbors[i,:len(a)]=list(a);valid[i,:len(a)]=1
den=np.maximum(valid.sum(1,keepdims=True),1);anchors=W.copy()
for step in range(65):W=.45*W+.55*(W[neighbors]*valid[:,:,None]).sum(1)/den;W[fixed]=anchors[fixed]
chainMask=np.logical_or.reduce(chainMasks)[inverse];mixed=chainMask[tri].sum(1);bridgeFaces=(mixed>0)&(mixed<3)&(ps[tri,1].max(1)<.24)
W=W[inverse];js=np.argsort(W,axis=1)[:,-4:][:,::-1];ws=np.take_along_axis(W,js,axis=1);ws/=ws.sum(1,keepdims=True);assert np.isfinite(ws).all();parts=[b];size=len(b)
def append(a,typ,ct):
 global size
 a=np.asarray(a,dtype='<f4'if ct==5126 else'<u4'if ct==5125 else'<u2');pad=(-size)%4
 if pad:parts.append(bytes(pad));size+=pad
 data=a.tobytes();vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':size,'byteLength':len(data)});parts.append(data);size+=len(data);ai=len(j['accessors']);j['accessors'].append({'bufferView':vi,'componentType':ct,'type':typ,'count':len(a)});return ai
p['indices']=append(tri[~bridgeFaces].reshape(-1,1),'SCALAR',5125)
skin['inverseBindMatrices']=append(np.array([np.linalg.inv(m).T.reshape(-1)for m in new]),'MAT4',5126);p['attributes']['JOINTS_0']=append(js,'VEC4',5123);p['attributes']['WEIGHTS_0']=append(ws,'VEC4',5126);j['buffers'][0]['byteLength']=size;encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary=b''.join(parts);binary+=bytes((-len(binary))%4);output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary;dest=R/'derived/ember-dragon-reskinned.glb';dest.write_bytes(output)
report={'schemaVersion':1,'input':str(source.relative_to(R)),'inputSha256':hashlib.sha256(raw).hexdigest(),'output':str(dest.relative_to(R)),'outputSha256':hashlib.sha256(output).hexdigest(),'method':'Anatomical fitted joint pivots and continuous body capsule weights. Dorsal wings and coiled tail share a coherent pelvic appendage frame, claws/cuffs/chains to corresponding hand. Seam-aware smoothing on welded geometry. Original positions, UVs and texture maps unchanged. Explicit chain-to-floor fused bridge faces removed in derivative only.','sourceGeometryUntouched':False,'originalSourceUntouched':True,'sourcePositionsUVTexturesUnchanged':True,'removedFusedChainBridgeTriangles':np.where(bridgeFaces)[0].tolist(),'vertices':len(ps),'triangles':int((~bridgeFaces).sum()),'jointLandmarks':land,'rigidWingVertices':int(wing[inverse].sum()),'rigidTailVertices':int(tail[inverse].sum()),'smoothingPasses':65,'maximumWeightSumError':float(abs(ws.sum(1)-1).max()),'wingVertexIds':np.where(wing[inverse])[0].tolist(),'tailVertexIds':np.where(tail[inverse])[0].tolist()};(R/'dragon-reskin-qa.json').write_text(json.dumps(report,indent=2)+'\n');metaPath=R/'derived/ember-dragon-rigging.json';meta=json.loads(metaPath.read_text());meta['reskin']=report;metaPath.write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if not k.endswith('VertexIds')}))
