import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Clock3, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { RoomTimerProps } from './RoomHome';
import { useBreakTimer } from './useBreakTimer';
import { consumeDismissEscape, isTopmostDismissTarget } from './dismissal';
import './StudyFocusDock.css';

export interface StudyFocusDockProps {
  timer: RoomTimerProps;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workLabel?: string;
  nookLabel: string;
  /** The nook recorded on the active session, which can differ from the current scene. */
  earningNookLabel?: string;
  onFinish?: () => void;
  retrySaving?: boolean;
  notice?: string;
}

const formatTime = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

/** Display and controls only: focus credits always come from the parent's persisted session. */
export function StudyFocusDock({ focusMode = false, onToggleFocusMode, timer, open, onOpenChange, workLabel = 'Independent study', nookLabel, earningNookLabel, onFinish, retrySaving = false, notice }: StudyFocusDockProps) {
  const breaks = useBreakTimer(timer.active || retrySaving);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const headingId = useId();
  const isFocus = breaks.mode === 'focus';
  const ticking = isFocus ? timer.running : breaks.running;
  const seconds = isFocus ? timer.remaining : breaks.remaining;
  const breakDone = !isFocus && seconds === 0;
  const controlsDisabled = timer.pending || (isFocus && !!timer.disabled);
  const activeNook = earningNookLabel || nookLabel;
  const modeLabel = isFocus ? 'Focus' : 'Break';
  const buttonLabel = timer.pending ? 'Saving…' : retrySaving ? 'Retry saving' : ticking ? 'Pause' : breakDone ? 'Back to focus' : isFocus ? timer.active ? 'Resume' : 'Start' : 'Start break';

  useEffect(() => {
    if (!open) { setConfirmDiscard(false); return; }
    const frame = requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (event.button === 0 && isTopmostDismissTarget(root.current) && event.target instanceof Node && !root.current?.contains(event.target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (!consumeDismissEscape(event, root.current)) return;
      onOpenChange(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onOpenChange]);

  useEffect(() => { if (!timer.active) setConfirmDiscard(false); }, [timer.active]);

  function close() {
    onOpenChange(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function primaryAction() {
    setConfirmDiscard(false);
    if (retrySaving) { timer.onStart(); return; }
    if (isFocus) { if (ticking) timer.onPause(); else timer.onStart(); }
    else if (breakDone) breaks.select('focus');
    else breaks.toggle();
  }

  function reset() {
    if (!isFocus) { breaks.reset(); return; }
    if (timer.active && !confirmDiscard) { setConfirmDiscard(true); return; }
    timer.onReset();
    setConfirmDiscard(false);
  }

  return <div className={`study-focus-dock ${ticking ? 'is-ticking' : ''} ${open ? 'is-open' : ''}`} ref={root}>
    {onToggleFocusMode ? <button className="study-focus-trigger" ref={trigger} aria-pressed={focusMode} onClick={onToggleFocusMode}><Clock3 size={15} aria-hidden="true"/><span>Focus mode</span><span className="study-focus-trigger-time" role="timer" aria-label={`${Math.floor(timer.remaining / 60)} minutes ${timer.remaining % 60} seconds remaining`}>{formatTime(timer.remaining)}</span></button> : <button className="study-focus-trigger" ref={trigger} onClick={() => onOpenChange(!open)} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" aria-label={`${modeLabel} timer, ${formatTime(seconds)}${ticking ? ', running' : timer.active ? ', paused' : ''}`}>
      <span className="study-focus-clock" aria-hidden="true">{ticking ? <span className="study-focus-tick"/> : <Clock3 size={15}/>}</span>
      <span className="study-focus-trigger-label">{modeLabel}</span>
      <span className="study-focus-trigger-time">{formatTime(seconds)}</span>
      <ChevronDown className="study-focus-chevron" size={12} aria-hidden="true"/>
    </button>}
    <section className="study-focus-popover" id={panelId} role="dialog" aria-labelledby={headingId} aria-hidden={!open} inert={!open}>
      <header className="study-focus-heading"><h2 id={headingId}>Focus timer</h2><button className="study-focus-close" aria-label="Close focus timer" ref={closeButton} onClick={close}><X size={16}/></button></header>
      <div className="study-focus-modes" role="group" aria-label="Timer mode">
        {(['focus', 'short', 'long'] as const).map(mode => <button key={mode} aria-pressed={breaks.mode === mode} disabled={timer.active || timer.pending || retrySaving || breaks.running} onClick={() => { setConfirmDiscard(false); breaks.select(mode); }}>{mode === 'focus' ? 'Focus' : mode === 'short' ? '5 min break' : '15 min break'}</button>)}
      </div>
      <div className="study-focus-time" role="timer" aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}>{formatTime(seconds)}</div>
      <p className="study-focus-state">{retrySaving ? 'Session finished · waiting to save' : breakDone ? 'Break complete' : ticking ? isFocus ? 'Focusing' : 'On a break' : isFocus && timer.active ? 'Paused' : isFocus ? 'Ready to begin' : 'A moment away from your work'}</p>
      {isFocus && !timer.active && !retrySaving && <div className="study-focus-presets" role="group" aria-label="Focus duration">
        {[15, 25, 50].map(minutes => <button key={minutes} disabled={controlsDisabled} aria-pressed={timer.minutes === minutes} onClick={() => timer.onMinutes(minutes)}>{minutes}<span> min</span></button>)}
        <label className="study-focus-custom"><input aria-label="Custom focus minutes" type="number" inputMode="numeric" min="1" max="180" value={timer.minutes} disabled={controlsDisabled} onChange={event => timer.onMinutes(Math.max(1, Math.min(180, Number(event.target.value) || 1)))}/><span>min</span></label>
      </div>}
      {isFocus && <div className="study-focus-work"><span>Working on</span><strong title={workLabel}>{workLabel}</strong><small>Time goes to {activeNook}</small></div>}
      {!isFocus && <p className="study-focus-break-note">Your work stays open. Breaks don’t add focus time.</p>}
      {notice && <p className="study-focus-notice" role="status">{notice}</p>}
      {confirmDiscard ? <div className="study-focus-discard" role="group" aria-label="Discard this focus session"><p>Discard this session without saving its time?</p><div><button onClick={() => setConfirmDiscard(false)}>Keep studying</button><button disabled={timer.pending} onClick={reset}>Discard</button></div></div> : <div className="study-focus-actions">
        <button className="study-focus-primary" disabled={controlsDisabled} onClick={primaryAction}>{ticking ? <Pause size={14} fill="currentColor"/> : breakDone ? <Check size={14}/> : <Play size={14} fill="currentColor"/>}{buttonLabel}</button>
        {isFocus && timer.active && onFinish && !retrySaving ? <button className="study-focus-finish" disabled={timer.pending} onClick={onFinish}>Finish</button> : !retrySaving && <button className="study-focus-reset" disabled={controlsDisabled} onClick={reset} aria-label={isFocus ? 'Reset focus timer' : 'Reset break timer'}><RotateCcw size={15}/></button>}
      </div>}
      {isFocus && timer.active && !confirmDiscard && !retrySaving && <button className="study-focus-discard-link" disabled={timer.pending} onClick={() => setConfirmDiscard(true)}>Discard session</button>}
    </section>
  </div>;
}
