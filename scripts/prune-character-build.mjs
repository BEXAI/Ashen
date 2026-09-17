import {access, readFile, readdir, rm, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {relative, resolve, sep} from 'node:path';

// Source assets remain available for editing and regression tests. Production
// ships the active manifest and its complete variant/fallback dependency set.
const root=fileURLToPath(new URL('../',import.meta.url));
const client=resolve(root,'dist/client');
const characterRoot=resolve(client,'assets/characters');
const loader=await readFile(resolve(root,'app/game/character-assets.ts'),'utf8');
const manifestUrl=loader.match(/CHARACTER_MANIFEST_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
if(!manifestUrl)throw new Error('Cannot resolve active character manifest');
const resolveAsset=url=>{
  if(typeof url!=='string'||!url.startsWith('/assets/characters/'))throw new Error(`Unexpected character URL: ${url}`);
  const path=resolve(client,'.'+url);
  if(!path.startsWith(characterRoot+sep))throw new Error('Character URL escapes build directory');
  return path;
};
const manifestPath=resolveAsset(manifestUrl);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const keep=new Set([manifestPath]);
for(const character of Object.values(manifest.characters)){
  for(const variant of Object.values(character.variants)){
    keep.add(resolveAsset(variant.url));
    keep.add(resolveAsset(variant.fallback));
  }
}
// Validate dependencies before removing any generated output.
for(const path of keep)await access(path);
let removedBytes=0,removedFiles=0;
async function prune(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=resolve(directory,entry.name);
    if(entry.isDirectory())await prune(path);
    else if(!keep.has(path)){
      removedBytes+=(await stat(path)).size;
      await rm(path);removedFiles++;
    }
  }
}
await prune(characterRoot);
console.log(`Kept ${keep.size} active character files; omitted ${removedFiles} legacy files (${(removedBytes/1048576).toFixed(1)} MiB) from ${relative(root,client)}.`);
