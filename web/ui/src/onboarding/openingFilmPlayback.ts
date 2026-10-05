export type OpeningPhase = 'loading' | 'playing' | 'still' | 'ending';
export type OpeningEndCardMode = 'overlay' | 'baked-in';
type Player = Pick<HTMLVideoElement, 'play' | 'pause' | 'muted'>;
interface PlaybackOptions {
  video: Player | null; reducedMotion: boolean; hidden: boolean;
  onPhase: (phase: OpeningPhase) => void; onFinish: () => void;
  loadingMs?: number; endCardMs?: number; endCardMode?: OpeningEndCardMode;
  schedule?: typeof setTimeout; cancel?: typeof clearTimeout;
}

/** Bounded playback: media failure always leaves an immediately usable entry card. */
export function createOpeningPlayback({ video, reducedMotion, hidden, onPhase, onFinish, loadingMs = 2500, endCardMs = 1100, endCardMode = 'overlay', schedule = setTimeout, cancel = clearTimeout }: PlaybackOptions) {
  let disposed = false, bakedEndPending = false, phase: OpeningPhase = reducedMotion || !video ? 'still' : 'loading';
  let timer: ReturnType<typeof setTimeout> | undefined, playTicket = 0;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const change = (next: OpeningPhase) => { phase = next; onPhase(next); };
  const still = () => { if (disposed || phase === 'still') return; clear(); bakedEndPending = false; playTicket++; video?.pause(); change('still'); };
  const guardLoad = () => { if (!hidden && timer === undefined) timer = schedule(still, Math.min(6000, Math.max(500, loadingMs))); };
  const finish = () => { if (disposed || hidden) return; disposed = true; clear(); playTicket++; video?.pause(); onFinish(); };
  const finishAfterCard = () => { clear(); if (!hidden) timer = schedule(() => { if (phase === 'ending') finish(); }, Math.min(3000, Math.max(0, endCardMs))); };
  const play = () => {
    if (disposed || hidden || bakedEndPending || !video || phase === 'still' || phase === 'ending') return;
    const ticket = ++playTicket;
    guardLoad();
    try { Promise.resolve(video.play()).catch(() => { if (!disposed && !hidden && ticket === playTicket) still(); }); } catch { still(); }
  };
  if (video) video.muted = true;
  onPhase(phase); if (phase === 'loading') play();
  return {
    playing() { if (!disposed && !hidden && !bakedEndPending && phase !== 'still' && phase !== 'ending') { clear(); change('playing'); } },
    waiting() { if (!disposed && !bakedEndPending && (phase === 'loading' || phase === 'playing')) guardLoad(); },
    failed() { if (!bakedEndPending) still(); },
    ended() {
      if (disposed || bakedEndPending || phase === 'still' || phase === 'ending') return;
      clear(); playTicket++; video?.pause();
      // Keep the final film frame visible through dismissal. An overlay phase
      // would flash a second logo over a closing card already in the artwork.
      if (endCardMode === 'baked-in') { bakedEndPending = true; finish(); }
      else { change('ending'); finishAfterCard(); }
    },
    visibility(isHidden: boolean) {
      if (disposed) return; hidden = isHidden;
      if (hidden) { clear(); playTicket++; video?.pause(); }
      else if (bakedEndPending) finish(); else if (phase === 'ending') finishAfterCard(); else play();
    },
    sound(enabled: boolean) { if (disposed || bakedEndPending || !video || phase === 'still' || phase === 'ending') return false; video.muted = !enabled; return true; },
    reduceMotion() { still(); },
    dispose() { disposed = true; clear(); playTicket++; video?.pause(); },
  };
}
