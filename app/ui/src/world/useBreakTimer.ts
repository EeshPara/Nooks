import { useEffect, useState } from 'react';
import { expireBreak, initialBreakTimer, pauseBreak, remainingBreakSeconds, restoreBreakTimer, selectBreakMode, startBreak, type BreakMode } from './breakTimerState';
const key = 'nooks:break-timer:v1';
function read() { try { return restoreBreakTimer(sessionStorage.getItem(key)); } catch { return initialBreakTimer(); } }

export function useBreakTimer(forceFocus: boolean) {
  const [state, setState] = useState(read);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* Private storage may be unavailable; the current timer still works. */ } }, [state]);
  useEffect(() => { if (forceFocus && state.mode !== 'focus') setState(initialBreakTimer()); }, [forceFocus, state.mode]);
  useEffect(() => {
    if (state.deadline === null) return;
    const tick = () => { const time = Date.now(); setNow(time); setState(value => expireBreak(value, time)); };
    tick(); const interval = window.setInterval(tick, 250);
    const visible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [state.deadline]);
  return {
    mode: forceFocus ? 'focus' as const : state.mode,
    remaining: remainingBreakSeconds(state, now), running: state.deadline !== null,
    select: (mode: BreakMode) => { const time = Date.now(); setNow(time); setState(value => selectBreakMode(value, mode, time)); },
    toggle: () => { const time = Date.now(); setNow(time); setState(value => value.deadline === null ? startBreak(value, time) : pauseBreak(value, time)); },
    reset: () => { setNow(Date.now()); setState(value => initialBreakTimer(value.mode)); },
  };
}
