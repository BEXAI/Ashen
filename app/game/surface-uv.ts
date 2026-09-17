import * as T from 'three';

/** Authoring contract shared by room fallback meshes and streamed baked rooms. */
export const DUNGEON_SURFACE_TILE_METRES=4;

/**
 * Set only UV0 from metre-scale positions. UV1, indices, positions, normals,
 * vertex colors and the existing lightmap remain untouched.
 * Pass the loaded node matrix: meshopt can put quantization scale/offset there.
 */
export function applyWorldSurfaceUV(geometry:T.BufferGeometry,matrix?:T.Matrix4){
 const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
 if(!position||!normal)return geometry;
 const values=new Float32Array(position.count*2),p=new T.Vector3(),n=new T.Vector3();
 const normalMatrix=matrix?new T.Matrix3().getNormalMatrix(matrix):undefined;
 for(let i=0;i<position.count;i++){
  p.fromBufferAttribute(position,i);n.fromBufferAttribute(normal,i);
  if(matrix)p.applyMatrix4(matrix);if(normalMatrix)n.applyMatrix3(normalMatrix).normalize();
  // Same projection and sign convention already used by world.ts architecture.
  const a=Math.abs(n.y)>.5?p.x:Math.abs(n.x)>.5?p.z:p.x;
  const b=Math.abs(n.y)>.5?p.z:p.y;
  values[i*2]=a/DUNGEON_SURFACE_TILE_METRES;values[i*2+1]=b/DUNGEON_SURFACE_TILE_METRES;
 }
 // Loaded UV attributes may be normalized integer arrays; world UVs exceed [0,1].
 geometry.setAttribute('uv',new T.BufferAttribute(values,2));
 return geometry;
}
