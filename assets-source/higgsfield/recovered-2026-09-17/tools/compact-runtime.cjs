// Remove unreachable source accessors/views left by non-destructive derivation.
// Every live accessor's bytes, index order, image bytes and nodes stay unchanged.
const {parseGLB,serializeGLB,sha}=require('./inspect-optimize-glb.cjs');
function compact(bytes){const raw=parseGLB(bytes),j=raw.json,used=new Set();
 for(const m of j.meshes||[])for(const p of m.primitives){for(const i of Object.values(p.attributes))used.add(i);if(p.indices!=null)used.add(p.indices);for(const t of p.targets||[])for(const i of Object.values(t))used.add(i);}
 for(const s of j.skins||[])if(s.inverseBindMatrices!=null)used.add(s.inverseBindMatrices);
 for(const a of j.animations||[])for(const s of a.samplers){used.add(s.input);used.add(s.output);}
 const map=new Map([...used].sort((a,b)=>a-b).map((x,i)=>[x,i])),accessors=[...map.keys()].map(i=>j.accessors[i]);
 for(const m of j.meshes||[])for(const p of m.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=map.get(p.attributes[k]);if(p.indices!=null)p.indices=map.get(p.indices);for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=map.get(t[k]);}
 for(const s of j.skins||[])if(s.inverseBindMatrices!=null)s.inverseBindMatrices=map.get(s.inverseBindMatrices);
 for(const a of j.animations||[])for(const s of a.samplers){s.input=map.get(s.input);s.output=map.get(s.output);}
 const views=new Set();for(const a of accessors){if(a.bufferView!=null)views.add(a.bufferView);if(a.sparse){views.add(a.sparse.indices.bufferView);views.add(a.sparse.values.bufferView);}}for(const i of j.images||[])if(i.bufferView!=null)views.add(i.bufferView);
 const vm=new Map([...views].sort((a,b)=>a-b).map((x,i)=>[x,i])),chunks=[],bufferViews=[];let len=0;
 for(const i of vm.keys()){const v=j.bufferViews[i];if(v.extensions?.EXT_meshopt_compression)throw Error('Compact uncompressed master only');const pad=(4-len%4)%4;if(pad){chunks.push(Buffer.alloc(pad));len+=pad;}const data=raw.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);chunks.push(data);bufferViews.push({...v,buffer:0,byteOffset:len});len+=data.length;}
 for(const a of accessors){if(a.bufferView!=null)a.bufferView=vm.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=vm.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=vm.get(a.sparse.values.bufferView);}}for(const i of j.images||[])if(i.bufferView!=null)i.bufferView=vm.get(i.bufferView);
 const before={accessors:j.accessors.length,bufferViews:j.bufferViews.length,bytes:bytes.length,sha256:sha(bytes)};j.accessors=accessors;j.bufferViews=bufferViews;j.buffers=[{byteLength:len}];const output=serializeGLB(j,Buffer.concat(chunks),raw.extraChunks);return {bytes:output,report:{method:'Drop only unreachable accessors and buffer views; preserve all active bytes and JSON references',before,after:{accessors:accessors.length,bufferViews:bufferViews.length,bytes:output.length,sha256:sha(output)}}};}
module.exports={compact};
