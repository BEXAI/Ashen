"""Rigidify only measured held props, retain triangles/textures, and author sockets.

Selection polylines were measured from the recovered mesh front/quarter views.
Each 2D seed is snapped onto the original surface in 3D; capsules are explicit,
recorded selection masks rather than new geometry.
"""
import sys,json,struct,hashlib,importlib.util
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('geometry',BASE/'tools/qa-equipment-points.py')
# Import definitions without its report loop.
ns={'__file__':str(BASE/'tools/qa-equipment-points.py')};exec((BASE/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns)
read,acc,world=ns['read'],ns['acc'],ns['world']
SETTINGS={
 'ogre':{'hand':'RightHand','lines':[([[-.80,.82],[-.65,.68],[-.49,.5]],.095),([[-.49,.5],[-.37,.37],[-.28,.26]],.16)],'base':[-.62,.65],'tip':[-.29,.27]},
 'goblin':{'hand':'RightHand','lines':[([[-.72,.67],[-.64,.60],[-.64,.50]],.10)],'base':[-.65,.63],'tip':[-.63,.49]},
 'sage':{'hand':'LeftHand','lines':[([[.32,.02],[.37,.73],[.40,1.16],[.43,1.55],[.45,1.70]],.044)],'base':[.40,1.17],'tip':[.45,1.68],'muzzle':[.45,1.68]},
 'lich':{'hand':'RightHand','lines':[([[-.36,.05],[-.40,.63],[-.46,1.18],[-.50,1.53],[-.51,1.68]],.046)],'base':[-.46,1.18],'tip':[-.51,1.66],'muzzle':[-.51,1.66]},
 'frost-mage':{'hand':'RightHand','lines':[([[-.33,.44],[-.37,.78],[-.42,1.08],[-.46,1.39],[-.50,1.62]],.055)],'base':[-.42,1.08],'tip':[-.50,1.61],'muzzle':[-.50,1.61]},
 'reaper':{'hand':'RightHand','lines':[([[-.56,1.55],[-.27,1.28],[.15,1.00],[.50,.83]],.043),([[-.56,1.55],[-.63,1.40],[-.70,1.21],[-.74,1.03],[-.72,.90],[-.69,.83]],.07)],'base':[-.56,1.51],'tip':[-.69,.84]},
 'ranger':{'hand':'LeftHand','lines':[([[.18,.94],[.29,1.03],[.40,1.22]],.035),([[.18,.94],[.36,.88],[.42,.95],[.40,1.22]],.044)],'base':[.38,.92],'tip':[.40,1.2],'muzzle':[.38,.95]},
 'skeleton-warrior':{'hand':'RightHand','lines':[([[-.62,1.01],[-.54,.92],[-.35,.68],[-.17,.46]],.095)],'base':[-.52,.88],'tip':[-.17,.46],'secondary':{'hand':'LeftHand','region':[.14,.54,.65,1.32]}},
}
def sha(b):return hashlib.sha256(b).hexdigest()
for slug in sys.argv[1:]:
 cfg=SETTINGS[slug];exactPath=BASE/'review/animated'/slug/'staff-segmentation.json';exactPath=exactPath if exactPath.exists() else BASE/'review/animated'/slug/'equipment-segmentation.json';exact=json.loads(exactPath.read_text()) if exactPath.exists() else None;source=BASE/'derived'/f'{slug}-rigged.glb'
 if not source.exists():source=BASE/'models'/f'{slug}-original.glb'
 sourcebytes=source.read_bytes();j,b=read(source);w=world(j);skin=j['skins'][0];joints=skin['joints'];names=[j['nodes'][x]['name'] for x in joints];hand=names.index(cfg['hand']);ib=acc(j,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);parts=[b];length=len(b)
 def append(array,typ,component=5126):
  global length
  array=np.asarray(array,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);pad=(-length)%4
  if pad:parts.append(b'\0'*pad);length+=pad
  by=array.tobytes();vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':length,'byteLength':len(by)});parts.append(by);length+=len(by);ai=len(j['accessors']);j['accessors'].append({'bufferView':vi,'componentType':component,'count':len(array),'type':typ});return ai
 rows=[]
 for ni,n in enumerate(j['nodes']):
  if 'mesh' not in n:continue
  for pi,p in enumerate(j['meshes'][n['mesh']]['primitives']):
   a=p['attributes'];ps=acc(j,b,a['POSITION']);js=acc(j,b,a['JOINTS_0']);ws=acc(j,b,a['WEIGHTS_0']);h=np.c_[ps,np.ones(len(ps))];mat=np.stack([w(jid)@ib[k] for k,jid in enumerate(joints)]);out=np.zeros_like(h)
   for k in range(4):out+=np.einsum('nij,nj->ni',mat[js[:,k]],h)*ws[:,k:k+1]
   rows.append({'mesh':n['mesh'],'primitive':pi,'a':a,'points':out[:,:3],'joints':js,'weights':ws,'prim':p})
 allpoints=np.concatenate([r['points'] for r in rows])
 def snap(seed):
  dist=np.linalg.norm(allpoints[:,:2]-seed,axis=1);ids=np.argpartition(dist,min(30,len(dist)-1))[:30];close=allpoints[ids];z=np.quantile(close[:,2],.55);return np.median(close[close[:,2]>=z],axis=0)
 snapped=[([snap(v) for v in line],radius) for line,radius in cfg['lines']]
 if slug=='ranger':
  paths=[([[.18,.94,-.45],[.27,.87,-.2],[.36,.88,.05],[.39,.97,.24],[.40,1.22,.48]],.026),([[.18,.94,-.45],[.40,1.22,.48]],.013)]
  snapped=[([allpoints[np.argmin(np.linalg.norm(allpoints-np.array(v),axis=1))]for v in line],radius)for line,radius in paths]
 selected=[];counts=[];allBody=[];removedTriangles=[];groups=[]
 for row in rows:
  ps=row['points'];mask=np.zeros(len(ps),dtype=bool)
  for points,radius in snapped:
   for a,bb in zip(points[:-1],points[1:]):
    delta=bb-a;t=np.clip(np.einsum('ij,j->i',ps-a,delta)/max(float(np.sum(delta*delta)),1e-12),0,1);distance=np.linalg.norm(ps-(a+t[:,None]*delta),axis=1);mask|=distance<radius
  if exact:
   mask[:]=False
   for item in exact['rigidVertexSets']:
    if item['mesh']==row['mesh'] and item['primitive']==row['primitive']:mask[item['vertices']]=True
  row['joints'][mask]=[hand,0,0,0];row['weights'][mask]=[1,0,0,0]
  groups.append({'mesh':row['mesh'],'primitive':row['primitive'],'hand':cfg['hand'],'vertices':np.where(mask)[0].tolist()})
  if 'secondary'in cfg:
   sc=cfg['secondary'];x0,x1,y0,y1=sc['region'];secondary=(ps[:,0]>x0)&(ps[:,0]<x1)&(ps[:,1]>y0)&(ps[:,1]<y1);si=names.index(sc['hand']);row['joints'][secondary]=[si,0,0,0];row['weights'][secondary]=[1,0,0,0];groups.append({'mesh':row['mesh'],'primitive':row['primitive'],'hand':sc['hand'],'vertices':np.where(secondary)[0].tolist()});mask|=secondary

  activeIndices=acc(j,b,row['prim']['indices']).reshape(-1,3)
  if exact or slug in ['ogre','goblin','skeleton-warrior']:
   indices=acc(j,b,row['prim']['indices']).reshape(-1,3);labels=mask[indices];mixed=labels.any(axis=1)&~labels.all(axis=1);
   if exact:
    mixed[:]=False
    for item in exact.get('bridgeTriangleSets',[])+exact.get('lowerShaftRepair',{}).get('removeExistingShaftTriangleSets',[]):
     if item['mesh']==row['mesh'] and item['primitive']==row['primitive']:mixed[item['triangles']]=True
   removed=np.where(mixed)[0];removedTriangles.append({'mesh':row['mesh'],'primitive':row['primitive'],'triangleIds':removed.tolist(),'count':len(removed),'sourceTriangleCount':len(indices)});activeIndices=indices[~mixed];row['prim']['indices']=append(activeIndices.reshape(-1,1),'SCALAR',5125)
  used=np.zeros(len(ps),dtype=bool);used[activeIndices.reshape(-1)]=True;groundMask=mask|~used
  ids=np.where(groundMask)[0];selected.append({'mesh':row['mesh'],'primitive':row['primitive'],'vertices':ids.tolist()});counts.append(len(ids));allBody.append(ps[~groundMask]);row['a']['JOINTS_0']=append(row['joints'],'VEC4',5123);row['a']['WEIGHTS_0']=append(row['weights'],'VEC4')
 inverse=np.linalg.inv(w(joints[hand]));local=lambda v:((inverse@np.r_[v,1])[:3]).tolist();cb=snap(cfg['base']);ct=snap(cfg['tip']);muzzle=snap(cfg['muzzle']) if 'muzzle'in cfg else None
 # The left-handed Sage uses the same native staff cast mirrored for its actual grip.
 metadataPath=BASE/'derived'/f'{slug}-rigging.json';meta=json.loads(metadataPath.read_text()) if metadataPath.exists() else {'schemaVersion':1,'method':'Existing provider skeleton preserved; rigid staff weight mask and measured contact/muzzle sockets appended.','source':{'path':str(source.relative_to(BASE)),'sha256':sha(sourcebytes)}}
 meta.update(equipment={'mode':'embedded','hand':cfg['hand'],'maskMethod':exact['method'] if exact else 'Surface-snapped measured 3D capsules; explicit vertex IDs recorded','selectedVertices':counts,'vertexGroups':groups,'polylines':[[[p.tolist() for p in points],radius] for points,radius in snapped]},contactSockets={'parent':cfg['hand'],'base':local(cb),'tip':local(ct),'baseWorld':cb.tolist(),'tipWorld':ct.tolist()},groundingExclusions={'reason':'Exact explicit held-equipment vertex masks; clothing, body and feet otherwise retained','vertexSets':selected})
 if muzzle is not None:meta['muzzleSocket']={'parent':cfg['hand'],'translation':local(muzzle),'world':muzzle.tolist()}
 body=np.concatenate(allBody);meta['bodyBounds']={'min':body.min(axis=0).tolist(),'max':body.max(axis=0).tolist()};meta['equipmentInputSha256']=sha(sourcebytes);meta['bridgeTriangleRepair']={'method':'Drop only triangles that cross the explicit held-prop/body mask boundary; original provider mesh preserved separately','primitives':removedTriangles}
 if exact:meta['equipmentSegmentationSource']={'path':str(exactPath.relative_to(BASE)),'sha256':sha(exactPath.read_bytes())}
 j['buffers'][0]['byteLength']=length;encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary=b''.join(parts);binary+=b'\0'*((-len(binary))%4);out=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary;output=BASE/'derived'/f'{slug}-rigged.glb';output.write_bytes(out);meta['output']={'path':str(output.relative_to(BASE)),'bytes':len(out),'sha256':sha(out)};metadataPath.write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps({'slug':slug,'selectedVertices':counts,'contactBaseWorld':cb.tolist(),'contactTipWorld':ct.tolist(),'muzzleWorld':muzzle.tolist() if muzzle is not None else None}),flush=True)
