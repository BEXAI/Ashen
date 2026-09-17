import bpy,math,json,argparse
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--asset',required=True);p.add_argument('--out',required=True);p.add_argument('--lod',type=int,default=0);p.add_argument('--skip-rest',action='store_true');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=a.asset)
scene=bpy.context.scene
for o in scene.objects:print(o.name,o.type,o.get('lod'),o.parent.name if o.parent else None,flush=True)
print('ACTIONS',[(a.name,tuple(a.frame_range)) for a in bpy.data.actions],flush=True)
for o in scene.objects:
 if o.type=='MESH' and o.get('lod') is not None:o.hide_render=o.get('lod')!=a.lod
arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis.identity()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.world=bpy.data.worlds.new('Review world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.22,.25,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.location.z=-.02;mat=bpy.data.materials.new('Floor');mat.diffuse_color=(.065,.07,.08,1);floor.data.materials.append(mat)
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key',(-3,-4,5),700,3,(1,.88,.77));area('Fill',(3,-3,3),340,3,(.76,.87,1));area('Rim',(2,3,4),850,2,(1,.83,.65))
d=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=3.4
scene.render.resolution_x=850;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
for label,loc in ([] if a.skip_rest else [('rest-front',(0,-8,1.8)),('rest-quarter',(3,-8,2.7))]):
 cam.location=loc;cam.rotation_euler=(Vector((0,0,1.48))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(label+'.png'));bpy.ops.render.render(write_still=True)
# glTF clips imported as actions; choose by exact name/prefix.
cam.location=(3,-8,2.7);cam.rotation_euler=(Vector((0,0,1.48))-cam.location).to_track_quat('-Z','Y').to_euler()
for clip,fraction in [('side',.25/.58),('overhead',.44/.91)]:
 act=next((x for x in bpy.data.actions if x.name==clip or x.name.startswith(clip)),None)
 if not act:continue
 arm.animation_data_create();arm.animation_data.action=act
 if len(act.slots):arm.animation_data.action_slot=act.slots[0]
 frame=act.frame_range[0]+(act.frame_range[1]-act.frame_range[0])*fraction;scene.frame_set(int(frame),subframe=frame-int(frame))
 scene.render.filepath=str(out/(clip+'.png'));bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'rig-import-review.blend'))
