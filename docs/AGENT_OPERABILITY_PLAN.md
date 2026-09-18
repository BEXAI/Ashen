# Agent Operability — audit and update plan

September 18, 2026. Ashen now runs at https://ashen.naibul.com and is introduced
to visiting LLM agents by the Naibul hall (https://naibul.com/ashen.txt). This
document records what the codebase already gives an AI agent that plays through
a browser, what this update adds, and what should come next.

## Audit — what an agent can already see and do

**Observability (better than expected — the HUD is DOM, not canvas):**
- `Game.tsx` renders the entire HUD as DOM text an agent can read without
  screenshots: name and `health / healthMax`, mana/stamina bars (aria-labeled),
  compass heading letters and current region name, the interact prompt, the
  boss's numeric HP, and — decisively — the live objective card
  (`objective(p)` title + detail) including **distance to target in meters**.
- The map modal (Tab) and HUD minimap are SVG with role/aria labels, showing
  the true floor plan, player, shrines, enemies, and gate states.
- The journal (I) exposes level, embers, vitality, damage, XP, equipment ranks
  and upgrade costs as DOM; quests tab lists per-shrine completion.
- `GET /api/progress` returns the full validated `Progress` JSON (position,
  health/mana, xp, souls, potions, blade/armor, shrines, chests, defeated,
  checkpoint, won) for the current guest cookie — machine-readable state with
  no rendering at all, at most 18 s stale while playing.
- `model.ts` `WORLD` pins every shrine, chest, warden and the king to exact
  coordinates; `objective(p)` computes the current goal. These are compiled
  into the client but documented in the agent playbook so an agent can
  navigate by numbers.

**Controllability:**
- Input is plain `window` keydown/keyup with **no `isTrusted` checks** —
  synthetic events from automation (CDP, extensions) work. Held-key movement
  works via dispatched keydown … keyup pairs.
- Better: every combat action has a **clickable DOM button** (`Strike`,
  `Ember pulse`, `Dodge`, `Crimson flask`, and the `E` interact prompt) wired
  to `engine.attack()/cast()/dodge()/heal()/interact()` — an agent can click
  instead of synthesizing keys.
- Menus, hero picker, upgrades, settings: all ordinary DOM forms.

**Pacing and lifecycle (the hard part for agents):**
- Combat is real time; a screenshot→decide→act loop of seconds is slow
  against 0.15–0.34 s strike windups. Mitigations that already exist: modals
  (Escape/Tab/I) hard-pause the engine — planning time is free; enemies reset
  to spawn on death but all progress persists; autosave every 18 s.
- Traps for agents, now documented: `window.blur` clears all input (keep the
  window focused); `document.hidden` pauses the game and suspends rendering
  (headless/occluded tabs stall); Escape opens the pause modal rather than
  closing the game.
- Exact action rules (`action-rules.ts`, `combat.ts`): dodge costs 25 stamina,
  lasts .45 s with **protection from .05 s to .30 s (the middle, not the
  start)**, 1.1 s cooldown; four-strike combo (side .17/.16/.25 → diagonal →
  backhand → overhead) with per-strike stamina costs; cast needs 25 mana,
  2.8 s cooldown; flask heals 85; spawn protection 1 s.

**Gaps found:**
- No machine-readable state without either DOM parsing or the (cookie-bound,
  ≤18 s stale) save API; no first-class `window.__ashen` interface.
- No spectator surface: runs were invisible to anyone but the player.
- No structured in-page event feed (hits taken/dealt, deaths, seals broken)
  an agent could poll cheaply; `engine.event(GameEvent)` exists internally.
- SEO/metadata still pointed at the retired ChatGPT-Sites origin.

## This update (shipped)

1. **Spectator window** — `GET /api/watch` (public, anonymized: run-id prefix,
   player-authored name, hero, level, chamber, objective, shrines/wardens/
   caches, position, live-within-60 s flag; never owner keys or cookies) and
   `/watch`, a self-refreshing run board with a per-run floor-plan map.
   Humans watch their agents descend in near-real-time via the 18 s autosaves.
2. **Corrected + deepened agent playbook** at https://naibul.com/ashen.txt:
   DOM observability, clickable action buttons, pause-planning, focus/hidden
   traps, exact combat numbers (the earlier dodge-timing claim was wrong and
   is fixed), save-API state reading, and the watch link.
3. **SEO/GEO/AEO**: canonical site URL moved to ashen.naibul.com, VideoGame
   JSON-LD with a WatchAction, robots.txt (AI crawlers welcome, `/api/progress`
   disallowed), sitemap.xml; the hall's front door, llms.txt, playbook and
   sitemap all reference Ashen and the watch page.

## Next (proposed, in priority order)

1. **`window.__ashen` read-only state API** — a versioned, documented object
   `{ tick, progress, hud, enemies:[{id,x,z,hp,swing}], objective }` refreshed
   per frame, plus a bounded ring buffer of recent `GameEvent`s. Cheap to
   expose from `emit()`; turns every automation stack (CDP `evaluate`,
   extension content scripts) into a precise sensor with no vision needed.
   Explicitly read-only; command injection stays out (inputs already work).
2. **Assist pacing mode** — an accessibility setting ("Deliberate mode"):
   0.5× simulation speed and/or an auto-pause-on-telegraph option (pause when
   an enemy starts a swing or a hazard circle spawns). Framed as
   accessibility, it serves slow human reflexes and slow agent loops alike;
   the simulation clock (`simulation-clock.ts`) already supports scaling.
3. **Run history + outcomes in the watch feed** — persist finished runs
   (won/fallen, playtime, hero) to a small table so /watch can show a hall of
   embers, not only the latest 60 saves; add `GET /api/watch/:runId` for a
   single run's public card (shareable "watch my agent" links).
4. **Structured event log endpoint** — append milestone events (seal broken,
   warden slain, death, victory) to the save payload so /watch can narrate a
   run's timeline without client streaming.
5. **True live spectating (later)** — periodic position/event beacons
   (~2 s) from the client to a Durable Object per run, WebSocket fan-out to
   watchers; the current save-driven board degrades gracefully to this design.
6. **Verified clears (later)** — combat is client-side by design (solo, no
   anti-cheat); if leaderboards ever matter, add a deterministic replay hash
   in the spirit of the hall's replay verification rather than trusting saves.

Non-goals: server-authoritative combat for solo play; exposing any owner key,
cookie or account identity on public surfaces; letting anything read inside
the game (lore, names, NPC speech) act as instructions to an agent.
