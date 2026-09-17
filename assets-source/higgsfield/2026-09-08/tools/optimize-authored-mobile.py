"""Create <=40k-triangle production originals; keep held equipment intact."""
import bpy,json,sys,hashlib,math
from pathlib import Path

base=Path('/Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/models')
kind=sys.argv[1]
bpy.ops.wm.open_mainfile(filepath=str(base/(kind+'-authored.blend')))
arm=bpy.data.objects['Armature'];arm.data.pose_position='REST'
body=bpy.data.objects[kind.title()+' authored reference character']
weapon=bpy.data.objects['GoblinHeldCleaver' if kind=='goblin' else 'OgreHeldClub']
def triangles(o):return sum(len(p.vertices)-2 for p in o.data.polygons)
before=triangles(body)+triangles(weapon)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
mod=body.modifiers.new('Production mobile surface reduction','DECIMATE');mod.ratio=min(1,33500/triangles(body));mod.use_collapse_triangulate=True
while body.modifiers.find(mod.name)>0:bpy.ops.object.modifier_move_up(modifier=mod.name)
bpy.ops.object.modifier_apply(modifier=mod.name)
# Collapse interpolates weights; retain the four strongest and normalize explicitly.
maxinf=0
for v in body.data.vertices:
    values=sorted([(g.group,g.weight) for g in v.groups if g.weight>1e-8],key=lambda x:-x[1])[:4]
    total=sum(w for _,w in values);assert total>0 and math.isfinite(total)
    for group in body.vertex_groups:group.remove([v.index])
    for i,w in values:body.vertex_groups[i].add([v.index],w/total,'REPLACE')
    maxinf=max(maxinf,len(values))
after=triangles(body)+triangles(weapon);assert after<=40000,after
arm.data.pose_position='POSE';bpy.context.scene.frame_set(0)
provenance_path=base/(kind+'-local-authorship.json');p=json.loads(provenance_path.read_text())
p['triangles']=triangles(body);p['heldEquipmentTriangles']=triangles(weapon)
p['totalProductionTriangles']=after;p['maxSkinInfluences']=maxinf
p['optimization']={'method':'Upstream detail tessellation reduced; moderate body edge collapse with interpolated skin weights, renormalized to four influences. Held weapon geometry and all bind transforms retained.','trianglesBeforeFinalCollapse':before,'trianglesAfterFinalCollapse':after,'highDetailModel':str(base/(kind+'-authored-high-detail.glb')),'targetMaxTriangles':40000}
provenance_path.write_text(json.dumps(p,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(base/(kind+'-authored-production.blend')))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);weapon.select_set(True);bpy.context.view_layer.objects.active=arm
output=base/(kind+'-original.glb')
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_all_influences=False,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
print(json.dumps({'asset':kind,'triangles':after,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'maxSkinInfluences':maxinf}))
