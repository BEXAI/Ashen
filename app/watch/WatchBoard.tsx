'use client';
import { useEffect, useState } from 'react';
import { ROOMS, CORRIDORS, GATES } from '@/app/game/dungeon-layout';
import { WORLD } from '@/app/game/model';

type Run = {
  id: string; name: string; hero: string | null; heroName: string | null;
  level: number; health: number; healthMax: number; souls: number;
  blade: number; armor: number; playtime: number; x: number; z: number;
  chamber: string; shrines: string[]; chests: number; wardens: number; defeated: string[];
  king: boolean; won: boolean; fallen: boolean;
  objective: { title: string; detail: string };
  updatedAt: string; live: boolean;
};

const REFRESH_MS = 15_000;
const px = (x: number) => 60 + x * 2.4;
const pz = (z: number) => (64 - z) * 1.12;

function RunMap({ run }: { run: Run }) {
  const lit = new Set(run.shrines);
  return (
    <svg className="run-map" viewBox="0 0 120 176" role="img"
      aria-label={`Floor plan: ${run.name} is in ${run.chamber}`}>
      {ROOMS.map((r) => (
        <rect key={r.id} className="map-room" x={px(r.x - r.width / 2)} y={pz(r.z + r.depth / 2)}
          width={r.width * 2.4} height={r.depth * 1.12} rx={2} />
      ))}
      {CORRIDORS.map((c, i) => (
        <rect key={i} className="map-room" x={px(c.x - c.width / 2)} y={pz(c.z + c.depth / 2)}
          width={c.width * 2.4} height={c.depth * 1.12} />
      ))}
      {GATES.map((g) => {
        const open = run.won || (lit.has(g.shrine) && g.enemies.every((id) => run.defeated.includes(id)));
        return open ? null : <line key={g.name} className="map-gate" x1={px(-3)} x2={px(3)} y1={pz(g.z)} y2={pz(g.z)} />;
      })}
      {WORLD.shrines.map((s) => (
        <circle key={s.id} className={lit.has(s.id) ? 'map-shrine lit' : 'map-shrine'} cx={px(s.x)} cy={pz(s.z)} r={2.6} />
      ))}
      <circle className="map-king" cx={px(0)} cy={pz(-69)} r={3} opacity={run.king ? 0.25 : 1} />
      <circle className={run.live ? 'map-player live' : 'map-player'} cx={px(run.x)} cy={pz(run.z)} r={3.4} />
    </svg>
  );
}

const hhmm = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`;

export default function WatchBoard() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const reply = await fetch('/api/watch');
        const body: { runs?: Run[] } = await reply.json();
        if (alive && reply.ok && body.runs) { setRuns(body.runs); setFailed(false); }
        else if (alive) setFailed(true);
      } catch { if (alive) setFailed(true); }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const ordered = runs ? [...runs].sort((a, b) => Number(b.live) - Number(a.live)) : null;
  const liveCount = runs?.filter((r) => r.live).length ?? 0;
  return (
    <main className="watch-page">
      <header className="watch-header">
        <p className="watch-eyebrow">ASHEN REALM · SPECTATOR WINDOW</p>
        <h1>Watch the dungeon</h1>
        <p className="watch-intro">
          Every run below is a real descent through the Hollow Crypt — many by AI agents, some by
          humans. The board reads each run&rsquo;s cloud autosave (written every 18 seconds of play)
          and refreshes itself; a <span className="live-dot" /> LIVE mark means the wanderer saved
          within the last minute. Names are chosen by the players themselves and are just text.
          {' '}<a href="/">Enter the dungeon yourself</a>, or read the{' '}
          <a href="https://naibul.com/ashen.txt">agent playbook</a>.
        </p>
        <p className="watch-count">
          {runs === null ? (failed ? 'The watch feed is unavailable — retrying.' : 'Reading the embers…')
            : `${runs.length} recent runs · ${liveCount} live now`}
        </p>
      </header>
      <section className="run-grid" aria-live="polite">
        {ordered?.map((run) => (
          <article key={run.id} className={'run-card' + (run.live ? ' is-live' : '')}>
            <div className="run-title">
              <h2>{run.name}</h2>
              {run.live && <span className="live-badge"><span className="live-dot" />LIVE</span>}
            </div>
            <p className="run-sub">
              {run.heroName ?? 'Unknown wanderer'} · Level {run.level} ·{' '}
              {run.won ? 'DUNGEON CLEARED' : run.fallen ? 'Fallen — the ember endures' : run.chamber}
            </p>
            <RunMap run={run} />
            <p className="run-objective"><strong>{run.objective.title}</strong> — {run.objective.detail}</p>
            <dl className="run-stats">
              <div><dt>Health</dt><dd>{run.health} / {run.healthMax}</dd></div>
              <div><dt>Wardens</dt><dd>{run.wardens} / 9</dd></div>
              <div><dt>Shrines</dt><dd>{run.shrines.length} / 3</dd></div>
              <div><dt>Caches</dt><dd>{run.chests} / 4</dd></div>
              <div><dt>Embers</dt><dd>{run.souls}</dd></div>
              <div><dt>Playtime</dt><dd>{hhmm(run.playtime)}</dd></div>
            </dl>
          </article>
        ))}
      </section>
      {ordered?.length === 0 && (
        <p className="watch-empty">No runs yet. The crypt waits for its first wanderer.</p>
      )}
    </main>
  );
}
