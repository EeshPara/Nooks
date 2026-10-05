import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import catalog from './room-rewards.json' with { type: 'json' };
import nookNames from './nook-names.json';
import { useModalFocus } from '../personalization/PersonalizePanel';
import { RewardDrawing } from './RewardDrawing';
import { useSoftDismiss } from './useSoftDismiss';
import { useBackdropDismiss } from './useBackdropDismiss';
import { isTopmostDismissTarget } from './dismissal';
import './RoomJourney.css';

export interface RoomProgress { focusSeconds: number; sessions: number; practices: number; placed: string[] }
export type RewardPerk = { type: 'soundtrack'; id: 'moonlit-piano' | 'vinyl-evening' } | { type: 'room'; id: 'moonstone-annex' | 'crystal-vault' };
export interface RoomReward { id: string; name: string; minutes: number; description: string; art: string; surprise?: boolean; perk?: RewardPerk }
export interface RoomRewardSet { label: string; theme: string; progression: 'collection' | 'growth'; growthArt?: string; rewards: RoomReward[] }
export interface RoomJourneyProps { roomId: string; progress: RoomProgress; liveFocusSeconds?: number; focusState?: 'running' | 'paused' | 'saving' | 'retry'; onPlace: (rewardId: string, placed: boolean) => Promise<void>; onFocus?: () => void; onUsePerk?: (perk: RewardPerk) => void }
export const emptyRoomProgress: RoomProgress = { focusSeconds: 0, sessions: 0, practices: 0, placed: [] };
const rewardRooms = catalog.rooms as unknown as Record<string, RoomRewardSet>;
export function getRoomRewards(roomId: string): RoomRewardSet { const room=rewardRooms[roomId] ?? rewardRooms.custom; return {...room,label:(nookNames as Record<string,string>)[roomId]||room.label}; }
const safeSeconds = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
export function unlockedRewards(roomId: string, progress: RoomProgress): RoomReward[] { return getRoomRewards(roomId).rewards.filter(reward => safeSeconds(progress.focusSeconds) >= reward.minutes * 60); }
export function roomGrowthSize(focusSeconds: number): number { return 70 + 48 * Math.min(1, Math.max(0, focusSeconds) / (180 * 60)); }
export function roomJourneyState(roomId: string, progress: RoomProgress) {
  const seconds = safeSeconds(progress.focusSeconds);
  const room = getRoomRewards(roomId), unlocked = unlockedRewards(roomId, progress), next = room.rewards.find(reward => seconds < reward.minutes * 60);
  return { room, unlocked, next, latest: unlocked.at(-1), percent: next ? Math.max(0, Math.min(100, seconds / (next.minutes * 60) * 100)) : 100, remainingMinutes: next ? Math.max(0, Math.ceil((next.minutes * 60 - seconds) / 60)) : 0 };
}

function SealedReward({ small = false }: { small?: boolean }) { return <div className={`room-sealed-reward ${small ? 'is-small' : ''}`} aria-hidden="true"><span>?</span><small>SEALED</small></div>; }
export function RoomRewardShelf({ roomId, progress, mode = 'placed' }: { roomId: string; progress: RoomProgress; mode?: 'placed' | 'earned' }) {
  const earned = unlockedRewards(roomId, progress), rewards = mode === 'placed' ? earned.filter(reward => progress.placed.includes(reward.id)).slice(0, 3) : earned;
  if (!rewards.length) return null;
  return <div className={`room-reward-shelf shelf-${mode}`} aria-label={mode === 'placed' ? 'Placed nook decorations' : 'Earned nook collection'}>{rewards.map(reward => <div className="room-shelf-object" key={reward.id} title={reward.name}><RewardDrawing art={reward.art} size={76} alt={reward.name} /></div>)}</div>;
}

export function RoomJourney(props: RoomJourneyProps) {
  const [open, setOpen] = useState(false);
  const { room, unlocked, next, percent, remainingMinutes } = roomJourneyState(props.roomId, props.progress);
  const saved = safeSeconds(props.progress.focusSeconds), live = safeSeconds(props.liveFocusSeconds ?? 0);
  const previewPercent = next ? Math.min(100, (saved + live) / (next.minutes * 60) * 100) : 100;
  const pendingUnlock = !!next && saved + live >= next.minutes * 60;
  const liveLabel = props.focusState === 'retry' ? 'Session waiting to save' : props.focusState === 'saving' ? 'Saving session…' : props.focusState === 'paused' ? 'Paused · time not yet saved' : 'Current session · not yet saved';
  return <>
    <section className={`room-journey-widget journey-${room.progression}`} aria-label={`Your progress in ${room.label}`}>
      <div className="journey-widget-heading"><span>Your collection</span><span>{unlocked.length}/{room.rewards.length}</span></div>
      <button className="journey-open" type="button" onClick={() => setOpen(true)} aria-label={`Open ${room.label} collection`}>
        {unlocked.length ? <RoomRewardShelf roomId={props.roomId} progress={props.progress} mode="earned" /> : <div className="journey-first-object"><RewardDrawing art={room.rewards[0].art} size={68} alt="" className="journey-preview-object" /><span>{room.rewards[0].name}<small>{room.rewards[0].minutes} minutes of focus</small></span></div>}
        <div className="journey-progress-heading"><span>{Math.floor(saved / 60)} min saved here</span><ChevronRight size={13} /></div>
        <div className="journey-progress-track" role="progressbar" aria-label="Saved focus progress toward the next keepsake" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(percent)} aria-valuetext={`${Math.floor(saved / 60)} saved minutes${next ? ` of ${next.minutes} minutes needed` : ', collection complete'}`}>
          {live > 0 && <i className="journey-progress-preview" style={{ width: `${previewPercent}%` }} />}
          <i className="journey-progress-saved" style={{ width: `${percent}%` }} />
        </div>
        {live > 0 && <span className="journey-live-progress"><span>{Math.floor(live / 60)}:{String(live % 60).padStart(2, '0')}</span> {liveLabel}</span>}
        <p>{pendingUnlock ? 'Ready after this session saves.' : next ? `${remainingMinutes} more saved ${remainingMinutes === 1 ? 'minute' : 'minutes'} to the next keepsake` : 'Collection complete'}</p>
      </button>
      <button className="journey-view-all" type="button" onClick={() => setOpen(true)}>View collection <ChevronRight size={12} /></button>
    </section>
    {open && <RoomJourneyModal {...props} onClose={() => setOpen(false)} />}
  </>;
}

export function RoomJourneyModal({ roomId, progress, onPlace, onFocus, onUsePerk, onClose }: RoomJourneyProps & { onClose: () => void }) {
  const { room, unlocked, next, remainingMinutes } = roomJourneyState(roomId, progress);
  const modal = useRef<HTMLDivElement>(null), heading = useId();
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const busy = useRef(false);
  const placementButton = useRef<HTMLButtonElement | null>(null);
  const dismiss = useSoftDismiss(modal, onClose, { blocked: !!pending, queueWhenBlocked: true });
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  useEffect(() => {
    if (pending || !placementButton.current) return;
    const button = placementButton.current; placementButton.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (isTopmostDismissTarget(modal.current) && button.isConnected && !button.disabled && (document.activeElement === document.body || document.activeElement === modal.current || modal.current?.contains(document.activeElement))) button.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pending]);
  const placed = [...new Set(progress.placed)].filter(id => unlocked.some(reward => reward.id === id));
  useModalFocus(modal, () => dismiss());
  async function place(reward: RoomReward, button: HTMLButtonElement) {
    if (busy.current) return;
    const removing = placed.includes(reward.id);
    if (!removing && placed.length >= 3) { setError('Your display has three objects. Remove one to make space.'); return; }
    busy.current = true; placementButton.current = button; setPending(reward.id); setError(''); setStatus('');
    try { await onPlace(reward.id, !removing); setStatus(removing ? `${reward.name} returned to your collection.` : `${reward.name} placed in your collection display.`); }
    catch { setError('Your display couldn’t save. Your collection is still here — try again.'); }
    finally { busy.current = false; setPending(null); }
  }
  return <div className="room-journey-overlay" {...backdrop}><div className="room-journey-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby={heading} tabIndex={-1} onClick={event => event.stopPropagation()}><header><div><span className="journey-eyebrow">YOUR COLLECTION</span><h2 id={heading}>{room.label}</h2><p>Earned with saved focus time in this nook.</p></div><button type="button" aria-label="Close nook collection" onClick={() => dismiss()}><X size={19} /></button></header><div className="room-journey-scroll"><div className="journey-room-stats"><span><strong>{Math.floor(Math.max(0, progress.focusSeconds) / 60)}</strong> focus minutes</span><span><strong>{progress.sessions}</strong> {progress.sessions === 1 ? 'session' : 'sessions'}</span><span><strong>{progress.practices}</strong> practice {progress.practices === 1 ? 'session' : 'sessions'}</span></div>{placed.length > 0 && <div className="journey-placed-display"><span>YOUR DISPLAY · {placed.length}/3</span><RoomRewardShelf roomId={roomId} progress={progress} /><p>You can keep three objects on display. Everything earned stays in your collection.</p></div>}<ol className="journey-reward-list">{room.rewards.map((reward, index) => {
    const earned = safeSeconds(progress.focusSeconds) >= reward.minutes * 60, secret = !earned && reward.surprise && !revealed.has(reward.id), isPlaced = placed.includes(reward.id), full = !isPlaced && placed.length >= 3;
    return <li key={reward.id} className={`${earned ? 'is-earned' : 'is-locked'} ${secret ? 'is-sealed' : ''}`}><div className="journey-reward-art">{secret ? <SealedReward /> : <RewardDrawing art={reward.art} size={84} alt="" />}</div><div className="journey-reward-copy"><span className="journey-reward-stage">{room.progression === 'growth' ? `STAGE ${index + 1}` : `DISCOVERY ${index + 1}`} · {reward.minutes} MIN</span><h3>{secret ? 'Surprise keepsake' : reward.name}</h3><p>{secret ? 'Reveal the details whenever you like.' : reward.description}</p>{earned ? <span className="journey-earned-label">Earned{isPlaced ? ' · On display' : ''}</span> : <span className="journey-locked-label">{Math.max(0, Math.ceil((reward.minutes * 60 - progress.focusSeconds) / 60))} more focus minutes</span>}{secret && <button type="button" className="journey-reveal-details" disabled={!!pending} onClick={() => setRevealed(previous => new Set([...previous, reward.id]))}>Reveal details</button>}</div><div className="journey-reward-actions">{earned && <><button type="button" disabled={!!pending || full} onClick={event => place(reward, event.currentTarget)} aria-label={`${isPlaced ? 'Remove' : 'Place'} ${reward.name}`} title={full ? 'Remove an object to make space' : undefined}>{pending === reward.id ? 'Saving…' : isPlaced ? 'Remove' : 'Place'}</button>{reward.perk && onUsePerk && <button type="button" className="journey-use-perk" disabled={!!pending} onClick={() => { dismiss(() => onUsePerk(reward.perk!)); }}>{reward.perk.type === 'soundtrack' ? 'Play track' : 'Visit nook'}</button>}</>}</div></li>;
  })}</ol>{error && <p className="journey-error" role="alert">{error}</p>}{status && <p className="journey-status" role="status">{status}</p>}</div><footer><span>{next ? `${remainingMinutes} more focus ${remainingMinutes === 1 ? 'minute' : 'minutes'} to your next keepsake.` : 'Collection complete. Your keepsakes stay saved.'}</span>{onFocus && <button type="button" disabled={!!pending} onClick={() => { dismiss(onFocus); }}>Focus in this nook <ChevronRight size={13} /></button>}</footer></div></div>;
}
export default RoomJourney;
