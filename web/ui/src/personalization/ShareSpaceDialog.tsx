import { useContext, useEffect, useRef, useState } from 'react';
import { DraftRecoveryScope, useCrashDraft } from '../WorkspaceErrorBoundary';
import { Check, Copy, ExternalLink, Globe2, Link2, LockKeyhole, Trash2, X } from 'lucide-react';
import { SpaceScene } from './SpaceScene';
import { useModalFocus } from './PersonalizePanel';
import { getRoomScene, safeBackgroundImage, SharedSpace, SpaceStats, WorkspaceSpace } from './types';
import { getRoomRewards, type RoomReward } from '../world/RoomJourney';
import { RewardDrawing } from '../world/RewardDrawing';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import './Personalization.css';

export interface ShareSpaceDialogProps { space: WorkspaceSpace; share?: SharedSpace | null; stats?: SpaceStats; onPublish: (options: { includeProgress: boolean; description: string }) => Promise<SharedSpace>; onRevoke: (shareId: string) => Promise<void>; onClose: () => void }
type ShareDraft = { description: string; includeProgress: boolean };
// Normal dismissal retains unfinished sharing text in this tab and account only.
const dismissedShareDrafts = new Map<string, ShareDraft>();
export function shareURL(share: SharedSpace): string {
  if (share.url) {
    try { const url = new URL(share.url, window.location.origin); if (['http:', 'https:'].includes(url.protocol)) return url.href; } catch { /* Invalid stored link falls back to the local share route. */ }
  }
  return `${window.location.origin}/?share=${encodeURIComponent(share.id)}`;
}

function sharedRoomDecorations(share: SharedSpace): RoomReward[] {
  const display = share.roomDisplay;
  const roomId = safeBackgroundImage(share.space.backgroundImage) ? 'custom' : getRoomScene(share.space).id;
  if (!display || display.roomId !== roomId || !Array.isArray(display.placed)) return [];
  const placed = new Set(display.placed.filter((id): id is string => typeof id === 'string'));
  return getRoomRewards(roomId).rewards.filter(reward => placed.has(reward.id)).slice(0, 3);
}

function SharedRoomDecorations({ share }: { share: SharedSpace }) {
  const decorations = sharedRoomDecorations(share);
  if (!decorations.length) return null;
  return <div className="room-reward-shelf shared-room-display" role="list" aria-label="Decorations in this shared nook" style={{ maxWidth: 270, margin: '8px auto 16px' }}>{decorations.map(reward => <div className="room-shelf-object" role="listitem" key={reward.id} title={reward.name}><RewardDrawing art={reward.art} size={76} alt={reward.name} /></div>)}</div>;
}

export default function ShareSpaceDialog({ space, share: initialShare, stats, onPublish, onRevoke, onClose }: ShareSpaceDialogProps) {
  const owner = useContext(DraftRecoveryScope);
  const draftKey = JSON.stringify([owner, getRoomScene(space).id, space.name]);
  const [share, setShare] = useState(initialShare ?? null);
  const [description, setDescription] = useCrashDraft('share:description', () => initialShare?.description ?? dismissedShareDrafts.get(draftKey)?.description ?? 'A cozy corner for learning, one little idea at a time.');
  const [includeProgress, setIncludeProgress] = useCrashDraft('share:include-progress', () => !initialShare && (dismissedShareDrafts.get(draftKey)?.includeProgress ?? false));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const modal = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const completed = useRef(!!initialShare);
  const active = useRef({ owner, mounted: true }); active.current.owner = owner;
  useEffect(() => { active.current.mounted = true; return () => { active.current.mounted = false; }; }, []);
  function dismissShare() {
    dismissedShareDrafts.delete(draftKey);
    if (!completed.current) {
      dismissedShareDrafts.set(draftKey, { description, includeProgress });
      if (dismissedShareDrafts.size > 12) dismissedShareDrafts.delete(dismissedShareDrafts.keys().next().value!);
    }
    onClose();
  }
  const dismiss = useSoftDismiss(modal, dismissShare, { blocked: pending, queueWhenBlocked: true });
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  useModalFocus(modal, () => dismiss());
  async function publish() {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setError('');
    try {
      const published = await onPublish({ includeProgress, description: description.trim() });
      if (!active.current.mounted || active.current.owner !== owner) return;
      setShare(published); completed.current = true; dismissedShareDrafts.delete(draftKey);
    } catch { if (active.current.mounted && active.current.owner === owner) setError('Your nook couldn’t publish. Try again in a moment.'); }
    finally { submitting.current = false; if (active.current.mounted && active.current.owner === owner) setPending(false); }
  }
  async function revoke() {
    if (!share || submitting.current) return;
    submitting.current = true; setPending(true); setError('');
    try {
      await onRevoke(share.id);
      if (!active.current.mounted || active.current.owner !== owner) return;
      setShare(null); setCopied(false); completed.current = false;
    } catch { if (active.current.mounted && active.current.owner === owner) setError('The link couldn’t be unpublished. Please try again.'); }
    finally { submitting.current = false; if (active.current.mounted && active.current.owner === owner) setPending(false); }
  }
  async function copy() { if (!share) return; try { await navigator.clipboard.writeText(shareURL(share)); setCopied(true); } catch { setError('Copy the link shown below to share your nook.'); } }
  return <div className="personalize-overlay" {...backdrop}><div className="share-space-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="share-space-heading" onClick={event => event.stopPropagation()}><div className="personalize-modal-heading"><div><span className="space-eyebrow">A LITTLE INSPIRATION TO SHARE</span><h2 id="share-space-heading">Share your study nook.</h2></div><button className="personalize-close" onClick={() => dismiss()} aria-label="Close sharing"><X size={19} /></button></div><SpaceScene space={share?.space ?? space} miniature showCards={false} />{share && <SharedRoomDecorations share={share} />}<div className="share-privacy"><LockKeyhole size={18} /><p>Your public nook shows its look and your message. <strong>Your notes, cards, quizzes, tasks, and account stay private.</strong></p></div>{share ? <><div className="share-live"><span><Globe2 size={16} /> Your nook has a public link</span><p>This is a snapshot. Publish a fresh one after changing your nook.</p><div className="share-link"><input readOnly aria-label="Public study nook link" value={shareURL(share)} onFocus={event => event.target.select()} /><button className="personalize-primary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}</button></div><a className="share-open" href={shareURL(share)} target="_blank" rel="noopener noreferrer">Preview your public nook <ExternalLink size={13} /></a>{['localhost','127.0.0.1'].includes(window.location.hostname) && <small>Local preview links work on this device. Deploy Nooks to share across devices.</small>}</div><div className="share-actions"><button className="personalize-secondary" disabled={pending} onClick={revoke}><Trash2 size={15} /> {pending ? 'Unpublishing…' : 'Unpublish link'}</button><button className="personalize-primary" onClick={() => dismiss()}>Done <Check size={15} /></button></div></> : <><label className="personalize-label">A note for visitors<textarea rows={2} maxLength={500} value={description} disabled={pending} onChange={event => { completed.current = false; setDescription(event.target.value); }} /></label><label className="personalize-toggle share-progress-toggle"><span><strong>Show my study milestones</strong><small>Optional: level, focus minutes, and study streak. Never individual activity.</small></span><input type="checkbox" checked={includeProgress} disabled={pending} onChange={event => { completed.current = false; setIncludeProgress(event.target.checked); }} /><i aria-hidden="true" /></label>{includeProgress && stats && <div className="share-preview-stats"><span>Level {stats.level}</span><span>{stats.focusMinutes} focus minutes</span><span>{stats.streak} day streak</span></div>}{space.backgroundImage && <p className="share-image-notice">Your uploaded nook background will be visible to anyone with the public link.</p>}<div className="share-actions"><button className="personalize-secondary" onClick={() => dismiss()}>Keep it private</button><button className="personalize-primary" onClick={publish} disabled={pending}><Link2 size={16} /> {pending ? 'Publishing your nook…' : 'Create public link'}</button></div></>}{error && <p className="personalize-error" role="alert">{error}</p>}</div></div>;
}

export function SharedSpaceView({ share, onOpenWorkspace }: { share: SharedSpace; onOpenWorkspace?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copy = async () => { try { await navigator.clipboard.writeText(shareURL(share)); setCopied(true); } catch { setCopyError(shareURL(share)); } };
  return <main className="shared-space-page"><header><a href="/" className="shared-notable-logo" aria-label="Nooks home"><img src="/images/nook-cat-logo.webp" alt="" width={46} height={36} style={{ objectFit: 'contain' }}/><img src="/images/nooks-wordmark.png" alt="Nooks" width={89} height={33} style={{ objectFit: 'contain' }}/></a><span><Globe2 size={13} /> A shared study nook</span></header><div className="shared-space-inner"><SpaceScene space={share.space} /><SharedRoomDecorations share={share} /><div className="shared-space-message"><span className="space-eyebrow">A NOTE FROM THIS NOOK</span><p>{share.description || 'A little place to make progress, one idea at a time.'}</p>{share.stats && <div className="shared-milestones"><div><strong>{share.stats.level}</strong><span>Study level</span></div><div><strong>{share.stats.focusMinutes}</strong><span>Minutes of focus</span></div><div><strong>{share.stats.streak}</strong><span>Day study streak</span></div></div>}<div className="share-actions"><button className="personalize-secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Link copied' : 'Copy this nook’s link'}</button>{onOpenWorkspace ? <button className="personalize-primary" onClick={onOpenWorkspace}><LeafMark /> Make my own nook</button> : <a className="personalize-primary" href="/"><LeafMark /> Make my own nook</a>}</div>{copyError && <p className="shared-copy-fallback">{copyError}</p>}<small>A public snapshot of someone’s style. Their study material is private.</small></div></div><footer>A little focus. A little growth. <img src="/images/nooks-wordmark.png" alt="Nooks" width={48} height={18} style={{ objectFit: 'contain', verticalAlign: 'middle', marginLeft: 9 }}/></footer></main>;
}
function LeafMark() { return <span aria-hidden="true">✳</span>; }
