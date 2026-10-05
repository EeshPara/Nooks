import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Shuffle } from 'lucide-react';
import type { StudyViewProps } from './StudyView';
import { usePracticeCheckpoint, usePracticeClock, type PracticeCheckpoint } from './usePracticeCheckpoint';
import './FlashcardsSession.css';

const newSessionId = () => globalThis.crypto?.randomUUID?.() ?? `study-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
type CardsCheckpoint = { queue: number[]; known: number[]; firstAnswers: Record<number, boolean>; flipped: boolean; showHint: boolean; complete: boolean; duration: number };

/** Ratings retain the first attempt, even when a card returns to the review queue. */
export default function FlashcardsSession({ artifact, onExit, onProgress, roomId, saved = true }: StudyViewProps) {
  const cards = artifact.cards ?? [];
  const [queue, setQueue] = useState(() => cards.map((_, index) => index));
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [known, setKnown] = useState<number[]>([]);
  const [firstAnswers, setFirstAnswers] = useState<Record<number, boolean>>({});
  const [complete, setComplete] = useState(false);
  const [duration, setDuration] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const section = useRef<HTMLElement>(null);
  const flipButton = useRef<HTMLButtonElement>(null);
  const sessionId = useRef<string>(newSessionId());
  const sessionRoomId = useRef(roomId);
  const emitted = useRef(false);
  const canRate = useRef(false);
  const focusNextCard = useRef(false);
  const clock = usePracticeClock(section, complete);
  const checkpoint = usePracticeCheckpoint<CardsCheckpoint>(artifact, {
    version: 1, kind: 'flashcards', artifactRevision: artifact.revision ?? 1,
    sessionId: sessionId.current, roomId: sessionRoomId.current, elapsedSeconds: clock.seconds,
    state: { queue, known, firstAnswers, flipped, showHint, complete, duration },
  }, restoreSession, section, saved);
  const currentIndex = queue[0];
  const card = cards[currentIndex];
  const firstScore = Object.values(firstAnswers).filter(Boolean).length;
  const repeated = cards.filter((_, index) => firstAnswers[index] === false);
  const progress = cards.length ? Math.round(known.length / cards.length * 100) : 0;

  function restoreSession(saved: PracticeCheckpoint<CardsCheckpoint>) {
    const state = saved.state;
    setQueue(state.queue); setKnown(state.known); setFirstAnswers(state.firstAnswers);
    setFlipped(state.flipped); setShowHint(state.showHint); setComplete(state.complete); setDuration(state.duration);
    sessionId.current = saved.sessionId; sessionRoomId.current = saved.roomId;
    canRate.current = state.flipped; emitted.current = state.complete;
    clock.restore(saved.elapsedSeconds);
    if (state.complete) emitProgress(state.firstAnswers, state.duration);
  }

  function emitProgress(ratings: Record<number, boolean>, seconds: number) {
    if (!saved) return;
    const score = Object.values(ratings).filter(Boolean).length;
    onProgress({ artifactId: artifact.id, artifactRevision: artifact.revision ?? 1, kind: 'flashcards', score, total: cards.length,
      xp: 10 + score * 5, durationSeconds: seconds, sessionId: sessionId.current, roomId: sessionRoomId.current,
      cardRatings: Object.fromEntries(cards.map((item, index) => [item.id, ratings[index] ? 'good' : 'again'])),
    });
  }

  function flip() {
    if (!checkpoint.ready || !card || complete) return;
    const next = !flipped;
    canRate.current = next;
    setFlipped(next);
  }

  function rate(didKnow: boolean) {
    if (!canRate.current || !flipped || complete || !card) return;
    // Close this turn immediately; two clicks before React renders must not grade twice.
    canRate.current = false;
    const nextFirst = currentIndex in firstAnswers ? firstAnswers : { ...firstAnswers, [currentIndex]: didKnow };
    const nextKnown = didKnow ? [...known, currentIndex] : known;
    const nextQueue = didKnow ? queue.slice(1) : [...queue.slice(1), currentIndex];
    setFirstAnswers(nextFirst);
    setKnown(nextKnown);
    setQueue(nextQueue);
    setFlipped(false);
    setShowHint(false);
    setAnnouncement(didKnow ? `${nextKnown.length} of ${cards.length} cards recalled.` : 'Card added to the end of your review queue.');
    if (!nextQueue.length) {
      const seconds = Math.max(1, clock.seconds);
      setComplete(true);
      setDuration(seconds);
      if (!emitted.current) {
        emitted.current = true;
        emitProgress(nextFirst, seconds);
      }
    } else {
      // Rating buttons become disabled until the next reveal. Keep keyboard focus useful.
      focusNextCard.current = true;
    }
  }

  function shuffle() {
    const pending = [...queue];
    for (let index = pending.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [pending[index], pending[target]] = [pending[target], pending[index]];
    }
    canRate.current = false;
    setQueue(pending);
    setFlipped(false);
    setShowHint(false);
    setAnnouncement('Remaining cards shuffled.');
  }

  function restart() {
    setQueue(cards.map((_, index) => index));
    setKnown([]);
    setFirstAnswers({});
    setFlipped(false);
    setShowHint(false);
    setComplete(false);
    setDuration(0);
    setAnnouncement('New practice session started.');
    canRate.current = false;
    clock.restore(0);
    sessionId.current = newSessionId();
    sessionRoomId.current = roomId;
    emitted.current = false;
  }

  useEffect(() => {
    if (focusNextCard.current && !complete) {
      flipButton.current?.focus({ preventScroll: true });
      focusNextCard.current = false;
    }
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"],dialog[open],.nooks-portal')) return;
      if (!checkpoint.ready || complete || !card || event.repeat || event.altKey || event.ctrlKey || event.metaKey || section.current?.closest('[hidden], [aria-hidden="true"]')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]')) return;
      if (target?.closest('button, a, [role="button"]') && !section.current?.contains(target)) return;
      if (event.code === 'Space') {
        // Native button activation already handles Space on focused controls.
        if (target?.closest('button, a, [role="button"], summary')) return;
        event.preventDefault();
        flip();
      } else if (event.key === 'ArrowRight' && flipped) {
        event.preventDefault();
        rate(true);
      } else if (event.key === 'ArrowLeft' && flipped) {
        event.preventDefault();
        rate(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const header = <header className="nooks-cards-header">
    <div className="nooks-cards-topline">
      <button type="button" className="nooks-cards-back" onClick={onExit}><ArrowLeft size={16} aria-hidden="true" /> Library</button>
      <span>{artifact.subject} <span aria-hidden="true">/</span> Flashcards</span>
    </div>
    <h1>{artifact.title}</h1>
    {!saved && <p className="nooks-cards-description">Preview · Save this set to keep your progress.</p>}
    {artifact.description && <p className="nooks-cards-description">{artifact.description}</p>}
    {checkpoint.error && <p role="alert">{checkpoint.error} <button type="button" onClick={checkpoint.retry}>Retry</button></p>}
  </header>;

  if (!checkpoint.ready) return <section className="nooks-cards" ref={section}>{header}{!checkpoint.error && <p role="status">Opening your cards…</p>}</section>;

  if (!cards.length) return <section className="nooks-cards" ref={section}>
    {header}
    <div className="nooks-cards-empty">
      <h2>No cards yet</h2>
      <p>Add a question and answer to this set, or ask ChatGPT to turn your notes into flashcards.</p>
      <button type="button" className="nooks-cards-button is-primary" onClick={onExit}>Back to library <ArrowRight size={16} aria-hidden="true" /></button>
    </div>
  </section>;

  if (complete) return <section className="nooks-cards" ref={section}>
    {header}
    <div className="nooks-cards-finished" role="status">
      <span className="nooks-cards-label">Session complete</span>
      <h2>All {cards.length} {cards.length === 1 ? 'card' : 'cards'} reviewed.</h2>
      <p>{repeated.length ? `${repeated.length} ${repeated.length === 1 ? 'card needed' : 'cards needed'} another pass. You recalled ${firstScore} on the first try.` : 'You recalled every answer on the first try.'}</p>
      <dl className="nooks-cards-results">
        <div><dt>First-pass recall</dt><dd>{firstScore}<span> / {cards.length}</span></dd></div>
        <div><dt>Reviewed again</dt><dd>{repeated.length}</dd></div>
        <div><dt>Time spent</dt><dd>{timeLabel(duration)}</dd></div>
      </dl>
    </div>
    <div className="nooks-cards-finish-actions">
      <button type="button" className="nooks-cards-button" onClick={restart}><RotateCcw size={16} aria-hidden="true" /> Practice again</button>
      <button type="button" className="nooks-cards-button is-primary" onClick={onExit}>Back to library <ArrowRight size={16} aria-hidden="true" /></button>
    </div>
    {!!repeated.length && <details className="nooks-cards-review">
      <summary>Review the {repeated.length === 1 ? 'card' : 'cards'} you repeated <span>{repeated.length}</span></summary>
      <div>{repeated.map(item => <article key={item.id}><h3>{item.front}</h3><p>{item.back}</p></article>)}</div>
    </details>}
  </section>;

  return <section className="nooks-cards" ref={section}>
    {header}
    <div className="nooks-cards-progress-meta"><span><strong>{known.length}</strong> of {cards.length} recalled</span><span>{queue.length} remaining</span></div>
    <div className="nooks-cards-progress" role="progressbar" aria-label="Cards recalled" aria-valuenow={known.length} aria-valuemin={0} aria-valuemax={cards.length}><span style={{ width: `${progress}%` }} /></div>
    <div className="nooks-cards-desk">
      <div className="nooks-cards-tools"><span>Card {currentIndex + 1} <span aria-hidden="true">·</span> {flipped ? 'Answer' : 'Question'}</span><button type="button" onClick={shuffle} disabled={queue.length < 2} aria-label="Shuffle remaining cards"><Shuffle size={14} aria-hidden="true" /> Shuffle</button></div>
      <button
        key={card.id}
        ref={flipButton}
        type="button"
        className={`nooks-cards-flip ${flipped ? 'is-flipped' : ''}`}
        onClick={flip}
        aria-label={flipped ? `Answer: ${card.back}. Show question.` : `Question: ${card.front}. Reveal answer.`}
        aria-describedby="nooks-card-shortcuts"
      >
        <span className="nooks-cards-sheet">
          <span className="nooks-cards-face is-front" aria-hidden="true">
            <span className="nooks-cards-label">Question</span>
            <span className="nooks-cards-copy">{card.front}</span>
            <span className="nooks-cards-flip-caption">Reveal answer <ArrowRight size={15} /></span>
          </span>
          <span className="nooks-cards-face is-back" aria-hidden="true">
            <span className="nooks-cards-label">Answer</span>
            <span className="nooks-cards-copy">{card.back}</span>
            <span className="nooks-cards-flip-caption">Show question <RotateCcw size={14} /></span>
          </span>
        </span>
      </button>
      <div className="nooks-cards-under-card">
        {!flipped && card.hint ? <div className="nooks-cards-hint"><button type="button" onClick={() => setShowHint(value => !value)} aria-expanded={showHint}>{showHint ? 'Hide hint' : 'Show hint'}</button>{showHint && <p>{card.hint}</p>}</div> : <span>{flipped ? 'How well did you recall it?' : 'Think of the answer, then flip.'}</span>}
      </div>
    </div>
    <div className="nooks-cards-rating">
      <button type="button" className="nooks-cards-button" onClick={() => rate(false)} disabled={!flipped}><RotateCcw size={17} aria-hidden="true" /><span>Review again</span><kbd aria-hidden="true">←</kbd></button>
      <button type="button" className="nooks-cards-button is-primary" onClick={() => rate(true)} disabled={!flipped}><Check size={18} aria-hidden="true" /><span>Got it</span><kbd aria-hidden="true">→</kbd></button>
    </div>
    <p className="nooks-cards-shortcuts" id="nooks-card-shortcuts"><kbd>Space</kbd> flip <span aria-hidden="true">·</span> <kbd>←</kbd> review again <span aria-hidden="true">·</span> <kbd>→</kbd> got it</p>
    <span className="nooks-cards-sr" role="status" aria-live="polite">{announcement}</span>
  </section>;
}
