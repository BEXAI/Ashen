"""Local portable PBR derivative from the actual committed Higgsfield .blend.
No cloud requests, no external texture inputs, no changes to the game checkout.
"""
import bpy,bmesh,os,json,math,numpy as np
from mathutils import Vector
OUT=os.environ.get('SHRINE_OUT',os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=OUT+'/cloud-source.blend');scene=bpy.context.scene;source_root=bpy.data.objects['EmberShrine']
source=[o for o in source_root.children_recursive if o.type=='MESH'];assert len(source)==63,len(source)
for o in source:
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True;scene.render.bake.cage_extrusion=.025;scene.render.bake.max_ray_distance=.07

def select(objects,active):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=active

def tris(o):o.data.calc_loop_triangles();return len(o.data.loop_triangles)
def decimate(o,target):
 select([o],o);before=tris(o)
 for _ in range(3):
  if tris(o)<=target:break
  m=o.modifiers.new('Bounded distance simplification','DECIMATE');m.ratio=(target-8)/tris(o);m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name)
 m=o.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=m.name);o.data.update();print('LOD',o.name,before,'->',tris(o),flush=True);assert tris(o)<=target

def merged(role,target):
 group=[o for o in source if o.get('surface_role')==role];dg=bpy.context.evaluated_depsgraph_get();copies=[]
 for o in group:
  data=bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg);dup=bpy.data.objects.new('Target '+o.name,data);scene.collection.objects.link(dup);dup.matrix_world=o.matrix_world.copy();copies.append(dup)
 select(copies,copies[0]);bpy.ops.object.join();o=bpy.context.object;o.name='EmberShrine_LOD0_'+role;select([o],o);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);decimate(o,target)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.018,area_weight=.5,correct_aspect=True,scale_to_bounds=False);bpy.ops.object.mode_set(mode='OBJECT');return o,group

def image(name,size):
 im=bpy.data.images.new('shrine_'+name,width=size,height=size,alpha=True,float_buffer=False);im.generated_color=(0,0,0,1);im.colorspace_settings.name='sRGB' if name in ['basecolor','emissive'] else 'Non-Color';return im

def save(im):im.filepath_raw=OUT+'/textures/'+im.name+'.png';im.file_format='PNG';im.save();im.pack()
os.makedirs(OUT+'/textures',exist_ok=True)

def bake(target,original,material,name,size,kind,channel=None):
 cached=OUT+'/textures/shrine_'+name+'.png'
 if os.environ.get('SHRINE_REUSE_BAKES')=='1' and os.path.exists(cached):
  im=bpy.data.images.load(cached,check_existing=False);im.name='shrine_'+name;im.colorspace_settings.name='sRGB' if name in ['basecolor','emissive'] else 'Non-Color';im.pack();return im
 nodes=material.node_tree.nodes;node=nodes.new('ShaderNodeTexImage');im=image(name,size);node.image=im;nodes.active=node;back=[]
 if channel:
  for m in set(m for o in original for m in o.data.materials):
   n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');out=n.get('Material Output');old=out.inputs['Surface'].links[0].from_socket;emit=n.new('ShaderNodeEmission');socket=p.inputs[channel]
   if socket.is_linked:l.new(socket.links[0].from_socket,emit.inputs['Color'])
   else:
    v=socket.default_value;emit.inputs['Color'].default_value=tuple(v) if hasattr(v,'__len__') else (v,v,v,1)
   l.new(emit.outputs[0],out.inputs['Surface']);back.append((m,old,out,emit))
 select(original+[target],target);scene.render.bake.margin=max(4,size//128)
 try:bpy.ops.object.bake(type=kind,normal_space='TANGENT')
 finally:
  for m,old,out,emit in back:m.node_tree.links.new(old,out.inputs['Surface']);m.node_tree.nodes.remove(emit)
 nodes.remove(node);save(im);return im

body,body_source=merged('body',5500);ember,ember_source=merged('ember',480)
bodymat=bpy.data.materials.new('Shrine_BakedStoneIron');bodymat.use_nodes=True;bodymat.use_backface_culling=True;bodymat['surface_role']='body';body.data.materials.clear();body.data.materials.append(bodymat)
n=bodymat.node_tree.nodes;l=bodymat.node_tree.links;p=n.get('Principled BSDF')
base=bake(body,body_source,bodymat,'basecolor',2048,'EMIT','Base Color');rough=bake(body,body_source,bodymat,'roughness',512,'EMIT','Roughness');metal=bake(body,body_source,bodymat,'metallic',512,'EMIT','Metallic');normal=bake(body,body_source,bodymat,'normal',512,'NORMAL');ao=bake(body,body_source,bodymat,'occlusion',512,'AO')
orm=image('orm',512);channels=[]
for im in [ao,rough,metal]:arr=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(arr);channels.append(arr.reshape(-1,4)[:,0])
packed=np.ones((512*512,4),dtype=np.float32)
for i,channel in enumerate(channels):packed[:,i]=channel
orm.pixels.foreach_set(packed.ravel());save(orm)
tex=n.new('ShaderNodeTexImage');tex.image=base;l.new(tex.outputs['Color'],p.inputs['Base Color'])
tex=n.new('ShaderNodeTexImage');tex.image=normal;nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.6;l.new(tex.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])
tex=n.new('ShaderNodeTexImage');tex.image=orm;sep=n.new('ShaderNodeSeparateColor');l.new(tex.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
g=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');g.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');gn=n.new('ShaderNodeGroup');gn.node_tree=g;l.new(sep.outputs['Red'],gn.inputs['Occlusion'])
embermat=bpy.data.materials.new('Shrine_StateEmber');embermat.use_nodes=True;embermat.use_backface_culling=False;embermat['surface_role']='ember';embermat['runtime_state_controlled']=True;ember.data.materials.clear();ember.data.materials.append(embermat)
em=bake(ember,ember_source,embermat,'emissive',256,'EMIT','Emission Strength');n=embermat.node_tree.nodes;l=embermat.node_tree.links;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(.04,.04,.04,1);p.inputs['Roughness'].default_value=.82;p.inputs['Emission Strength'].default_value=1
tex=n.new('ShaderNodeTexImage');tex.image=em;mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.65,.22,.04,1);l.new(tex.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Emission Color'])
rt=bpy.data.objects.new('EmberShrine_Runtime',None);scene.collection.objects.link(rt);rt['asset_id']='A02_ember_shrine';rt['source_project_id']='02f9af38-c881-4c8b-9fd6-0cbe6e8f1d59';rt['source_revision']=1;rt['metres_per_unit']=1
anchors=[]
for name in ['Ground','FlameOrigin','LightOrigin','EmberCore']:
 old=bpy.data.objects[name];old.name='Source_'+name;o=old.copy();o.name=name;scene.collection.objects.link(o);o.parent=rt;anchors.append(o)
groups=[];all_meshes=[];stats=[]
for lod,targets in enumerate([(5500,480),(2600,360),(950,200)]):
 group=bpy.data.objects.new('EmberShrine_LOD%d'%lod,None);scene.collection.objects.link(group);group.parent=rt;group['lod']=lod;groups.append(group);objects=[]
 for role,template,target in zip(['body','ember'],[body,ember],targets):
  if lod==0:o=template
  else:o=template.copy();o.data=template.data.copy();scene.collection.objects.link(o);decimate(o,target)
  o.name='EmberShrine_LOD%d_%s'%(lod,role);o.parent=group;o['surface_role']=role;o['lod_index']=lod;objects.append(o);all_meshes.append(o)
 points=[o.matrix_world@v.co for o in objects for v in o.data.vertices];lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)];stats.append({'lod':lod,'triangles':sum(tris(o) for o in objects),'body_triangles':tris(objects[0]),'ember_triangles':tris(objects[1]),'draws':2,'bounds_gltf_size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],'bounds_blender_min':lo,'bounds_blender_max':hi})
for o in source:o.hide_render=True;o.hide_set(True)
select([rt]+groups+all_meshes+anchors,body)
bpy.ops.export_scene.gltf(filepath=OUT+'/shrine-combined-baked.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
for o in all_meshes:o.hide_render=o.get('lod_index')!=0;o.hide_set(o.get('lod_index')!=0)
scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.cycles.samples=16;scene.view_settings.view_transform='AgX';scene.render.image_settings.media_type='IMAGE';scene.render.filepath=OUT+'/baked-lod0-review.png';bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/shrine-baked-workfile.blend')
report={'asset_id':'A02_ember_shrine','lods':stats,'materials':2,'texture_contract':{'source_basecolor':[2048,2048,'sRGB'],'runtime_basecolor':[1024,1024,'sRGB'],'normal':[512,512,'linear'],'ORM':[512,512,'linear'],'emissive':[256,256,'sRGB neutral intensity mask']},'anchors_gltf':{'Ground':[0,0,0],'FlameOrigin':[0,1.9,0],'LightOrigin':[0,2.2,0],'EmberCore':[0,1.54,0]},'runtime_lights':0,'root_transform':'identity','bake_method':'Selected-to-active Cycles basecolor/tangent normal/roughness/metallic/AO from actual committed .blend; base color contains no light bake; separate neutral emissive-strength mask tinted only by runtime material','source_project_id':'02f9af38-c881-4c8b-9fd6-0cbe6e8f1d59','source_revision':1}
json.dump(report,open(OUT+'/runtime-manifest.json','w'),indent=2);print(json.dumps(report),flush=True)
