"""Original Ashen Realm sconce. Blender 5.2; bpy-only authoring, no catalog input.
Coordinate convention: Blender Z up, front -Y; GLB Y up, front +Z.
Source dimensions <= 0.65 x 1.10 x 0.50 m. Mount pivot at identity root.
Remote source uses editable geometry/materials; runtime textures are baked from
this downloaded .blend by the companion local preparation pipeline.
"""
import bpy,math,json
from mathutils import Vector
# New isolated authorized project only. It was inspected as empty revision zero.
for old in list(bpy.data.objects):bpy.data.objects.remove(old,do_unlink=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1.0
root=bpy.data.objects.new('AshenSconce',None);scene.collection.objects.link(root)
root['asset_id']='ashen_iron_sconce';root['source']='Original authored geometry; no catalog inputs';root['metres_per_unit']=1.0
root['front_axis']='Blender -Y / glTF +Z';root['runtime_note']='Bake procedural appearance; export only geometry and semantic anchor nodes.'
parts=[]

def material(name,base,metal,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*base,1);n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*base,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 coord=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.name='Hammered iron micro-relief';noise.inputs['Scale'].default_value=110;noise.inputs['Detail'].default_value=2;noise.inputs['Roughness'].default_value=.7;l.new(coord.outputs['Generated'],noise.inputs['Vector'])
 bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.26;bump.inputs['Distance'].default_value=.0013;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
 broad=n.new('ShaderNodeTexNoise');broad.inputs['Scale'].default_value=9;broad.inputs['Detail'].default_value=3;l.new(coord.outputs['Generated'],broad.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.15;ramp.color_ramp.elements[0].color=(*(c*.55 for c in base),1);ramp.color_ramp.elements[1].position=.85;ramp.color_ramp.elements[1].color=(*(min(c*1.65,.8) for c in base),1);l.new(broad.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs['Color'],p.inputs['Base Color'])
 rr=n.new('ShaderNodeMapRange');rr.inputs['From Min'].default_value=0;rr.inputs['From Max'].default_value=1;rr.inputs['To Min'].default_value=rough-.10;rr.inputs['To Max'].default_value=rough+.12;l.new(noise.outputs['Fac'],rr.inputs[0]);l.new(rr.outputs['Result'],p.inputs['Roughness']);return m
iron=material('Forged black iron',(0.060,.052,.044),.88,.53)
edge=material('Warm worn iron edges',(.105,.078,.043),.78,.47)

def mesh(name,verts,faces,mat=iron,bevel=.002):
 data=bpy.data.meshes.new(name+' mesh');data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.parent=root;o.data.materials.append(mat);parts.append(o)
 if bevel:
  b=o.modifiers.new('Small forged edge bevel','BEVEL');b.width=bevel;b.segments=2;b.affect='EDGES'
  b=o.modifiers.new('Weighted bevel highlights','WEIGHTED_NORMAL');b.keep_sharp=True;b.weight=45
 return o

def ring_plate(name,outline,inner,front,back):
 n=len(outline);vs=[(x,y,z) for y in [front,back] for shape in [outline,inner] for x,z in shape];faces=[]
 for i in range(n):
  j=(i+1)%n
  faces.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 return mesh(name,vs,faces,iron,.0018)
outline=[(0,.45),(.08,.365),(.105,.26),(.083,.10),(.083,-.12),(.122,-.34),(.083,-.53),(0,-.65),(-.083,-.53),(-.122,-.34),(-.083,-.12),(-.083,.10),(-.105,.26),(-.08,.365)]
inner=[(x*.40,z*.62-.055) for x,z in outline]
ring_plate('Pierced spear wall plate',outline,inner,-.027,-.003)

def strap(name,points,width=.038,thick=.021,mat=iron):
 pts=[Vector(p) for p in points];vs=[];faces=[]
 for i,p in enumerate(pts):
  tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized();axis=Vector((1,0,0));side=tangent.cross(axis).normalized()
  for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:vs.append(tuple(p+axis*a*width/2+side*b*thick/2))
 for i in range(len(pts)-1):
  for k in range(4):faces.append((4*i+k,4*i+(k+1)%4,4*(i+1)+(k+1)%4,4*(i+1)+k))
 faces.extend([(3,2,1,0),tuple(4*(len(pts)-1)+k for k in range(4))]);return mesh(name,vs,faces,mat,.0023)
for side in [-1,1]:
 pts=[]
 for i in range(13):
  t=i/12;y=-.028-.265*(3*t*t-2*t*t*t);z=-.37+.44*t+.03*math.sin(math.pi*t);x=side*(.072+.027*math.sin(math.pi*t/2));pts.append((x,y,z))
 strap(('Left' if side<0 else 'Right')+' swept supporting strap',pts)
 # An inward curl terminates the lower mount in an intentional forged scroll.
 pts=[]
 for i in range(13):
  t=i/12;angle=math.pi*.65+t*math.pi*1.5;r=.048*(1-.5*t);pts.append((side*.070,-.055+r*math.cos(angle),-.385+r*math.sin(angle)))
 strap(('Left' if side<0 else 'Right')+' lower forged scroll',pts,width=.029,thick=.017,mat=edge)
# A segmented, double-wall elliptic brazier. Twelve actual ventilation openings,
# with jamb faces across metal thickness, sit between the middle two rings.
N=24;center=-.265
profile=[(.090,.065,.047),(.17,.120,.13),(.255,.175,.27),(.284,.195,.345)]
vs=[]
for inner_wall in [False,True]:
 for rx,ry,z in profile:
  rx=rx-(.012 if inner_wall else 0);ry=ry-(.012 if inner_wall else 0)
  for j in range(N):
   a=2*math.pi*j/N
   # Broad radial fluting gives real highlights, not only texture grain.
   factor=1+.018*math.cos(12*a);vs.append((rx*math.cos(a)*factor,center+ry*math.sin(a)*factor,z))
faces=[];rings=len(profile);offset=N*rings
for k in range(rings-1):
 for j in range(N):
  jj=(j+1)%N;a=k*N+j;b=k*N+jj;c=(k+1)*N+jj;d=(k+1)*N+j
  hole=(k==1 and j%2==0)
  if not hole:faces.extend([(a,b,c,d),(offset+d,offset+c,offset+b,offset+a)])
  else:faces.extend([(a,offset+a,offset+b,b),(d,c,offset+c,offset+d),(a,d,offset+d,offset+a),(b,offset+b,offset+c,c)])
for k in [0,rings-1]:
 for j in range(N):
  a=k*N+j;b=k*N+(j+1)%N;faces.append((a,b,offset+b,offset+a))
bowl=mesh('Vented fluted brazier shell',vs,faces,iron,.002)
# Shallow inset ash floor closes the basin while retaining genuine side vents.
bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=1,depth=.012,location=(0,center,.07));o=bpy.context.object;o.name='Recessed solid ash tray';o.scale=(.108,.077,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=root;o.data.materials.append(iron);parts.append(o)
# Oval rolled lip and lower binding ring are closed swept rectangular steel bands.
def band(name,rx,ry,z,rad=.009,n=48,mat=edge):
 vv=[];ff=[]
 for j in range(n):
  a=2*math.pi*j/n
  for k in range(6):
   q=2*math.pi*k/6;vv.append(((rx+rad*math.cos(q))*math.cos(a),center+(ry+rad*math.cos(q))*math.sin(a),z+rad*math.sin(q)))
 for j in range(n):
  for k in range(6):ff.append((j*6+k,((j+1)%n)*6+k,((j+1)%n)*6+(k+1)%6,j*6+(k+1)%6))
 return mesh(name,vv,ff,mat,0)
band('Rolled oval upper lip',.287,.198,.347,.009)
band('Lower riveted binding',.173,.123,.134,.006,n=36,mat=iron)
# Small iron finials punctuate the bowl rim without a literal flame model.
for j,a in enumerate([math.pi*1.13,math.pi*1.5,math.pi*1.87]):
 x=.280*math.cos(a);y=center+.188*math.sin(a);h=.050 if j!=1 else .068;w=.032
 v=[(x-w/2,y+.009,.344),(x+w/2,y+.009,.344),(x,y+.009,.344+h),(x-w/2,y-.009,.344),(x+w/2,y-.009,.344),(x,y-.009,.344+h)]
 mesh('Brazier crown tab %d'%j,v,[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],edge,.001)
# Deliberately low-profile, separately editable rivet heads.
def rivet(name,loc,r=.012):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=(r,.006,r);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=root;o.data.materials.append(edge);parts.append(o)
for i,(x,z) in enumerate([(-.07,.26),(.07,.26),(-.071,-.34),(.071,-.34),(0,.405),(0,-.59)]):rivet('Wall fixing rivet %02d'%i,(x,-.033,z),.010 if abs(x)<.001 else .012)
for i,a in enumerate([math.pi*1.2,math.pi*1.5,math.pi*1.8]):rivet('Bowl band rivet %02d'%i,(.176*math.cos(a),center+.124*math.sin(a)-.004,.135),.009)
# Socket contracts. Empty nodes are retained independently of later mesh merging.
for name,location in [('Mount',(0,0,0)),('FlameOrigin',(0,center,.385)),('LightOrigin',(0,center,1.085))]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=root;o.location=location;o.empty_display_type='PLAIN_AXES';o.empty_display_size=.035;o['semantic_anchor']=True
scene.world=bpy.data.worlds.new('Soft review ambient');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.17,.20,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
for name,loc,power,size,color in [('Key',(-1.2,-1.2,1.5),95,1.2,(1,.88,.72)),('Fill',(1.1,-.8,.5),65,1.3,(.77,.86,1)),('Rim',(.8,.6,.9),120,1,(1,.86,.65))]:
 d=bpy.data.lights.new('Review '+name,'POINT');d.energy=power*3;d.shadow_soft_size=size/2;d.color=color;o=bpy.data.objects.new('Review '+name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,-.18,-.07))-o.location).to_track_quat('-Z','Y').to_euler()
# Review lighting lives outside the asset root and is excluded from game export.
d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(1.05,-1.65,.74);cam.rotation_euler=(Vector((0,-.17,-.08))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=1.5
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
# Remote worker only: portable punctual review lights are also available.
# Local derivation strips all cameras/lights from the runtime asset.
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();verts=[o.matrix_world@v.co for o in parts for v in o.evaluated_get(dg).data.vertices]
lo=[min(v[i] for v in verts) for i in range(3)];hi=[max(v[i] for v in verts) for i in range(3)]
result={'asset':'ashen_iron_sconce','root':'AshenSconce','source_meshes':len(parts),'bounds_blender_min':lo,'bounds_blender_max':hi,'bounds_gltf_size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],'anchors':['Mount','FlameOrigin','LightOrigin'],'authorship':'Original procedural modeling; no catalog assets','bake_required':True,'runtime_lod_targets':[1500,600,200]}
if 'artifacts' in globals():
 scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=512;scene.render.resolution_y=640
 target=artifacts.file(name='sconce-source-review.png',media_type='image/png');scene.render.filepath=str(target.path);bpy.ops.render.render(write_still=True);target.publish()
