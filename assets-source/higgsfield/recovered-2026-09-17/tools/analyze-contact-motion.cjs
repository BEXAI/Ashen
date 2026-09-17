#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createRequire}=require('node:module');
const {sampleTrack,dense}=require('./sample-skinned-bounds.cjs');
const req=createRequire(path.join(process.env.ASHEN_ASSET_DEPS||process.cwd(),'package.json'));
const {NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),T=req('three');
const strikes=new Set(['side','diagonal','backhand','overhead']);
async function main(){
  const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
  const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(input),root=document.getRoot(),nodes=root.listNodes();
  const map=new Map(nodes.map((n,i)=>[n,i])),parents=nodes.map(n=>map.get(n.getParentNode())??-1);
  const rest=nodes.map(n=>({translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale()}));
  const tip=nodes.findIndex(n=>n.getName()==='ContactTip');if(tip<0)throw Error('No ContactTip');
  const result={input,method:'ContactTip world motion sampled at 120 Hz. Candidate interval is contiguous >=50% peak speed around fastest sample.',limitation:'Kinematic candidate, not observed collision or validated release timing. Equipment sockets are provisional; recovery can be faster than the active strike. Native duration is preserved.',clips:[]};
  for(const a of root.listAnimations()){
    if(!strikes.has(a.getName()))continue;
    const tracks=a.listChannels().map(c=>{const s=c.getSampler();return{node:map.get(c.getTargetNode()),path:c.getTargetPath(),times:dense(s.getInput()),values:dense(s.getOutput()),width:s.getOutput().getElementSize(),interpolation:s.getInterpolation()};});
    const start=Math.min(...tracks.map(t=>t.times[0])),end=Math.max(...tracks.map(t=>t.times[t.times.length-1])),duration=end-start,N=Math.ceil(duration*120),dt=duration/N;
    const samples=[];
    for(let f=0;f<=N;f++){
      const states=rest.map(r=>({...r})),time=start+f*dt;for(const t of tracks)states[t.node][t.path]=sampleTrack(t,time,T);
      const world=new Map();function matrix(i){if(world.has(i))return world.get(i);const s=states[i],m=new T.Matrix4().compose(new T.Vector3().fromArray(s.translation),new T.Quaternion().fromArray(s.rotation),new T.Vector3().fromArray(s.scale));if(parents[i]>=0)m.premultiply(matrix(parents[i]));world.set(i,m);return m;}
      samples.push(new T.Vector3().setFromMatrixPosition(matrix(tip)));
    }
    const speed=samples.slice(1).map((v,i)=>v.distanceTo(samples[i])/dt);let peak=0;for(let i=1;i<speed.length;i++)if(speed[i]>speed[peak])peak=i;
    const threshold=speed[peak]*.5;let lo=peak,hi=peak;while(lo>0&&speed[lo-1]>=threshold)lo--;while(hi<speed.length-1&&speed[hi+1]>=threshold)hi++;
    const localPeaks=speed.map((v,i)=>({i,v})).filter(({i,v})=>i>0&&i<speed.length-1&&v>=speed[i-1]&&v>speed[i+1]&&v>=threshold).sort((a,b)=>b.v-a.v).slice(0,5).map(({i,v})=>({phase:(i+.5)/N,seconds:(i+.5)*dt,speedMetersPerSecond:v}));
    result.clips.push({name:a.getName(),durationSeconds:duration,peakTipSpeedMetersPerSecond:speed[peak],peakPhase:(peak+.5)/N,candidateActivePhase:[lo/N,(hi+1)/N],candidateActiveSeconds:[lo*dt,(hi+1)*dt],localPeaks,source:a.getExtras().provenance||null});
  }
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,clips:result.clips.map(({name,durationSeconds,peakPhase,candidateActivePhase})=>({name,durationSeconds,peakPhase,candidateActivePhase}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
