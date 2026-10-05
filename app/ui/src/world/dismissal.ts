/** A native dialog is above the page regardless of its DOM position. */
export function isTopmostDismissTarget(surface: HTMLElement | null): boolean {
  if (!surface?.isConnected) return false;
  const visible = (element: HTMLElement) => !element.closest('[hidden], [aria-hidden="true"], [inert]')
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';
  const native = [...document.querySelectorAll<HTMLElement>('dialog[open]')].filter(visible).at(-1);
  const top = native ?? [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter(visible).at(-1);
  return !top || top === surface || top.contains(surface);
}

/** Only one surface should handle a single Escape, including nested controls. */
export function consumeDismissEscape(event: KeyboardEvent, surface: HTMLElement | null): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || !isTopmostDismissTarget(surface)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
