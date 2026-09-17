#!/usr/bin/env node
'use strict';
// Portable offline reproduction. Paid provider calls are intentionally absent.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..'),args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const deps=path.resolve(value('--deps-root',process.env.ASHEN_ASSET_DEPS||process.cwd()));
const rigDonors=path.resolve(value('--rig-donors-root',process.env.ASHEN_RIG_DONOR_ROOT||path.join(base,'../2026-09-08/models')));
const motions=path.resolve(value('--motion-donors-root',process.env.ASHEN_DONOR_ROOT||path.join(rigDonors,'animations')));
const executable=p=>p.includes('/')?path.resolve(p):p;
const python=executable(value('--python',process.env.ASHEN_PYTHON||'python3')),blender=executable(value('--blender-python',process.env.ASHEN_BLENDER_PYTHON||'python3'));
const env={...process.env,ASHEN_ASSET_DEPS:deps,ASHEN_RIG_DONOR_ROOT:rigDonors,ASHEN_DONOR_ROOT:motions};const plan=[];
const node=(file,...a)=>plan.push({program:process.execPath,args:['tools/'+file,...a]});const py=(file,...a)=>plan.push({program:python,args:['tools/'+file,...a]});const bpy=(file,...a)=>plan.push({program:blender,args:['tools/'+file,...a]});
py('verify-originals.py');
node('fit-recovered-rig.cjs','ogre','goblin','silver-knight','sage','lich','skeleton-warrior','knife-rogue');
plan.push({copy:['models/frost-mage-original.glb','derived/frost-mage-rigged.glb'],remove:'derived/frost-mage-rigging.json'});
py('fit-embedded-equipment.py','ogre','goblin','sage','lich','frost-mage','skeleton-warrior');
for(const slug of ['ogre','goblin','sage','lich','skeleton-warrior'])py('reskin-humanoid.py',slug);
py('ground-ogre-body.py');py('complete-frost-shaft.py');py('align-skeleton-sword.py');node('mirror-staff-motion.cjs',path.join(motions,'staff.glb'),'derived/staff-left.glb');
node('build-recovered.cjs','dusk-rogue','lion-knight','frost-mage','ogre','goblin','sage','silver-knight','lich','skeleton-warrior','knife-rogue');
node('update-grounding.cjs','lion-knight','review/animated/lion-knight/grounding-exclusions.json');
if(!args.includes('--core-only')){
 py('reskin-reaper.py');node('build-reaper-base.cjs','--deps-root',deps,'--donors-root',motions);node('constrain-reaper-grip.cjs','--deps-root',deps);node('compact-reaper.cjs');node('reaper-pipeline/inspect-optimize-glb.cjs','runtime/reaper-runtime.glb','optimized/reaper','--deps-root',deps,'--force');node('package-reaper.cjs','--deps-root',deps);
 bpy('reskin-dragon.py');node('build-dragon.cjs','ember-dragon');
 // Ranger is dispatched through its independently maintained, portable recipe.
 node('rebuild-ranger.cjs','--deps-root',deps,'--donors-root',motions,'--python',python);
 bpy('rig-spider.py');bpy('decimate-spider-mobile.py');
 for(const mobile of [false,true])node('spider-pipeline/normalize-retarget-glb.cjs',`derived/spider-rigged${mobile?'-mobile':''}.glb`,`runtime/${mobile?'mobile/':''}spider-runtime.glb`,'--materials-only','--profile','nonmetal','--require-complete','--provenance-json','spider-provenance.json','--deps-root',deps,'--force');
 node('optimize-spider-variants.cjs','runtime/spider-runtime.glb','optimized/spider','--variant','hd2048','--deps-root',deps,'--force');node('optimize-spider-variants.cjs','runtime/mobile/spider-runtime.glb','optimized/spider','--variant','mobile1024','--deps-root',deps,'--force');node('ground-spider.cjs','--deps-root',deps);node('audit-spider-source.cjs','--deps-root',deps);
 node('merge-special-deliveries.cjs');
}
if(args.includes('--plan')){console.log(JSON.stringify({cwd:base,environment:{ASHEN_ASSET_DEPS:deps,ASHEN_RIG_DONOR_ROOT:rigDonors,ASHEN_DONOR_ROOT:motions},steps:plan},null,2));process.exit(0);}
for(const dir of ['derived','runtime','runtime/mobile','optimized','provenance','qa'])fs.mkdirSync(path.join(base,dir),{recursive:true});
for(const step of plan){if(step.copy){fs.copyFileSync(path.join(base,step.copy[0]),path.join(base,step.copy[1]));if(step.remove)fs.rmSync(path.join(base,step.remove),{force:true});continue;}console.log('Running '+step.args.join(' '));const result=spawnSync(step.program,step.args,{cwd:base,env,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
