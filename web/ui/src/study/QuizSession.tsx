import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { StudyViewProps } from './StudyView';
import { expectedAnswer, isCorrectAnswer, shuffledOptionIndices, type StudyQuestion } from './types';
import { usePracticeCheckpoint, usePracticeClock, type PracticeCheckpoint } from './usePracticeCheckpoint';
import './QuizSession.css';

type Answer = number | string;
type Stage = 'questions' | 'submit' | 'results';
const hasAnswer = (answer: Answer | undefined) => typeof answer === 'number' || (typeof answer === 'string' && answer.trim().length > 0);
const makeSessionId = () => globalThis.crypto?.randomUUID?.() ?? `study-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
type QuizCheckpoint = { index: number; answers: Record<number, Answer>; checked: Record<number, boolean>; flagged: Record<number, boolean>; optionOrders: number[][]; stage: Stage; reviewFilter: 'all' | 'missed' };

/** Answer values always retain their original option index, independent of display order. */
export default function QuizSession({ artifact, onExit, onProgress, roomId, saved = true }: StudyViewProps) {
  const questions = artifact.questions ?? [];
  const isExam = artifact.kind === 'exam';
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [optionOrders, setOptionOrders] = useState(() => questions.map(shuffledOptionIndices));
  const [stage, setStage] = useState<Stage>('questions');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'missed'>('all');
  const section = useRef<HTMLElement>(null);
  const clock = usePracticeClock(section, stage === 'results');
  const seconds = clock.seconds;
  const sessionId = useRef<string>(makeSessionId());
  const sessionRoomId = useRef(roomId);
  const emitted = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const previousLocation = useRef(`${stage}-${index}`);
  const checkpoint = usePracticeCheckpoint<QuizCheckpoint>(artifact, {
    version: 1, kind: isExam ? 'exam' : 'quiz', artifactRevision: artifact.revision ?? 1,
    sessionId: sessionId.current, roomId: sessionRoomId.current, elapsedSeconds: seconds,
    state: { index, answers, checked, flagged, optionOrders, stage, reviewFilter },
  }, restoreSession, section, saved);
  const question = questions[index];
  const answer = answers[index];
  const answered = hasAnswer(answer);
  const hasChecked = !isExam && !!checked[index];
  const answeredCount = questions.filter((_, i) => hasAnswer(answers[i])).length;
  const checkedCount = questions.filter((_, i) => checked[i]).length;
  const flaggedCount = questions.filter((_, i) => flagged[i]).length;
  const score = questions.filter((q, i) => isCorrectAnswer(q, answers[i])).length;
  const total = questions.length;
  const progress = stage === 'results' ? total : isExam ? answeredCount : checkedCount;

  function restoreSession(saved: PracticeCheckpoint<QuizCheckpoint>) {
    const state = saved.state;
    setIndex(state.index); setAnswers(state.answers); setChecked(state.checked); setFlagged(state.flagged);
    setOptionOrders(state.optionOrders); setStage(state.stage); setReviewFilter(state.reviewFilter);
    clock.restore(saved.elapsedSeconds); sessionId.current = saved.sessionId; sessionRoomId.current = saved.roomId;
    emitted.current = state.stage === 'results';
    if (state.stage === 'results') emitProgress(state.answers, saved.elapsedSeconds);
  }

  function emitProgress(responses: Record<number, Answer>, duration: number) {
    if (!saved) return;
    const savedScore = questions.filter((q, i) => isCorrectAnswer(q, responses[i])).length;
    onProgress({ artifactId: artifact.id, artifactRevision: artifact.revision ?? 1, kind: isExam ? 'exam' : 'quiz', score: savedScore, total: questions.length,
      xp: 10 + savedScore * (isExam ? 10 : 5), durationSeconds: duration,
      sessionId: sessionId.current, roomId: sessionRoomId.current,
      answers: Object.fromEntries(questions.flatMap((q, i) => hasAnswer(responses[i]) ? [[q.id, responses[i]]] : [])),
    });
  }

  useEffect(() => {
    const location = `${stage}-${index}`;
    if (previousLocation.current !== location) questionHeading.current?.focus({ preventScroll: true });
    previousLocation.current = location;
  }, [stage, index]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"],dialog[open],.nooks-portal')) return;
      if (!checkpoint.ready || section.current?.closest('[hidden], [aria-hidden="true"]') || stage !== 'questions' || hasChecked || !question?.options?.length || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return;
      const position = Number(event.key) - 1;
      if (!/^[1-9]$/.test(event.key) || position >= optionOrders[index].length) return;
      event.preventDefault();
      setAnswers(value => ({ ...value, [index]: optionOrders[index][position] }));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [stage, hasChecked, question, optionOrders, index, checkpoint.ready]);

  function finish() {
    if (emitted.current) return;
    emitted.current = true;
    const duration = Math.max(1, seconds);
    clock.restore(duration);
    setStage('results');
    setReviewFilter(score === total ? 'all' : 'missed');
    emitProgress(answers, duration);
  }

  function next() {
    if (isExam) {
      if (index === total - 1) setStage('submit');
      else setIndex(value => value + 1);
      return;
    }
    if (!answered) return;
    if (!hasChecked) { setChecked(value => ({ ...value, [index]: true })); return; }
    if (checkedCount === total) { finish(); return; }
    // A navigator can skip ahead; return to any unchecked question before scoring the set.
    const later = questions.findIndex((_, i) => i > index && !checked[i]);
    setIndex(later >= 0 ? later : questions.findIndex((_, i) => !checked[i]));
  }

  function restart() {
    setIndex(0); setAnswers({}); setChecked({}); setFlagged({}); setStage('questions');
    clock.restore(0); setOptionOrders(questions.map(shuffledOptionIndices)); setReviewFilter('all');
    sessionId.current = makeSessionId(); sessionRoomId.current = roomId; emitted.current = false;
  }

  function visit(questionIndex: number) { setIndex(questionIndex); setStage('questions'); }

  function navigator(expanded = false) {
    const buttons = <div className="nooks-quiz-map">{questions.map((q, i) => {
      const status = stage === 'results' ? isCorrectAnswer(q, answers[i]) ? 'correct' : 'missed' : !isExam && checked[i] ? isCorrectAnswer(q, answers[i]) ? 'correct' : 'missed' : hasAnswer(answers[i]) ? 'answered' : 'unanswered';
      return <button type="button" key={q.id} className={`nooks-quiz-jump is-${status} ${i === index && stage === 'questions' ? 'is-current' : ''}`} onClick={() => visit(i)} aria-label={`Question ${i + 1}, ${status}${flagged[i] ? ', flagged for review' : ''}`} aria-current={i === index && stage === 'questions' ? 'step' : undefined}><span>{i + 1}</span>{flagged[i] && <i aria-hidden="true" />}</button>;
    })}</div>;
    return expanded ? buttons : <details className="nooks-quiz-overview"><summary><span>Question overview</span><span>{progress}/{total}<ChevronDown size={14} aria-hidden="true" /></span></summary>{buttons}<p>Jump to a question. A small dot marks one you flagged.</p></details>;
  }

  if (!checkpoint.ready) return <section className="nooks-quiz" ref={section}><header className="nooks-quiz-header"><h1>{artifact.title}</h1></header>{checkpoint.error ? <p role="alert">{checkpoint.error} <button type="button" onClick={checkpoint.retry}>Retry</button></p> : <p role="status">Opening your questions…</p>}<button type="button" className="nooks-quiz-text-button" onClick={onExit}>Back to library</button></section>;

  return <section className="nooks-quiz" ref={section} aria-label={isExam ? 'Practice exam' : 'Quiz'}>
    <header className="nooks-quiz-header">
      <div className="nooks-quiz-topline"><button type="button" className="nooks-quiz-back" onClick={onExit}><ArrowLeft size={16} aria-hidden="true" /> Library</button><span>{artifact.subject} <span aria-hidden="true">/</span> {isExam ? 'Practice exam' : 'Quiz'}</span></div>
      <div className="nooks-quiz-title"><h1>{artifact.title}</h1><span aria-label={`Elapsed time ${timeLabel(seconds)}`}>{timeLabel(seconds)}</span></div>
      {!saved && <p className="nooks-quiz-footnote">Preview · Save this set to keep your progress.</p>}
      <div className="nooks-quiz-progress" role="progressbar" aria-label={isExam ? 'Questions answered' : 'Questions checked'} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={total}><span style={{ width: `${total ? progress / total * 100 : 0}%` }} /></div>
      {checkpoint.error && <p role="alert">{checkpoint.error} <button type="button" onClick={checkpoint.retry}>Retry</button></p>}
    </header>

    {!total ? <div className="nooks-quiz-empty"><h2>No questions yet</h2><p>Add questions to this set, or ask ChatGPT to make a quiz from your notes.</p><button type="button" className="nooks-quiz-primary" onClick={onExit}>Back to library <ArrowRight size={16} aria-hidden="true" /></button></div>
      : stage === 'results' ? <>
        <div className="nooks-quiz-result"><span className="nooks-quiz-label">{isExam ? 'Exam' : 'Quiz'} complete</span><h2 ref={questionHeading} tabIndex={-1}>{score === total ? 'All answers correct.' : `${score} of ${total} correct.`}</h2><div className="nooks-quiz-result-line"><strong>{Math.round(score / total * 100)}<span>%</span></strong><span>{timeLabel(seconds)} spent studying</span><span>{total - score} to revisit</span></div><div className="nooks-quiz-result-actions"><button type="button" className="nooks-quiz-primary" onClick={onExit}>Back to library <ArrowRight size={16} aria-hidden="true" /></button><button type="button" className="nooks-quiz-text-button" onClick={restart}>Try again</button></div></div>
        <div className="nooks-quiz-review"><div className="nooks-quiz-review-heading"><h3>Review answers</h3><div className="nooks-quiz-filters" aria-label="Filter answer review"><button type="button" aria-pressed={reviewFilter === 'missed'} onClick={() => setReviewFilter('missed')}>Missed <span>{total - score}</span></button><button type="button" aria-pressed={reviewFilter === 'all'} onClick={() => setReviewFilter('all')}>All <span>{total}</span></button></div></div>{reviewFilter === 'missed' && score === total ? <p className="nooks-quiz-no-mistakes">Nothing to revisit in this set.</p> : questions.map((q, i) => reviewFilter === 'missed' && isCorrectAnswer(q, answers[i]) ? null : <ReviewQuestion key={`${reviewFilter}-${q.id}`} question={q} answer={answers[i]} index={i} />)}</div>
      </> : stage === 'submit' ? <div className="nooks-quiz-submit">
        <span className="nooks-quiz-label">Before you submit</span><h2 ref={questionHeading} tabIndex={-1}>Ready to check your work?</h2><p>{answeredCount} of {total} answered{flaggedCount ? ` · ${flaggedCount} flagged for review` : ''}.</p>{navigator(true)}
        {answeredCount < total && <p className="nooks-quiz-unanswered" role="status">{total - answeredCount} unanswered {total - answeredCount === 1 ? 'question will count' : 'questions will count'} as incorrect.</p>}
        <div className="nooks-quiz-submit-actions"><button type="button" className="nooks-quiz-text-button" onClick={() => visit(questions.findIndex((_, i) => flagged[i]) >= 0 ? questions.findIndex((_, i) => flagged[i]) : questions.findIndex((_, i) => !hasAnswer(answers[i])) >= 0 ? questions.findIndex((_, i) => !hasAnswer(answers[i])) : index)}>Keep reviewing</button><button type="button" className="nooks-quiz-primary" onClick={finish}>{answeredCount < total ? `Submit with ${total - answeredCount} unanswered` : 'Submit exam'} <ArrowRight size={16} aria-hidden="true" /></button></div>
      </div> : <>
        <div className="nooks-quiz-position"><span>Question {index + 1} <span>of {total}</span></span><button type="button" className={`nooks-quiz-flag ${flagged[index] ? 'is-flagged' : ''}`} aria-pressed={!!flagged[index]} onClick={() => setFlagged(value => ({ ...value, [index]: !value[index] }))}>{flagged[index] ? 'Flagged for review' : 'Flag for review'}<span aria-hidden="true" /></button></div>
        <form className="nooks-quiz-question" key={question.id} onSubmit={event => { event.preventDefault(); next(); }}>
          <h2 id="nooks-question-heading" ref={questionHeading} tabIndex={-1}>{question.prompt}</h2>
          {question.options?.length ? <div className="nooks-quiz-options" role="group" aria-labelledby="nooks-question-heading">{optionOrders[index].map((originalIndex, displayIndex) => {
            const selected = answer === originalIndex;
            const correct = hasChecked && originalIndex === question.correctIndex;
            const wrong = hasChecked && selected && !correct;
            return <button type="button" key={originalIndex} className={`nooks-quiz-option ${selected ? 'is-selected' : ''} ${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}`} disabled={hasChecked} aria-pressed={selected} onClick={() => setAnswers(value => ({ ...value, [index]: originalIndex }))}><span className="nooks-quiz-letter" aria-hidden="true">{String.fromCharCode(65 + displayIndex)}</span><span className="nooks-quiz-option-copy">{question.options![originalIndex]}</span>{correct ? <span className="nooks-quiz-option-state"><Check size={15} aria-hidden="true" /><span>Correct</span></span> : wrong ? <span className="nooks-quiz-option-state">Your answer</span> : <span className="nooks-quiz-radio" aria-hidden="true" />}</button>;
          })}</div> : <div className="nooks-quiz-answer"><label htmlFor="nooks-short-answer">Your answer</label><textarea id="nooks-short-answer" rows={3} maxLength={2000} placeholder="Write your answer…" value={typeof answer === 'string' ? answer : ''} disabled={hasChecked} aria-describedby="nooks-answer-help" onChange={event => setAnswers(value => ({ ...value, [index]: event.target.value }))} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); next(); } }} /><p id="nooks-answer-help">Matches the accepted answer, ignoring case, spacing, and basic punctuation.</p></div>}
          {hasChecked && <div className={`nooks-quiz-feedback ${isCorrectAnswer(question, answer) ? 'is-correct' : 'is-missed'}`} role="status"><strong>{isCorrectAnswer(question, answer) ? 'Correct' : 'Not quite'}</strong>{!isCorrectAnswer(question, answer) && <p>Correct answer: <b>{expectedAnswer(question)}</b></p>}{question.explanation && <p>{question.explanation}</p>}</div>}
          <div className="nooks-quiz-question-actions"><button type="button" className="nooks-quiz-text-button" disabled={!index} onClick={() => setIndex(value => value - 1)}><ArrowLeft size={15} aria-hidden="true" /> Previous</button><button type="submit" className="nooks-quiz-primary" disabled={!isExam && !answered}>{!isExam && !hasChecked ? 'Check answer' : !isExam && checkedCount === total ? 'See results' : isExam && index === total - 1 ? 'Review & submit' : isExam && !answered ? 'Skip for now' : 'Next question'}<ArrowRight size={16} aria-hidden="true" /></button></div>
        </form>
        {navigator()}
        <p className="nooks-quiz-footnote">{isExam ? 'Answers stay hidden until you submit.' : 'Answers lock after checking.'}{question.options?.length ? <span> Keys 1–9 select an option.</span> : null}</p>
      </>}
  </section>;
}

function ReviewQuestion({ question, answer, index }: { question: StudyQuestion; answer: Answer | undefined; index: number }) {
  const correct = isCorrectAnswer(question, answer as Answer);
  const response = typeof answer === 'number' ? question.options?.[answer] : answer?.trim();
  return <details className={`nooks-quiz-review-item ${correct ? 'is-correct' : 'is-missed'}`} open={!correct}>
    <summary><span className="nooks-quiz-review-number">{index + 1}</span><span>{question.prompt}</span><span className="nooks-quiz-review-status">{correct ? 'Correct' : 'Missed'}<ChevronDown size={15} aria-hidden="true" /></span></summary>
    <div className="nooks-quiz-review-content"><p><span>Your answer</span><strong>{response || 'Not answered'}</strong></p>{!correct && <p><span>Correct answer</span><strong>{expectedAnswer(question)}</strong></p>}{question.explanation && <div className="nooks-quiz-explanation">{question.explanation}</div>}</div>
  </details>;
}
