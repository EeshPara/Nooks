/** Cosmetic breaks only. These functions never create focus sessions or grant progress. */
export type BreakMode = 'focus' | 'short' | 'long';
export interface BreakTimerState { version: 1; mode: BreakMode; remaining: number; deadline: number | null }
export const breakDuration = (mode: BreakMode) => mode === 'long' ? 900 : 300;
export const initialBreakTimer = (mode: BreakMode = 'focus'): BreakTimerState => ({ version: 1, mode, remaining: breakDuration(mode), deadline: null });
export function remainingBreakSeconds(state: BreakTimerState, now = Date.now()): number {
  return state.deadline === null ? state.remaining : Math.min(breakDuration(state.mode), Math.max(0, Math.ceil((state.deadline - now) / 1000)));
}
export function expireBreak(state: BreakTimerState, now = Date.now()): BreakTimerState {
  return state.deadline !== null && remainingBreakSeconds(state, now) === 0 ? { ...state, remaining: 0, deadline: null } : state;
}
export function restoreBreakTimer(serialized: string | null, now = Date.now()): BreakTimerState {
  try {
    const state = JSON.parse(serialized ?? 'null');
    if (!state || state.version !== 1 || !['focus', 'short', 'long'].includes(state.mode)
      || !Number.isInteger(state.remaining) || state.remaining < 0 || state.remaining > breakDuration(state.mode)
      || (state.deadline !== null && (!Number.isSafeInteger(state.deadline) || state.deadline <= 0 || state.mode === 'focus' || state.deadline > now + breakDuration(state.mode) * 1000 + 1000))) return initialBreakTimer();
    return expireBreak(state, now);
  } catch { return initialBreakTimer(); }
}
export function startBreak(state: BreakTimerState, now = Date.now()): BreakTimerState {
  if (state.mode === 'focus' || state.deadline !== null) return state;
  const remaining = state.remaining || breakDuration(state.mode);
  return { ...state, remaining, deadline: now + remaining * 1000 };
}
export function pauseBreak(state: BreakTimerState, now = Date.now()): BreakTimerState {
  return { ...state, remaining: remainingBreakSeconds(state, now), deadline: null };
}
export function selectBreakMode(state: BreakTimerState, mode: BreakMode, now = Date.now()): BreakTimerState {
  return state.deadline !== null && remainingBreakSeconds(state, now) > 0 ? state : initialBreakTimer(mode);
}
