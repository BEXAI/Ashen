import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const require=createRequire(resolve(process.cwd(),'package.json')),{build}=require('esbuild');
const b=await build({entryPoints:['app/game/auto-controller.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {AutoController}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
function simulation(){const controller=new AutoController(),events=[];let now=0;return {controller,events,get now(){return now;},frame(interval,cpu,classification='steady'){now+=interval;const e=controller.sample({nowMs:now,pacedIntervalMs:interval,cpuSubmissionMs:cpu,classification});if(e)events.push({...e,at:now});return e;},run(ms,metrics){const until=now+ms;while(now<until){const [interval,cpu,kind]=metrics(controller.current);this.frame(interval,cpu,kind);}}};}

test('one spike and a cold upload cannot lower a healthy 60 FPS profile',()=>{
 const s=simulation();s.run(10000,()=>[1000/60,5]);s.frame(350,180);s.run(20000,()=>[1000/60,5]);assert.equal(s.events.length,0);
 s.run(15000,()=>[50,35,'loading']);s.run(10000,()=>[1000/60,5]);assert.equal(s.events.length,0);assert.equal(s.controller.current.scale,1);
});

test('sustained overload stages optional effects and shadow detail before resolution and 30 FPS',()=>{
 const s=simulation();s.run(90000,p=>p.fps===60?[33.34,20]:[1000/30,20]);
 assert.equal(s.controller.current.fps,30);assert.equal(s.controller.current.scale,.65);assert.equal(s.events[0].after.bloom,false);assert.equal(s.events[0].after.scale,1);assert.equal(s.events[1].after.shadowSize,256);assert.equal(s.events[1].after.scale,1);
 const fallback=s.events.findIndex(e=>e.after.fps===30);assert.ok(fallback>=6);for(let i=1;i<s.events.length;i++)assert.ok(s.events[i].at-s.events[i-1].at>=8000,'No rapid allocation/quality churn');
 const events=s.events.length;s.run(180000,()=>[1000/30,20]);assert.equal(s.events.length,events,'Stable paced 30fps must converge, not lower or repeatedly probe with inadequate CPU headroom');assert.equal(s.controller.status.limitation,null);
});

test('a GPU/scheduler-limited 30 FPS workload cannot masquerade as 60 FPS headroom',()=>{
 const s=simulation();s.run(90000,p=>[p.fps===30?1000/30:33.34,5]);assert.equal(s.controller.current.fps,30);
 s.run(125000,p=>[p.fps===30?1000/30:33.34,5]);const probes=s.events.filter(e=>e.reason.startsWith('Probe 60')),rollbacks=s.events.filter(e=>e.reason.startsWith('60 FPS probe missed'));
 assert.equal(probes.length,1);assert.equal(rollbacks.length,1);assert.equal(s.controller.current.fps,30);assert.ok(s.controller.status.nextProbeMs>s.now);assert.ok(rollbacks[0].window.pressure==='interval-only');
});

test('recovery uses a bounded 60 FPS probe before restoring visual quality gradually',()=>{
 const s=simulation();s.run(90000,p=>p.fps===60?[33.34,20]:[1000/30,20]);assert.equal(s.controller.current.fps,30);
 s.run(300000,p=>[1000/p.fps,5]);assert.equal(s.controller.current.fps,60);assert.equal(s.controller.current.stage,0);const probe=s.events.findIndex(e=>e.reason.startsWith('Probe 60')),success=s.events.findIndex(e=>e.reason.startsWith('60 FPS probe sustained'));
 assert.ok(probe>=0&&success>probe);assert.equal(s.events[probe].after.stage,6);assert.ok(s.events.slice(probe+1,success+1).every(e=>e.after.stage===6),'Do not restore visual cost during the FPS probe');
 const recovery=s.events.filter(e=>e.reason.startsWith('Sustained 60 FPS headroom'));assert.equal(recovery.length,6);for(let i=1;i<recovery.length;i++)assert.ok(recovery[i].at-recovery[i-1].at>=30000);
});

test('pause/loading reset evidence without undoing the chosen visual stage',()=>{
 const s=simulation();s.run(9000,()=>[33.34,20]);assert.equal(s.controller.current.stage,1);const before=s.controller.current,events=s.events.length;
 s.controller.resetSamples(s.now,2000);s.run(1500,()=>[33.34,20]);assert.equal(s.events.length,events);assert.deepEqual(s.controller.current,before);
 s.run(2900,()=>[33.34,20]);s.frame(16.67,5,'paused');s.run(3100,()=>[33.34,20]);assert.equal(s.events.length,events,'A partial pressure run cannot bridge suspension');
 s.frame(20000,1);s.run(10000,()=>[1000/60,5]);assert.deepEqual(s.controller.current,before,'A suspension gap cannot trigger downgrade or immediate recovery');
});

test('intentional hit pause does not skew timings or starve adaptation in repeated combat',()=>{
 const s=simulation();let n=0;s.run(20000,()=>[++n%6===0?1000/60:33.34,20,n%6===0?'hit-pause':'steady']);assert.ok(s.controller.current.stage>=1);
 const healthy=simulation();n=0;healthy.run(30000,()=>[++n%6===0?100:1000/60,5,n%6===0?'hit-pause':'steady']);assert.equal(healthy.events.length,0);
});

test('borderline windows do not oscillate around a threshold, and minimum overload is reported',()=>{
 const s=simulation();let n=0;s.run(120000,()=>[++n%20===0?22:17.5,8]);assert.equal(s.events.length,0);
 const severe=simulation();severe.run(140000,()=>[50,35]);assert.equal(severe.controller.current.fps,30);assert.equal(severe.controller.current.scale,.65);assert.match(severe.controller.status.limitation,/Sustained overload/);const count=severe.events.length;severe.run(120000,()=>[50,35]);assert.equal(severe.events.length,count,'Do not cycle or exceed the existing minimum scale');
});
