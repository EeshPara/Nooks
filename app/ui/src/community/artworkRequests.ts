import type { ArtworkFile } from './artworkImport';
export type ArtworkRequest = { requestId: string; status: 'pending' | 'received' | 'completed' | 'canceled' | 'expired'; createdAt: string; expiresAt: string; receivedAt?: string; completedAt?: string; canceledAt?: string; file?: ArtworkFile };
export type ArtworkDraft = { id: string; revision: number; title: string; description: string; style: string; artworkMode: string; scenePrompt: string; visibility?: string; space: { backgroundImage?: string; theme?: string; room?: string; accent?: string; companion?: string; layout?: string; decorations?: string[] }; artworkRequest?: ArtworkRequest };
export type ArtworkImportState = { phase: 'waiting' | 'checking' | 'importing' | 'saving' | 'complete' | 'error' | 'expired'; message?: string };
export const awaitingArtwork = (request?: ArtworkRequest) => request?.status === 'pending' || request?.status === 'received';
export function artworkIntent(draft: ArtworkDraft) {
  const { backgroundImage, theme, room, accent, companion, layout, decorations } = draft.space;
  return JSON.stringify([draft.artworkMode, draft.style, draft.scenePrompt.trim(), backgroundImage ?? '', theme, room, accent, companion, layout, decorations]);
}
/** Preserve only local metadata edits. Concurrent edits to the same metadata
 * field need review; a different artwork intent can never adopt a late image. */
export function mergeCompletedArtwork<T extends ArtworkDraft>(local: T, baseline: T, incoming: T): T | null {
  if (local.id !== incoming.id || local.id !== baseline.id || local.artworkRequest?.requestId !== incoming.artworkRequest?.requestId || incoming.artworkRequest?.status !== 'completed' || artworkIntent(local) !== artworkIntent(baseline)) return null;
  const merged = { ...incoming };
  for (const key of ['title', 'description', 'visibility'] as const) if (local[key] !== baseline[key]) {
    if (incoming[key] !== baseline[key] && incoming[key] !== local[key]) return null;
    Object.assign(merged, { [key]: local[key] });
  }
  return merged;
}
/** Cancellation can race a completed upload. Re-read that exact request after
 * an uncertain response, and never call a different owner's transport. */
export async function cancelSavedArtwork<T extends ArtworkDraft>(options: { draftId: string; requestId: string; current: () => boolean; cancel: () => Promise<T>; read: () => Promise<T> }): Promise<T> {
  const settled = (draft: T) => draft.id === options.draftId && draft.artworkRequest?.requestId === options.requestId && ['canceled', 'completed'].includes(draft.artworkRequest.status);
  const requireCurrent = () => { if (!options.current()) throw new Error('This nook editor has closed.'); };
  requireCurrent();
  try { const result = await options.cancel(); requireCurrent(); if (!settled(result)) throw new Error('The cancellation has not been confirmed. Retry canceling this image request.'); return result; }
  catch (error) {
    requireCurrent();
    try { const result = await options.read(); requireCurrent(); if (settled(result)) return result; } catch { /* Retain the original failure and pending cancellation. */ }
    throw error;
  }
}
/** One mounted, selected request. Reads back off; downloads/writes retry only
 * when explicitly requested after failure. Every await rechecks its owner. */
export function createArtworkRequestController<T extends ArtworkDraft>(options: {
  draftId: string; requestId: string; current: () => boolean; hidden?: () => boolean; blocked?: () => boolean;
  read: () => Promise<T>; importFile: (file: ArtworkFile, signal: AbortSignal) => Promise<string>;
  complete: (fileId: string, image: string) => Promise<T>; accept: (draft: T) => boolean; request?: (request: ArtworkRequest) => void;
  state: (state: ArtworkImportState) => void; now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>; clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const setTimer = options.setTimer ?? setTimeout, clearTimer = options.clearTimer ?? clearTimeout, now = options.now ?? Date.now;
  const abort = new AbortController(); let stopped = false, busy = false, paused = false, polls = 0, failures = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let prepared: { fileId: string; image: string } | undefined;
  const active = () => !stopped && !abort.signal.aborted && options.current();
  const clear = () => { if (timer !== undefined) clearTimer(timer); timer = undefined; };
  const schedule = (delay: number) => { clear(); if (active() && !paused) timer = setTimer(() => { timer = undefined; void tick(); }, delay); };
  const valid = (draft: T) => draft?.id === options.draftId && draft.artworkRequest?.requestId === options.requestId;
  const finish = (draft: T) => {
    if (!draft.space?.backgroundImage) throw new Error('Your image is saved, but its preview could not be loaded. Retry when the connection is ready.');
    if (active()) { const accepted = options.accept(draft); options.state(accepted ? { phase: 'complete' } : { phase: 'error', message: 'Your image is saved. Review the newer saved version before replacing your current edits.' }); }
    stopped = true; clear();
  };
  async function tick() {
    if (!active() || busy || paused) return;
    if (options.hidden?.()) { schedule(30_000); return; }
    if (options.blocked?.()) { schedule(2000); return; }
    busy = true; let reading = true;
    try {
      options.state({ phase: 'checking' }); const draft = await options.read(); if (!active()) return;
      if (!valid(draft)) throw new Error('This artwork request changed. Your current draft is still here.');
      const request = draft.artworkRequest!;
      if (request.status === 'completed') { finish(draft); return; }
      if (request.status === 'canceled') { paused = true; options.state({ phase: 'error', message: 'This artwork request was canceled. Your draft is still here.' }); return; }
      if (request.status === 'expired' || !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= now()) { paused = true; options.request?.({ ...request, status: 'expired' }); options.state({ phase: 'expired', message: 'This artwork request expired. Ask ChatGPT for a new image when you are ready.' }); return; }
      options.request?.(request); failures = 0;
      if (request.status === 'pending') { options.state({ phase: 'waiting' }); schedule(++polls < 4 ? 3000 : 8000); return; }
      if (request.status !== 'received' || !request.file?.fileId) throw new Error('The artwork file could not be read. Retry when the connection is ready.');
      reading = false;
      if (!prepared || prepared.fileId !== request.file.fileId) {
        options.state({ phase: 'importing' }); const image = await options.importFile(request.file, abort.signal); if (!active()) return;
        prepared = { fileId: request.file.fileId, image };
      }
      if (options.blocked?.()) { schedule(2000); return; }
      options.state({ phase: 'saving' });
      let completed: T;
      try { completed = await options.complete(prepared.fileId, prepared.image); }
      catch (error) {
        if (!active()) return;
        // A lost completion response must not create a fresh generation request.
        try { const recovered = await options.read(); if (active() && valid(recovered) && recovered.artworkRequest?.status === 'completed') { finish(recovered); return; } } catch { /* Keep the first failure. */ }
        throw error;
      }
      if (!active()) return;
      if (!valid(completed) || completed.artworkRequest?.status !== 'completed') throw new Error('The image save has not been confirmed. Retry this same artwork request.');
      finish(completed);
    } catch (error) {
      if (!active()) return;
      const message = error instanceof Error ? error.message : 'The artwork could not be loaded. Your draft is still here.';
      options.state({ phase: 'error', message });
      if (reading && ++failures < 4) schedule(Math.min(30_000, 3000 * 2 ** failures)); else paused = true;
    } finally { busy = false; }
  }
  return {
    start() { void tick(); },
    retry() { if (!active()) return; paused = false; failures = 0; clear(); void tick(); },
    wake() { if (active() && !paused && !options.hidden?.()) { clear(); void tick(); } },
    stop() { stopped = true; clear(); abort.abort(); prepared = undefined; },
  };
}
