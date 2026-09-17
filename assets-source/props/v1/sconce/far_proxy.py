"""A 188-triangle silhouette proxy for distant sconces, using the existing atlas.
Large surfaces retain the basin, vent gaps, blade-shaped backplate and two straps.
Small trim is intentionally removed. Exported alongside unchanged semantic anchors.
"""
import bpy,bmesh,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def build_far_proxy(reference,atlas,root):
 vertices=[];faces=[]
 def add(v,f):
  start=len(vertices);vertices.extend(v);faces.extend([tuple(start+i for i in p) for p in f])
 n=8;center=-.265;profile=[(.09,.065,.047),(.20,.137,.20),(.287,.198,.347)]
 v=[];f=[]
 for inner in [False,True]:
  for rx,ry,z in profile:
   rx-=.012 if inner else 0;ry-=.012 if inner else 0
   for j in range(n):
    a=2*math.pi*j/n;v.append((rx*math.cos(a),center+ry*math.sin(a),z))
 offset=n*len(profile)
 for k in range(2):
  for j in range(n):
   a=k*n+j;b=k*n+(j+1)%n;c=(k+1)*n+(j+1)%n;d=(k+1)*n+j
   if k==0 and j%2==0:f.extend([(a,offset+a,offset+b,b),(d,c,offset+c,offset+d),(a,d,offset+d,offset+a),(b,offset+b,offset+c,c)])
   else:f.extend([(a,b,c,d),(offset+d,offset+c,offset+b,offset+a)])
 for k in [0,2]:
  for j in range(n):
   a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,offset+b,offset+a))
 add(v,f)
 # A shallow ash floor, retained at all distances.
 add([(0,center,.07)]+[(.108*math.cos(2*math.pi*j/n),center+.077*math.sin(2*math.pi*j/n),.07) for j in range(n)],[(0,j+1,(j+1)%n+1) for j in range(n)])
 shape=[(0,.449),(.09,.27),(.075,-.1),(.115,-.34),(.07,-.54),(0,-.649),(-.07,-.54),(-.115,-.34),(-.075,-.1),(-.09,.27)]
 v=[(x,y,z) for y in [-.027,-.003] for x,z in shape];n=len(shape);f=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)];add(v,f)
 for side in [-1,1]:
  pts=[Vector((side*.072,-.028,-.37)),Vector((side*.086,-.16,-.13)),Vector((side*.099,-.293,.07))];v=[]
  for j,p in enumerate(pts):
   tangent=(pts[min(j+1,2)]-pts[max(j-1,0)]).normalized();axis=Vector((1,0,0));orth=tangent.cross(axis).normalized()
   for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:v.append(tuple(p+a*axis*.019+b*orth*.0105))
  f=[(3,2,1,0),(8,9,10,11)]
  for j in range(2):
   for k in range(4):f.append((4*j+k,4*j+(k+1)%4,4*(j+1)+(k+1)%4,4*(j+1)+k))
  add(v,f)
 data=bpy.data.meshes.new('Distant basin silhouette');data.from_pydata(vertices,[],faces);data.update();o=bpy.data.objects.new('AshenSconce_LOD2',data);bpy.context.scene.collection.objects.link(o);o.parent=root;o['lod']=2
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free();data.update()
 # Transfer a representative atlas sample for each far triangle. Small nonzero
 # UV extent keeps valid gradients without stretching across unrelated islands.
 reference.data.calc_loop_triangles();tris=list(reference.data.loop_triangles);points=[v.co.copy() for v in reference.data.vertices];tree=BVHTree.FromPolygons(points,[tuple(t.vertices) for t in tris],all_triangles=True)
 source_uv=reference.data.uv_layers.active.data;uv=data.uv_layers.new(name='UVMap')
 for poly in data.polygons:
  center=sum((data.vertices[i].co for i in poly.vertices),Vector())/3
  hit,norm,index,distance=tree.find_nearest(center)
  tri=tris[index];sample=sum((source_uv[i].uv for i in tri.loops),Vector((0,0)))/3
  for j,loop in enumerate(poly.loop_indices):uv.data[loop].uv=sample+Vector([(0,0),(.0002,0),(0,.0002)][j])
 # All LOD nodes share the exact atlas material and textures.
 material=atlas
 data.materials.append(material);data.validate(clean_customdata=False);data.calc_loop_triangles()
 assert len(data.loop_triangles)==188,len(data.loop_triangles)
 return o
