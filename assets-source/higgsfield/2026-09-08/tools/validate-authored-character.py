"""Validate locally authored GLBs and derive sockets from the exact exported bones."""
import json,struct,sys
import numpy as np
from pathlib import Path

p=Path(sys.argv[1]);raw=p.read_bytes();pos=12;g=None;blob=None
while pos<len(raw):
    n,t=struct.unpack_from('<II',raw,pos);chunk=raw[pos+8:pos+8+n];pos+=8+n
    if t==0x4e4f534a:g=json.loads(chunk)
    elif t==0x004e4942:blob=chunk
types={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
dtypes={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
def accessor(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dim=types[a['type']];dt=np.dtype(dtypes[a['componentType']]);off=v.get('byteOffset',0)+a.get('byteOffset',0)
    arr=np.ndarray((a['count'],dim),dtype=dt,buffer=blob,offset=off,strides=(v.get('byteStride',dim*dt.itemsize),dt.itemsize)).copy()
    if a.get('normalized') and a['componentType']!=5126:arr=arr.astype(float)/np.iinfo(dt).max
    return arr
def matrix(n):
    if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
    x,y,z,w=n.get('rotation',[0,0,0,1]);s=n.get('scale',[1,1,1]);t=n.get('translation',[0,0,0]);m=np.eye(4)
    m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(s);m[:3,3]=t
    return m
parents={j:i for i,n in enumerate(g['nodes']) for j in n.get('children',[])}
world={}
def wm(i):
    if i not in world:world[i]=(wm(parents[i]) if i in parents else np.eye(4))@matrix(g['nodes'][i])
    return world[i]
vertices=triangles=unweighted=0;minsum=1;maxsum=1;maxinfluences=0;bounds=[];meshinfo=[]
for ni,n in enumerate(g['nodes']):
    if 'mesh' not in n:continue
    count=0
    for prim in g['meshes'][n['mesh']]['primitives']:
        attrs=prim['attributes'];ps=accessor(attrs['POSITION']);assert np.isfinite(ps).all();count+=len(ps);vertices+=len(ps)
        triangles+=(g['accessors'][prim['indices']]['count']//3 if 'indices' in prim else len(ps)//3)
        ws=accessor(attrs['WEIGHTS_0']);js=accessor(attrs['JOINTS_0']);assert np.isfinite(ws).all() and (ws>=0).all()
        assert 'skin' in n
        sums=ws.sum(axis=1);minsum=min(minsum,float(sums.min()));maxsum=max(maxsum,float(sums.max()));unweighted+=int((sums==0).sum());maxinfluences=max(maxinfluences,int((ws>1e-6).sum(axis=1).max()))
        assert np.max(abs(sums-1))<.0001
        skin=g['skins'][n['skin']];assert js.max()<len(skin['joints'])
        ibms=accessor(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
        homo=np.c_[ps,np.ones(len(ps))];out=np.zeros((len(ps),4))
        matrices=np.stack([wm(j)@ibms[k] for k,j in enumerate(skin['joints'])])
        for k in range(4):out+=np.einsum('nij,nj->ni',matrices[js[:,k]],homo)*ws[:,k:k+1]
        assert np.isfinite(out).all();bounds.extend(out[:,:3])
    meshinfo.append({'name':n.get('name'), 'vertices':count,'heldEquipment':n.get('extras',{}).get('heldEquipment',False)})
bounds=np.array(bounds)
provenance_path=p.with_name(p.stem.replace('-original','')+'-local-authorship.json');provenance=json.loads(provenance_path.read_text())
hand=next(i for i,n in enumerate(g['nodes']) if n.get('name')=='RightHand');inv=np.linalg.inv(wm(hand))
for key in ['contactBase','contactTip']:
    x,y,z=provenance[key+'Blender'];local=(inv@np.array([x,z,-y,1]))[:3]
    provenance[key+'ExportedRightHandLocal']=list(local)
provenance_path.write_text(json.dumps(provenance,indent=2))
report={'model':str(p),'bytes':len(raw),'bones':len(g['skins'][0]['joints']),'skinCount':len(g['skins']),'meshes':meshinfo,'vertices':vertices,'triangles':triangles,'weightsSumRange':[minsum,maxsum],'maxInfluences':maxinfluences,'unweightedVertices':unweighted,'finite':True,'restBounds':{'min':bounds.min(axis=0).tolist(),'max':bounds.max(axis=0).tolist()},'animations':[{'name':a.get('name'),'tracks':len(a['channels'])} for a in g.get('animations',[])],'contactBaseExportedRightHandLocal':provenance['contactBaseExportedRightHandLocal'],'contactTipExportedRightHandLocal':provenance['contactTipExportedRightHandLocal']}
p.with_suffix('.authored-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
