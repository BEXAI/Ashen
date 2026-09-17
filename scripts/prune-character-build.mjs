import {access, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {relative, resolve, sep} from 'node:path';

// Source assets remain available for editing and regression tests. Production
// ships the Keeper dependency set. The September roster supplies hero/enemies.
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
// GameEngine registers only the Keeper with the legacy loader; the sixteen
// September characters use their own manifest. Preserve historical assets in
// public/assets for authoring and regression tests, but omit unused deploy bytes.
if(!manifest.characters['ash-knight'])throw new Error('Missing Keeper character');
manifest.characters={'ash-knight':manifest.characters['ash-knight']};
manifest.version+='-keeper-only';
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
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
