import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OpeningFilm from './OpeningFilm';
import type { OpeningDismissReason } from './useOpeningFilm';
import './OpeningFilmPreview.css';

/** Isolated manual QA entry: no App, account, first-visit history, or study state. */
function OpeningFilmPreview() {
  const [open, setOpen] = useState(false);
  const [presentationId, setPresentationId] = useState(0);
  const [lastDismissal, setLastDismissal] = useState<OpeningDismissReason | null>(null);

  function play() {
    setPresentationId(id => id + 1);
    setOpen(true);
  }

  return <>
    <main className={`opening-preview${open ? ' is-playing' : ''}`}>
      <div className="opening-preview-scene" aria-hidden="true" />
      <section className="opening-preview-entry" aria-labelledby="opening-preview-title">
        <img className="opening-preview-wordmark" src="/images/nooks-wordmark.png" alt="Nooks" />
        <h1 id="opening-preview-title">Opening film preview</h1>
        <p>Your little study nook in ChatGPT.</p>
        <button type="button" className="opening-preview-play" onClick={play}>{lastDismissal ? 'Replay opening' : 'Play opening'}</button>
      </section>
      <footer className="opening-preview-status" role="status" aria-live="polite">
        {lastDismissal ? `Last dismissal: ${lastDismissal}` : 'Ready to play · Sound starts off'}
      </footer>
    </main>
    <OpeningFilm
      open={open}
      presentationId={presentationId}
      videoSrc="/media/opening-film/nooks-opening-v3.mp4"
      posterSrc="/media/opening-film/nooks-opening-poster-v2.jpg"
      wordmarkSrc="/images/nooks-wordmark.png"
      brandName="Nooks"
      endCardMode="baked-in"
      onDismiss={reason => { setLastDismissal(reason); setOpen(false); }}
    />
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><OpeningFilmPreview /></StrictMode>);
