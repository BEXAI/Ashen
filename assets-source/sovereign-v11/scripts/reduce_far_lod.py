import bpy,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--master',required=True);p.add_argument('--out',required=True);p.add_argument('--source-lod',type=int,default=0);p.add_argument('--ratio',type=float,default=.33);a=p.parse_args()
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=a.master)
o=next(o for o in bpy.context.scene.objects if o.get('lod')==a.source_lod);arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
arm.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis.identity()
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
m=o.modifiers.new('Far distance geometry reduction','DECIMATE');m.ratio=a.ratio;m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name)
print('FAR_TRI',sum(len(p.vertices)-2 for p in o.data.polygons),flush=True)
arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=a.out,export_format='GLB',use_selection=True,export_apply=False,export_animations=False,export_tangents=True)
