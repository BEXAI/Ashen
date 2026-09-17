// Bake two-hand reach constraints onto genuine retargeted motion; no mesh edits.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),req=require('module').createRequire(path.join(require('./resolve-deps.cjs')(__dirname),'package.json'));
const{NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),T=req('three');
const{sampleTrack,dense}=require('./reaper-pipeline/sample-skinned-bounds.cjs');
const base=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const input=path.join(base,'runtime/reaper-retargeted.glb'),io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(input),root=doc.getRoot(),nodes=root.listNodes(),ix=new Map(nodes.map((n,i)=>[n,i])),byName=new Map(nodes.map((n,i)=>[n.getName(),i])),parents=nodes.map(n=>ix.get(n.getParentNode())??-1);
 const rests=nodes.map(n=>({translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale()})),matrices=nodes.map(()=>new T.Matrix4());let states;
 const V=a=>new T.Vector3().fromArray(a),Q=a=>new T.Quaternion().fromArray(a);
 function update(){const done=new Set();function one(i){if(done.has(i))return;const s=states[i];matrices[i].compose(V(s.translation),Q(s.rotation),V(s.scale));if(parents[i]>=0){one(parents[i]);matrices[i].premultiply(matrices[parents[i]]);}done.add(i);}nodes.forEach((_,i)=>one(i));}
 const pos=i=>new T.Vector3().setFromMatrixPosition(matrices[i]);
 const rot=i=>{const q=new T.Quaternion();matrices[i].decompose(new T.Vector3(),q,new T.Vector3());return q;};
 const L=['LeftArm','LeftForeArm','LeftHand'].map(n=>byName.get(n)),R=['RightArm','RightForeArm','RightHand'].map(n=>byName.get(n));
 if([...L,...R].some(i=>i===undefined))throw Error('Arm chain absent');
 states=rests.map(s=>({...s}));update();
 const grip=matrices[R[2]].clone().invert().multiply(matrices[L[2]]),gripOffset=new T.Vector3(),gripRotation=new T.Quaternion();grip.decompose(gripOffset,gripRotation,new T.Vector3());
 const lengths=chain=>[pos(chain[0]).distanceTo(pos(chain[1])),pos(chain[1]).distanceTo(pos(chain[2]))],lenL=lengths(L),lenR=lengths(R);
 const setWorldRotation=(i,q)=>{const parent=parents[i]>=0?rot(parents[i]):new T.Quaternion();states[i].rotation=parent.invert().multiply(q).normalize().toArray();update();};
 function solve(chain,target,handQ,pole){
  const s=pos(chain[0]),e=pos(chain[1]),w=pos(chain[2]),a=s.distanceTo(e),b=e.distanceTo(w),delta=target.clone().sub(s),distance=T.MathUtils.clamp(delta.length(),Math.abs(a-b)+1e-5,a+b-1e-5),axis=delta.normalize();
  const x=(a*a-b*b+distance*distance)/(2*distance),h=Math.sqrt(Math.max(0,a*a-x*x));
  const bend=pole.clone().sub(s);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-10){bend.set(0,0,-1);bend.addScaledVector(axis,-bend.dot(axis));}bend.normalize();
  const elbow=s.clone().addScaledVector(axis,x).addScaledVector(bend,h),desired=s.clone().addScaledVector(axis,distance);
  setWorldRotation(chain[0],new T.Quaternion().setFromUnitVectors(e.sub(s).normalize(),elbow.clone().sub(s).normalize()).multiply(rot(chain[0])));
  const nowElbow=pos(chain[1]),nowWrist=pos(chain[2]);
  setWorldRotation(chain[1],new T.Quaternion().setFromUnitVectors(nowWrist.sub(nowElbow).normalize(),desired.clone().sub(nowElbow).normalize()).multiply(rot(chain[1])));
  setWorldRotation(chain[2],handQ);
 }
 function project(p,center,lengths){const delta=p.clone().sub(center),min=Math.abs(lengths[0]-lengths[1])+1e-4,max=lengths[0]+lengths[1]-1e-4,d=delta.length();if(d<min||d>max)p.copy(center).addScaledVector(delta.normalize(),T.MathUtils.clamp(d,min,max));}
 const report={input:path.relative(base,input),inputSHA256:sha(fs.readFileSync(input)),method:'Native source clips preserved below the shoulder. Two-bone arm IK baked at 48Hz with unchanged limb lengths/rest transforms; right-hand target minimally projected into the shared two-hand reach region. Right-hand native orientation preserved; left-hand bind grip follows the rigid scythe.',leftArmLengths:lenL,rightArmLengths:lenR,offhandGripInRightHand:{translation:gripOffset.toArray(),rotation:gripRotation.toArray()},clips:[]};
 for(const animation of root.listAnimations()){
  const tracks=animation.listChannels().map(c=>{const s=c.getSampler(),a=s.getOutput();return{node:ix.get(c.getTargetNode()),path:c.getTargetPath(),times:dense(s.getInput()),values:dense(a),width:a.getElementSize(),interpolation:s.getInterpolation()};});
  const start=Math.min(...tracks.map(t=>t.times[0])),end=Math.max(...tracks.map(t=>t.times[t.times.length-1])),count=Math.max(2,Math.ceil((end-start)*48)+1),times=[],values=new Map([...L,...R].map(i=>[i,[]]));
  let maxGripError=0,maxRightShift=0;const gripErrors=[];
  for(let frame=0;frame<count;frame++){
   const time=start+(end-start)*frame/(count-1);times.push(time);states=rests.map(s=>({...s}));for(const t of tracks)states[t.node][t.path]=sampleTrack(t,time,T);update();
   const shoulderR=pos(R[0]),shoulderL=pos(L[0]),rightOriginal=pos(R[2]),rightTarget=rightOriginal.clone(),rightQ=rot(R[2]),leftQ=rightQ.clone().multiply(gripRotation),offset=gripOffset.clone().applyQuaternion(rightQ),rightPole=pos(R[1]),leftPole=pos(L[1]);
   for(let i=0;i<24;i++){project(rightTarget,shoulderR,lenR);project(rightTarget,shoulderL.clone().sub(offset),lenL);}
   solve(R,rightTarget,rightQ,rightPole);
   const leftTarget=pos(R[2]).add(offset);solve(L,leftTarget,leftQ,leftPole);
   const error=pos(L[2]).distanceTo(leftTarget),shift=pos(R[2]).distanceTo(rightOriginal);maxGripError=Math.max(maxGripError,error);maxRightShift=Math.max(maxRightShift,shift);gripErrors.push(error);
   for(const i of [...L,...R]){let q=Q(states[i].rotation),out=values.get(i);if(out.length&&q.dot(Q(out.slice(-4)))<0)q.set(-q.x,-q.y,-q.z,-q.w);out.push(...q.toArray());}
  }
  for(const c of [...animation.listChannels()])if([...L,...R].includes(ix.get(c.getTargetNode()))&&c.getTargetPath()==='rotation'){animation.removeChannel(c);c.dispose();}
  const buffer=root.listBuffers()[0],inputAccessor=doc.createAccessor(animation.getName()+' grip times').setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
  for(const i of [...L,...R]){const output=doc.createAccessor(animation.getName()+' '+nodes[i].getName()+' grip rotations').setType('VEC4').setArray(new Float32Array(values.get(i))).setBuffer(buffer),sampler=doc.createAnimationSampler().setInput(inputAccessor).setOutput(output).setInterpolation('LINEAR'),channel=doc.createAnimationChannel().setTargetNode(nodes[i]).setTargetPath('rotation').setSampler(sampler);animation.addSampler(sampler).addChannel(channel);}
  animation.setExtras({...animation.getExtras(),twoHandGripCorrection:{method:'48Hz analytic arm IK with native wrist orientation',maxGripError,maxPrimaryHandShift:maxRightShift}});
  report.clips.push({name:animation.getName(),duration:end-start,samples:count,maxGripError,maxPrimaryHandShift:maxRightShift});
 }
 const bytes=await io.writeBinary(doc),output=path.join(base,'runtime/reaper-runtime.glb');fs.writeFileSync(output,bytes);report.output={path:path.relative(base,output),bytes:bytes.length,sha256:sha(bytes)};
 fs.writeFileSync(path.join(base,'reaper-grip-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})();
