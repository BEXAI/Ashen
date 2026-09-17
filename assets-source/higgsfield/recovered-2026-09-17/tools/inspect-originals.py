from pathlib import Path
import json,struct,hashlib,io
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
inv=json.loads((ROOT/'inventory.json').read_text())
def inspect(path):
 data=path.read_bytes(); at=12; js=None; binary=None
 while at<len(data):
  length,kind=struct.unpack_from('<II',data,at); chunk=data[at+8:at+8+length]
  if kind==0x4e4f534a:js=json.loads(chunk)
  elif kind==0x004e4942:binary=chunk
  at+=8+length
 assert at==len(data) and js is not None
 def accessor(i):
  a=js['accessors'][i];v=js['bufferViews'][a['bufferView']];dt={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',np.dtype(dt).itemsize*w)
  return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=off,strides=(stride,np.dtype(dt).itemsize)).copy()
 def local(n):
  if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
  x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],float);m[:3,:3]*=np.array(n.get('scale',[1,1,1]))[None,:];m[:3,3]=n.get('translation',[0,0,0]);return m
 worlds={}
 def walk(idx,parent):
  n=js['nodes'][idx];worlds[idx]=parent@local(n)
  for child in n.get('children',[]):walk(child,worlds[idx])
 for idx in js['scenes'][js.get('scene',0)]['nodes']:walk(idx,np.eye(4))
 points=[];geometry=[]
 for idx,n in enumerate(js.get('nodes',[])):
  if 'mesh' not in n or idx not in worlds:continue
  for pi,p in enumerate(js['meshes'][n['mesh']]['primitives']):
   a=accessor(p['attributes']['POSITION']);assert np.isfinite(a).all();world=np.einsum('ij,nj->ni',worlds[idx],np.c_[a,np.ones(len(a))])
   if 'skin' in n:
    skin=js['skins'][n['skin']];ibms=accessor(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);joint=accessor(p['attributes']['JOINTS_0']).astype(int);weight=accessor(p['attributes']['WEIGHTS_0']);weight=weight/weight.sum(axis=1,keepdims=True);mats=np.array([worlds[j]@ibms[k] for k,j in enumerate(skin['joints'])]);v=np.c_[a,np.ones(len(a))];world=np.zeros_like(v)
    for influence in range(joint.shape[1]):world+=np.einsum('nij,nj->ni',mats[joint[:,influence]],v)*weight[:,influence,None]
   assert np.isfinite(world).all();points.append(world[:,:3]);inds=accessor(p['indices']) if 'indices' in p else None
   geometry.append({'node':n.get('name',str(idx)),'mesh':n['mesh'],'primitive':pi,'vertices':len(a),'triangles':int(len(inds)//3 if inds is not None else len(a)//3),'attributes':list(p['attributes']),'mode':p.get('mode',4),'material':p.get('material')})
 allpoints=np.concatenate(points);minimum=allpoints.min(axis=0);maximum=allpoints.max(axis=0)
 images=[]
 for image in js.get('images',[]):
  v=js['bufferViews'][image['bufferView']] if 'bufferView'in image else None
  im=Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])) if v else None
  if im:im.load()
  images.append({'name':image.get('name'),'mimeType':image.get('mimeType'),'dimensions':list(im.size) if im else None,'externalUri':image.get('uri')})
 anim=[]
 for a in js.get('animations',[]):
  times=[accessor(s['input']) for s in a['samplers']];anim.append({'name':a.get('name'),'channels':len(a['channels']),'duration':float(max(t.max() for t in times)-min(t.min() for t in times))})
 return {'path':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'nodes':len(js.get('nodes',[])),'meshes':len(js.get('meshes',[])),'triangles':sum(p['triangles'] for p in geometry),'vertices':sum(p['vertices'] for p in geometry),'geometry':geometry,'materials':js.get('materials',[]),'images':images,'skins':[{'name':s.get('name'),'boneCount':len(s['joints']),'boneNames':[js['nodes'][i].get('name',str(i)) for i in s['joints']]} for s in js.get('skins',[])],'animations':anim,'extensions':js.get('extensionsUsed',[]),'worldBoundsGltfMeters':{'min':minimum.tolist(),'max':maximum.tolist(),'dimensions':(maximum-minimum).tolist(),'note':'Static node transforms applied; skinned meshes use weighted joint world matrices and inverse bind matrices, before sampling animation. Provider physical units are not independently guaranteed.'},'externalUris':[x['uri'] for group in ['images','buffers'] for x in js.get(group,[]) if 'uri'in x]}
report={'schemaVersion':1,'models':[],'notes':['All values derive from original binary bytes. Models are preserved unmodified.','glTF coordinates: X width, Y vertical, Z depth. Bounds include held equipment, wings and tail.','Source images mapped by exact original generation input asset ID.','No facing direction is claimed without render inspection.']}
for asset in inv['assets']:
 item=inspect(Path(asset['path']));item.update({'slug':asset['slug'],'jobId':asset['jobId'],'sourceImagePath':asset['sourceImagePath'],'sourceArtworkAssetId':asset['sourceArtwork']['assetId']});report['models'].append(item);print(json.dumps({'slug':item['slug'],'triangles':item['triangles'],'bones':[s['boneCount'] for s in item['skins']],'animations':item['animations'],'bounds':item['worldBoundsGltfMeters']['dimensions'],'imageSizes':[i['dimensions'] for i in item['images']]}))
(ROOT/'original-metadata.json').write_text(json.dumps(report,indent=2)+'\n')
