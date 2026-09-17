import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
const input=await readFile('public/assets/dungeon/v9/entry.glb');
assert.equal(hash(input),'3177efecfd238857f78eea3e7109e8fec16a64afe2f639a55cd455327b350507');
const jsonLength=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+jsonLength).toString());
assert.deepEqual(json.scenes[0].nodes,[0,1,2,3,4,5]);
assert.equal(json.nodes[5].name,'entry-5');
assert.equal(json.meshes[json.nodes[5].mesh].primitives.length,1);
const fixture=json.meshes[json.nodes[5].mesh].primitives[0];
assert.equal(json.accessors[fixture.indices].count,144*3);
// Only detach the independently batched old iron fixtures. Keep all geometry,
// UV1/lightmap data, compression buffers and remaining scene references intact.
json.scenes[0].nodes=json.scenes[0].nodes.filter(n=>n!==5);
let encoded=Buffer.from(JSON.stringify(json));
encoded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
const header=Buffer.from(input.subarray(0,20)),bin=input.subarray(20+jsonLength);
header.writeUInt32LE(20+encoded.length+bin.length,8);header.writeUInt32LE(encoded.length,12);
const output=Buffer.concat([header,encoded,bin]);
const manifest=JSON.parse(await readFile('public/assets/dungeon/v9/manifest.json','utf8'));
manifest.version='visual-v10';manifest.derivation='v9 with entry legacy iron fixture scene node detached for the Higgsfield pilot. Remaining geometry, UV1 and lightmaps are byte-identical.';
const entry=manifest.rooms.find(r=>r.id==='entry');
Object.assign(entry,{url:'/assets/dungeon/v10/entry.glb',triangles:entry.triangles-144,materialDraws:entry.materialDraws-1,bytes:output.length,sha256:hash(output)});
await mkdir('public/assets/dungeon/v10',{recursive:true});
await writeFile('public/assets/dungeon/v10/entry.glb',output);
await writeFile('public/assets/dungeon/v10/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version:manifest.version,entry}));
