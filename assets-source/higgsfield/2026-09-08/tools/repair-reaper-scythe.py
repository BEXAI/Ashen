#!/usr/bin/env python3
"""Rigidly rebind the existing detached scythe without changing body or original GLB."""
from pathlib import Path
import hashlib,json,struct
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'models/reaper-original.glb';target=ROOT/'models/reaper-equipment-repaired.glb'
raw=source.read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+json_size]);binary=bytearray(raw[28+json_size:])
TYPES={5126:'<f4',5123:'<u2',5121:'u1'}
SIZES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def accessor(i):
 a=gltf['accessors'][i];v=gltf['bufferViews'][a['bufferView']];n=SIZES[a['type']];dtype=np.dtype(TYPES[a['componentType']]);stride=v.get('byteStride',n*dtype.itemsize)
 return np.ndarray((a['count'],n),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(stride,dtype.itemsize))
primitive=gltf['meshes'][0]['primitives'][0];attrs=primitive['attributes']
p=accessor(attrs['POSITION']);normals=accessor(attrs['NORMAL']);joints=accessor(attrs['JOINTS_0']);weights=accessor(attrs['WEIGHTS_0']);indices=accessor(primitive['indices']).reshape(-1)
original_positions=p.copy();original_normals=normals.copy();original_joints=joints.copy();original_weights=weights.copy()
# Connectivity must weld positions logically because hard-normal/UV seams duplicate vertices.
parent=list(range(len(p)))
def find(x):
 while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
 return x
seen={}
for i,point in enumerate(p):
 key=tuple(np.round(point,6));parent[find(i)]=find(seen.setdefault(key,i))
for face in indices.reshape(-1,3):
 a,b,c=map(find,face);parent[b]=a;parent[c]=a
components={}
for i in range(len(p)):components.setdefault(find(i),[]).append(i)
assert sorted(map(len,components.values()))==[683,28213], 'Unexpected source topology; review required.'
weapon=np.array(min(components.values(),key=len));body=np.array(max(components.values(),key=len));q=p[weapon].astype(np.float64)
hand_node=next(i for i,n in enumerate(gltf['nodes'])if n.get('name')=='RightHand');hand_joint=gltf['skins'][0]['joints'].index(hand_node)
inverse_bind=accessor(gltf['skins'][0]['inverseBindMatrices'])[hand_joint].reshape(4,4).T.astype(float)
# Observed shaft endpoints in bind-space metres. Estimate their centers from the existing geometry.
butt=q[q[:,1]>.99].mean(0)
head=q[(q[:,0]>-.20)&(q[:,1]<.075)].mean(0)
tip=q[np.argmin(q[:,0])]
up=(head-butt);up/=np.linalg.norm(up)
blade=tip-head;blade-=up*np.dot(blade,up);blade/=np.linalg.norm(blade)
normal=np.cross(up,blade);normal/=np.linalg.norm(normal)
source_basis=np.column_stack([up,blade,normal])
target_basis=np.column_stack([[0,1,0],[-1,0,0],[0,0,1]])
rotation=target_basis@source_basis.T
assert np.allclose(rotation.T@rotation,np.eye(3),atol=1e-6) and np.linalg.det(rotation)>.999
hand_weight=(weights*(joints==hand_joint)).sum(1)
palm=np.unique(p[np.setdiff1d(np.where(hand_weight>.8)[0],weapon)],axis=0)
grip=np.median(palm,axis=0).astype(float)
grip_source=head+(butt-head)*.43
scale=.9
def transform(points):return (points-grip_source)@rotation.T*scale+grip
p[weapon]=transform(q)
normals[weapon]=normals[weapon]@rotation.T
normals[weapon]/=np.maximum(np.linalg.norm(normals[weapon],axis=1,keepdims=True),1e-8)
joints[weapon]=[hand_joint,0,0,0];weights[weapon]=[1,0,0,0]
assert np.array_equal(p[body],original_positions[body])
assert np.array_equal(normals[body],original_normals[body])
assert np.array_equal(joints[body],original_joints[body])
assert np.array_equal(weights[body],original_weights[body])
assert len(indices)==61944 and np.all(np.isfinite(p))
pa=gltf['accessors'][attrs['POSITION']];pa['min']=p.min(0).tolist();pa['max']=p.max(0).tolist()
def hand_local(point):return (inverse_bind@np.r_[point,1])[:3].tolist()
contact_base=transform(head);contact_tip=transform(tip)
record={'operation':'Move existing disconnected scythe rigidly into right-hand palm; bind only its vertices to RightHand. No new weapon geometry.','source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(raw).hexdigest(),'derived':str(target.relative_to(ROOT)),'weaponVertexCount':len(weapon),'bodyVertexCount':len(body),'weaponTriangleCount':sum(all(int(v) in set(weapon) for v in f)for f in indices.reshape(-1,3)),'bodyPositionNormalJointWeightBytesUnchanged':True,'materialsTexturesUvsIndicesAnimationBytesUnchanged':True,'originalFileUnmodified':True,'gripSourceMetres':grip_source.tolist(),'gripTargetMetres':grip.tolist(),'sourceShaftButtMetres':butt.tolist(),'sourceShaftHeadMetres':head.tolist(),'rotation':rotation.tolist(),'weaponScale':scale,'handNode':hand_node,'handJointIndex':hand_joint,'contactSockets':{'parent':'RightHand','units':'source hand-local centimetres; preserve through normalized rig wrapper','base':hand_local(contact_base),'tip':hand_local(contact_tip),'purpose':'Chord across actual blade from shaft/blade junction to blade tip'},'bounds':{'min':pa['min'],'max':pa['max']}}
record['weaponGeometry']={'meshIndex':0,'primitiveIndex':0,'vertexIndices':weapon.tolist(),'purpose':'Exclude these indices from body-only grounding calculations before optimization or topology remapping.'}
gltf.setdefault('extras',{})['equipmentRepair']={'type':'rigid-hand-rebind','component':'scythe','bone':'RightHand','vertexCount':len(weapon),'sourceSha256':record['sourceSha256']}
text=json.dumps(gltf,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
output=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
target.write_bytes(output);record.update(derivedSha256=hashlib.sha256(output).hexdigest(),derivedBytes=len(output))
assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sourceSha256']
(ROOT/'models/reaper-equipment-repair.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
