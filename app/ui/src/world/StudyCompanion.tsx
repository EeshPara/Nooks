import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Cookie, Heart, Moon, Move, X } from 'lucide-react';
import './StudyCompanion.css';

export type CompanionKind = 'sleepy-dog' | 'cat' | 'sprout' | 'none';
type Mood = 'idle' | 'walking' | 'eating' | 'happy' | 'sleeping';
type Point = { x: number; y: number };
type Viewport = { width: number; height: number };
type Care = { comfort: number; lastFed: number; wandering: boolean };
export interface StudyCompanionProps { kind: CompanionKind; reducedMotion?: boolean; scene?: string; active?: boolean; hidden?: boolean }

export function clampCompanionPoint(point: Point, viewport: Viewport): Point {
  const size = viewport.width <= 640 ? 75 : 100;
  const composerReserve = viewport.width <= 640 ? 250 : 170;
  const maxY = Math.max(12, viewport.height - size - composerReserve);
  const minY = Math.min(maxY, Math.max(85, viewport.height * .52));
  return { x: Math.max(12, Math.min(Math.max(12, viewport.width - size - 14), Number.isFinite(point.x) ? point.x : 12)), y: Math.max(minY, Math.min(maxY, Number.isFinite(point.y) ? point.y : minY)) };
}
export function companionRoomSpots(viewport: Viewport): Point[] {
  return [
    { x: viewport.width * .12, y: viewport.height * .69 },
    { x: viewport.width * .35, y: viewport.height * .74 },
    { x: viewport.width * .62, y: viewport.height * .71 },
    { x: viewport.width * .84, y: viewport.height * .68 },
  ].map(point => clampCompanionPoint(point, viewport));
}
function currentViewport(): Viewport { return { width: window.innerWidth, height: window.innerHeight }; }
function readCare(kind: CompanionKind): Care {
  try {
    const value = JSON.parse(localStorage.getItem(`notable-companion-v1-${kind}`) ?? '{}');
    return { comfort: Number.isFinite(value.comfort) ? Math.max(0, Math.min(100, value.comfort)) : 72, lastFed: Number.isFinite(value.lastFed) && value.lastFed <= Date.now() ? value.lastFed : 0, wandering: typeof value.wandering === 'boolean' ? value.wandering : true };
  } catch { return { comfort: 72, lastFed: 0, wandering: true }; }
}
const companionNames: Record<CompanionKind, string> = { 'sleepy-dog': 'Study dog', cat: 'Study cat', sprout: 'Desk plant', none: 'Companion' };

export default function StudyCompanion({ kind, reducedMotion = false, scene, active = true, hidden = false }: StudyCompanionProps) {
  return kind === 'none' ? null : <CompanionRoom key={kind} kind={kind} reducedMotion={reducedMotion} scene={scene} active={active} hidden={hidden} />;
}

function CompanionRoom({ kind, reducedMotion: requestedReducedMotion = false, scene, active = true, hidden = false }: StudyCompanionProps) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const reducedMotion = requestedReducedMotion || systemReducedMotion;
  const [viewport, setViewport] = useState(currentViewport);
  const [point, setPoint] = useState(() => companionRoomSpots(currentViewport())[3]);
  const pointRef = useRef(point); pointRef.current = point;
  const [mood, setMood] = useState<Mood>('idle');
  const [care, setCare] = useState<Care>(() => readCare(kind));
  const [menu, setMenu] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const [hearts, setHearts] = useState(0);
  const [spriteReady, setSpriteReady] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const transitionTimer = useRef<number | null>(null);
  const actionTimer = useRef<number | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const awake = active && !hidden && viewport.height >= 370;
  const allSpots = companionRoomSpots(viewport);
  const roomSpots = kind === 'sprout' ? [allSpots[1], allSpots[3]] : allSpots;

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const change = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    query.addEventListener('change', change); return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => { try { localStorage.setItem(`notable-companion-v1-${kind}`, JSON.stringify(care)); } catch { /* Care remains available for this session. */ } }, [care, kind]);
  useEffect(() => {
    const resize = () => { const value = currentViewport(); setViewport(value); setPoint(previous => clampCompanionPoint(previous, value)); };
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (kind !== 'cat') return;
    const image = new Image(); image.onload = () => setSpriteReady(true); image.src = '/images/study-cat-sprites.webp';
    return () => { image.onload = null; };
  }, [kind]);
  useEffect(() => () => { if (transitionTimer.current) window.clearTimeout(transitionTimer.current); if (actionTimer.current) window.clearTimeout(actionTimer.current); }, []);
  useEffect(() => {
    if (!awake) { setMenu(false); if (transitionTimer.current) window.clearTimeout(transitionTimer.current); setMood(previous => previous === 'walking' ? 'idle' : previous); }
  }, [awake]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [menu]);
  useEffect(() => {
    if (!care.lastFed) return;
    const update = () => setCooldown(Math.max(0, Math.ceil((care.lastFed + 5000 - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [care.lastFed]);
  useEffect(() => {
    if (!awake || !care.wandering || reducedMotion || menu || dragging || ['sleeping', 'eating', 'happy', 'walking'].includes(mood) || kind === 'sprout') return;
    const timer = window.setTimeout(() => {
      const choices = companionRoomSpots(viewport).filter(value => Math.abs(value.x - pointRef.current.x) > 60);
      const destination = choices[Math.floor(Math.random() * choices.length)];
      if (destination) moveTo(destination);
    }, 18000 + Math.random() * 15000);
    return () => window.clearTimeout(timer);
  }, [awake, care.wandering, reducedMotion, menu, dragging, mood, viewport, kind]);
  useEffect(() => { setPoint(previous => clampCompanionPoint(previous, currentViewport())); }, [scene]);

  function clearTimers() { if (transitionTimer.current) window.clearTimeout(transitionTimer.current); if (actionTimer.current) window.clearTimeout(actionTimer.current); }
  function moveTo(destination: Point, explicit = false) {
    clearTimers();
    const next = clampCompanionPoint(destination, currentViewport());
    setFacingLeft(next.x < pointRef.current.x); setPoint(next);
    setMood(reducedMotion || kind === 'sprout' ? 'idle' : 'walking');
    if (!reducedMotion && kind !== 'sprout') transitionTimer.current = window.setTimeout(() => setMood('idle'), 4800);
    if (explicit) setMessage(kind === 'sprout' ? 'Your plant found a new spot.' : 'Coming over.');
  }
  function showAction(nextMood: Mood, text: string, heartsCount: number) {
    clearTimers(); setMood(nextMood); setMessage(text); setHearts(value => value + heartsCount);
    actionTimer.current = window.setTimeout(() => setMood('idle'), nextMood === 'eating' ? 2800 : 1700);
  }
  function feed() {
    if (Date.now() - care.lastFed < 5000) return;
    const now = Date.now(); setCare(value => ({ ...value, comfort: Math.min(100, value.comfort + 8), lastFed: now }));
    showAction('eating', kind === 'sprout' ? 'Fresh water for your desk plant.' : 'Treat time. That hit the spot.', 3);
  }
  function pet() { setCare(value => ({ ...value, comfort: Math.min(100, value.comfort + 3) })); showAction('happy', kind === 'sprout' ? 'A sunny moment for your plant.' : 'A happy study buddy. Thanks for the attention.', 2); }
  function nap() { clearTimers(); setMood('sleeping'); setCare(value => ({ ...value, wandering: false })); setMessage(kind === 'sprout' ? 'Your plant is resting in its spot.' : 'Settling in for a quiet nap.'); }
  function toggleRoaming() { const next = !care.wandering; setCare(value => ({ ...value, wandering: next })); setMood('idle'); setMessage(next ? reducedMotion ? 'Roaming stays still with reduced motion. Choose Move to change spots.' : 'Free to explore the nook.' : 'Staying right here.'); }
  function pointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const rect = container.current?.getBoundingClientRect();
    const from = rect ? { x: rect.left, y: rect.top } : pointRef.current;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, from, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 7) return;
    gesture.moved = true; clearTimers(); setDragging(true); setMenu(false); setMood('idle');
    setPoint(clampCompanionPoint({ x: gesture.from.x + dx, y: gesture.from.y + dy }, currentViewport()));
  }
  function pointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current; drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture?.moved) { suppressClick.current = true; setMessage('A new spot, just for you.'); event.preventDefault(); }
  }
  function toggleMenu(event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
    if (!menu) {
      clearTimers(); const rect = container.current?.getBoundingClientRect();
      if (rect) setPoint(clampCompanionPoint({ x: rect.left, y: rect.top }, currentViewport()));
      setMood(previous => previous === 'walking' ? 'idle' : previous);
    }
    setMenu(value => !value);
  }
  const name = companionNames[kind];
  const closeToRight = point.x + (viewport.width <= 640 ? 17 + 205 : 45 + 221) > viewport.width - 12;
  return <div ref={container} className={`room-study-companion kind-${kind} mood-${mood} ${reducedMotion ? 'companion-reduced' : ''} ${dragging ? 'is-dragging' : ''} ${menu ? 'menu-open' : ''} ${closeToRight ? 'menu-left' : ''}`} style={{ transform: `translate3d(${point.x}px,${point.y}px,0)`, display: awake ? undefined : 'none' }}>
    <button ref={button} className="room-companion-character" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setDragging(false); suppressClick.current = false; }} onClick={toggleMenu} aria-label={`Visit your ${name.toLowerCase()}. Drag to move.`} aria-expanded={menu} aria-controls="room-companion-care"><span className={`room-companion-art ${facingLeft ? 'faces-left' : ''}`}>
      {kind === 'cat' && spriteReady ? <span className="room-cat-sprite" role="img" aria-label="Study cat" /> : kind === 'cat' ? <img src="/images/study-cat.webp" alt="Study cat holding a book" /> : kind === 'sleepy-dog' ? <img src="/images/sleeping-dog.webp" alt="A sleepy golden study dog" /> : <span className="room-companion-plant"><span className="room-plant-stem" /><span className="room-plant-leaf leaf-one" /><span className="room-plant-leaf leaf-two" /><span className="room-plant-pot" /></span>}
    </span>{mood === 'sleeping' && <span className="room-companion-sleep" aria-hidden="true">z<span>z</span></span>}{hearts > 0 && ['eating', 'happy'].includes(mood) && <span key={hearts} className="room-companion-hearts" aria-hidden="true"><i>♡</i><i>♡</i><i>♡</i></span>}</button>
    {menu && <div id="room-companion-care" className="room-companion-menu" style={{ maxHeight: Math.max(105, point.y - (viewport.width <= 640 ? 80 : 100) - 12) }} role="dialog" aria-labelledby="room-companion-name"><div className="room-companion-menu-heading"><span id="room-companion-name">{name}</span><button onClick={() => { setMenu(false); button.current?.focus(); }} aria-label="Close companion care"><X size={12} /></button></div><div className="room-companion-comfort"><span>Comfort</span><div role="meter" aria-label="Companion comfort" aria-valuenow={care.comfort} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${care.comfort}%` }} /></div><small>{care.comfort}%</small></div><div className="room-companion-actions"><button onClick={feed} disabled={cooldown > 0}><Cookie size={13} /><span>{kind === 'sprout' ? 'Water' : 'Feed'}</span><small>{cooldown ? `${cooldown}s` : 'A treat'}</small></button><button onClick={pet}><Heart size={13} /><span>{kind === 'sprout' ? 'Encourage' : 'Pet'}</span><ChevronRight size={11} /></button><button onClick={() => { moveTo(roomSpots[(roomSpots.findIndex(p => Math.abs(p.x - point.x) < 15) + 1) % roomSpots.length] ?? roomSpots[2], true); setMenu(false); }}><Move size={13} /><span>{reducedMotion || kind === 'sprout' ? 'Move spot' : 'Call over'}</span><ChevronRight size={11} /></button><button onClick={nap}><Moon size={13} /><span>{kind === 'sprout' ? 'Rest' : 'Nap'}</span><ChevronRight size={11} /></button><button onClick={toggleRoaming} disabled={kind === 'sprout' || reducedMotion}><Check size={13} /><span>{care.wandering && kind !== 'sprout' && !reducedMotion ? 'Wandering on' : 'Staying here'}</span><i className={care.wandering && kind !== 'sprout' && !reducedMotion ? 'is-on' : ''} /></button></div><p>Care saved on this device. Drag your companion to another spot.</p>{message && <span className="room-companion-feedback">{message}</span>}</div>}
    <span className="room-companion-announcement" role="status" aria-live="polite">{message}</span>
  </div>;
}
