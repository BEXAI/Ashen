// Rebuild only Ranger; never modifies shared manifest or batch summaries.
const path=require('path'),{execFileSync}=require('child_process');
const base=path.resolve(__dirname,'..'),argv=process.argv.slice(2),option=n=>{const i=argv.indexOf(n);return i<0?undefined:argv[i+1];},python=option('--python')||process.env.ASHEN_PYTHON||'python3',deps=option('--deps-root')||require('./resolve-deps.cjs')(__dirname),donors=option('--donors-root')||process.env.ASHEN_DONOR_ROOT;
const node=(script,args=[])=>execFileSync(process.execPath,[path.join(__dirname,script),...args],{cwd:base,stdio:'inherit'});
execFileSync(python,[path.join(__dirname,'reskin-ranger.py')],{cwd:base,stdio:'inherit'});
node('build-ranger.cjs',['--deps-root',deps,...(donors?['--donors-root',donors]:[])]);
node('compact-ranger.cjs');
node('ranger-pipeline/inspect-optimize-glb.cjs',[path.join(base,'runtime/ranger-runtime.glb'),path.join(base,'optimized/ranger'),'--deps-root',deps,'--force']);
node('package-ranger.cjs',['--deps-root',deps]);
