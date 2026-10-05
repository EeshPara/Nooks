import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Gamepad2, RotateCcw, X, Zap } from 'lucide-react';
import { Artifact, Flashcard, isCorrectAnswer, ProgressEvent, shuffledOptionIndices } from './types';
import './Study.css';
import './StudyClose.css';

export interface GamesViewProps { roomId?: string; artifacts: Artifact[]; onProgress: (event: ProgressEvent) => void }
type GameKind = 'match' | 'sprint';
type GameChoice = { kind: GameKind; artifact: Artifact };
const sessionKey = () => globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const shuffled = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function GamesView({ artifacts, onProgress, roomId }: GamesViewProps) {
  const [game, setGame] = useState<GameChoice | null>(null);
  const [picker, setPicker] = useState<GameKind | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const previous = document.activeElement as HTMLElement | null;
    pickerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPicker(null); }
      if (event.key === 'Tab') {
        const controls = Array.from(pickerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, [tabindex="0"]') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handle);
    return () => { window.removeEventListener('keydown', handle); previous?.focus(); };
  }, [picker]);
  const cards = artifacts.filter(artifact => (artifact.cards?.length ?? 0) >= 2);
  const quizzes = artifacts.filter(artifact => artifact.questions?.some(q => (q.options?.length ?? 0) > 1 && q.correctIndex !== undefined));
  if (game) return game.kind === 'match' ? <MatchGame roomId={roomId} artifact={game.artifact} onProgress={onProgress} onExit={() => setGame(null)} /> : <SprintGame roomId={roomId} artifact={game.artifact} onProgress={onProgress} onExit={() => setGame(null)} />;
  const sources = picker === 'match' ? cards : quizzes;
  return <section className="games-view"><div className="games-heading"><span className="study-eyebrow">Practice, with a plot twist</span><h1>A little play. A lot of progress.</h1><p>Turn your study sets into a challenge. Same material, fresh energy.</p></div><div className="games-grid"><article className="game-launch-card match-launch"><div className="game-art"><div className="game-mini-card">A</div><div className="game-mini-card">↔</div></div><span className="study-eyebrow">Make connections</span><h2>Match garden</h2><p>Match concepts with their meanings. Clear the board, one connection at a time.</p><div className="game-details"><span><Gamepad2 size={14} /> Up to 6 pairs</span><span>At your pace</span></div><button className="study-primary" onClick={() => setPicker('match')} disabled={!cards.length}>Pick a flashcard set <ArrowRight size={16} /></button>{!cards.length && <span className="game-unavailable">Add a set with at least 2 flashcards to play.</span>}</article><article className="game-launch-card sprint-launch"><div className="game-art"><div className="game-sprint-mark"><span>01</span><i>/</i><span>10</span><small>one question at a time</small></div></div><span className="study-eyebrow">Build recall</span><h2>Answer sprint</h2><p>A quick run through your quiz questions. Build a streak and see what sticks.</p><div className="game-details"><span><Zap size={14} /> Up to 10 questions</span><span>Instant feedback</span></div><button className="study-primary" onClick={() => setPicker('sprint')} disabled={!quizzes.length}>Pick a quiz <ArrowRight size={16} /></button>{!quizzes.length && <span className="game-unavailable">Add a multiple-choice quiz to play.</span>}</article></div><div className="games-note"><div><strong>Small sessions count.</strong><p>Finished games earn practice points. Your progress follows the study set you play.</p></div></div>
    {picker && <div className="game-picker-overlay" onClick={() => setPicker(null)}><div className="game-picker" ref={pickerRef} role="dialog" aria-modal="true" aria-labelledby="game-picker-title" onClick={event => event.stopPropagation()}><div className="study-popup-topline"><button className="study-back" onClick={() => setPicker(null)}><ArrowLeft size={16} /> Back</button><button type="button" className="study-surface-close" onClick={() => setPicker(null)} aria-label="Close game picker" title="Close game picker"><X size={20} aria-hidden="true" /></button></div><h2 id="game-picker-title">Pick your {picker === 'match' ? 'flashcard set' : 'quiz'}</h2><p>Your own material makes the best practice.</p><div className="game-source-list">{sources.map(artifact => <button key={artifact.id} onClick={() => { setGame({ kind: picker, artifact }); setPicker(null); }}><span className="game-source-dot" style={{ background: artifact.color }} /><span><strong>{artifact.title}</strong><small>{artifact.subject} · {picker === 'match' ? `${artifact.cards?.length} cards` : `${artifact.questions?.filter(q => q.options?.length).length} questions`}</small></span><ArrowRight size={18} /></button>)}</div></div></div>}
  </section>;
}

interface ActiveGameProps { roomId?: string; artifact: Artifact; onProgress: (event: ProgressEvent) => void; onExit: () => void }
interface Tile { id: string; cardId: string; side: 'front' | 'back'; text: string }

function MatchGame({ artifact, onProgress, onExit, roomId }: ActiveGameProps) {
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [mismatch, setMismatch] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [complete, setComplete] = useState(false);
  const started = useRef(Date.now());
  const session = useRef(sessionKey());
  const sessionRoomId = useRef(roomId);
  const sessionArtifactRevision = useRef(artifact.revision ?? 1);
  const emitted = useRef(false);
  const mismatchTimer = useRef<number | null>(null);
  const [cards, setCards] = useState<Flashcard[]>(() => shuffled(artifact.cards ?? []).slice(0, 6));
  const [tiles, setTiles] = useState<Tile[]>(() => shuffled(cards.flatMap(card => [{ id: `${card.id}:front`, cardId: card.id, side: 'front' as const, text: card.front }, { id: `${card.id}:back`, cardId: card.id, side: 'back' as const, text: card.back }])));

  useEffect(() => { if (complete) return; const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 1000); return () => window.clearInterval(timer); }, [complete, round]);
  useEffect(() => () => { if (mismatchTimer.current) window.clearTimeout(mismatchTimer.current); }, []);

  function choose(tile: Tile) {
    if (matched.includes(tile.cardId) || mismatch.length || complete) return;
    if (selected === tile.id) { setSelected(null); return; }
    if (!selected) { setSelected(tile.id); return; }
    const first = tiles.find(item => item.id === selected)!;
    if (first.side === tile.side) { setSelected(tile.id); return; }
    setAttempts(value => value + 1);
    if (first.cardId === tile.cardId) {
      const next = [...matched, tile.cardId];
      setMatched(next); setSelected(null);
      if (next.length === cards.length) {
        setComplete(true);
        if (!emitted.current) { emitted.current = true; onProgress({ artifactId: artifact.id, artifactRevision: sessionArtifactRevision.current, kind: 'match', score: cards.length, total: cards.length, xp: cards.length * 5 + 10, durationSeconds: Math.max(1, Math.round((Date.now() - started.current) / 1000)), sessionId: session.current, roomId: sessionRoomId.current, matches: cards.map(c => ({ cardId: c.id, front: c.front, back: c.back })) }); }
      }
    } else {
      setMismatch([first.id, tile.id]); setSelected(null);
      mismatchTimer.current = window.setTimeout(() => setMismatch([]), 850);
    }
  }
  function restart() {
    const next = shuffled(artifact.cards ?? []).slice(0, 6);
    setCards(next); setTiles(shuffled(next.flatMap(card => [{ id: `${card.id}:front`, cardId: card.id, side: 'front' as const, text: card.front }, { id: `${card.id}:back`, cardId: card.id, side: 'back' as const, text: card.back }])));
    setSelected(null); setMatched([]); setMismatch([]); setAttempts(0); setSeconds(0); setComplete(false); setRound(value => value + 1); started.current = Date.now(); session.current = sessionKey(); sessionRoomId.current = roomId; sessionArtifactRevision.current = artifact.revision ?? 1; emitted.current = false;
  }
  const fronts = tiles.filter(tile => tile.side === 'front');
  const backs = tiles.filter(tile => tile.side === 'back');
  return <section className="games-view active-game"><div className="study-topline"><button className="study-back" onClick={onExit}><ArrowLeft size={17} /> All games</button><div className="study-topline-actions"><span className="study-eyebrow">Match garden</span><button type="button" className="study-surface-close" onClick={onExit} aria-label="Close game" title="Close game"><X size={20} aria-hidden="true" /></button></div></div><div className="study-heading"><div><h1>{complete ? 'Connections made.' : 'Find your connections.'}</h1><p>{artifact.title}</p></div><span className="study-pill"><Clock3 size={15} /> {clock(seconds)}</span></div>{complete ? <div className="study-complete"><h2>You cleared the garden.</h2><p>Every match is another connection you can remember.</p><div className="study-results-stats"><div><strong>{cards.length}</strong><span>Pairs matched</span></div><div><strong>{attempts}</strong><span>Attempts</span></div><div><strong>{clock(seconds)}</strong><span>Time practicing</span></div></div><div className="study-actions"><button className="study-secondary" onClick={restart}><RotateCcw size={16} /> Play again</button><button className="study-primary" onClick={onExit}>Explore games <ArrowRight size={16} /></button></div></div> : <><div className="match-status"><span><Check size={16} /> {matched.length} / {cards.length} matched</span><span>Choose a concept, then its meaning.</span></div><div className="match-board">{[fronts, backs].map((column, columnIndex) => <div className="match-column" key={columnIndex}><span className="study-eyebrow">{columnIndex === 0 ? 'Concepts' : 'Meanings'}</span>{column.map(tile => <button key={tile.id} disabled={matched.includes(tile.cardId) || !!mismatch.length} className={`match-tile ${selected === tile.id ? 'is-selected' : ''} ${matched.includes(tile.cardId) ? 'is-matched' : ''} ${mismatch.includes(tile.id) ? 'is-mismatch' : ''}`} onClick={() => choose(tile)} aria-pressed={selected === tile.id}><span>{tile.text}</span>{matched.includes(tile.cardId) && <Check size={17} />}</button>)}</div>)}</div><div className="match-announcement" aria-live="polite">{mismatch.length ? 'Not quite. Try a different connection.' : matched.length ? `${matched.length} pairs matched. Keep growing.` : 'Ready when you are.'}</div></>}</section>;
}

function SprintGame({ artifact, onProgress, onExit, roomId }: ActiveGameProps) {
  const [questions, setQuestions] = useState(() => shuffled((artifact.questions ?? []).filter(q => (q.options?.length ?? 0) > 1 && q.correctIndex !== undefined)).slice(0, 10));
  const [optionOrders, setOptionOrders] = useState(() => Object.fromEntries((artifact.questions ?? []).map(q => [q.id, shuffledOptionIndices(q)])));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [complete, setComplete] = useState(false);
  const started = useRef(Date.now());
  const session = useRef(sessionKey());
  const sessionRoomId = useRef(roomId);
  const sessionArtifactRevision = useRef(artifact.revision ?? 1);
  const emitted = useRef(false);
  const question = questions[index];
  const answer = answers[question?.id];
  const answered = answer !== undefined;
  const score = questions.filter(q => isCorrectAnswer(q, answers[q.id])).length;
  function choose(value: number) {
    if (answered) return;
    setAnswers(previous => ({ ...previous, [question.id]: value }));
    const nextStreak = isCorrectAnswer(question, value) ? streak + 1 : 0;
    setStreak(nextStreak); setBestStreak(value => Math.max(value, nextStreak));
  }
  function advance() {
    if (!answered) return;
    if (index < questions.length - 1) { setIndex(value => value + 1); return; }
    setComplete(true);
    if (!emitted.current) { emitted.current = true; onProgress({ artifactId: artifact.id, artifactRevision: sessionArtifactRevision.current, kind: 'sprint', score, total: questions.length, xp: 10 + score * 5, durationSeconds: Math.max(1, Math.round((Date.now() - started.current) / 1000)), sessionId: session.current, roomId: sessionRoomId.current, answers }); }
  }
  function restart() { setQuestions(shuffled((artifact.questions ?? []).filter(q => (q.options?.length ?? 0) > 1 && q.correctIndex !== undefined)).slice(0, 10)); setOptionOrders(Object.fromEntries((artifact.questions ?? []).map(q => [q.id, shuffledOptionIndices(q)]))); setIndex(0); setAnswers({}); setStreak(0); setBestStreak(0); setComplete(false); started.current = Date.now(); session.current = sessionKey(); sessionRoomId.current = roomId; sessionArtifactRevision.current = artifact.revision ?? 1; emitted.current = false; }
  return <section className="games-view active-game"><div className="study-topline"><button className="study-back" onClick={onExit}><ArrowLeft size={17} /> All games</button><div className="study-topline-actions"><span className="study-eyebrow">Answer sprint</span><button type="button" className="study-surface-close" onClick={onExit} aria-label="Close game" title="Close game"><X size={20} aria-hidden="true" /></button></div></div><div className="study-heading"><div><h1>{complete ? 'That’s a good run.' : 'Trust what you know.'}</h1><p>{artifact.title}</p></div><span className="sprint-streak"><Zap size={19} /> {streak} streak</span></div><div className="study-progress" role="progressbar" aria-label="Sprint progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={complete ? questions.length : index}><span style={{ width: `${(complete ? questions.length : index) / questions.length * 100}%` }} /></div>{complete ? <div className="study-complete"><h2>You showed up. That counts.</h2><p>Use your quiz review to revisit anything that tripped you up.</p><div className="study-results-stats"><div><strong>{score}/{questions.length}</strong><span>Correct answers</span></div><div><strong>{bestStreak}</strong><span>Best streak</span></div><div><strong>1</strong><span>Session completed</span></div></div><div className="study-actions"><button className="study-secondary" onClick={restart}><RotateCcw size={16} /> Another round</button><button className="study-primary" onClick={onExit}>Explore games <ArrowRight size={16} /></button></div></div> : <><div className="study-question-meta"><span className="study-pill">Question {index + 1} of {questions.length}</span><span>{score} correct so far</span></div><div className="study-question" key={question.id}><h2>{question.prompt}</h2><div className="study-options">{optionOrders[question.id].map((optionIndex, displayIndex) => <button key={optionIndex} disabled={answered} onClick={() => choose(optionIndex)} className={`study-option ${answered && optionIndex === question.correctIndex ? 'is-correct' : ''} ${answered && answer === optionIndex && optionIndex !== question.correctIndex ? 'is-wrong' : ''}`}><span className="study-option-letter">{String.fromCharCode(65 + displayIndex)}</span><span>{question.options![optionIndex]}</span>{answered && optionIndex === question.correctIndex && <CheckCircle2 size={19} />}</button>)}</div>{answered && <div className={`study-feedback ${isCorrectAnswer(question, answer) ? 'is-correct' : 'is-wrong'}`} aria-live="polite"><strong>{isCorrectAnswer(question, answer) ? streak >= 3 ? `${streak} in a row. You’re on a roll.` : 'Yes! Keep that momentum.' : 'A little reset. You’ve got the next one.'}</strong>{question.explanation && <p>{question.explanation}</p>}</div>}</div><div className="sprint-next"><button className="study-primary" disabled={!answered} onClick={advance}>{index === questions.length - 1 ? 'See results' : 'Next question'} <ArrowRight size={17} /></button></div></>}</section>;
}

export { GamesView };
