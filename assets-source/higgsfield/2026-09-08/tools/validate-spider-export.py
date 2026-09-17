"""Re-import the delivered GLB and validate skinning across every clip."""
import bpy
import json
import numpy as np
from pathlib import Path
P=Path('/Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/models')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(P/'spider-rigged.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials))
scene=bpy.context.scene
for track in arm.animation_data.nla_tracks:track.mute=True
reports=[]
for action in bpy.data.actions:
    arm.animation_data.action=action
    arm.animation_data.action_slot=action.slots[0]
    end=int(action.frame_range[1]);poses=[]
    for frame in [0,end//4,end//2,3*end//4,end]:
        scene.frame_set(frame);bpy.context.view_layer.update()
        evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        vertices=np.array([tuple(evaluated.matrix_world@v.co) for v in evaluated.data.vertices])
        assert np.isfinite(vertices).all(),action.name
        low=vertices.min(axis=0);high=vertices.max(axis=0)
        assert max(high-low)<4,action.name+' exploding bounds'
        assert low[2]>-.01,action.name+' penetrates floor by '+str(-low[2])
        tip=arm.matrix_world@arm.pose.bones['ContactTip'].head
        poses.append({'frame':frame,'min':low.tolist(),'max':high.tolist(),'ContactTip':list(tip)})
    reports.append({'clip':action.name,'poses':poses})
(P/'spider-export-pose-validation.json').write_text(json.dumps(reports,indent=2))
print(json.dumps({'clipsChecked':len(reports),'posesChecked':sum(len(x['poses']) for x in reports),'allFinite':True,'minZ':min(p['min'][2] for r in reports for p in r['poses']),'maxExtent':max(max(np.array(p['max'])-np.array(p['min'])) for r in reports for p in r['poses'])},indent=2))
