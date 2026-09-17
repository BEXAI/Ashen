'use strict';
// CPU evaluation of actual skinned positions. Static mesh.getBounds() is unsuitable
// for the Meshy .01 Armature / inverse-bind convention used by the pilot.
function dense(accessor) {
  const a = new Float64Array(accessor.getCount() * accessor.getElementSize()), tmp = [];
  for (let i = 0; i < accessor.getCount(); i++) { accessor.getElement(i, tmp); for (let j = 0; j < accessor.getElementSize(); j++) a[i * accessor.getElementSize() + j] = tmp[j]; }
  return a;
}
function box() { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
function expand(b, x, y, z) { const v = [x, y, z]; for (let c = 0; c < 3; c++) { b.min[c] = Math.min(b.min[c], v[c]); b.max[c] = Math.max(b.max[c], v[c]); } }
function merge(a, b) { expand(a, ...b.min); expand(a, ...b.max); }
function completed(b) { return b.min.every(Number.isFinite) ? { ...b, size: b.max.map((x, i) => x - b.min[i]) } : null; }

function sampleTrack(track, time, THREE) {
  const times = track.times, values = track.values, n = track.width;
  let lo = 0, hi = times.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (times[mid] <= time) lo = mid; else hi = mid - 1; }
  const a = lo, b = Math.min(a + 1, times.length - 1), dt = times[b] - times[a];
  const u = dt > 0 ? Math.max(0, Math.min(1, (time - times[a]) / dt)) : 0;
  if (track.interpolation === 'CUBICSPLINE') {
    const result = [], u2 = u*u, u3 = u2*u;
    for (let j = 0; j < n; j++) result.push((2*u3-3*u2+1)*values[(a*3+1)*n+j] + (u3-2*u2+u)*dt*values[(a*3+2)*n+j] + (-2*u3+3*u2)*values[(b*3+1)*n+j] + (u3-u2)*dt*values[(b*3)*n+j]);
    return track.path === 'rotation' ? new THREE.Quaternion().fromArray(result).normalize().toArray() : result;
  }
  if (track.interpolation === 'STEP' || a === b) return Array.from(values.subarray(a*n, (a+1)*n));
  if (track.path === 'rotation') return new THREE.Quaternion().fromArray(values, a*n).slerp(new THREE.Quaternion().fromArray(values, b*n), u).normalize().toArray();
  return Array.from({ length: n }, (_, j) => values[a*n+j]*(1-u)+values[b*n+j]*u);
}

function sampleSkinnedBounds(document, THREE, sampleCount = 17, exclusions = {}) {
  const root = document.getRoot(), nodes = root.listNodes(), nodeIndex = new Map(nodes.map((n,i)=>[n,i]));
  const parents = nodes.map(n => nodeIndex.get(n.getParentNode()) ?? -1);
  const rests = nodes.map(n => ({ translation: n.getTranslation(), rotation: n.getRotation(), scale: n.getScale(), weights: n.getWeights().length ? n.getWeights() : n.getMesh()?.getWeights() || [] }));
  const skins = root.listSkins().map(s => ({ skin: s, joints: s.listJoints().map(n=>nodeIndex.get(n)), inverse: s.listJoints().map((_, i) => s.getInverseBindMatrices() ? new THREE.Matrix4().fromArray(s.getInverseBindMatrices().getElement(i, [])) : new THREE.Matrix4()) }));
  const primitives = [];
  for (let node = 0; node < nodes.length; node++) {
    const mesh = nodes[node].getMesh(); if (!mesh) continue;
    if((exclusions.nodeNames||[]).includes(nodes[node].getName())||(exclusions.meshNames||[]).includes(mesh.getName()))continue;
    const meshIndex=root.listMeshes().indexOf(mesh);
    for (const p of mesh.listPrimitives()) {
      const position = p.getAttribute('POSITION'); if (!position) continue;
      const sets = p.listSemantics().filter(s=>/^JOINTS_\d+$/.test(s)).map(s => ({ joints: dense(p.getAttribute(s)), weights: dense(p.getAttribute(s.replace('JOINTS_', 'WEIGHTS_'))) }));
      const primitiveIndex=mesh.listPrimitives().indexOf(p),excludedVertices=new Set((exclusions.vertexSets||[]).filter(v=>v.mesh===meshIndex&&v.primitive===primitiveIndex).flatMap(v=>v.vertices));
      primitives.push({ node, positions: dense(position), excludedVertices, skin: skins.find(s=>s.skin===nodes[node].getSkin()), sets, morphs: p.listTargets().map(t=>t.getAttribute('POSITION') ? dense(t.getAttribute('POSITION')) : null) });
    }
  }
  const world = nodes.map(()=>new THREE.Matrix4());
  function pose(tracks, time) {
    const states = rests.map(r=>({ ...r }));
    for (const t of tracks) states[t.node][t.path] = sampleTrack(t, time, THREE);
    const done = new Set();
    function update(i) { if(done.has(i))return; const r=states[i]; world[i].compose(new THREE.Vector3().fromArray(r.translation),new THREE.Quaternion().fromArray(r.rotation),new THREE.Vector3().fromArray(r.scale)); if(parents[i]>=0){update(parents[i]);world[i].premultiply(world[parents[i]]);} done.add(i); }
    nodes.forEach((_,i)=>update(i));
    const skinMatrices = new Map(skins.map(s=>[s, s.joints.map((j,i)=>world[j].clone().multiply(s.inverse[i]).elements)]));
    const bounds = box();
    for (const p of primitives) {
      const mats = p.skin ? skinMatrices.get(p.skin) : null, model = world[p.node].elements, morphWeights=states[p.node].weights;
      for(let v=0;v<p.positions.length/3;v++) {
        if(p.excludedVertices.has(v))continue;
        let x=p.positions[v*3],y=p.positions[v*3+1],z=p.positions[v*3+2];
        p.morphs.forEach((m,i)=>{const w=morphWeights[i]||0;if(m&&w){x+=m[v*3]*w;y+=m[v*3+1]*w;z+=m[v*3+2]*w;}});
        let ox=0,oy=0,oz=0,total=0;
        if(mats&&p.sets.length)for(const set of p.sets)for(let k=0;k<4;k++){
          const w=set.weights[v*4+k];if(!w)continue;const m=mats[set.joints[v*4+k]];
          ox+=(m[0]*x+m[4]*y+m[8]*z+m[12])*w;oy+=(m[1]*x+m[5]*y+m[9]*z+m[13])*w;oz+=(m[2]*x+m[6]*y+m[10]*z+m[14])*w;total+=w;
        }
        if(!total){ox=model[0]*x+model[4]*y+model[8]*z+model[12];oy=model[1]*x+model[5]*y+model[9]*z+model[13];oz=model[2]*x+model[6]*y+model[10]*z+model[14];}
        expand(bounds,ox,oy,oz);
      }
    }
    const contacts={};for(let i=0;i<nodes.length;i++)if(['ContactBase','ContactTip','EquippedMuzzle','LeftHand','RightHand','Hips','LeftFoot','RightFoot','LeftToeBase','RightToeBase'].includes(nodes[i].getName()))contacts[nodes[i].getName()]=new THREE.Vector3().setFromMatrixPosition(world[i]).toArray();
    return { time, bounds: completed(bounds), keyNodePositions: contacts };
  }
  const result = { units: 'glTF world meters', method: 'CPU skinning: sum(weight * jointWorld * inverseBind * vertex); includes morphs', sampleCountPerClip: sampleCount, limitation: 'Uniform time samples, not guaranteed continuous extrema', rest: pose([],0), clips: [] };
  for(const animation of root.listAnimations()){
    const tracks=animation.listChannels().map(c=>{const s=c.getSampler(),a=s.getOutput();return{node:nodeIndex.get(c.getTargetNode()),path:c.getTargetPath(),times:dense(s.getInput()),values:dense(a),width:c.getTargetPath()==='weights'?a.getCount()/s.getInput().getCount()/(s.getInterpolation()==='CUBICSPLINE'?3:1):a.getElementSize(),interpolation:s.getInterpolation()};});
    const start=Math.min(...tracks.map(t=>t.times[0])),end=Math.max(...tracks.map(t=>t.times[t.times.length-1]));
    const union=box(),samples=[];for(let i=0;i<sampleCount;i++){const s=pose(tracks,start+(end-start)*i/(sampleCount-1));if(s.bounds)merge(union,s.bounds);samples.push(s);}
    result.clips.push({name:animation.getName(),start,end,duration:end-start,unionBounds:completed(union),minimumVertexY:Math.min(...samples.map(s=>s.bounds?.min[1]??Infinity)),maximumVertexY:Math.max(...samples.map(s=>s.bounds?.max[1]??-Infinity)),samples});
  }
  return result;
}
module.exports={sampleSkinnedBounds,sampleTrack,dense};
