"""Render actual imported GLB at named clip samples; no source asset writes."""
import bpy,argparse,json,math
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--asset',required=True);p.add_argument('--out',required=True);p.add_argument('--lod',type=int,default=0);p.add_argument('--full',action='store_true');p.add_argument('--only');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=a.asset)
scene=bpy.context.scene
for o in scene.objects:
 if o.type=='MESH' and o.get('lod') is not None:o.hide_render=o.get('lod')!=a.lod
arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis.identity()
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=3
scene.world=bpy.data.worlds.new('Neutral review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.25,.26,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.location.z=-.03;mat=bpy.data.materials.new('Floor');mat.diffuse_color=(.055,.055,.06,1);floor.data.materials.append(mat)
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key',(-3,-4,5),700,3,(1,.92,.84));area('Fill',(3,-3,3),340,3,(.84,.91,1));area('Rim',(2,3,4),850,2,(1,.9,.8))
d=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=3.7
scene.render.resolution_x=480;scene.render.resolution_y=640;scene.render.resolution_percentage=100
poses=[('neutral',None,0),('walk','forward',.175),('side-windup','side',.17),('overhead-windup','overhead',.34),('overhead-contact','overhead',.44),('dodge','dodge',.25),('death','death',.8)]
if a.full:poses=[('neutral',None,0),('idle','idle',.17),('walk','forward',.175),('backward','backward',.175),('strafe-left','strafe_left',.175),('strafe-right','strafe_right',.175),('turn','turn',.175),('dodge','dodge',.25),('hit','hit',.15),('death','death',.8)]+[(f'{name}-{suffix}',name,t) for name,wind,active in [('side',.17,.16),('diagonal',.23,.18),('backhand',.15,.16),('overhead',.34,.20)] for suffix,t in [('windup',wind),('contact',wind+active/2),('follow',wind+active)]]
if a.only:poses=[x for x in poses if x[0] in a.only.split(',')]
views=[('front',(2.6,-8,2.65)),('side',(8,-.3,2.1)),('rear',(2.6,8,2.65))]
report=[]
for label,clip,time in poses:
 arm.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis.identity()
 if clip:
  act=bpy.data.actions.get(clip)
  if not act:raise RuntimeError('Missing clip '+clip)
  arm.animation_data_create();arm.animation_data.action=act
  if len(act.slots):arm.animation_data.action_slot=act.slots[0]
  frame=time*scene.render.fps;scene.frame_set(int(frame),subframe=frame-int(frame))
 bpy.context.view_layer.update()
 for view,loc in views:
  target=Vector((-1.25,0,.2) if label=='death' else (0,0,1.45));cam.data.ortho_scale=4.8 if label=='death' else 3.7
  cam.location=Vector(loc)+(target-Vector((0,0,1.45)));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(label+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
  report.append({'pose':label,'clip':clip,'seconds':time,'view':view,'image':label+'-'+view+'.png'})
 print('POSE_COMPLETE',label,flush=True)
(out/('index-'+a.only+'.json' if a.only else 'index.json')).write_text(json.dumps({'asset':a.asset,'lod':a.lod,'renders':report},indent=2))
