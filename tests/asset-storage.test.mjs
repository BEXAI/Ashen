import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {restoreAsset} from '../scripts/restore-visual-assets.mjs';
const manifest=JSON.parse(await readFile('assets-source/large-assets.json'));
test('Stored blocks reconstruct exact master and runtime asset bytes',async()=>{
 const out=resolve('.sites-runtime/restoration-proof');await rm(out,{recursive:true,force:true});
 for(const entry of [manifest.assets.find(a=>a.path.endsWith('-base.png')),manifest.assets.find(a=>a.path.startsWith('public/'))]){
  assert.equal(await restoreAsset(entry,process.cwd(),out),true);
  const bytes=await readFile(resolve(out,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.deepEqual(bytes,await readFile(entry.path));assert.equal(await restoreAsset(entry,process.cwd(),out),false);
 }
 await rm(out,{recursive:true,force:true});
});
test('Restoring assets cannot overwrite an artist’s local edits',async()=>{
 const out=resolve('.sites-runtime/restoration-edits'),entry=manifest.assets[0],path=resolve(out,entry.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,'local artist edits');
 await assert.rejects(restoreAsset(entry,process.cwd(),out),/local edits/);assert.equal(await readFile(path,'utf8'),'local artist edits');await rm(out,{recursive:true,force:true});
});
