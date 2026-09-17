import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const chunkSize=3*1024*1024,limit=4*1024*1024,assets=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir('assets-source/blocks',{recursive:true});
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())await scan(path);else if(/\.(png|glb|bin|blend)$/.test(path)){const bytes=await readFile(path);if(bytes.length<=limit)continue;const digest=hash(bytes),parts=[];for(let i=0;i<bytes.length;i+=chunkSize){const block=bytes.subarray(i,i+chunkSize),name=`assets-source/blocks/${digest}-${i/chunkSize}.part`;await writeFile(name,block);parts.push({path:name,sha256:hash(block)});}assets.push({path,bytes:bytes.length,sha256:digest,parts});}}}
for(const root of ['assets-source/characters','assets-source/materials','assets-source/sovereign-v10','assets-source/sovereign-v11','assets-source/props','public/assets/characters/v9','public/assets/characters/v10','public/assets/characters/v11'])await scan(root);
await writeFile('assets-source/large-assets.json',JSON.stringify({version:1,encoding:'raw byte ranges; exact SHA-256 reconstruction',chunkBytes:chunkSize,assets},null,2)+'\n');
const marker='# Generated large visual assets: restored by npm prebuild from tracked byte blocks.';
let ignore=await readFile('.gitignore','utf8');ignore=ignore.split(marker)[0].trimEnd()+'\n\n'+marker+'\n'+assets.map(a=>'/'+a.path).join('\n')+'\n';await writeFile('.gitignore',ignore);
console.log(`Packed ${assets.length} assets into ${assets.reduce((n,a)=>n+a.parts.length,0)} blocks; original files remain intact.`);
