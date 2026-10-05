import { Component, createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

let recoveryGeneration = 0;
const interruptedDrafts = new Map<string, unknown>();
export const DraftRecoveryScope = createContext('host');

/** Preserve mounted form fields across a caught render failure, in this document only. */
export function useCrashDraft<T>(name: string, initial: T | (() => T), owner?: string): [T, Dispatch<SetStateAction<T>>] {
  const contextScope = useContext(DraftRecoveryScope);
  const scope = owner ?? contextScope;
  const key = JSON.stringify([scope, name]);
  const restore = () => interruptedDrafts.has(key) ? interruptedDrafts.get(key) as T : typeof initial === 'function' ? (initial as () => T)() : initial;
  const [state, setState] = useState(() => ({ key, value: restore() }));
  const value = state.key === key ? state.value : restore();
  // An account change must reset before rendering any old owner's form fields.
  if (state.key !== key) setState({ key, value });
  const latest = useRef({ key, value });
  if (latest.current.key !== key) latest.current = { key, value };
  else latest.current.value = value;
  // Each committed owner keeps its own cell. A failed render for a new owner
  // must not replace the value captured by the previous owner's cleanup.
  const snapshot = latest.current;
  useEffect(() => {
    const generation = recoveryGeneration;
    // A committed remount owns the snapshot again. Ordinary closing keeps the
    // component's existing save/discard behavior, without accumulating forms.
    interruptedDrafts.delete(key);
    return () => { if (generation !== recoveryGeneration) interruptedDrafts.set(key, snapshot.value); };
  }, [key]);
  return [value, next => setState(previous => {
    if (previous.key !== key) return previous;
    const updated = typeof next === 'function' ? (next as (previous: T) => T)(previous.value) : next;
    snapshot.value = updated;
    return { key, value: updated };
  })];
}

/** Recovery stays in the same document so pending saves and scoped drafts survive. */
export default class WorkspaceErrorBoundary extends Component<{ children: ReactNode; onReopen?: () => void }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    recoveryGeneration++;
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <main className="loading-space" role="alert">
      <h2>Your nook needs a moment</h2>
      <p>This view couldn’t open. Try reopening it in this tab.</p>
      <button className="button primary" autoFocus onClick={() => { this.props.onReopen?.(); this.setState(state => ({ failed: false, attempt: state.attempt + 1 })); }}>Reopen nook</button>
      <p>Keep this tab open for any work still waiting to save.</p>
    </main>;
    return <div key={this.state.attempt} style={{ display: 'contents' }}>{this.props.children}</div>;
  }
}
