import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const roots=['app','db','worker','build','scripts','tests'];
const files=[];
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(/\.(?:ts|tsx|js|mjs)$/.test(file)&&!file.endsWith('.d.ts'))files.push(file);}}
for(const root of roots)await scan(root);
let failed=false;
for(const file of files){
 const text=await readFile(file,'utf8');
 const result=ts.transpileModule(text,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,isolatedModules:true}});
 const errors=result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)??[];
 if(errors.length){failed=true;console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));}
}
let built=0;
async function checkBuild(dir){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
 for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())await checkBuild(file);else if(/\.(?:js|mjs)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});built++;if(r.status!==0){failed=true;console.error(r.stderr);}}}}
await checkBuild('dist');
if(failed)process.exit(1);
console.log(`Syntax checked ${files.length} source files and ${built} compiled JavaScript modules.`);
