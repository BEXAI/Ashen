"""Bake the downloaded, committed 3D Jutsu source into a one-atlas mobile sconce.
Only local derivation. Requires Blender 5.2 Python, numpy. No network/catalog input.
"""
import bpy, bmesh, os, json, math, numpy as np
from mathutils import Vector
OUT=os.environ.get('SCONCE_OUT',os.path.dirname(os.path.abspath(__file__)))
SOURCE=os.environ.get('SCONCE_SOURCE',OUT+'/cloud-source.blend')
bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene
source_root=bpy.data.objects.get('AshenSconce')
assert source_root is not None, 'Expected original source root'
source=[o for o in source_root.children_recursive if o.type=='MESH']
assert len(source)==21, len(source)
source_materials=list({m for o in source for m in o.data.materials})
# Repair inconsistent winding in the editable cloud source before projection.
for o in source:
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12
scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True
scene.render.bake.cage_extrusion=.025;scene.render.bake.max_ray_distance=.08
scene.render.bake.margin=4

def select(objects,active):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=active

def tris(o):
 o.data.calc_loop_triangles();return len(o.data.loop_triangles)

def decimate(o,target):
 start=tris(o)
 if start>target:
  select([o],o);m=o.modifiers.new('Mobile silhouette reduction','DECIMATE');m.ratio=(target-8)/start;m.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=m.name)
 attempts=0
 while tris(o)>target and attempts<3:
  attempts+=1;previous=tris(o)
  m=o.modifiers.new('Exact triangle ceiling','DECIMATE');m.ratio=(target-4)/tris(o);m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name)
  if tris(o)==previous:break
 print('DECIMATE',o.name,start,'target',target,'actual',tris(o),flush=True)
 select([o],o);m=o.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=m.name)
 o.data.validate(clean_customdata=False);o.data.update()
 return tris(o)

# Preserve original per-object Generated shader coordinates during baking.
duplicates=[]
dg=bpy.context.evaluated_depsgraph_get()
for old in source:
 data=bpy.data.meshes.new_from_object(old.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
 dup=bpy.data.objects.new('Bake target '+old.name,data);scene.collection.objects.link(dup);dup.matrix_world=old.matrix_world.copy();duplicates.append(dup)
select(duplicates,duplicates[0]);bpy.ops.object.join();low=bpy.context.object;low.name='AshenSconce_LOD0'
source_triangle_count=tris(low)
select([low],low);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
tri0=decimate(low,1500)
select([low],low);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(64),island_margin=.016,area_weight=.5,correct_aspect=True,scale_to_bounds=False);bpy.ops.object.mode_set(mode='OBJECT')
low.data.materials.clear();atlas=bpy.data.materials.new('Ashen Sconce | baked atlas');atlas.use_nodes=True;atlas.use_backface_culling=True;low.data.materials.append(atlas)
nodes=atlas.node_tree.nodes;links=atlas.node_tree.links;p=nodes.get('Principled BSDF')
target_node=nodes.new('ShaderNodeTexImage');target_node.name='Active bake target'

def image(name,size,color):
 im=bpy.data.images.new(name,width=size,height=size,alpha=True,float_buffer=False);im.generated_color=color;im.colorspace_settings.name='sRGB' if name.endswith('basecolor') else 'Non-Color';return im

def bake(name,size,kind,channel=None):
 saved=OUT+'/textures/sconce_'+name+'.png'
 if os.environ.get('SCONCE_REUSE_BAKES')=='1' and os.path.exists(saved):
  im=bpy.data.images.load(saved,check_existing=False);im.name='sconce_'+name;im.colorspace_settings.name='sRGB' if name=='basecolor' else 'Non-Color';im.pack();return im
 im=image('sconce_'+name,size,(0,0,0,1));target_node.image=im;nodes.active=target_node
 links_backup=[]
 if channel:
  for mat in source_materials:
   n=mat.node_tree.nodes;l=mat.node_tree.links;pr=n.get('Principled BSDF');out=n.get('Material Output');old=out.inputs['Surface'].links[0].from_socket
   emit=n.new('ShaderNodeEmission');socket=pr.inputs[channel]
   if socket.is_linked:l.new(socket.links[0].from_socket,emit.inputs['Color'])
   else:
    v=socket.default_value;emit.inputs['Color'].default_value=tuple(v) if hasattr(v,'__len__') else (v,v,v,1)
   l.new(emit.outputs[0],out.inputs['Surface']);links_backup.append((mat,old,out,emit))
 select(source+[low],low)
 bpy.ops.object.bake(type=kind,normal_space='TANGENT')
 for mat,old,out,emit in links_backup:mat.node_tree.links.new(old,out.inputs['Surface']);mat.node_tree.nodes.remove(emit)
 im.filepath_raw=OUT+'/textures/'+im.name+'.png';im.file_format='PNG';im.save();im.pack();return im

os.makedirs(OUT+'/textures',exist_ok=True)
base=bake('basecolor',512,'EMIT','Base Color')
rough=bake('roughness',256,'EMIT','Roughness')
metal=bake('metallic',256,'EMIT','Metallic')
normal=bake('normal',256,'NORMAL')
# Geometry AO is portable and reserved to occlusion, never multiplied into albedo.
ao=bake('occlusion',256,'AO')
orm=image('sconce_orm',256,(1,.55,.88,1))
ar=np.empty(len(ao.pixels),dtype=np.float32);ao.pixels.foreach_get(ar)
rr=np.empty(len(rough.pixels),dtype=np.float32);rough.pixels.foreach_get(rr)
mr=np.empty(len(metal.pixels),dtype=np.float32);metal.pixels.foreach_get(mr)
packed=np.ones_like(ar).reshape(-1,4);packed[:,0]=ar.reshape(-1,4)[:,0];packed[:,1]=rr.reshape(-1,4)[:,0];packed[:,2]=mr.reshape(-1,4)[:,0]
orm.pixels.foreach_set(packed.ravel());orm.filepath_raw=OUT+'/textures/sconce_orm.png';orm.file_format='PNG';orm.save();orm.pack()
nodes.remove(target_node)
tex=nodes.new('ShaderNodeTexImage');tex.image=base;links.new(tex.outputs['Color'],p.inputs['Base Color'])
tex=nodes.new('ShaderNodeTexImage');tex.image=normal;norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.45;links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],p.inputs['Normal'])
tex=nodes.new('ShaderNodeTexImage');tex.image=orm;sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],p.inputs['Roughness']);links.new(sep.outputs['Blue'],p.inputs['Metallic'])
# glTF exporter recognizes the standard occlusion group.
group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');gi=nodes.new('ShaderNodeGroup');gi.node_tree=group;links.new(sep.outputs['Red'],gi.inputs['Occlusion'])
runtime_root=bpy.data.objects.new('AshenSconce_Runtime',None);scene.collection.objects.link(runtime_root);runtime_root['asset_id']='ashen_iron_sconce';runtime_root['metres_per_unit']=1;runtime_root['source_project_id']='21434c15-bdde-4abd-bcb9-62098cae463a';runtime_root['source_revision']=1
anchors=[]
for name in ['Mount','FlameOrigin','LightOrigin']:
 original=bpy.data.objects[name];original.name='Source_'+name;dup=original.copy();dup.name=name;scene.collection.objects.link(dup);dup.parent=runtime_root
 if name=='LightOrigin':dup.location.z=.685
 anchors.append(dup)
low.parent=runtime_root;low['lod']=0
lods=[low]
for index,target in [(1,600)]:
 o=low.copy();o.data=low.data.copy();o.name='AshenSconce_LOD%d'%index;scene.collection.objects.link(o);o['lod']=index;decimate(o,target);lods.append(o)
exec(compile(open(OUT+'/far_proxy.py').read(),OUT+'/far_proxy.py','exec'))
lods.append(build_far_proxy(low,atlas,runtime_root))
for o in source:o.hide_render=True;o.hide_set(True)
for o in lods:o.hide_render=o!=low;o.hide_set(o!=low)

stats=[]
for i,o in enumerate(lods):
 points=[o.matrix_world@v.co for v in o.data.vertices];lo=[min(v[j] for v in points) for j in range(3)];hi=[max(v[j] for v in points) for j in range(3)]
 row={'lod':i,'triangles':tris(o),'vertices':len(o.data.vertices),'materials':len(o.data.materials),'bounds_blender_min':lo,'bounds_blender_max':hi,'bounds_gltf_size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]}
 stats.append(row);select([runtime_root,o]+anchors,o)
 bpy.ops.export_scene.gltf(filepath=OUT+'/sconce-lod%d-baked.glb'%i,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
select([runtime_root]+lods+anchors,low)
bpy.ops.export_scene.gltf(filepath=OUT+'/sconce-combined-baked.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
for o in lods:o.hide_render=o!=low;o.hide_set(o!=low)
select([low],low)
scene.view_settings.view_transform='AgX';scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.filepath=OUT+'/baked-lod0-review.png';bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/sconce-baked-workfile.blend')
manifest={'source':SOURCE,'source_evaluated_triangles':source_triangle_count,'lods':stats,'material_count':1,'texture_contract':{'basecolor':[512,512,'sRGB'],'normal':[256,256,'linear'],'ORM':[256,256,'linear']},'anchors_gltf':{'Mount':[0,0,0],'FlameOrigin':[0,.385,.265],'LightOrigin':[0,.685,.265]},'root_transform':'identity','front':'+Z','up':'+Y','units':'metres','flame_geometry':False,'runtime_cameras_lights':False,'local_adjustments':['Recalculated outward mesh normals before baking','Runtime LightOrigin is 0.3 m above FlameOrigin to preserve existing game light position','Far LOD is a 188-triangle basin/plate/strap silhouette proxy; same shared PBR atlas material including normal texture'], 'derivation':'Original 3D Jutsu committed .blend; local evaluated-mesh reduction, selected-to-active Cycles PBR bake, one material, three LODs'}
json.dump(manifest,open(OUT+'/runtime-manifest.json','w'),indent=2);print(json.dumps(manifest))
