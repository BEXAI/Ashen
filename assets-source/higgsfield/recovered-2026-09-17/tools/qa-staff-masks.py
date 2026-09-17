import sys,json,struct,io,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
R=Path(__file__).resolve().parents[1]
ns={'__file__':str(R/'tools/qa-equipment-points.py')};exec((R/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns)
for slug in sys.argv[1:]:
 path=R/'derived'/f'{slug}-rigged.glb';j,b=ns['read'](path);p=j['meshes'][0]['primitives'][0];v=ns['acc'](j,b,p['attributes']['POSITION']);t=ns['acc'](j,b,p['indices']).reshape(-1,3);uv=ns['acc'](j,b,p['attributes']['TEXCOORD_0']);mat=j['materials'][p['material']];tex=j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];bv=j['bufferViews'][j['images'][tex['source']]['bufferView']];im=Image.open(io.BytesIO(b[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB');tx=np.asarray(im);pixel=np.mod(uv,1)*np.array([im.width,im.height]);col=tx[pixel[:,1].astype(int),pixel[:,0].astype(int)];out=R/'review/animated'/slug
 for axis,name in [(0,'front'),(2,'side')]:
  sheet=Image.new('RGB',(900,1100),(25,29,34));dr=ImageDraw.Draw(sheet)
  def xy(a,y):return (round(450+a*500),round(1060-y*530))
  for a in np.arange(-.8,.81,.1):dr.line([xy(a,0),xy(a,2)],fill=(48,53,59));dr.text(xy(a,0),f'{a:.1f}',fill='white')
  for y in np.arange(0,2.01,.1):dr.line([xy(-.9,y),xy(.9,y)],fill=(48,53,59));dr.text(xy(-.88,y),f'{y:.1f}',fill='white')
  depth=2 if axis==0 else 0
  for ids in t[np.argsort(v[t,depth].mean(1))]:dr.polygon([xy(v[i,axis],v[i,1])for i in ids],fill=tuple(col[ids].mean(0).astype(int)))
  dr.text((10,5),slug+' '+name+' '+('X/Y'if axis==0 else'Z/Y'),fill='white');sheet.save(out/(name+'-geometry-grid.png'))
 np.savez(out/'staff-source-arrays.npz',v=v,t=t,col=col)
