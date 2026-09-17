import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const roots=['assets-source/higgsfield/2026-09-08','public/assets/roster/september-8','assets-source/higgsfield/recovered-2026-09-17','public/assets/roster/recovered-2026-09-17','assets-source/higgsfield/2026-09-17/bone-throne'];
const file='assets-source/large-assets.json',manifest=JSON.parse(await readFile(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const chunkSize=manifest.chunkBytes,limit=4*1024*1024;
if(!Number.isSafeInteger(chunkSize)||chunkSize<=0)throw Error('Invalid existing chunk size');
await mkdir('assets-source/blocks',{recursive:true});
const additions=[];
async function scan(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=dir+'/'+entry.name;
  if(entry.isDirectory()){await scan(path);continue;}
  if(!entry.isFile()||!/\.(png|mp4|glb|blend|npz)$/.test(path))continue;
  const bytes=await readFile(path);if(bytes.length<=limit)continue;
  const sha256=hash(bytes),parts=[];
  for(let offset=0;offset<bytes.length;offset+=chunkSize){
   const part=bytes.subarray(offset,offset+chunkSize),partPath=`assets-source/blocks/${sha256}-${offset/chunkSize}.part`;
   await writeFile(partPath,part);parts.push({path:partPath,sha256:hash(part)});
  }
  additions.push({path,bytes:bytes.length,sha256,parts});
 }
}
for(const root of roots)await scan(root);
const managed=path=>roots.some(root=>path.startsWith(root+'/'));
manifest.assets=[...manifest.assets.filter(a=>!managed(a.path)),...additions];
await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
const ignore=await readFile('.gitignore','utf8'),unmanaged=ignore.split('\n').filter(line=>!managed(line.replace(/^\//,''))).join('\n');
await writeFile('.gitignore',unmanaged.trimEnd()+'\n'+additions.map(a=>'/'+a.path).join('\n')+'\n');
console.log(`Preserved existing packed assets; packed ${additions.length} roster originals/exports with exact checksums.`);
