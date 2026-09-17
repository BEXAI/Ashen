import json,struct,math,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
BASE=Path(__file__).resolve().parent.parent
NAMES=['ogre','goblin','sage','lich','reaper','ranger','skeleton-warrior','frost-mage']
def read(p):
 b=p.read_bytes();j=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]]);k=20+struct.unpack_from('<I',b,12)[0];return j,b[k+8:k+8+struct.unpack_from('<I',b,k)[0]]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];d={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];t=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]);return np.ndarray((a['count'],d),dtype=t,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',d*t.itemsize),t.itemsize)).copy()
def world(j):
 parents={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])};cache={}
 def w(i):
  if i in cache:return cache[i]
  n=j['nodes'][i]
  if 'matrix'in n:m=np.array(n['matrix']).reshape(4,4).T
  else:
   x,y,z,v=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*v),2*(x*z+y*v)],[2*(x*y+z*v),1-2*(x*x+z*z),2*(y*z-x*v)],[2*(x*z-y*v),2*(y*z+x*v),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
  cache[i]=(w(parents[i]) if i in parents else np.eye(4))@m;return cache[i]
 return w
for slug in NAMES:
 p=BASE/'derived'/f'{slug}-rigged.glb'
 if not p.exists():p=BASE/'models'/f'{slug}-original.glb'
 j,b=read(p);w=world(j);im=Image.new('RGB',(640,800),(25,29,34));dr=ImageDraw.Draw(im)
 def xy(x,y):return (int(320+x*270),int(760-y*380))
 for x in np.arange(-1,1.01,.1):dr.line([xy(x,0),xy(x,1.9)],fill=(48,53,59));dr.text(xy(x,0),f'{x:.1f}',fill='white')
 for y in np.arange(0,1.91,.1):dr.line([xy(-1,y),xy(1,y)],fill=(48,53,59));dr.text(xy(-1.1,y),f'{y:.1f}',fill='white')
 for ni,n in enumerate(j['nodes']):
  if 'mesh' not in n:continue
  for p in j['meshes'][n['mesh']]['primitives']:
   a=p['attributes'];ps=acc(j,b,a['POSITION']);uv=acc(j,b,a['TEXCOORD_0']);h=np.c_[ps,np.ones(len(ps))]
   if 'skin'in n:
    s=j['skins'][n['skin']];ib=acc(j,b,s['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);js=acc(j,b,a['JOINTS_0']);ws=acc(j,b,a['WEIGHTS_0']);mat=np.stack([w(jid)@ib[k] for k,jid in enumerate(s['joints'])]);out=np.zeros_like(h)
    for k in range(4):out+=np.einsum('nij,nj->ni',mat[js[:,k]],h)*ws[:,k:k+1]
    ps=out[:,:3]
   else:ps=(w(ni)@h.T).T[:,:3]
   m=j['materials'][p['material']];ti=m.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index');texture=None
   if ti is not None:
    source=j['textures'][ti]['source'];v=j['bufferViews'][j['images'][source]['bufferView']];texture=np.array(Image.open(io.BytesIO(b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB'))
   for i in np.argsort(ps[:,2]):
    x,y=xy(*ps[i,:2]);color=(180,180,180) if texture is None else tuple(texture[min(texture.shape[0]-1,int(uv[i,1]%1*texture.shape[0])),min(texture.shape[1]-1,int(uv[i,0]%1*texture.shape[1]))]);dr.ellipse((x-1,y-1,x+1,y+1),fill=color)
 dr.text((5,5),slug+' / canonical world coordinates',fill='white');im.save(BASE/'review'/f'{slug}-equipment-points.png')
