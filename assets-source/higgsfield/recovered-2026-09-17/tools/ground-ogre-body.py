"""Exclude the weapon-hand influence group from floor lift, including fused shaft remnants."""
import json
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parent.parent
ns={'__file__':str(BASE/'tools/qa-equipment-points.py')};exec((BASE/'tools/qa-equipment-points.py').read_text().split('for slug in NAMES:')[0],ns)
j,b=ns['read'](BASE/'derived/ogre-rigged.glb');metaPath=BASE/'derived/ogre-rigging.json';meta=json.loads(metaPath.read_text());names=[j['nodes'][x]['name']for x in j['skins'][0]['joints']];hand=names.index('RightHand');sets=[];added=0
for mi,m in enumerate(j['meshes']):
 for pi,p in enumerate(m['primitives']):
  js=ns['acc'](j,b,p['attributes']['JOINTS_0']);ws=ns['acc'](j,b,p['attributes']['WEIGHTS_0']);primary=js[np.arange(len(js)),np.argmax(ws,axis=1)];old=set(v for item in meta['groundingExclusions']['vertexSets']if item['mesh']==mi and item['primitive']==pi for v in item['vertices']);extra=set(np.where(primary==hand)[0].tolist());merged=old|extra;added+=len(merged)-len(old);sets.append({'mesh':mi,'primitive':pi,'vertices':sorted(merged)})
meta['groundingExclusions']={'reason':'Body floor lift excludes the complete weapon-hand dominant influence group and explicit held-club mask. This removes source-fused brown shaft remnants and the gripping hand from ground anchoring; leg, torso, head and free arm remain included. Minor weapon/gripping-hand floor overlap in death is allowed instead of lifting the corpse.','vertexSets':sets};meta['weaponHandGroundingRepair']={'dominantJoint':'RightHand','addedVertices':added,'geometryAndAnimationUnchanged':True,'evidence':'qa/ogre-ground-contact-vertices.json'};metaPath.write_text(json.dumps(meta,indent=2)+'\n');out=BASE/'ogre-body-grounding-exclusions.json';out.write_text(json.dumps(meta['groundingExclusions'],indent=2)+'\n');print(json.dumps({'added':added,'total':sum(len(x['vertices'])for x in sets),'output':out.name}))
