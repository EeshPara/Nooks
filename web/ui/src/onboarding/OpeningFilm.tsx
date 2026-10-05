import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Volume2, VolumeX, X } from 'lucide-react';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import { createOpeningPlayback, type OpeningEndCardMode, type OpeningPhase } from './openingFilmPlayback';
import { createOpeningDismiss } from './openingFilmDismiss';
import type { OpeningDismissReason } from './useOpeningFilm';
import './OpeningFilm.css';

export interface OpeningFilmProps {
  open: boolean;
  /** Change this on replay to restart even if the previous surface remains open. */
  presentationId?: number | string;
  videoSrc?: string;
  posterSrc?: string;
  wordmarkSrc?: string;
  logoSrc?: string;
  brandName?: string;
  endCardMs?: number;
  /** Baked-in films already contain their closing brand card; skip the extra overlay. */
  endCardMode?: OpeningEndCardMode;
  onDismiss: (reason: OpeningDismissReason) => void;
}

/** No mounted video, image, or network preload when this opening is not visible. */
export default function OpeningFilm({ open, presentationId, ...props }: OpeningFilmProps) {
  return open ? <OpeningFilmSurface key={presentationId} {...props} /> : null;
}

function OpeningFilmSurface({ videoSrc, posterSrc, wordmarkSrc = '/images/nooks-wordmark.png', logoSrc = '/images/nook-cat-logo.webp', brandName = 'Nooks', endCardMs = 1100, endCardMode = 'overlay', onDismiss }: Omit<OpeningFilmProps, 'open' | 'presentationId'>) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [phase, setPhase] = useState<OpeningPhase>(reducedMotion || !videoSrc ? 'still' : 'loading');
  const [sound, setSound] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null);
  const playback = useRef<ReturnType<typeof createOpeningPlayback> | null>(null);
  const dismissal = useRef<ReturnType<typeof createOpeningDismiss> | null>(null);
  const onDismissRef = useRef(onDismiss); onDismissRef.current = onDismiss;
  const heading = useId();
  const closeRef = useRef<(value: OpeningDismissReason) => void>(() => {});
  function close(value: OpeningDismissReason) {
    playback.current?.dispose();
    dismissal.current?.dismiss(value);
  }
  closeRef.current = close;
  const backdrop = useBackdropDismiss<HTMLDialogElement>(() => close('outside'), true);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current; element?.showModal();
    const controller = createOpeningDismiss({ surface: element, reducedMotion, hidden: document.hidden, onDismiss: value => onDismissRef.current(value) });
    dismissal.current = controller;
    return () => {
      controller.dispose(); if (dismissal.current === controller) dismissal.current = null;
      element?.close();
      requestAnimationFrame(() => {
        if (!document.querySelector('dialog[open],[aria-modal="true"]') && previous?.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, []);
  useEffect(() => {
    const media = video.current;
    // Strict Mode replays this effect after cleanup while retaining its DOM node.
    if (media && videoSrc && !reducedMotion && !media.hasAttribute('src')) media.src = videoSrc;
    const releaseMedia = () => { if (media?.hasAttribute('src')) { media.removeAttribute('src'); media.load(); } };
    const player = createOpeningPlayback({ video: media, reducedMotion, hidden: document.hidden, onPhase: next => { setPhase(next); if (next === 'still') releaseMedia(); }, onFinish: () => closeRef.current('finished'), endCardMs, endCardMode });
    playback.current = player;
    const visibility = () => { player.visibility(document.hidden); dismissal.current?.visibility(document.hidden); };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changedMotion = (event: MediaQueryListEvent) => { if (event.matches) { setReducedMotion(true); player.reduceMotion(); dismissal.current?.reduceMotion(); } };
    document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', changedMotion);
    return () => { player.dispose(); releaseMedia(); if (playback.current === player) playback.current = null; document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', changedMotion); };
    // A preference changing to reduce turns this presentation into a still; never
    // restart playback midway because an unrelated callback or state changed.
  }, [videoSrc, endCardMs, endCardMode]);
  const showCard = phase === 'ending' || phase === 'still';
  const playable = !!videoSrc && !reducedMotion && phase !== 'still';
  return createPortal(<dialog ref={dialog} className={`nooks-opening-film phase-${phase}${reducedMotion ? ' is-reduced' : ''}`} aria-modal="true" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close('escape'); }} {...backdrop}>
    <div className="nooks-opening-scene" aria-hidden="true">
      {posterSrc ? <img className="nooks-opening-poster" src={posterSrc} alt="" /> : <div className="nooks-opening-paper" />}
      {playable ? <video ref={video} className="nooks-opening-video" src={videoSrc} poster={posterSrc} muted playsInline preload="auto" aria-hidden="true" onPlaying={() => playback.current?.playing()} onWaiting={() => playback.current?.waiting()} onStalled={() => playback.current?.waiting()} onError={() => playback.current?.failed()} onEnded={() => playback.current?.ended()} /> : null}
    </div>
    <div className="nooks-opening-shade" aria-hidden="true" />
    <header className="nooks-opening-controls">
      {playable && !showCard ? <button className="nooks-opening-sound" type="button" aria-pressed={sound} aria-label={sound ? 'Mute opening film' : 'Turn on opening film sound'} onClick={() => { const next = !sound; if (playback.current?.sound(next)) setSound(next); }}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{sound ? 'Sound on' : 'Sound off'}</span></button> : <span />}
      <button className="nooks-opening-close" type="button" aria-label="Close opening film" onClick={() => close('close')}><X size={20} /></button>
    </header>
    <div className="nooks-opening-card" aria-hidden={!showCard}>
      <img className="nooks-opening-cat" src={logoSrc} alt="" />
      <img className="nooks-opening-wordmark" src={wordmarkSrc} alt={brandName} />
      <p>Your little study nook in ChatGPT.</p>
    </div>
    <h1 id={heading} className="nooks-opening-sr-only">Welcome to {brandName}</h1>
    <footer className="nooks-opening-footer">
      <button autoFocus type="button" className="nooks-opening-enter" onClick={() => close('enter')}>Enter my nook<ArrowRight size={17} /></button>
    </footer>
  </dialog>, document.body);
}
