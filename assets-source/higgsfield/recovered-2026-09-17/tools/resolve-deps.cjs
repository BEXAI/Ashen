// Find installed project dependencies without installing or embedding a user path.
const fs=require('fs'),path=require('path');
module.exports=function resolveDeps(start=__dirname,argv=process.argv.slice(2)){
 const index=argv.indexOf('--deps-root');
 const supplied=index>=0?argv[index+1]:process.env.ASHEN_ASSET_DEPS||process.env.ASHEN_PACKAGE_JSON;
 const usable=p=>fs.existsSync(path.join(p,'node_modules/@gltf-transform/core/package.json'));
 if(supplied){const p=path.resolve(supplied.endsWith('.json')?path.dirname(supplied):supplied);if(!usable(p))throw Error('Dependency directory is missing @gltf-transform/core: '+p);return p;}
 const seen=new Set();
 for(const initial of [start,process.cwd()])for(let p=path.resolve(initial);!seen.has(p);p=path.dirname(p)){
  seen.add(p);if(usable(p))return p;
  // Also support a sibling checkout when recipes live in a workspace source archive.
  for(const name of ['Ashen-current','Ashen','game']){const candidate=path.join(p,name);if(usable(candidate))return candidate;}
  if(path.dirname(p)===p)break;
 }
 return process.cwd(); // The caller's normal require error retains the package name.
};
