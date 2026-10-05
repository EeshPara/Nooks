import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './SelectionActions.css';

export type SelectionAction = 'explain' | 'simplify' | 'flashcards';
export interface SelectionActionsProps {
  containerSelector: string;
  onAction: (action: SelectionAction, text: string) => void;
  resetKey?: string;
}

type SelectionSnapshot = { text: string; range: Range; container: HTMLElement; backwards: boolean; returnFocus: HTMLElement };
type ToolbarPosition = { left: number; top: number; maxWidth: number; visible: boolean };
const editable = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const excluded = `${editable},button`;
const actions: { action: SelectionAction; label: string }[] = [
  { action: 'explain', label: 'Explain' },
  { action: 'simplify', label: 'Simplify' },
  { action: 'flashcards', label: 'Make cards' },
];
const elementAt = (node: Node | null): Element | null => node instanceof Element ? node : node?.parentElement ?? null;

/** No selected note content is written to storage or sent until a button is chosen. */
export function SelectionActions({ containerSelector, onAction, resetKey }: SelectionActionsProps) {
  const [selected, setSelected] = useState<SelectionSnapshot | null>(null);
  const [position, setPosition] = useState<ToolbarPosition>({ left: 0, top: 0, maxWidth: 280, visible: false });
  const toolbar = useRef<HTMLDivElement>(null);
  const snapshot = useRef<SelectionSnapshot | null>(null);
  const callback = useRef(onAction); callback.current = onAction;
  const selectingWithPointer = useRef(false);
  const frame = useRef(0);
  const pendingCapture = useRef(false);

  function matchingContainer(node: Node | null): HTMLElement | null {
    try { return elementAt(node)?.closest<HTMLElement>(containerSelector) ?? null; }
    catch { return null; }
  }
  function restoreFocus(value: SelectionSnapshot) {
    const target = value.returnFocus.isConnected ? value.returnFocus : value.container;
    if (!target.isConnected) return;
    const temporary = !target.hasAttribute('tabindex') && target.tabIndex < 0;
    if (temporary) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (temporary) target.removeAttribute('tabindex');
  }
  function dismiss(clearRange = false, returnFocus = false) {
    const previous = snapshot.current;
    snapshot.current = null; setSelected(null);
    if (clearRange) {
      const selection = window.getSelection();
      if (previous && selection?.rangeCount && previous.container.contains(selection.getRangeAt(0).commonAncestorContainer)) selection.removeAllRanges();
    }
    if (returnFocus && previous) restoreFocus(previous);
  }
  function capture() {
    if (toolbar.current?.contains(document.activeElement)) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) { dismiss(); return; }
    if (elementAt(document.activeElement)?.closest(editable)) { dismiss(); return; }
    const range = selection.getRangeAt(0);
    const container = matchingContainer(range.startContainer);
    if (!container || container !== matchingContainer(range.endContainer) || !container.contains(range.commonAncestorContainer)) { dismiss(); return; }
    if (elementAt(range.startContainer)?.closest(excluded) || elementAt(range.endContainer)?.closest(excluded)) { dismiss(); return; }
    // A selection spanning an editable island must not expose its contents either.
    for (const field of container.querySelectorAll(excluded)) {
      if (range.intersectsNode(field)) { dismiss(); return; }
    }
    const text = selection.toString().trim();
    if (!text) { dismiss(); return; }
    const active = document.activeElement;
    const value: SelectionSnapshot = {
      text, range: range.cloneRange(), container,
      backwards: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset,
      returnFocus: active instanceof HTMLElement && container.contains(active) ? active : container,
    };
    snapshot.current = value; setSelected(value);
  }
  function place() {
    const value = snapshot.current;
    if (!value || !value.container.isConnected || !value.range.startContainer.isConnected || !value.range.endContainer.isConnected) { dismiss(); return; }
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth, viewportHeight = viewport?.height ?? window.innerHeight;
    const rightEdge = leftEdge + viewportWidth, bottomEdge = topEdge + viewportHeight;
    const lines = Array.from(value.range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0 && rect.bottom > topEdge && rect.top < bottomEdge && rect.right > leftEdge && rect.left < rightEdge);
    if (!lines.length) { setPosition(previous => ({ ...previous, visible: false })); return; }
    const anchor = value.backwards ? lines[0] : lines[lines.length - 1];
    const maxWidth = Math.max(1, viewportWidth - 20);
    const width = Math.min(toolbar.current?.offsetWidth || 262, maxWidth);
    const height = toolbar.current?.offsetHeight || 44;
    const minimumLeft = leftEdge + 10, minimumTop = topEdge + 10;
    const left = Math.max(minimumLeft, Math.min(anchor.left + anchor.width / 2 - width / 2, rightEdge - width - 10));
    const above = anchor.top - height - 10;
    const preferredTop = above >= minimumTop ? above : anchor.bottom + 10;
    const top = Math.max(minimumTop, Math.min(preferredTop, bottomEdge - height - 10));
    setPosition(previous => previous.left === left && previous.top === top && previous.maxWidth === maxWidth && previous.visible ? previous : { left, top, maxWidth, visible: true });
  }

  useLayoutEffect(() => { if (selected) place(); }, [selected, position.visible]);
  useEffect(() => {
    dismiss(true);
    function schedule(readSelection: boolean) {
      pendingCapture.current ||= readSelection;
      window.cancelAnimationFrame(frame.current);
      frame.current = window.requestAnimationFrame(() => {
        const read = pendingCapture.current; pendingCapture.current = false;
        if (read) capture(); else place();
      });
    }
    const selectionChanged = () => { if (!selectingWithPointer.current) schedule(true); };
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (toolbar.current?.contains(target)) return;
      const container = matchingContainer(target);
      selectingWithPointer.current = Boolean(container && !elementAt(target)?.closest(excluded));
      if (!selectingWithPointer.current) dismiss(true);
    };
    const pointerUp = (event: PointerEvent) => {
      selectingWithPointer.current = false;
      if (!toolbar.current?.contains(event.target as Node)) schedule(true);
    };
    const focusChanged = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!toolbar.current?.contains(target) && (!matchingContainer(target) || elementAt(target)?.closest(excluded))) dismiss(true);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!snapshot.current) return;
      if (event.key === 'Escape') {
        const wasFocused = Boolean(toolbar.current?.contains(document.activeElement));
        event.preventDefault(); dismiss(true, wasFocused); return;
      }
      const altEnter = event.altKey && event.key === 'Enter';
      const tabFromNote = event.key === 'Tab' && !event.shiftKey && Boolean(matchingContainer(document.activeElement)) && !elementAt(document.activeElement)?.closest(excluded);
      if ((altEnter || tabFromNote) && toolbar.current && !toolbar.current.hidden) { event.preventDefault(); toolbar.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
    };
    const move = () => { if (snapshot.current) schedule(false); };
    document.addEventListener('selectionchange', selectionChanged);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('pointercancel', pointerUp, true);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('keydown', keyboard);
    document.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    window.visualViewport?.addEventListener('resize', move);
    window.visualViewport?.addEventListener('scroll', move);
    return () => {
      window.cancelAnimationFrame(frame.current);
      pendingCapture.current = false;
      document.removeEventListener('selectionchange', selectionChanged);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerUp, true);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
      window.visualViewport?.removeEventListener('resize', move);
      window.visualViewport?.removeEventListener('scroll', move);
    };
  }, [containerSelector, resetKey]);

  function toolbarKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(toolbar.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Tab' && event.shiftKey && index === 0) {
      event.preventDefault(); if (snapshot.current) restoreFocus(snapshot.current);
    }
  }
  if (!selected) return null;
  return createPortal(<div className="selection-actions" ref={toolbar} role="toolbar" aria-label="Study selected text" aria-keyshortcuts="Alt+Enter" hidden={!position.visible} style={{ left: position.left, top: position.top, maxWidth: position.maxWidth }} onKeyDown={toolbarKeys} onPointerDown={event => event.preventDefault()}>
    {actions.map(({ action, label }) => <button key={action} type="button" onClick={() => { const text = snapshot.current?.text; if (text) { dismiss(true); callback.current(action, text); } }}>{label}</button>)}
    <span className="selection-actions-hint" role="status">Study actions are available for your selection. Press Alt+Enter to focus them.</span>
  </div>, document.body);
}

export default SelectionActions;
