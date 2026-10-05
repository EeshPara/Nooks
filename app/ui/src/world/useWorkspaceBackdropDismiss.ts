import { useRef, type MouseEvent, type PointerEvent } from 'react';

const workspaceMargins = '.world-main, .page-content, .nooks-active-work, .nooks-study-primary, .study-workspace, .study-dismiss-toolbar, [data-workspace-backdrop]';
const transientSurfaces = '[role="dialog"], [role="menu"], dialog[open], .nooks-doc-top-actions details[open], .popover-menu, .nooks-portal';

/** Only the illustrated margins dismiss work; controls and the paper/player do not. */
export function useWorkspaceBackdropDismiss(enabled: boolean, onDismiss: () => void, blocked = false) {
  const startedOutside = useRef<boolean | null>(null);
  function isMargin(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
    if (!enabled || blocked || !(event.target instanceof Element)) return false;
    const root = event.currentTarget;
    const target = event.target;
    if (!root.contains(target) || (target !== root && !target.matches(workspaceMargins))) return false;
    // A study-set form owns unsaved local edits that aren't part of note autosave.
    if (root.querySelector('.study-editor')) return false;
    // A click closing another popup must not also close the document underneath.
    if ([...document.querySelectorAll<HTMLElement>(transientSurfaces)].some(panel => !panel.closest('[hidden], [aria-hidden="true"], [inert]') && panel.getClientRects().length > 0)) return false;
    return true;
  }
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => { startedOutside.current = event.button === 0 && isMargin(event); },
    onPointerCancelCapture: () => { startedOutside.current = false; },
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      const dismiss = event.button === 0 && startedOutside.current !== false && isMargin(event);
      startedOutside.current = null;
      if (dismiss) onDismiss();
    },
  };
}
