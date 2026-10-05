import type { WorkspaceLayoutChange, WorkspaceLayoutValue, WorkspaceWidgetId, WorkspaceWidgetPosition } from '../workspace-normalize';

const ids = ['spotify', 'timer', 'tasks', 'collection', 'collection-next', 'welcome', 'people'] as const;
export function readLayout(value?: WorkspaceLayoutValue): WorkspaceLayoutValue {
  const positions: Partial<Record<WorkspaceWidgetId, WorkspaceWidgetPosition>> = {};
  if (value?.version === 1) for (const id of ids) {
    const point = value.positions?.[id];
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) positions[id] = { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) };
  }
  return { version: 1, positions };
}
export function changeLayout(value: WorkspaceLayoutValue, change: WorkspaceLayoutChange): WorkspaceLayoutValue {
  if ('reset' in change) return { version: 1, positions: {} };
  const positions = { ...value.positions };
  if (change.position === null) delete positions[change.id]; else positions[change.id] = { ...change.position };
  return readLayout({ version: 1, positions });
}
type Save = (change: WorkspaceLayoutChange) => Promise<unknown>;
type Session = { base: WorkspaceLayoutValue; value: WorkspaceLayoutValue; incoming: string; queue: WorkspaceLayoutChange[]; saving: boolean; error: string; send?: Save; flight?: Promise<void> };
/** Small in-document account ledger: a failed save keeps its exact draft and
 * never retries automatically. Switching accounts cannot dispatch queued work.
 */
export function createWorkspaceLayoutStore() {
  const sessions = new Map<string, Session>(), listeners = new Set<() => void>(); let active: string | undefined;
  const emit = () => listeners.forEach(listener => listener());
  const session = (scope: string, initial?: WorkspaceLayoutValue) => {
    let state = sessions.get(scope);
    if (!state) { const value = readLayout(initial); state = { base: value, value, incoming: JSON.stringify(value), queue: [], saving: false, error: '' }; sessions.set(scope, state); }
    return state;
  };
  const rebuild = (state: Session) => { state.value = state.queue.reduce(changeLayout, state.base); };
  async function flush(scope: string) {
    const state = session(scope); if (state.flight) return state.flight;
    if (active !== scope || !state.send || !state.queue.length) return;
    const task = Promise.resolve().then(async () => {
      state.saving = true; state.error = ''; emit();
      try {
        while (state.queue.length && active === scope) {
          const change = state.queue[0], send = state.send!;
          await send(change);
          state.base = changeLayout(state.base, change); state.queue.shift(); rebuild(state);
        }
      } catch (error) { state.error = `${error instanceof Error && error.message ? error.message : 'Your layout could not save.'} Your arrangement is still here. Retry saving when you are ready.`; }
      finally { state.saving = false; state.flight = undefined; emit(); }
    });
    state.flight = task; return task;
  }
  return {
    get: session,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(scope: string | undefined, value: WorkspaceLayoutValue | undefined, send: Save) {
      active = scope; if (!scope) return;
      const state = session(scope, value), normalized = readLayout(value), incoming = JSON.stringify(normalized);
      state.send = send;
      if (incoming !== state.incoming) { state.incoming = incoming; state.base = normalized; rebuild(state); emit(); }
    },
    change(scope: string, change: WorkspaceLayoutChange) {
      if (scope !== active) return;
      const state = session(scope); state.queue.push(structuredClone(change)); rebuild(state); emit();
      if (!state.error) void flush(scope);
    },
    retry(scope: string) { if (scope === active) { session(scope).error = ''; return flush(scope); } },
    deactivate() { active = undefined; },
  };
}
