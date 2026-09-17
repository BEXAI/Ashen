"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { FlaskConical, Sparkles, Sword, Zap } from 'lucide-react';
import type { GameEngine, Hud } from './engine';
import { PointerOwner, stickPosition } from './touch-input';

type EngineRef = RefObject<GameEngine | null>;

function useTouchPointer<T extends HTMLElement>(active: boolean, onEnd: () => void) {
  const element = useRef<T>(null);
  const owner = useRef(new PointerOwner());
  const end = useRef(onEnd);
  useLayoutEffect(() => { end.current = onEnd; }, [onEnd]);
  const reset = useCallback(() => {
    const id = owner.current.reset();
    try {
      if (id !== null && element.current?.hasPointerCapture(id)) element.current.releasePointerCapture(id);
    } catch { /* Safari may release capture before the cancellation reaches React. */ }
    end.current();
  }, []);

  useEffect(() => { if (!active) reset(); }, [active, reset]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) reset(); };
    const released = (event: globalThis.PointerEvent) => { if (owner.current.owns(event.pointerId)) reset(); };
    window.addEventListener('blur', reset);
    window.addEventListener('pagehide', reset);
    window.addEventListener('orientationchange', reset);
    window.addEventListener('pointerup', released);
    window.addEventListener('pointercancel', released);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', reset);
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('orientationchange', reset);
      window.removeEventListener('pointerup', released);
      window.removeEventListener('pointercancel', released);
      document.removeEventListener('visibilitychange', hidden);
      reset();
    };
  }, [reset]);

  function start(e: PointerEvent<T>) {
    if (!active || (e.pointerType === 'mouse' && e.button !== 0) || !owner.current.start(e.pointerId)) return false;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); }
    catch { reset(); return false; }
    return true;
  }

  function finish(e: PointerEvent<T>) {
    if (!owner.current.owns(e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();
    reset();
  }

  return { element, owner, start, finish };
}

function MovementPad({ engine, active }: { engine: EngineRef; active: boolean }) {
  const [sprinting, setSprinting] = useState(false);
  const thumb = useRef<HTMLSpanElement>(null);
  const bounds = useRef<DOMRect | null>(null);
  const paint = useRef<number | null>(null);
  const position = useRef({ x: 0, y: 0 });
  const wasSprinting = useRef(false);
  const { element, owner, start, finish } = useTouchPointer<HTMLDivElement>(active, () => {
    if (paint.current !== null) cancelAnimationFrame(paint.current);
    paint.current = null;
    bounds.current = null;
    position.current = { x: 0, y: 0 };
    wasSprinting.current = false;
    if (thumb.current) thumb.current.style.transform = 'translate(0px, 0px)';
    setSprinting(false);
    engine.current?.setStick(0, 0);
  });

  function move(e: PointerEvent<HTMLDivElement>) {
    if (!active || !owner.current.owns(e.pointerId)) return;
    e.preventDefault();
    const box = bounds.current;
    if (!box) return;
    const next = stickPosition(e.clientX - box.left - box.width / 2, e.clientY - box.top - box.height / 2, box.width * 0.3);
    position.current = { x: next.thumbX, y: next.thumbY };
    if (wasSprinting.current !== next.sprint) { wasSprinting.current = next.sprint; setSprinting(next.sprint); }
    engine.current?.setStick(next.x, next.y, next.sprint);
    if (paint.current === null) paint.current = requestAnimationFrame(() => {
      paint.current = null;
      if (thumb.current) thumb.current.style.transform = `translate(${position.current.x}px, ${position.current.y}px)`;
    });
  }

  return <div className="joystick" ref={element} role="group" aria-label="Movement joystick. Drag to move; push to the edge to sprint." data-sprinting={sprinting}
    onPointerDown={e => { if (start(e)) { bounds.current = e.currentTarget.getBoundingClientRect(); engine.current?.resumeAudio(); move(e); } }} onPointerMove={move}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onContextMenu={e => e.preventDefault()}>
    <span className="joystick-thumb" ref={thumb} />
    <span className="joystick-label">{sprinting ? 'Sprint' : 'Move'}</span>
  </div>;
}

const actions = {
  dodge: { label: 'Dodge', aria: 'Dodge', Icon: Zap },
  spell: { label: 'Ember', aria: 'Cast ember pulse', Icon: Sparkles },
  heal: { label: 'Heal', aria: 'Drink healing flask', Icon: FlaskConical },
  strike: { label: 'Strike', aria: 'Sword combo: side cut, diagonal cut, backhand, overhead. Hold to chain strikes.', Icon: Sword },
};
type Action = keyof typeof actions;

function ActionButton({ action, engine, active, hud }: { action: Action; engine: EngineRef; active: boolean; hud: Hud }) {
  const [pressed, setPressed] = useState(false);
  const { element, owner, start, finish } = useTouchPointer<HTMLButtonElement>(active, () => {
    setPressed(false);
    if (action === 'strike') engine.current?.setAttackHeld(false);
  });
  const { label, aria, Icon } = actions[action];
  const cooldown = action === 'spell' ? hud.castCd : action === 'dodge' ? hud.dodgeCd : 0;
  const unavailable = cooldown > 0 || (action === 'spell' && hud.p.mana < 25) || (action === 'heal' && (hud.p.potions === 0 || hud.p.health >= hud.healthMax)) || (action === 'dodge' && hud.stamina < 25) || (action === 'strike' && hud.stamina < 8);

  function activate(hold: boolean) {
    const game = engine.current;
    if (!game || !active) return;
    if (action === 'strike') { if (hold) game.setAttackHeld(true); else game.attack(); }
    if (action === 'spell') game.cast();
    if (action === 'dodge') game.dodge();
    if (action === 'heal') game.heal();
  }
  function cancel(e: PointerEvent<HTMLButtonElement>) {
    if (action === 'strike' && owner.current.owns(e.pointerId)) engine.current?.setAttackHeld(false, true);
    finish(e);
  }

  return <button ref={element} type="button" className={`touch-action touch-${action}`} aria-label={aria}
    disabled={!active} data-unavailable={unavailable} data-pressed={pressed}
    onPointerDown={e => { if (start(e)) { setPressed(true); activate(true); } }}
    onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onContextMenu={e => e.preventDefault()}
    onClick={e => { if (e.detail === 0) activate(false); }}>
    <Icon aria-hidden="true" />
    <span className="touch-label">{label}</span>
    {cooldown > 0 && <small className="touch-badge">{cooldown.toFixed(1)}</small>}
    {action === 'heal' && <small className="touch-badge">{hud.p.potions}</small>}
  </button>;
}

export function TouchControls({ engine, hud, active }: { engine: EngineRef; hud: Hud; active: boolean }) {
  return <div className="mobile-controls" aria-label="Touch controls">
    <MovementPad engine={engine} active={active} />
    <div className="touch-actions" role="group" aria-label="Combat actions">
      {(Object.keys(actions) as Action[]).map(action => <ActionButton key={action} action={action} engine={engine} active={active} hud={hud} />)}
    </div>
  </div>;
}
