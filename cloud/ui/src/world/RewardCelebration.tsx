import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { RewardDrawing } from './RewardDrawing';
import type { RoomReward } from './RoomJourney';
import { consumeDismissEscape, isTopmostDismissTarget } from './dismissal';
import { useSoftDismiss } from './useSoftDismiss';
import { useBackdropDismiss } from './useBackdropDismiss';
import './RewardCelebration.css';

export interface RewardCelebrationProps {
  /** Only rewards newly returned after a confirmed server save. Parent deduplicates by completed session. */
  rewards: RoomReward[];
  roomLabel: string;
  onClose: () => void;
  onPlace?: (rewardId: string) => Promise<void>;
}

export function RewardCelebration({ rewards, roomLabel, onClose, onPlace }: RewardCelebrationProps) {
  const items = [...new Map(rewards.map(reward => [reward.id, reward])).values()];
  const dialog = useRef<HTMLDivElement>(null), busy = useRef(false);
  const heading = useId(), description = useId();
  const [pending, setPending] = useState<string | null>(null), [placed, setPlaced] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const dismiss = useSoftDismiss(dialog, onClose, { blocked: !!pending, queueWhenBlocked: true });
  const closeRef = useRef(() => dismiss()); closeRef.current = () => dismiss();
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  const active = items.length > 0;

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      const modal = dialog.current;
      if (!modal) return;
      if (consumeDismissEscape(event, modal)) closeRef.current();
      if (event.key !== 'Tab' || event.defaultPrevented || !isTopmostDismissTarget(modal)) return;
      const nodes = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); modal.focus(); return; }
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || focused === modal || !modal.contains(focused))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (focused === last || focused === modal || !modal.contains(focused))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => { if (previous?.isConnected && isTopmostDismissTarget(previous)) previous.focus({ preventScroll: true }); });
    };
  }, [active]);

  async function place(id: string) {
    if (!onPlace || busy.current || placed.has(id)) return;
    busy.current = true; setPending(id); setError(''); setStatus('');
    try {
      await onPlace(id);
      setPlaced(previous => new Set([...previous, id]));
      setStatus('Added to your collection display.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your display could not save. The keepsake is still in your collection.');
    } finally {
      busy.current = false; setPending(null);
      requestAnimationFrame(() => { if (isTopmostDismissTarget(dialog.current)) dialog.current?.focus({ preventScroll: true }); });
    }
  }

  if (!active) return null;
  return <div className="reward-celebration-overlay" {...backdrop}>
    <div ref={dialog} className="reward-celebration" role="dialog" aria-modal="true" aria-labelledby={heading} aria-describedby={description} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <button className="reward-celebration-close" type="button" aria-label="Close new keepsakes" onClick={() => dismiss()}><X size={19} /></button>
      <span className="reward-celebration-place">{roomLabel}</span>
      <h2 id={heading}>{items.length === 1 ? 'A new keepsake' : `${items.length} new keepsakes`}</h2>
      <p id={description}>Your focus time is saved. These are yours to keep.</p>
      <ul className={`reward-celebration-items ${items.length === 1 ? 'is-single' : ''}`}>
        {items.map(reward => <li key={reward.id}>
          <div className="reward-celebration-art"><RewardDrawing art={reward.art} size={items.length === 1 ? 152 : 100} /></div>
          <h3>{reward.name}</h3>
          <p>{reward.minutes} minutes in this nook</p>
          {onPlace && <button type="button" className="reward-celebration-place-item" disabled={!!pending || placed.has(reward.id)} onClick={() => place(reward.id)}>{pending === reward.id ? 'Saving…' : placed.has(reward.id) ? 'On display' : 'Add to display'}</button>}
        </li>)}
      </ul>
      {error && <p className="reward-celebration-error" role="alert">{error}</p>}
      {status && <p className="reward-celebration-status" role="status">{status}</p>}
      <button type="button" className="reward-celebration-done" onClick={() => dismiss()}>Continue</button>
    </div>
  </div>;
}

export default RewardCelebration;
