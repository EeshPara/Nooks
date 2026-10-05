import { useLayoutEffect, useRef } from 'react';

/** Animate the committed destination, never delay navigation or unmount an editor. */
export function useWorkspaceTransition(surfaceKey: string, enabled = true) {
  const surface = useRef<HTMLDivElement>(null);
  const previous = useRef(surfaceKey);
  const currentAnimation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const stop = () => { if (preference?.matches) currentAnimation.current?.cancel(); };
    preference?.addEventListener('change', stop);
    return () => { preference?.removeEventListener('change', stop); currentAnimation.current?.cancel(); };
  }, []);

  useLayoutEffect(() => {
    const changed = previous.current !== surfaceKey;
    previous.current = surfaceKey;
    currentAnimation.current?.cancel();
    currentAnimation.current = null;
    const element = surface.current;
    if (!changed || !enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !element?.animate) return;
    // No exit timer, copied document, or fill mode: the latest real view stays
    // interactive and fully visible even if animation support fails.
    try {
      // Translating an ancestor creates a containing block for fixed widgets,
      // briefly shifting their saved viewport coordinates on the way home.
      // Check the committed slots, including defaults that may be moved while
      // this short animation is running; their children remain mounted.
      const frames: Keyframe[] = element.querySelector('.workspace-widget-slot')
        ? [{ opacity: .72 }, { opacity: 1 }]
        : [{ opacity: .72, translate: '0 8px' }, { opacity: 1, translate: '0 0' }];
      const animation = element.animate(
        frames,
        { duration: 240, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'none' },
      );
      currentAnimation.current = animation;
      return () => { animation.cancel(); if (currentAnimation.current === animation) currentAnimation.current = null; };
    } catch { /* Navigation does not depend on visual effects. */ }
  }, [surfaceKey, enabled]);

  return surface;
}
