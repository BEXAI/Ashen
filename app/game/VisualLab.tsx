'use client';
import './visual-lab.css';
import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './engine';
import { newProgress } from './model';
import { DEFAULT_GRAPHICS } from './graphics-preferences';
import { BENCHMARK_VIEWS, type BenchmarkView } from './visual-bench';

export default function VisualLab() {
  const host=useRef<HTMLDivElement>(null),engine=useRef<GameEngine|null>(null),run=useRef<{end:number;sequence:number}|null>(null);
  const captured=useRef<ReturnType<GameEngine['exportDiagnostics']>|null>(null);
  const [view,setView]=useState<BenchmarkView>('entrance'),[quality,setQuality]=useState('low'),[brightness,setBrightness]=useState(100);
  const [report,setReport]=useState('Preparing reference scene'),[phase,setPhase]=useState('Choose a view, then start a measurement.');
  const [device,setDevice]=useState(''),[conditions,setConditions]=useState(''),[props,setProps]=useState(true),[roomState,setRoomState]=useState('closed'),[deviceProfile,setDeviceProfile]=useState('detected');
  useEffect(()=>{
    if(!host.current)return;
    let game:GameEngine;
    try {game=new GameEngine(host.current,newProgress(),quality,false,()=>{},()=>{},DEFAULT_GRAPHICS,true);}
    catch(error){const timer=setTimeout(()=>setReport(`Renderer unavailable: ${error instanceof Error?error.message:'Unknown error'}`),0);return()=>clearTimeout(timer);}
    engine.current=game;if(deviceProfile==='mobile')game.benchmarkDeviceProfile(true);game.benchmark(view);game.benchmarkProps(props);game.benchmarkState(roomState==='open');game.setGraphics({...DEFAULT_GRAPHICS,brightness:brightness/100});
    const ready=setTimeout(()=>setPhase('Choose a view, then start a measurement.'),0);
    const timer=setInterval(()=>{
      if(run.current&&game.diagnostics().timing.sequence!==run.current.sequence){captured.current=game.exportDiagnostics();run.current=null;setPhase('Interrupted by a pause or visibility change. Keep the tab visible and start again.');}
      if(run.current){const seconds=Math.ceil((run.current.end-performance.now())/1000);
        if(seconds<=0){captured.current=game.exportDiagnostics();run.current=null;game.pause(true);setPhase('Measurement captured. Export the report before changing the scene.');}
        else setPhase(seconds>60?`Warming up · ${seconds-60}s remaining`:`Measuring · ${seconds}s remaining`);
      }
      const current=captured.current??game.diagnostics();const display={...current};if('measurementWindows' in display)delete display.measurementWindows;setReport(JSON.stringify(display,null,2));
    },1000);
    return()=>{clearTimeout(ready);clearInterval(timer);game.dispose();engine.current=null;run.current=null;};
    // Keep a single renderer while views and quality change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  function reset(){run.current=null;captured.current=null;setPhase('Scene changed. Start a new measurement.');}
  function start(){reset();engine.current?.pause(false);engine.current?.resetMeasurements('30s warmup + 60s sample',30000);run.current={end:performance.now()+90000,sequence:engine.current?.diagnostics().timing.sequence??0};setPhase('Warming up · 30s remaining');}
  function download(){const data={recordedAt:new Date().toISOString(),deviceReportedByTester:device||'not supplied',displayAndPowerConditions:conditions||'not supplied',hardwareVerification:'Tester-supplied; browser size alone does not prove physical phone',report:captured.current??engine.current?.exportDiagnostics()};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`ashen-realm-${view}-${quality}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <main className="visual-lab">
    <h1 style={{fontSize:22}}>Graphics check</h1>
    <p>Isolated dungeon test. Your saved journey is untouched. Keep this tab visible during measurement.</p>
    <div style={{display:'flex',gap:12,marginBottom:12,flexWrap:'wrap'}}>
      <label>View <select value={view} onChange={e=>{reset();const v=e.target.value as BenchmarkView;setView(v);engine.current?.benchmark(v);}}>{Object.keys(BENCHMARK_VIEWS).map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Quality <select value={quality} onChange={e=>{reset();setQuality(e.target.value);engine.current?.setQuality(e.target.value);}}>{['low','auto','medium','high'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Rendering profile <select value={deviceProfile} onChange={e=>{reset();setDeviceProfile(e.target.value);engine.current?.benchmarkDeviceProfile(e.target.value==='mobile');}}><option value="detected">Detected device</option><option value="mobile">Mobile budget</option></select></label>
      <label>Brightness <input type="range" min="85" max="130" value={brightness} onChange={e=>{reset();const b=+e.target.value;setBrightness(b);engine.current?.setGraphics({...DEFAULT_GRAPHICS,brightness:b/100});}}/> {brightness}%</label>
      <label><input type="checkbox" checked={props} onChange={e=>{reset();setProps(e.target.checked);engine.current?.benchmarkProps(e.target.checked);}}/> Higgsfield assets</label>
      <label>Room state <select value={roomState} onChange={e=>{reset();setRoomState(e.target.value);engine.current?.benchmarkState(e.target.value==='open');}}><option value="closed">Sealed / unlit shrines</option><option value="open">Open / lit shrines</option></select></label>
      <button onClick={()=>{reset();engine.current?.pause(false);}}>Animate</button><button onClick={()=>{captured.current=engine.current?.exportDiagnostics()??null;run.current=null;engine.current?.pause(true);setPhase('Frozen');}}>Freeze</button>
      <button onClick={()=>engine.current?.attack()}>Strike</button>
    </div>
    {deviceProfile==='mobile'&&<p>Mobile budget exercises the mobile renderer in this browser. It does not emulate phone hardware.</p>}
    <div ref={host} className="visual-lab-canvas" />
    <p role="status">{phase}</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <label>Phone / device model <input value={device} onChange={e=>setDevice(e.target.value)} placeholder="e.g. iPhone 15"/></label>
      <label>Display / power conditions <input value={conditions} onChange={e=>setConditions(e.target.value)} placeholder="Brightness, low power, charging, room light"/></label>
      <button onClick={start}>Start 60-second measurement</button><button onClick={download}>Export diagnostic JSON</button>
    </div>
    <p>For a phone comparison: test Auto and Performance in portrait and landscape. Repeat after 15 minutes of play. Record your OS/browser and display conditions; this page reports timing methods and missing measurements explicitly.</p>
    <details><summary>Render diagnostics</summary><pre aria-label="Render diagnostics" style={{fontSize:12,whiteSpace:'pre-wrap'}}>{report}</pre></details>
  </main>;
}
