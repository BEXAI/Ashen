"""Explicit reviewed staff regions in canonical rest positions; originals untouched."""
from pathlib import Path
import numpy as np,json,hashlib,sys
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]
for slug in sys.argv[1:]:
 out=R/'review/animated'/slug;d=np.load(out/'staff-source-arrays.npz');v,t,col=d['v'],d['t'],d['col'];x,y,z=v.T
 if slug=='frost-mage':
  cx=np.interp(y,[0,.5,1.,1.35],[-.267,-.311,-.389,-.441]);cz=np.interp(y,[0,.5,1.,1.35],[-.027,.035,.110,.185]);shaft=((x-cx)**2+(z-cz)**2<.028**2)&(y<1.4);ornament=((y>1.09)&(x<-.375)&(z>.05))|((y>1.4)&(x<-.34)&(z>.115));grip=(y>.967)&(y<1.06)&(x<-.353)&(z>.034);griprange=(.935,1.085)
 elif slug=='sage':
  cx=np.interp(y,[0,.45,.85,1.2,1.55],[.324,.35,.379,.407,.437]);cz=np.interp(y,[0,.45,.85,1.2,1.55],[-.065,.014,.083,.147,.19]);shaft=((x-cx)**2+(z-cz)**2<.048**2)&(y<1.55);ornament=(y>1.39)&(x>.36)&(z>.105);grip=(y>1.1)&(y<1.245)&(x>.371)&(z>.105);griprange=(1.075,1.275)
 elif slug=='lich':
  cx=-.328-.101*y;cz=.162+.078*y;shaft=((x-cx)**2+(z-cz)**2<.04**2)&(y<1.48);ornament=(y>1.30)&(x<-.405)&(z>.205);grip=(y>1.145)&(y<1.26)&(x<-.406)&(z>.19);griprange=(1.115,1.285)
 else:raise ValueError(slug)
 mask=shaft|ornament|grip;cnt=mask[t].sum(1);cross=(cnt>0)&(cnt<3);keepgrip=((v[t,1].min(1)>griprange[0])&(v[t,1].max(1)<griprange[1]));remove=cross&~keepgrip
 # Keep same-position UV-seam vertices together.
 keys=np.round(v,5);selected={tuple(p)for p in keys[mask]};mask=np.array([tuple(p)in selected for p in keys]);cnt=mask[t].sum(1);cross=(cnt>0)&(cnt<3);remove=cross&~keepgrip
 for axis,name in [(0,'front'),(2,'side')]:
  im=Image.new('RGB',(900,1100),(25,29,34));dr=ImageDraw.Draw(im)
  def xy(a,y):return(round(450+a*500),round(1060-y*530))
  depth=2 if axis==0 else 0
  for ti in np.argsort(v[t,depth].mean(1)):
   ids=t[ti];color=(240,40,25) if mask[ids].all()else(240,220,20)if remove[ti]else tuple((col[ids].mean(0)*.7).astype(int));dr.polygon([xy(v[i,axis],v[i,1])for i in ids],fill=color)
  dr.text((10,5),slug+' red = rigid staff/grip; yellow = proposed fused seam removal',fill='white');im.save(out/(name+'-staff-mask.png'))
 record={'schemaVersion':1,'slug':slug,'sourceCanonicalPositionSha256':hashlib.sha256(v.tobytes()).hexdigest(),'positionCount':len(v),'triangleCount':len(t),'hand':'LeftHand'if slug=='sage'else'RightHand','method':'Explicit reviewed canonical rest-space shaft, ornament, and grip regions. Coincident UV-seam vertices are unified. Mixed staff/body triangles outside the articulated grip are identified as fused bridge faces; no source meshes changed.','status':'DRAFT pending visual review','rigidVertexSets':[{'mesh':0,'primitive':0,'vertices':np.where(mask)[0].tolist()}],'bridgeTriangleSets':[{'mesh':0,'primitive':0,'triangles':np.where(remove)[0].tolist()}],'retainBodyVertexSets':[{'mesh':0,'primitive':0,'vertices':np.where(~mask)[0].tolist()}],'gripYRange':griprange,'counts':{'rigidVertices':int(mask.sum()),'bridgeTriangles':int(remove.sum()),'mixedTrianglesAtGrip':int((cross&keepgrip).sum())}}
 (out/'staff-segmentation.json').write_text(json.dumps(record,indent=2)+'\n');print(slug,record['counts'])
