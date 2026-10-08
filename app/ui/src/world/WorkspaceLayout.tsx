import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Grip, LayoutGrid, RotateCcw, Check } from 'lucide-react';
import type { WorkspaceLayoutChange, WorkspaceLayoutValue, WorkspaceWidgetId, WorkspaceWidgetPosition } from '../workspace-normalize';
import { createWorkspaceLayoutStore } from './workspaceLayoutState';
import { movedWidget, passedWidgetDragThreshold, widgetBounds, widgetPixels, widgetPosition, snapWidget, type WidgetViewport } from './workspaceLayoutMath';
import './WorkspaceLayout.css';
export type { WorkspaceLayoutChange, WorkspaceLayoutValue, WorkspaceWidgetId, WorkspaceWidgetPosition } from '../workspace-normalize';

type LayoutContext = { scope?: string; value: WorkspaceLayoutValue; editing: boolean; compact: boolean; saving: boolean; dirty: boolean; error: string; arrange: (editing: boolean) => void; change: (change: WorkspaceLayoutChange) => void; retry: () => void };
const Context = createContext<LayoutContext | null>(null);
export function WorkspaceLayoutProvider({ value, onChange, scopeKey, children }: { value?: WorkspaceLayoutValue; onChange: (change: WorkspaceLayoutChange) => Promise<unknown>; scopeKey?: string; children: ReactNode }) {
  const store = useMemo(createWorkspaceLayoutStore, []), [, render] = useState(0);
  const [editingScope, setEditingScope] = useState<string>(), [compact, setCompact] = useState(() => window.innerWidth <= 760);
  const state = scopeKey ? store.get(scopeKey, value) : undefined;
  useLayoutEffect(() => store.subscribe(() => render(version => version + 1)), [store]);
  useLayoutEffect(() => { store.select(scopeKey, value, onChange); }, [store, scopeKey, value, onChange]);
  useEffect(() => () => store.deactivate(), [store]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)'), update = () => { setCompact(query.matches); if (query.matches) setEditingScope(undefined); };
    update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  return <Context.Provider value={{ scope: scopeKey, value: state?.value ?? { version: 1, positions: {} }, editing: !!scopeKey && editingScope === scopeKey && !compact, compact, saving: state?.saving ?? false, dirty: !!state?.queue.length, error: state?.error ?? '', arrange: editing => setEditingScope(editing ? scopeKey : undefined), change: change => { if (scopeKey) store.change(scopeKey, change); }, retry: () => { if (scopeKey) void store.retry(scopeKey); } }}>{children}</Context.Provider>;
}

export function LayoutControls({ className = '' }: { className?: string }) {
  const layout = useContext(Context); if (!layout) return null;
  return <div className={`workspace-layout-controls ${className}`} data-workspace-layout-control onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    {layout.editing ? <><button type="button" onClick={() => layout.arrange(false)}><Check size={14}/>Done</button><button type="button" disabled={layout.saving || !Object.keys(layout.value.positions).length} onClick={() => layout.change({ reset: true })}><RotateCcw size={13}/>Reset layout</button></> : <button type="button" aria-label="Arrange workspace" disabled={!layout.scope || layout.compact} title={layout.compact ? 'Your widgets use a stacked layout on this screen.' : 'Move widgets around your study space'} onClick={() => layout.arrange(true)}><LayoutGrid size={14}/>Arrange</button>}
    {(layout.editing || layout.dirty) && <span role="status">{layout.saving ? 'Saving layout…' : layout.error ? 'Layout not saved' : layout.dirty ? 'Changes waiting to save' : 'Layout saved'}</span>}
    {layout.error && <div className="workspace-layout-error" role="alert"><span>{layout.error}</span><button type="button" disabled={layout.saving} onClick={layout.retry}>Retry saving layout</button></div>}
    {layout.dirty && !layout.error && !layout.saving && <button type="button" onClick={layout.retry}>Save pending layout</button>}
  </div>;
}

function viewportFor(element: HTMLElement): WidgetViewport {
  const root = element.closest('.lofi-world') ?? element, css = getComputedStyle(root), viewport = window.visualViewport;
  const number = (name: string) => Math.max(0, Number.parseFloat(css.getPropertyValue(name)) || 0);
  return { width: viewport?.width ?? window.innerWidth, height: Math.max(window.innerHeight, ((root as HTMLElement).querySelector?.('.study-home')?.getBoundingClientRect().bottom || 0) + (window.scrollY||0) + 48), offsetX: 0, offsetY: 0, left: 16 + number('--nooks-host-safe-left'), right: 16 + number('--nooks-host-safe-right'), top: 96 + number('--nooks-host-safe-top'), bottom: 32 + number('--nooks-host-safe-bottom') + number('--nooks-composer-reserve') };
}
type Drag = { pointer: number | null; startX: number; startY: number; originX: number; originY: number; x: number; y: number; moved: boolean; scope?: string };

export function MovableWidget({ id, label, children, className = '', style }: { id: WorkspaceWidgetId; label: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const layout = useContext(Context), slot = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null), handle = useRef<HTMLButtonElement>(null);
  const latest = useRef(layout); latest.current = layout;
  const drag = useRef<Drag | null>(null), frame = useRef(0), originalSize = useRef({ width: 0, height: 0 });
  const position = layout?.value.positions[id], enabled = !!layout?.editing && !layout.compact;
  function restore() {
    const outer = slot.current, element = surface.current; if (!outer || !element) return;
    const context = latest.current, point = context?.value.positions[id];
    if (!context || context.compact || !point) {
      delete outer.dataset.positioned; delete element.dataset.positioned;
      for (const key of ['left', 'top', 'width', 'max-width', 'max-height', '--workspace-widget-max-height']) element.style.removeProperty(key);
      outer.style.removeProperty('min-height'); outer.style.removeProperty('min-width'); return;
    }
    paint(point);
  }
  function freePosition(point: {x:number;y:number}) {
    const element=surface.current;
    if(!element)return null;
    // Free placement: clamp to the visible workspace, without rejecting overlap.
    // The handle remains reachable so students can move overlapping widgets again.
    return widgetPosition(point, viewportFor(element), element.getBoundingClientRect());
  }

  function paint(point: WorkspaceWidgetPosition) {
    const outer = slot.current, element = surface.current; if (!outer || !element) return;
    const viewport = viewportFor(element), bounds = widgetBounds(viewport, { width: 0, height: 0 });
    if (!outer.dataset.positioned) { const size = element.getBoundingClientRect(); originalSize.current = { width: size.width, height: size.height }; }
    // The wrapper remains in its original layout slot; only its existing inner
    // surface changes positioning. Children and iframe DOM nodes never move.
    outer.style.minHeight = `${originalSize.current.height}px`; outer.dataset.positioned = 'true'; element.dataset.positioned = 'true';
    // Intrinsic flex slots (the people pill) would otherwise collapse after the
    // surface leaves flow. Full-width grid slots keep their responsive width.
    if (!outer.getBoundingClientRect().width || outer.style.minWidth) outer.style.minWidth = `${Math.min(originalSize.current.width, bounds.width)}px`;
    const width = Math.min(outer.getBoundingClientRect().width || originalSize.current.width || bounds.width, bounds.width);
    element.style.width = `${width}px`; element.style.maxWidth = `${bounds.width}px`; element.style.maxHeight = `${bounds.height}px`;
    element.style.setProperty('--workspace-widget-max-height', `${bounds.height}px`);
    const size = element.getBoundingClientRect();
    const safe = freePosition(widgetPixels(point, viewport, size));
    if (!safe) {
      delete outer.dataset.positioned; delete element.dataset.positioned;
      for (const key of ['left','top','width','max-width','max-height','--workspace-widget-max-height']) element.style.removeProperty(key);
      outer.style.removeProperty('min-height'); outer.style.removeProperty('min-width'); return;
    }
    const pixels = widgetPixels(safe, viewport, size);
    const origin = outer.getBoundingClientRect();
    element.style.left = `${pixels.x-origin.left-(window.scrollX||0)}px`; element.style.top = `${pixels.y-origin.top-(window.scrollY||0)}px`;
  }
  function cancel() {
    if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0;
    const active = drag.current; drag.current = null;
    if (active?.pointer !== null && active?.pointer !== undefined) try { handle.current?.releasePointerCapture(active.pointer); } catch {}
    if (surface.current) delete surface.current.dataset.dragging; restore();
  }
  function finish() {
    const active = drag.current, element = surface.current; if (!active || !element) return;
    if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0;
    drag.current = null; delete element.dataset.dragging;
    if (active.pointer !== null) try { handle.current?.releasePointerCapture(active.pointer); } catch {}
    if (!active.moved || active.scope !== latest.current?.scope || latest.current?.compact) { restore(); return; }
    const point = freePosition({ x: active.x, y: active.y });
    if (!point) { restore(); return; }
    paint(point); latest.current?.change({ id, position: point });
  }
  function schedule() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0; const active = drag.current, element = surface.current; if (!active?.moved || !element) return;
      if (active.scope !== latest.current?.scope || latest.current?.compact) { cancel(); return; }
      const point = freePosition({x:active.x,y:active.y});
      if(point){element.dataset.dragging = 'true'; paint(point);}
    });
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!enabled || event.button !== 0 || drag.current || !surface.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    const bounds = surface.current.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, originX: bounds.left+(window.scrollX||0), originY: bounds.top+(window.scrollY||0), x: bounds.left+(window.scrollX||0), y: bounds.top+(window.scrollY||0), moved: false, scope: layout?.scope };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current; if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); const dx = event.clientX - active.startX, dy = event.clientY - active.startY;
    active.moved ||= passedWidgetDragThreshold(dx, dy); active.x = active.originX + dx; active.y = active.originY + dy; schedule();
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    if (!enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !surface.current) return;
    event.preventDefault(); event.stopPropagation(); const bounds = surface.current.getBoundingClientRect();
    drag.current ??= { pointer: null, startX: 0, startY: 0, originX: bounds.left+(window.scrollX||0), originY: bounds.top+(window.scrollY||0), x: bounds.left+(window.scrollX||0), y: bounds.top+(window.scrollY||0), moved: true, scope: layout?.scope };
    if (drag.current.pointer !== null) return;
    Object.assign(drag.current, movedWidget(drag.current, event.key, event.shiftKey)); schedule();
  }
  useLayoutEffect(() => { cancel(); }, [layout?.scope, layout?.compact, layout?.editing, position?.x, position?.y]);
  useEffect(() => {
    const element = surface.current, outer = slot.current; if (!element || !outer) return;
    const resize = () => {
      if (drag.current) { cancel(); return; }
      if (!outer.dataset.positioned) { const rect = element.getBoundingClientRect(); originalSize.current = { width: rect.width, height: rect.height }; }
      restore();
    };
    const resizedSurface = () => { if (drag.current) schedule(); else resize(); };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resizedSurface); observer?.observe(element); observer?.observe(outer);
    window.addEventListener('resize', resize, { passive: true }); window.visualViewport?.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize);  if (frame.current) cancelAnimationFrame(frame.current); };
  }, []);
  return <div className={`workspace-widget-slot ${className}`} style={style} ref={slot} data-workspace-widget={id} data-layout-editing={enabled || undefined}>
    <div className="workspace-widget-surface" ref={surface}>
      {children}
      {enabled && <div className="workspace-widget-controls" data-workspace-layout-control onClick={event => event.stopPropagation()}>
        <button type="button" ref={handle} className="workspace-widget-handle" aria-label={`Move ${label}`} title="Drag anywhere in your workspace. Arrow keys move; Shift moves farther. Escape cancels." onPointerDown={start} onPointerMove={move} onPointerUp={event => { event.stopPropagation(); finish(); }} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current?.pointer !== null) cancel(); }} onKeyDown={key} onKeyUp={event => { if (event.key.startsWith('Arrow')) { event.preventDefault(); event.stopPropagation(); finish(); } }} onBlur={() => { if (drag.current?.pointer === null) finish(); }}><Grip size={14}/><span>{label}</span></button>
        {position && <button type="button" className="workspace-widget-reset" aria-label={`Reset ${label} position`} title="Return to the original position" onPointerDown={event => event.stopPropagation()} onClick={() => layout?.change({ id, position: null })}><RotateCcw size={13}/></button>}
      </div>}
    </div>
  </div>;
}
