import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(process.env.ASHEN_REPO_ROOT??root,'package.json'));
const {build}=require('esbuild');
const parent=path.join(root,'.sites-runtime/tests');await mkdir(parent,{recursive:true});
const temporary=await mkdtemp(path.join(parent,'terminal-presentation-')),outfile=path.join(temporary,'runtime.mjs');
await build({stdin:{contents:'export { RenderLoop } from "./app/game/mobile-runtime";',resolveDir:root},outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {RenderLoop}=await import(pathToFileURL(outfile).href);await rm(temporary,{recursive:true,force:true});
function frames(){
 let serial=0;const pending=new Map();return {pending,request(cb){pending.set(++serial,cb);return serial;},cancel(id){pending.delete(id);},step(now){const work=[...pending.values()];pending.clear();for(const cb of work)cb(now);}};
}

test('Terminal presentation stays paced while paused and stops at its finite owner deadline',()=>{
 const raf=frames();let draws=0,age=0;const loop=new RenderLoop((_now,interval)=>{draws++;age+=interval;if(age>=50)loop.setPresentationActive(false);},raf.request,raf.cancel);
 loop.pause(true);loop.setPresentationActive(true);loop.setPresentationActive(true);assert.equal(raf.pending.size,1);
 for(const t of [1,18,35,52])raf.step(t);
 assert.equal(draws,4);assert.equal(age,51);assert.equal(raf.pending.size,0);
 raf.step(1000);assert.equal(draws,4);loop.dispose();
});

test('Ordinary pause cancels the presentation exception and still draws exactly once',()=>{
 const raf=frames();let draws=0;const loop=new RenderLoop(()=>draws++,raf.request,raf.cancel);
 loop.pause(true);loop.setPresentationActive(true);raf.step(1);assert.equal(raf.pending.size,1);
 loop.pause(true);raf.step(18);assert.equal(draws,2);assert.equal(raf.pending.size,0);
 loop.invalidate();raf.step(35);assert.equal(draws,3);assert.equal(raf.pending.size,0);
 loop.pause(false);raf.step(52);assert.equal(draws,4);assert.equal(raf.pending.size,1);loop.dispose();
});

test('Hidden/context suspension cancels terminal RAF and resume discards the hidden interval',()=>{
 const raf=frames(),intervals=[];const loop=new RenderLoop((_now,interval)=>intervals.push(interval),raf.request,raf.cancel);
 loop.pause(true);loop.setPresentationActive(true);raf.step(1);raf.step(18);
 loop.suspend(true);assert.equal(raf.pending.size,0);
 loop.setPresentationActive(false);loop.setPresentationActive(true);loop.invalidate();raf.step(10000);assert.equal(intervals.length,2);assert.equal(raf.pending.size,0);
 loop.suspend(false);raf.step(10017);assert.deepEqual(intervals,[0,17,0]);assert.equal(raf.pending.size,1);loop.dispose();
});

test('Terminal rendering at 120Hz callbacks respects the chosen 30/60FPS pacing',()=>{
 for(const fps of [30,60]){
  const raf=frames();let draws=0;const loop=new RenderLoop(()=>draws++,raf.request,raf.cancel);
  loop.setFps(fps);loop.pause(true);loop.setPresentationActive(true);
  for(let i=0;i<120;i++)raf.step(1+i*1000/120);
  assert.ok(draws>=fps-1&&draws<=fps+1,`${fps} target produced ${draws} draws`);
  loop.setPresentationActive(false);assert.equal(raf.pending.size,0);loop.dispose();
 }
});

test('Ending presentation externally cancels pending paused work without affecting normal play',()=>{
 const raf=frames();let draws=0;const loop=new RenderLoop(()=>draws++,raf.request,raf.cancel);
 loop.pause(true);loop.setPresentationActive(true);loop.setPresentationActive(false);assert.equal(raf.pending.size,0);
 loop.pause(false);loop.setPresentationActive(true);loop.setPresentationActive(false);raf.step(1);assert.equal(draws,1);assert.equal(raf.pending.size,1);loop.dispose();
});

test('Dispose from a terminal draw prevents any continuation or later resurrection',()=>{
 const raf=frames();let draws=0;const loop=new RenderLoop(()=>{draws++;loop.dispose();},raf.request,raf.cancel);
 loop.pause(true);loop.setPresentationActive(true);raf.step(1);assert.equal(draws,1);assert.equal(raf.pending.size,0);
 loop.setPresentationActive(true);loop.suspend(false);loop.pause(false);loop.invalidate();raf.step(100);assert.equal(draws,1);assert.equal(raf.pending.size,0);
});
