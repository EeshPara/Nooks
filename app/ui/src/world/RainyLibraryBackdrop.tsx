import { useEffect, useRef, useState } from 'react';
import { createRainyLibraryPlayback } from './rainyLibraryPlayback';
import './RainyLibraryBackdrop.css';

const RAINY_LIBRARY_FILM = '/media/nooks/rainy-library-loop-v1.mp4';

export function RainyLibraryBackdrop({ motion, src = RAINY_LIBRARY_FILM }: { motion: boolean; src?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const playback = useRef<ReturnType<typeof createRainyLibraryPlayback> | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!video.current) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const player = createRainyLibraryPlayback({
      video: video.current, src, enabled: motion,
      reducedMotion: preference.matches, hidden: document.hidden, onReady: setReady,
    });
    playback.current = player;
    const visibility = () => player.visibility(document.hidden);
    const reduceMotion = () => player.reduceMotion(preference.matches);
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', reduceMotion);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', reduceMotion);
      player.dispose();
      if (playback.current === player) playback.current = null;
    };
  }, [src]);
  useEffect(() => { playback.current?.enabled(motion); }, [motion]);

  return <video ref={video} className={`rainy-library-backdrop${ready ? ' is-ready' : ''}`}
    aria-hidden="true" tabIndex={-1} muted loop playsInline preload="none" disablePictureInPicture
    onPlaying={() => playback.current?.playing()} onError={() => playback.current?.failed()} />;
}
