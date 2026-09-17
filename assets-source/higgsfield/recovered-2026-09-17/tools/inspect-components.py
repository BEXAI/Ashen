import sys,json,struct
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
ns={'__file__':str(BASE/'tools/qa-equipment-points.py')};exec((BASE/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns);read,acc,world=ns['read'],ns['acc'],ns['world']
for slug in sys.argv[1:]:
 p=BASE/'derived'/f'{slug}-rigged.glb';j,b=read(p);w=world(j);rows=[]
 for ni,n in enumerate(j['nodes']):
  if 'mesh'not in n:continue
  for pi,pr in enumerate(j['meshes'][n['mesh']]['primitives']):
   a=pr['attributes'];ps=acc(j,b,a['POSITION']);skin=j['skins'][n['skin']];js=acc(j,b,a['JOINTS_0']);ws=acc(j,b,a['WEIGHTS_0']);ib=acc(j,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);mat=np.stack([w(jid)@ib[k] for k,jid in enumerate(skin['joints'])]);h=np.c_[ps,np.ones(len(ps))];out=np.zeros_like(h)
   for k in range(4):out+=np.einsum('nij,nj->ni',mat[js[:,k]],h)*ws[:,k:k+1]
   ps=out[:,:3];uniq,mapping=np.unique(np.round(ps,5),axis=0,return_inverse=True);parents=list(range(len(uniq)))
   def root(i):
    while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
    return i
   inds=acc(j,b,pr['indices']).reshape(-1,3)
   for triangle in inds:
    a,b1,c=map(lambda k:root(mapping[k]),triangle);parents[b1]=a;parents[c]=a
   comp={}
   for vi,wi in enumerate(mapping):comp.setdefault(root(wi),[]).append(vi)
   ordered=sorted(comp.values(),key=len,reverse=True)
   for ci,ids in enumerate(ordered):
    pp=ps[ids];rows.append({'component':ci,'mesh':n['mesh'],'primitive':pi,'vertexCount':len(ids),'min':pp.min(axis=0).tolist(),'max':pp.max(axis=0).tolist(),'vertices':ids})
 (BASE/'qa'/f'{slug}-components.json').write_text(json.dumps({'source':str(p),'components':rows},indent=2)+'\n');print(slug,[(x['component'],x['vertexCount'],np.round(x['min'],2).tolist(),np.round(x['max'],2).tolist()) for x in rows[:12]],flush=True)
