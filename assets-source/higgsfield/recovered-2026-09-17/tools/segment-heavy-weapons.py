"""Capture canonical geometry and review held club/cleaver masks; originals untouched."""
from pathlib import Path
import numpy as np,json,hashlib,io,sys
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]
ns={'__file__':str(R/'tools/qa-equipment-points.py')};exec((R/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns)
read,acc,world=ns['read'],ns['acc'],ns['world']
for slug in sys.argv[1:]:
 out=R/'review/animated'/slug;out.mkdir(parents=True,exist_ok=True);cache=out/'heavy-source-arrays.npz'
 if not cache.exists():
  j,b=read(R/'derived'/f'{slug}-rigged.glb');w=world(j);node=next(n for n in j['nodes'] if 'mesh'in n);p=j['meshes'][node['mesh']]['primitives'][0];a=p['attributes'];ps=acc(j,b,a['POSITION']);uv=acc(j,b,a['TEXCOORD_0']);h=np.c_[ps,np.ones(len(ps))];s=j['skins'][node['skin']];ib=acc(j,b,s['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);js=acc(j,b,a['JOINTS_0']);ws=acc(j,b,a['WEIGHTS_0']);mat=np.stack([w(jid)@ib[k]for k,jid in enumerate(s['joints'])]);v=np.zeros_like(h)
  for k in range(4):v+=np.einsum('nij,nj->ni',mat[js[:,k]],h)*ws[:,k:k+1]
  v=v[:,:3];oj,ob=read(R/'models'/f'{slug}-original.glb');op=oj['meshes'][0]['primitives'][0];t=acc(oj,ob,op['indices']).reshape(-1,3);assert len(v)==oj['accessors'][op['attributes']['POSITION']]['count']
  material=j['materials'][p['material']];tex=j['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']];image=j['images'][tex['source']];view=j['bufferViews'][image['bufferView']];im=np.array(Image.open(io.BytesIO(b[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB'));col=im[(uv[:,1]%1*(im.shape[0]-1)).astype(int),(uv[:,0]%1*(im.shape[1]-1)).astype(int)];np.savez(cache,v=v,t=t,col=col)
 d=np.load(cache);v,t,col=d['v'],d['t'],d['col'];x,y,z=v.T
 if slug=='ogre':
  cx=np.interp(y,[.14,.25,.35,.45,.55,.65,.75,.85],[-.24,-.26,-.32,-.40,-.49,-.61,-.71,-.79]);cz=np.interp(y,[.14,.25,.35,.45,.55,.65,.75,.85],[.64,.59,.55,.49,.40,.29,.18,.08]);rx=np.interp(y,[.14,.25,.35,.45,.55,.65,.75,.85],[.15,.20,.23,.23,.19,.12,.12,.07]);rz=np.interp(y,[.14,.25,.35,.45,.55,.65,.75,.85],[.13,.19,.22,.22,.17,.14,.14,.08]);rx+=np.where(y<.60,.06,.03);rz+=np.where(y<.60,.06,.07);mask=(y>.12)&(y<.9)&(abs(x-cx)<rx)&(abs(z-cz)<rz);mask|=(x>-.87)&(x<-.54)&(y>.60)&(y<.875)&(z>-.07)&(z<.35);mask&=~((y>.50)&(y<.65)&(z<.28)&(x>-.52));mask|=(x<-.73)&(x>-.97)&(y>.76)&(y<.90)&(z>-.28)&(z<.16);griprange=(.58,.96)
 else:
  mask=(x<-.45)&(y<.745)&(y>.38);griprange=(.64,.80)
 keys=np.round(v,5);selected={tuple(p)for p in keys[mask]};mask=np.array([tuple(p)in selected for p in keys]);counts=mask[t].sum(1);mixed=(counts>0)&(counts<3);atgrip=(v[t,1].min(1)>griprange[0])&(v[t,1].max(1)<griprange[1]);remove=mixed&~atgrip
 record={'schemaVersion':1,'slug':slug,'sourceCanonicalPositionSha256':hashlib.sha256(v.tobytes()).hexdigest(),'positionCount':len(v),'triangleCount':len(t),'hand':'RightHand','method':'Explicit canonical rest-space weapon and closed grip regions, reviewed from front and both sides. Coincident UV seam vertices unified. Original full triangle ordering retained for bridge IDs.','status':'Reviewed static front/right-side segmentation; pending animated delivery validation','rigidVertexSets':[{'mesh':0,'primitive':0,'vertices':np.where(mask)[0].tolist()}],'bridgeTriangleSets':[{'mesh':0,'primitive':0,'triangles':np.where(remove)[0].tolist()}],'retainBodyVertexSets':[{'mesh':0,'primitive':0,'vertices':np.where(~mask)[0].tolist()}],'gripYRange':griprange,'counts':{'rigidVertices':int(mask.sum()),'bridgeTriangles':int(remove.sum()),'mixedTrianglesAtGrip':int((mixed&atgrip).sum())}}
 (out/'staff-segmentation.json').write_text(json.dumps(record,indent=2)+'\n');print(slug,record['counts'])
 for axis,name in [(0,'front'),(2,'side'),(2,'right-side')]:
  im=Image.new('RGB',(900,1100),(25,29,34));dr=ImageDraw.Draw(im)
  def xy(a,b):return(round(450+a*440),round(1060-b*530))
  for value in np.arange(-1,1.01,.1):dr.line([xy(value,0),xy(value,1.9)],fill=(42,45,50));dr.text(xy(value,.01),f'{value:.1f}',fill='white')
  for value in np.arange(0,1.91,.1):dr.line([xy(-1,value),xy(1,value)],fill=(42,45,50));dr.text(xy(-1,value),f'{value:.1f}',fill='white')
  depth=2 if axis==0 else 0
  for ti in np.argsort(v[t,depth].mean(1)) if name!='right-side'else np.argsort(-v[t,depth].mean(1)):
   ids=t[ti];color=(240,40,25)if mask[ids].all()else(240,220,20)if remove[ti]else tuple(col[ids].mean(0).astype(int));dr.polygon([xy(v[i,axis],v[i,1])for i in ids],fill=color)
  dr.text((10,5),slug+' draft red weapon selection',fill='white');im.save(out/(name+'-heavy-mask.png'))
