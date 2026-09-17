"""Separate mobile derivative. The source and full-resolution rig are untouched."""
import bpy,json,math
from pathlib import Path
BASE=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(BASE/'derived/spider-rigged.blend'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
arm.data.pose_position='REST'
arm.animation_data.action=None
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
before=sum(len(p.vertices)-2 for p in mesh.data.polygons)
modifier=mesh.modifiers.new('Mobile only 24k triangle derivative','DECIMATE')
modifier.ratio=.42;modifier.use_collapse_triangulate=True
while mesh.modifiers.find(modifier.name)>0:bpy.ops.object.modifier_move_up(modifier=modifier.name)
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
after=sum(len(p.vertices)-2 for p in mesh.data.polygons)
assert 20000<=after<=25000,after
sums=[sum(g.weight for g in v.groups) for v in mesh.data.vertices]
assert all(math.isfinite(s) and abs(s-1)<1e-5 for s in sums)
assert max(len(v.groups) for v in mesh.data.vertices)<=4
arm.data.pose_position='POSE'
bpy.context.scene.frame_set(0)
arm.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(BASE/'derived/spider-rigged-mobile.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_bake_animation=True,export_skins=True,export_def_bones=False,export_optimize_animation_size=True)
report={'source':'derived/spider-rigged.blend','output':'derived/spider-rigged-mobile.glb','operation':'Separate Blender collapse decimation at rest; no HD/source changes','ratio':.42,'beforeTriangles':before,'afterTriangles':after,'vertices':len(mesh.data.vertices),'maxInfluences':max(len(v.groups) for v in mesh.data.vertices),'maxWeightSumError':max(abs(s-1) for s in sums),'zeroUnweightedVertices':True,'UVsRetained':len(mesh.data.uv_layers)>0,'bones':len(arm.data.bones),'clips':[t.name for t in arm.animation_data.nla_tracks]}
(BASE/'spider-mobile-decimation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
