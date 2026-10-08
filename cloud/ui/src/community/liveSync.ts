/** Broadcast is a hint, never a source of membership or focus credit. */
export type RefreshTarget = 'all' | 'room' | 'directory';
export function startLiveSync(options: {
 refresh: (target?: RefreshTarget) => Promise<void>; heartbeat: () => Promise<void>;
 refreshOnStart?: boolean;
 cooldown?: () => number;
 subscribe?: (hint: (topic?: string) => void) => () => void;
 document?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
 window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
 online?: () => boolean; random?: () => number; now?: () => number;
 setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout;
}) {
 const doc = options.document ?? document, win = options.window ?? window;
 const later = options.setTimeout ?? setTimeout, cancel = options.clearTimeout ?? clearTimeout;
 const random = options.random ?? Math.random, now = options.now ?? Date.now;
 const online = options.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
 let stopped = false, active = false, detach: (() => void) | undefined;
 let hintTimer: ReturnType<typeof setTimeout> | undefined, reconcile: ReturnType<typeof setTimeout> | undefined, presence: ReturnType<typeof setTimeout> | undefined;
 let lastRefresh = now(), started = false;
 let queued: RefreshTarget | undefined;
 const usable = () => !stopped && !doc.hidden && online();
 const runRefresh = (target: RefreshTarget = 'all') => { if (!usable()) return; if (target === 'all') { cancel(hintTimer); hintTimer = undefined; queued = undefined; } lastRefresh = now(); void options.refresh(target).catch(() => {}); };
 function hint(topic?: string) {
  if (!usable() || !active) return;
  const target: RefreshTarget = topic === 'nooks:directory' ? 'directory' : topic?.startsWith('nook:') ? 'room' : 'all';
  queued = queued && queued !== target ? 'all' : target;
  if (hintTimer) return;
  const cooldown = options.cooldown?.() ?? 5000;
  hintTimer = later(() => { hintTimer = undefined; const target = queued; queued = undefined; runRefresh(target); }, Math.max(250, cooldown - (now() - lastRefresh)) + random() * (cooldown > 5000 ? 3000 : 1500));
 }
 function scheduleReconcile() {
  reconcile = later(() => { runRefresh(); if (usable()) scheduleReconcile(); }, 45000 + random() * 15000);
 }
 function schedulePresence() {
  // Spread classroom joins and reconnects while staying below the 90-second expiry.
  presence = later(() => { if (!usable()) return; void options.heartbeat().catch(() => {}); schedulePresence(); }, 45000 + random() * 10000);
 }
 function suspend() {
  active = false; detach?.(); detach = undefined;
  cancel(hintTimer); cancel(reconcile); cancel(presence);
  hintTimer = reconcile = presence = undefined; queued = undefined;
 }
 function resume() {
  if (!usable()) { suspend(); return; }
  if (active) return;
  active = true; detach = options.subscribe?.(hint);
  if (started) hint();
  else if (options.refreshOnStart !== false) runRefresh();
  started = true; scheduleReconcile(); schedulePresence();
 }
 doc.addEventListener('visibilitychange', resume);
 win.addEventListener('online', resume); win.addEventListener('offline', resume);
 resume();
 return () => { stopped = true; suspend(); doc.removeEventListener('visibilitychange', resume); win.removeEventListener('online', resume); win.removeEventListener('offline', resume); };
}
