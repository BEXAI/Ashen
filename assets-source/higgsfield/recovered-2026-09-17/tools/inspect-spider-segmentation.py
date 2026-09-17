"""Fit and animate eight leg chains on the supplied reconstructed spider mesh.

The source mesh, triangles, UVs and textures are preserved. Virtual position
welding is used only to discover connected leg regions across UV seams.
"""
import bpy
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Vector

BASE=Path(__file__).resolve().parents[1]/'models'
SOURCE=BASE/'spider-original.glb'
OUTPUT=BASE/'spider-rigged.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.view_layer.update()
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
mesh.name='September9SpiderMesh'
mesh.rotation_mode='XYZ'
mesh.rotation_euler.z-=math.pi/2
mesh.scale*=2
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
ground=min(v.co.z for v in mesh.data.vertices)
for v in mesh.data.vertices:
    v.co.z-=ground
positions=np.array([tuple(v.co) for v in mesh.data.vertices],dtype=np.float64)

# Discover eight outer leg components without welding/changing source geometry.
unique=[]; keys={}; mapping=[]
for p in positions:
    key=tuple(round(float(c),4) for c in p)
    if key not in keys:
        keys[key]=len(unique);unique.append(p)
    mapping.append(keys[key])
unique=np.array(unique)
adj=[set() for _ in unique]
for e in mesh.data.edges:
    a,b=(mapping[i] for i in e.vertices)
    adj[a].add(b);adj[b].add(a)

result={'bounds':[positions.min(axis=0).tolist(),positions.max(axis=0).tolist()],'scan':[]}
for threshold in [.26,.28,.30,.32,.34,.36,.38,.40,.42,.44,.46,.48,.5]:
 remaining={i for i,p in enumerate(unique) if abs(p[0])>threshold};components=[]
 while remaining:
  start=remaining.pop();stack=[start];component=[start]
  while stack:
   i=stack.pop()
   for j in adj[i]:
    if j in remaining:remaining.remove(j);stack.append(j);component.append(j)
  if len(component)>100:components.append(component)
 result['scan'].append({'threshold':threshold,'count':len(components),'components':[{'count':len(c),'min':unique[c].min(axis=0).tolist(),'max':unique[c].max(axis=0).tolist(),'center':np.mean(unique[c],axis=0).tolist()}for c in components]})
Path('/tmp/ashen-new-spider-segmentation.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'bounds':result['bounds'],'scan':[{k:v for k,v in a.items()if k!='components'} for a in result['scan']]}))
