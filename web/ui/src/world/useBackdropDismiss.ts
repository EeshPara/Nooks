import { useRef, type MouseEvent, type PointerEvent } from 'react';

/** A backdrop click starts and ends outside the panel; dragging text out is not dismissal. */
export function useBackdropDismiss<T extends HTMLElement>(onDismiss: () => void, nativeDialog = false) {
  // Some host/accessibility activations emit click without a preceding pointer
  // event. null allows that path; false still protects a drag from inside.
  const startedOutside = useRef<boolean | null>(null);
  function isBackdrop(event: MouseEvent<T> | PointerEvent<T>) {
    if (event.target !== event.currentTarget) return false;
    if (!nativeDialog) return true;
    // The native ::backdrop retargets its events to <dialog>. Its border and
    // empty surface do too, so check geometry before treating either as outside.
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  return {
    onPointerDownCapture: (event: PointerEvent<T>) => { startedOutside.current = event.button === 0 && isBackdrop(event); },
    onPointerCancelCapture: () => { startedOutside.current = false; },
    // Capture also sees inner clicks that stop propagation. Otherwise an inner
    // click can leave a stale drag guard and swallow the next host-only tap.
    onClickCapture: (event: MouseEvent<T>) => {
      const dismiss = event.button === 0 && startedOutside.current !== false && isBackdrop(event);
      startedOutside.current = null;
      if (dismiss) onDismiss();
    },
  };
}
