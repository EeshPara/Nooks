import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Keep the modal mounted (and its focus trap intact) until the short exit finishes. */
export function useSoftDismiss<T extends HTMLElement>(
  element: RefObject<T | null>,
  onDismiss: () => void,
  options: { blocked?: boolean; queueWhenBlocked?: boolean; direction?: 'down' | 'right' } = {},
) {
  const latest = useRef({ onDismiss, ...options }); latest.current = { onDismiss, ...options };
  const closing = useRef(false);
  const queued = useRef<{ afterDismiss?: () => void } | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const animation = useRef<Animation | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; epoch.current++; clearTimeout(fallback.current);
      animation.current?.cancel(); animation.current = null; closing.current = false;
      queued.current = null;
    };
  }, []);
  const dismiss = useCallback((afterDismiss?: () => void) => {
    if (!mounted.current || closing.current) return;
    if (latest.current.blocked) {
      if (latest.current.queueWhenBlocked && !queued.current) queued.current = { afterDismiss };
      return;
    }
    queued.current = null;
    closing.current = true;
    const ticket = epoch.current;
    let finished = false;
    const finish = () => {
      if (finished || !mounted.current || ticket !== epoch.current) return;
      finished = true; clearTimeout(fallback.current);
      latest.current.onDismiss(); afterDismiss?.();
    };
    const target = element.current;
    if (!target || target.closest('.motion-off') || typeof target.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    try {
      // Starting from the live style avoids a jump if dismissed during its entrance.
      const style = window.getComputedStyle(target);
      const transform = style.transform === 'none' ? '' : style.transform;
      const travel = latest.current.direction === 'right' ? 'translateX(12px)' : 'translateY(8px)';
      animation.current = target.animate([
        { opacity: style.opacity, transform: transform || 'none' },
        { opacity: 0, transform: `${transform} ${travel} scale(.99)` },
      ], { duration: 140, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      animation.current.finished.then(finish).catch(() => { /* Unmount cancellation must not dismiss another panel. */ });
      // Finish even if the browser drops the animation completion event.
      fallback.current = setTimeout(finish, 190);
    } catch { finish(); }
  }, [element]);
  useEffect(() => {
    if (!options.blocked && queued.current) dismiss(queued.current.afterDismiss);
  }, [options.blocked, dismiss]);
  return dismiss;
}
