type AmbientVideo = Pick<HTMLVideoElement,
  'src' | 'muted' | 'loop' | 'playsInline' | 'play' | 'pause' | 'load' | 'removeAttribute'>;

interface AmbientPlaybackOptions {
  video: AmbientVideo;
  src: string;
  enabled: boolean;
  reducedMotion: boolean;
  hidden: boolean;
  onReady: (ready: boolean) => void;
}

/** Keep background media silent and idle until motion is both wanted and visible. */
export function createRainyLibraryPlayback({ video, src, enabled, reducedMotion, hidden, onReady }: AmbientPlaybackOptions) {
  let disposed = false, loaded = false, failed = false, ticket = 0;
  const allowed = () => !disposed && enabled && !reducedMotion && !hidden && !failed;
  const pause = () => { ticket++; video.pause(); };
  const release = () => {
    pause();
    if (loaded) { video.removeAttribute('src'); video.load(); loaded = false; }
    onReady(false);
  };
  const fail = () => { if (!disposed) { failed = true; release(); } };
  const play = () => {
    if (!allowed()) { pause(); return; }
    video.muted = true;
    if (!loaded) { video.src = src; loaded = true; }
    const attempt = ++ticket;
    try {
      Promise.resolve(video.play()).catch(() => {
        // A pause, tab switch, or scene change can cancel a pending play promise.
        if (attempt === ticket && allowed()) fail();
      });
    } catch { if (attempt === ticket && allowed()) fail(); }
  };
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  play();
  return {
    playing() { if (allowed()) onReady(true); else pause(); },
    failed: fail,
    enabled(value: boolean) {
      const retry = value && !enabled;
      enabled = value;
      if (retry) failed = false;
      play();
    },
    visibility(value: boolean) { hidden = value; play(); },
    reduceMotion(value: boolean) {
      reducedMotion = value;
      if (value) release(); else play();
    },
    dispose() { disposed = true; release(); },
  };
}

export function usesRainyLibraryFilm({ workspaceReady, roomId, sceneImage, customArtwork, alternateScene, customNook }: {
  workspaceReady: boolean; roomId: string; sceneImage: string; customArtwork: boolean; alternateScene: boolean; customNook: boolean;
}) {
  // Before hydration, the placeholder workspace looks like Rainy Library even
  // when the student's saved destination is a different or custom scene.
  return workspaceReady && roomId === 'rainy-library' && sceneImage === '/images/lofi-rainy-library.webp'
    && !customArtwork && !alternateScene && !customNook;
}
