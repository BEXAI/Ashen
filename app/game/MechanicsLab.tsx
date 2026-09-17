'use client';
import './visual-lab.css';
import './mechanics-lab.css';
import { useEffect, useRef, useState } from 'react';
import { GameEngine, type GameEvent, type Hud } from './engine';
import { newProgress, progressSchema, WORLD, type Progress } from './model';
import { DEFAULT_HERO, ENEMY_ROSTER, HERO_IDS, ROSTER, type HeroId } from './character-roster';
import { BONE_THRONE, GATES, validDungeonSpawn } from './dungeon';
import { DEFAULT_GRAPHICS } from './graphics-preferences';

export const MECHANICS_FIXTURES = [
  { id: 'entry', name: 'Entry · all enemies', note: 'Fresh entry, every enemy alive, ordinary starting equipment and resources.' },
  { id: 'ogre', name: 'Ogre duel', note: 'Only the native Ogre spawn is alive. Cinder seal is open; start seven units in front of the Ogre.' },
  { id: 'goblin', name: 'Goblin duel', note: 'Only the native Goblin spawn is alive. Start five units in front of it.' },
  { id: 'boss', name: 'Boss duel · unshielded', note: 'Only the Hollow King is alive. All three shrines are awakened; all seals are open.' },
  { id: 'boss-shielded', name: 'Boss duel · shielded fixture', note: 'Start legally with all seals open, then explicitly extinguish Crown Shrine in this in-memory fixture. The Crown seal closes behind you; the King is shielded. Return to shrine goes to Dusk.' },
  { id: 'gate', name: 'Closed gate · no enemies', note: 'All enemies are marked defeated only in this fixture. Cinder Shrine stays unlit, so its seal remains closed.' },
  { id: 'throne', name: 'Bone Throne · no enemies', note: 'All enemies are marked defeated and all seals opened only in this fixture. Start three units in front of the side Bone Throne.' },
  { id: 'crowd', name: 'Cinder crowd · native spawns', note: 'The three native Cinder wardens remain alive. Their normal AI approaches and body collisions form the crowd; no enemy positions are injected.' },
] as const;
export type MechanicsFixtureId = typeof MECHANICS_FIXTURES[number]['id'];
type Movement = 'stop' | 'forward' | 'back' | 'left' | 'right';
const MOVEMENT: Record<Movement, readonly [number, number]> = { stop: [0, 0], forward: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
type Terminal = Extract<GameEvent['type'], 'death' | 'victory'>;
type LogEvent = { sequence: number; type: GameEvent['type']; text?: string };

/** Explicit, disposable fixture data. Both schema and legal initial spawn are checked. */
export function createMechanicsFixture(id: MechanicsFixtureId, hero: HeroId): Progress {
  const p = newProgress('Mechanics fixture', hero);
  if (id === 'entry') {
    const checked = progressSchema.parse(p);
    if (!validDungeonSpawn(checked)) throw new Error('Illegal entry fixture spawn.');
    return checked;
  }
  const enemyFor = (roster: 'ogre' | 'goblin') => WORLD.enemies.find(e => ENEMY_ROSTER[e.id] === roster)!;
  let alive: readonly string[] = [];
  if (id === 'ogre' || id === 'goblin') {
    const enemy = enemyFor(id); alive = [enemy.id]; p.x = enemy.x; p.z = enemy.z + (id === 'ogre' ? 7 : 5);
    if (id === 'ogre') { p.shrines = ['cinder']; p.checkpoint = 'cinder'; }
  } else if (id === 'boss' || id === 'boss-shielded') {
    const king = WORLD.enemies.find(e => e.id === 'king')!;
    alive = [king.id]; p.x = king.x; p.z = king.z + 6.5;
    p.shrines = WORLD.shrines.map(s => s.id); p.checkpoint = id === 'boss-shielded' ? 'dusk' : 'crown';
  } else if (id === 'gate') { p.x = 0; p.z = GATES[0].z + 2.5; }
  else if (id === 'throne') {
    p.x = BONE_THRONE.x; p.z = BONE_THRONE.z + 3;
    p.shrines = WORLD.shrines.map(s => s.id); p.checkpoint = 'crown';
  } else if (id === 'crowd') { alive = GATES[0].enemies; p.x = 0; p.z = 25; }
  p.defeated = WORLD.enemies.filter(e => !alive.includes(e.id)).map(e => e.id);
  p.talked = true;
  const checked = progressSchema.parse(p);
  if (!validDungeonSpawn(checked)) throw new Error(`Illegal mechanics fixture spawn: ${id}`);
  return checked;
}

/** Public progress replacement after a valid constructor, explicitly disclosed in the UI. */
export function shieldedBossFixture(progress: Progress): Progress {
  return progressSchema.parse({ ...progress, shrines: progress.shrines.filter(id => id !== 'crown') });
}

export default function MechanicsLab() {
  const host = useRef<HTMLDivElement>(null), engine = useRef<GameEngine | null>(null);
  const qualityRef = useRef('low'), shakeRef = useRef(false), soundRef = useRef(false);
  const [fixture, setFixture] = useState<MechanicsFixtureId>('entry'), [hero, setHero] = useState<HeroId>(DEFAULT_HERO);
  const [resetSerial, setResetSerial] = useState(0), [quality, setQuality] = useState('low');
  const [layout, setLayout] = useState<'wide' | 'portrait'>('wide');
  const [hud, setHud] = useState<Hud | null>(null), [report, setReport] = useState('Waiting for renderer.');
  const [fixtureReport, setFixtureReport] = useState(''), [events, setEvents] = useState<LogEvent[]>([]);
  const [paused, setPaused] = useState(true), [terminal, setTerminal] = useState<Terminal | null>(null);
  const [status, setStatus] = useState('Preparing isolated fixture.'), [error, setError] = useState('');
  const [movement, setMovement] = useState<Movement>('stop'), [held, setHeld] = useState(false), [sprint, setSprint] = useState(false);
  const [shake, setShake] = useState(false), [sound, setSound] = useState(false), [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const selected = MECHANICS_FIXTURES.find(f => f.id === fixture)!;

  useEffect(() => {
    if (!import.meta.env.DEV || !host.current) return;
    let live = true, game: GameEngine | null = null, sequence = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { if (live) setReducedMotion(motion.matches); };
    const clearControls = () => { if (live) { setMovement('stop'); setHeld(false); setSprint(false); } };
    const visibility = () => { if (document.hidden) clearControls(); };
    const ready = setTimeout(() => {
      if (!live) return;
      motionChanged(); setError(''); setTerminal(null); setEvents([]); clearControls(); setPaused(true);
      try {
        const p = createMechanicsFixture(fixture, hero);
        game = new GameEngine(host.current!, p, qualityRef.current, soundRef.current,
          next => { if (live) setHud(next); },
          event => {
            if (!live) return;
            const item = { sequence: ++sequence, ...event };
            setEvents(previous => [...previous.slice(-19), item]);
            if (event.text) setStatus(event.text);
            if (event.type === 'death' || event.type === 'victory') {
              game?.pause(true, true); clearControls(); setPaused(true); setTerminal(event.type);
              setStatus(event.text ?? (event.type === 'death' ? 'Defeated. Return to shrine or reset the fixture.' : 'Victory in this isolated fixture.'));
            } else if (event.type === 'graphics-lost') {
              clearControls(); setPaused(true); setError('Graphics context lost. Reset the fixture to recreate the renderer.');
            }
          }, { ...DEFAULT_GRAPHICS, impactShake: shakeRef.current });
        engine.current = game;
        host.current?.querySelector('canvas')?.setAttribute('tabindex', '0');
        if (fixture === 'boss-shielded') game.replace(shieldedBossFixture(game.snapshot()));
        game.pause(true);
        const snapshot = game.snapshot();
        setFixtureReport(JSON.stringify({ mode: selected.name, setup: selected.note, inMemoryOnly: true, hero: snapshot.hero,
          spawn: { x: snapshot.x, z: snapshot.z }, health: snapshot.health, blade: snapshot.blade, armor: snapshot.armor,
          shrines: snapshot.shrines, checkpoint: snapshot.checkpoint, defeated: snapshot.defeated,
          alive: WORLD.enemies.filter(e => !snapshot.defeated.includes(e.id)).map(e => ({ id: e.id, roster: ENEMY_ROSTER[e.id], x: e.x, z: e.z })),
          shieldFixturePostStartReplacement: fixture === 'boss-shielded' }, null, 2));
        setStatus('Paused. Resume when assets are ready; normal damage and resource costs apply.');
        const refresh = () => {
          if (!live || !game) return;
          const diagnostics = game.diagnostics();
          setReport(JSON.stringify({ mechanics: diagnostics.mechanics, loading: diagnostics.loading,
            graphics: diagnostics.graphics, camera: diagnostics.camera, characterSources: diagnostics.characterSources }, null, 2));
        };
        refresh(); timer = setInterval(refresh, 250);
      } catch (reason) {
        game?.dispose(); if (engine.current === game) engine.current = null;
        setHud(null); setError(reason instanceof Error ? reason.message : 'Renderer unavailable.');
      }
    }, 0);
    motion.addEventListener('change', motionChanged);
    window.addEventListener('blur', clearControls); window.addEventListener('orientationchange', clearControls);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      live = false; clearTimeout(ready); if (timer) clearInterval(timer);
      motion.removeEventListener('change', motionChanged);
      window.removeEventListener('blur', clearControls); window.removeEventListener('orientationchange', clearControls);
      document.removeEventListener('visibilitychange', visibility);
      game?.dispose(); if (engine.current === game) engine.current = null;
    };
  }, [fixture, hero, resetSerial, selected.name, selected.note]);

  const blocked = paused || terminal !== null || !!error || !hud;
  function focusGame() { host.current?.querySelector('canvas')?.focus({ preventScroll: true }); }
  function stop() { engine.current?.clearInput(); setMovement('stop'); setHeld(false); setSprint(false); }
  function move(next: Movement) {
    if (blocked) return;
    const value = movement === next ? 'stop' : next; setMovement(value);
    const [x, y] = MOVEMENT[value]; engine.current?.setStick(x, y, sprint);
  }
  function pause() { stop(); engine.current?.pause(true); setPaused(true); setStatus('User paused. Gameplay and ordinary presentation are frozen.'); }
  function resume() { if (terminal || error) return; engine.current?.pause(false); setPaused(false); focusGame(); setStatus('Playing isolated fixture.'); }
  function reset() { stop(); setHud(null); setPaused(true); setResetSerial(value => value + 1); }
  function returnToShrine() {
    stop(); engine.current?.respawn(); setTerminal(null); setPaused(false);
    setStatus('Returned to the fixture checkpoint. Defeated enemies and victory remain recorded only in this page.');
  }

  if (!import.meta.env.DEV) return <main className="visual-lab"><h1>Mechanics lab closed</h1><p>This fixture is available only in development.</p></main>;
  return <main className={`visual-lab mechanics-lab mechanics-lab--${layout}`} onKeyDownCapture={event => {
    if ((event.target as HTMLElement).closest('button,input,select,a,summary')) event.stopPropagation();
  }}>
    <header><p className="mechanics-lab-kicker">Development fixture · unsaved</p><h1>Battle mechanics lab</h1>
      <p>Normal combat engine, normal damage and costs. No saved journey is loaded or written. Selecting a fixture or hero resets this local encounter.</p></header>
    <div className="mechanics-lab-toolbar">
      <label>Fixture <select value={fixture} onChange={event => { stop(); setHud(null); setPaused(true); setFixture(event.target.value as MechanicsFixtureId); }}>
        {MECHANICS_FIXTURES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select></label>
      <label>Hero <select value={hero} onChange={event => { stop(); setHud(null); setPaused(true); setHero(event.target.value as HeroId); }}>
        {HERO_IDS.map(id => <option key={id} value={id}>{ROSTER[id].name}</option>)}
      </select></label>
      <label>Quality <select value={quality} onChange={event => { const value = event.target.value; qualityRef.current = value; setQuality(value); engine.current?.setQuality(value); }}>
        <option value="low">Low</option><option value="auto">Auto</option><option value="high">High</option>
      </select></label>
      <label>Layout <select value={layout} onChange={event => setLayout(event.target.value as 'wide' | 'portrait')}>
        <option value="wide">Desktop width</option><option value="portrait">390 px portrait layout</option>
      </select></label>
      <label><input type="checkbox" checked={shake} onChange={event => { const value = event.target.checked; shakeRef.current = value; setShake(value); engine.current?.setGraphics({ ...DEFAULT_GRAPHICS, impactShake: value }); }}/> Impact shake</label>
      <label><input type="checkbox" checked={sound} onChange={event => { const value = event.target.checked; soundRef.current = value; setSound(value); engine.current?.setSound(value); }}/> Sound</label>
    </div>
    <p className="mechanics-lab-mode"><strong>Actual fixture: {selected.name}.</strong> {selected.note}</p>
    <p className="mechanics-lab-caption">Reduced motion: {reducedMotion === null ? 'detecting system preference' : reducedMotion ? 'enabled by system' : 'not requested by system'}. Impact shake is disabled by the engine when reduced motion is requested. Layout width does not emulate phone hardware.</p>
    <div className="mechanics-lab-stage">
      <div ref={host} className="visual-lab-canvas mechanics-lab-canvas" onPointerDownCapture={focusGame} />
      {terminal && <div className="mechanics-lab-terminal" role="alert"><strong>{terminal === 'death' ? 'Defeated' : 'Victory'}</strong>
        <span>{terminal === 'victory' && hud?.p.health === 0 ? 'Mutual defeat · victory retained at zero HP.' : 'Terminal presentation continues; gameplay is frozen.'} Use Return to shrine or Reset below.</span></div>}
    </div>
    <section className="mechanics-lab-hud" aria-label="Live combat HUD">
      <span>HP <strong data-testid="mechanics-hp">{hud ? `${hud.p.health.toFixed(1)} / ${hud.healthMax}` : '—'}</strong></span>
      <span>Stamina <strong>{hud?.stamina.toFixed(1) ?? '—'}</strong></span><span>Mana <strong>{hud?.p.mana.toFixed(1) ?? '—'}</strong></span>
      <span>XZ <strong data-testid="mechanics-position">{hud ? `${hud.p.x.toFixed(3)}, ${hud.p.z.toFixed(3)}` : '—'}</strong></span>
      <span>Boss <strong>{hud?.boss ? `${hud.boss.hp.toFixed(1)} / ${hud.boss.max}` : '—'}</strong></span>
      <span>Dodge CD <strong>{hud?.dodgeCd.toFixed(2) ?? '—'}</strong></span><span>State <strong>{terminal ?? (paused ? 'paused' : 'playing')}</strong></span>
    </section>
    <p role="status">{status}</p>{error && <p role="alert" className="mechanics-lab-error">{error}</p>}
    <div className="mechanics-lab-controls" aria-label="Session controls">
      <button onClick={paused ? resume : pause} disabled={!!terminal || !!error || !hud}>{paused ? 'Resume' : 'Pause'}</button>
      <button onClick={reset}>Reset fixture</button><button onClick={returnToShrine} disabled={!!error || !hud}>Return to shrine</button>
      <button onClick={focusGame} disabled={blocked}>Focus game keyboard</button>
    </div>
    <fieldset className="mechanics-lab-controls" disabled={blocked}><legend>Normal combat input</legend>
      <button onClick={() => engine.current?.attack()}>Strike · J</button>
      <button aria-pressed={held} onClick={() => { const value = !held; setHeld(value); engine.current?.setAttackHeld(value, !value); }}>{held ? 'Release attack' : 'Hold attack'}</button>
      <button onClick={() => engine.current?.dodge()}>Dodge · Space · 25 stamina</button><button onClick={() => engine.current?.cast()}>Cast · Q</button>
      <button onClick={() => engine.current?.heal()}>Heal · R</button><button onClick={() => engine.current?.interact()}>Interact · E</button>
    </fieldset>
    <fieldset className="mechanics-lab-controls" disabled={blocked}><legend>Camera-relative walking toggles</legend>
      {(['forward', 'back', 'left', 'right'] as const).map(direction => <button key={direction} aria-pressed={movement === direction} onClick={() => move(direction)}>Walk {direction}</button>)}
      <button onClick={stop}>Stop / release all</button>
      <label><input type="checkbox" checked={sprint} onChange={event => { const value = event.target.checked; setSprint(value); const [x, y] = MOVEMENT[movement]; engine.current?.setStick(x, y, value); }}/> Sprint</label>
    </fieldset>
    <p className="mechanics-lab-caption">WASD / arrows also move after focusing the game canvas. Drag the canvas to turn the camera; mouse click strikes. Walking and hold buttons latch until stopped, paused, reset or the page loses focus. Keyboard focus in these controls does not trigger game shortcuts.</p>
    <details open><summary>Live mechanics · hazards · recent contacts</summary><pre aria-label="Live mechanics diagnostics" data-testid="mechanics-diagnostics">{report}</pre></details>
    <details open><summary>Engine events · no save handler</summary><pre aria-label="Engine events">{JSON.stringify(events, null, 2)}</pre></details>
    <details><summary>Exact in-memory fixture setup</summary><pre aria-label="Fixture setup">{fixtureReport}</pre></details>
  </main>;
}
