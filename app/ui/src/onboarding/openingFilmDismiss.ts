import type { OpeningDismissReason } from './useOpeningFilm';

export const OPENING_DISSOLVE_MS = 700;
type DismissSurface = Pick<HTMLElement, 'classList'>;
interface DismissOptions {
  surface: DismissSurface | null;
  reducedMotion: boolean;
  hidden: boolean;
  onDismiss: (reason: OpeningDismissReason) => void;
  now?: () => number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}

/** Only natural completion dissolves. A student's close action always wins immediately. */
export function createOpeningDismiss({ surface, reducedMotion, hidden, onDismiss, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }: DismissOptions) {
  let disposed = false, finished = false, dissolving = false;
  let remaining = OPENING_DISSOLVE_MS, startedAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const finish = (reason: OpeningDismissReason) => {
    if (disposed || finished) return;
    finished = true; clear(); onDismiss(reason);
  };
  const resume = () => {
    if (hidden || disposed || finished) return;
    if (remaining <= 0) { finish('finished'); return; }
    startedAt = now();
    timer = schedule(() => { timer = undefined; remaining = 0; if (!hidden) finish('finished'); }, remaining);
  };
  return {
    dismiss(reason: OpeningDismissReason) {
      if (disposed || finished) return;
      if (reason !== 'finished' || reducedMotion || !surface) { finish(reason); return; }
      if (dissolving) return;
      dissolving = true;
      surface.classList.add('is-dissolving');
      if (hidden) surface.classList.add('is-dismiss-paused');
      resume();
    },
    visibility(nextHidden: boolean) {
      if (disposed || finished || nextHidden === hidden) return;
      hidden = nextHidden;
      if (!dissolving) return;
      if (hidden) {
        clear();
        if (startedAt !== undefined) remaining = Math.max(0, remaining - (now() - startedAt));
        startedAt = undefined; surface?.classList.add('is-dismiss-paused');
      } else { surface?.classList.remove('is-dismiss-paused'); resume(); }
    },
    reduceMotion() { reducedMotion = true; if (dissolving) finish('finished'); },
    dispose() { disposed = true; clear(); surface?.classList.remove('is-dissolving', 'is-dismiss-paused'); },
  };
}
