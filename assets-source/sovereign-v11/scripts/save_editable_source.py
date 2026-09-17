"""Create an editable Blender import from the validated master, without changing GLB bytes."""
import argparse
from pathlib import Path
import bpy
p=argparse.ArgumentParser();p.add_argument('--asset',required=True);p.add_argument('--out',required=True);a=p.parse_args()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.asset)
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
arm.animation_data_clear()
for bone in arm.pose.bones:bone.matrix_basis.identity()
for action in bpy.data.actions:action.use_fake_user=True
for obj in bpy.context.scene.objects:
 if obj.get('lod') is not None:obj.hide_render=obj.get('lod')!=0;obj.hide_set(obj.get('lod')!=0)
for image in bpy.data.images:
 if image.source=='FILE' and not image.packed_file:image.pack()
bpy.context.scene['source_status']='Editable import of validated refined GLB; authoritative exact-byte rebuild is source static atlas plus rig/reduction scripts.'
bpy.context.scene['animation_change']='Only dodge/cape_lower/rotation modified; +0.18rad*sin(pi*t/duration)^2 about local X; 389 other channels unchanged.'
Path(a.out).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=a.out)
print('EDITABLE_SOURCE',len(bpy.data.actions),'actions',len(arm.pose.bones),'bones')
