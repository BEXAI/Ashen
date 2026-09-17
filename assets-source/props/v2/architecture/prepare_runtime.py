"""Local bake of committed editable 3D Jutsu kit; no remote operations."""
import bpy,bmesh,os,json,math,numpy as np
OUT=os.environ.get('KIT_OUT',os.path.dirname(os.path.abspath(__file__)))
SOURCE=os.environ.get('KIT_SOURCE',OUT+'/cloud-source.blend')
bpy.ops.wm.open_mainfile(filepath=SOURCE);scene=bpy.context.scene
modules={name:bpy.data.objects[name] for name in ['Arch','Pillar','Trim']}
targets={'Arch':[6000,3000,1200],'Pillar':[1200,600,240],'Trim':[600,300,120]}
source=[o for m in modules.values() for o in m.children_recursive if o.type=='MESH'];materials=list({m for o in source for m in o.data.materials})
for o in source:
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
def select(objects,active):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=active
def tris(o):o.data.calc_loop_triangles();return len(o.data.loop_triangles)
def reduce(o,target):
 select([o],o)
 for attempt in range(3):
  before=tris(o)
  if before<=target:break
  mod=o.modifiers.new('Distance reduction','DECIMATE');mod.ratio=(target-8)/before;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name);o.data.validate(clean_customdata=False)
  if tris(o)>=before:break
 mod=o.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name);o.data.validate(clean_customdata=False);o.data.update()
 print(o.name,'triangles',tris(o),'budget',target,flush=True)
 if tris(o)>target:raise RuntimeError('Reduction budget requires a deliberate proxy: '+o.name)
near=[];dg=bpy.context.evaluated_depsgraph_get()
for name,modroot in modules.items():
 duplicates=[]
 for old in [o for o in modroot.children_recursive if o.type=='MESH']:
  data=bpy.data.meshes.new_from_object(old.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg);o=bpy.data.objects.new('Bake '+old.name,data);scene.collection.objects.link(o);o.matrix_world=old.matrix_world.copy();duplicates.append(o)
 select(duplicates,duplicates[0]);bpy.ops.object.join();o=bpy.context.object;o.name=name+'_BakeTarget';bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);reduce(o,targets[name][0]);group=o.vertex_groups.new(name=name);group.add(list(range(len(o.data.vertices))),1,'REPLACE');near.append(o)
# Unwrap the three modules together once; one atlas and consistent texel density.
select(near,near[0]);bpy.ops.object.join();combined=bpy.context.object;combined.name='Combined atlas bake target'
select([combined],combined);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.009,area_weight=.5,correct_aspect=True,scale_to_bounds=False);bpy.ops.object.mode_set(mode='OBJECT')
combined.data.materials.clear();atlas=bpy.data.materials.new('Ash architecture | shared baked PBR atlas');atlas.use_nodes=True;atlas.use_backface_culling=True;combined.data.materials.append(atlas);nodes=atlas.node_tree.nodes;links=atlas.node_tree.links;p=nodes.get('Principled BSDF');bake_node=nodes.new('ShaderNodeTexImage');nodes.active=bake_node
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True;scene.render.bake.cage_extrusion=.06;scene.render.bake.max_ray_distance=.14;scene.render.bake.margin=4
os.makedirs(OUT+'/textures',exist_ok=True)
def bake(kind,size,bake_type,channel=None):
 scene.render.bake.margin=max(4,size//256)
 path=OUT+'/textures/kit_'+kind+'.png'
 if os.environ.get('KIT_REUSE_BAKES')=='1' and os.path.exists(path):
  im=bpy.data.images.load(path,check_existing=False);im.name='kit_'+kind;im.colorspace_settings.name='sRGB' if kind.startswith('basecolor') else 'Non-Color';im.pack();return im
 im=bpy.data.images.new('kit_'+kind,width=size,height=size,alpha=True);im.colorspace_settings.name='sRGB' if kind.startswith('basecolor') else 'Non-Color';bake_node.image=im;nodes.active=bake_node;restore=[]
 if channel:
  for mat in materials:
   n=mat.node_tree.nodes;l=mat.node_tree.links;pr=n.get('Principled BSDF');out=n.get('Material Output');old=out.inputs['Surface'].links[0].from_socket;emit=n.new('ShaderNodeEmission');s=pr.inputs[channel]
   if s.is_linked:l.new(s.links[0].from_socket,emit.inputs['Color'])
   else:
    v=s.default_value;emit.inputs['Color'].default_value=tuple(v) if hasattr(v,'__len__') else (v,v,v,1)
   l.new(emit.outputs[0],out.inputs['Surface']);restore.append((mat,old,out,emit))
 select(source+[combined],combined);bpy.ops.object.bake(type=bake_type,normal_space='TANGENT')
 for mat,old,out,emit in restore:mat.node_tree.links.new(old,out.inputs['Surface']);mat.node_tree.nodes.remove(emit)
 im.filepath_raw=path;im.file_format='PNG';im.save();im.pack();return im
base_source=bake('basecolor_source',2048,'EMIT','Base Color');base=base_source.copy();base.name='kit_basecolor';base.scale(512,512);base.filepath_raw=OUT+'/textures/kit_basecolor.png';base.file_format='PNG';mobile_path=base.filepath_raw;base.save();bpy.data.images.remove(base);base=bpy.data.images.load(mobile_path,check_existing=False);base.name='kit_basecolor';base.colorspace_settings.name='sRGB';base.pack();rough=bake('roughness',512,'EMIT','Roughness');metal=bake('metallic',512,'EMIT','Metallic');normal=bake('normal',512,'NORMAL');ao=bake('occlusion',512,'AO')
orm=bpy.data.images.new('kit_orm',width=512,height=512,alpha=True);orm.colorspace_settings.name='Non-Color';packed=np.ones((512*512,4),dtype=np.float32)
for k,im in enumerate([ao,rough,metal]):
 values=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(values);packed[:,k]=values.reshape(-1,4)[:,0]
orm.pixels.foreach_set(packed.ravel());orm.filepath_raw=OUT+'/textures/kit_orm.png';orm.file_format='PNG';orm.save();orm.pack();nodes.remove(bake_node)
t=nodes.new('ShaderNodeTexImage');t.image=base;links.new(t.outputs['Color'],p.inputs['Base Color']);t=nodes.new('ShaderNodeTexImage');t.image=normal;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.55;links.new(t.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],p.inputs['Normal']);t=nodes.new('ShaderNodeTexImage');t.image=orm;sep=nodes.new('ShaderNodeSeparateColor');links.new(t.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],p.inputs['Roughness']);links.new(sep.outputs['Blue'],p.inputs['Metallic']);group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');g=nodes.new('ShaderNodeGroup');g.node_tree=group;links.new(sep.outputs['Red'],g.inputs['Occlusion'])
runtime=bpy.data.objects.new('AshenArchitectureKit',None);scene.collection.objects.link(runtime);runtime['asset_id']='ashen_architecture_kit';runtime['metres_per_unit']=1;runtime['clearance_width']=6;runtime['clearance_height']=6.8
lods=[];stats={};anchors=[]
for name,modroot in modules.items():
 low=combined.copy();low.data=combined.data.copy();low.name=name+'_LOD0';scene.collection.objects.link(low);group_index=low.vertex_groups[name].index
 bm=bmesh.new();bm.from_mesh(low.data);weights=bm.verts.layers.deform.active;bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[weights].get(group_index,0)<.5],context='VERTS');bm.to_mesh(low.data);bm.free();low.data.transform(modroot.matrix_world.inverted());low.data.update();low.vertex_groups.clear();low.parent=runtime;low['module']=name;low['lod']=0;low.data.name=name+' near geometry';lods.append(low);stats[name]=[]
 for level in [1,2]:
  o=low.copy();o.data=low.data.copy();o.name=name+'_LOD'+str(level);scene.collection.objects.link(o);o['lod']=level;o.data.name=name+' distance '+str(level)+' geometry';reduce(o,targets[name][level]);lods.append(o)
 for o in [o for o in lods if o.get('module')==name]:
  coords=[v.co for v in o.data.vertices];lo=[min(v[i] for v in coords) for i in range(3)];hi=[max(v[i] for v in coords) for i in range(3)];stats[name].append({'lod':o['lod'],'triangles':tris(o),'vertices':len(o.data.vertices),'bounds_blender':[lo,hi],'dimensions_gltf':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]})
 for original in [o for o in modroot.children_recursive if o.type=='EMPTY' and o.get('semantic_anchor')]:
  anchor=original.copy();anchor.name=original.name+'_Runtime';scene.collection.objects.link(anchor);anchor.parent=runtime;anchor.matrix_world=modroot.matrix_world.inverted()@original.matrix_world;anchor['module']=name;anchor['semantic_name']=original.name;anchors.append(anchor)
for o in source:o.hide_render=True;o.hide_set(True)
combined.hide_render=True;combined.hide_set(True)
select([runtime]+lods+anchors,lods[0]);bpy.ops.export_scene.gltf(filepath=OUT+'/architecture-kit-baked.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
# Review layout is applied only after export and documented in the workfile.
for o in lods:o.hide_render=o['lod']!=0;o.hide_set(o['lod']!=0);o.location=modules[o['module']].location
scene.view_settings.view_transform='AgX';scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=896;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.filepath=OUT+'/baked-review.png';bpy.ops.render.render(write_still=True);bpy.ops.wm.save_as_mainfile(filepath=OUT+'/architecture-baked-workfile.blend')
manifest={'source':SOURCE,'modules':stats,'triangles_targets':targets,'material_count':1,'texture_sizes':{'basecolor':512,'normal':512,'orm':512},'source_basecolor_px':2048,'estimatedRgbaMipBytes':4194304,'root':'AshenArchitectureKit','up':'+Y','front':'+Z','units':'metres','module_pivots':'base centre; all runtime module nodes use native local coordinates','clearance':[6,6.8],'review_layout_only':{n:list(o.location) for n,o in modules.items()},'local_derivation':'Outward-normal repair, selected-to-active PBR bake, one shared atlas, nine LOD meshes, source review transforms removed. No lights or camera in runtime.'}
json.dump(manifest,open(OUT+'/runtime-manifest.json','w'),indent=2);print(json.dumps(manifest),flush=True)
