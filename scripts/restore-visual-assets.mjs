import {readFile,mkdir,rename,stat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function restoreAsset(entry,root=process.cwd(),outputRoot=root){
 const target=resolve(outputRoot,entry.path),boundary=resolve(outputRoot)+'/';
 if(!target.startsWith(boundary))throw Error('Invalid asset destination');
 try{const bytes=await readFile(target);if(createHash('sha256').update(bytes).digest('hex')===entry.sha256)return false;throw Error(`Asset has local edits: ${entry.path}. Repack or back up those edits before restoring.`);}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(dirname(target),{recursive:true});const temp=target+'.restoring',file=await open(temp,'w'),hash=createHash('sha256');let size=0;
 try{
  for(const part of entry.parts){const source=resolve(root,part.path);if(!source.startsWith(resolve(root)+'/assets-source/blocks/'))throw Error('Invalid asset block');const bytes=await readFile(source);if(createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw Error(`Corrupt asset block: ${part.path}`);await file.writeFile(bytes);hash.update(bytes);size+=bytes.length;}
 }finally{await file.close();}
 if(size!==entry.bytes||hash.digest('hex')!==entry.sha256)throw Error(`Asset integrity failure: ${entry.path}`);
 await rename(temp,target);return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const manifest=JSON.parse(await readFile('assets-source/large-assets.json'));let restored=0;
 for(const entry of manifest.assets)if(await restoreAsset(entry))restored++;
 for(const entry of manifest.assets)if((await stat(entry.path)).size!==entry.bytes)throw Error('Asset size mismatch');
 console.log(`Verified ${manifest.assets.length} large visual assets; restored ${restored}.`);
}
