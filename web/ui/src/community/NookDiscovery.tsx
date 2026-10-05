import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Search, X } from 'lucide-react';
import type { RoomCategory, RoomScene } from '../personalization/types';
import { getRoomRewards } from '../world/RoomJourney';
import { RewardDrawing } from '../world/RewardDrawing';
import { publicNooks, type PublicNook, type NookDraft } from './nookCatalog';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import { consumeDismissEscape, isTopmostDismissTarget } from '../world/dismissal';
import './NookDiscovery.css';

export interface NookDiscoveryProps {
  currentNookId: string;
  onClose: () => void;
  onJoin: (scene: RoomScene) => void;
  onCreate: () => void;
  onCommunity?: () => void;
  drafts?: NookDraft[];
  onJoinDraft?: (draft: NookDraft) => void;
}

const categories: { id: RoomCategory | 'all' | 'creators' | 'mine'; label: string }[] = [
  { id: 'all', label: 'All nooks' }, { id: 'cozy', label: 'Cozy corners' },
  { id: 'nature', label: 'In nature' }, { id: 'city', label: 'City escapes' },
  { id: 'elsewhere', label: 'Somewhere else' }, 
  { id: 'mine', label: 'My nooks' },
];

function StudyingCount({ count }: { count: number }) {
  return <span className="nd-studying"><i aria-hidden="true" />{count} studying</span>;
}

function NookCard({ nook, current, onSelect }: { nook: PublicNook; current: boolean; onSelect: () => void }) {
  return <button type="button" className="nd-card" onClick={onSelect} aria-label={`Explore ${nook.title}`}>
    <span className="nd-card-image"><img src={nook.scene.image} alt="" loading="lazy" width={nook.scene.width} height={nook.scene.height} />
      {current && <span className="nd-current"><Check size={11} /> Your current nook</span>}
      <span className="nd-card-enter" aria-hidden="true"><ArrowRight size={19} /></span>
    </span>
    <span className="nd-card-title"><strong>{nook.title}</strong></span>
    <span className="nd-card-caption">{nook.scene.caption}</span>
    <span className="nd-card-bottom"><span>{nook.audiences.slice(0, 2).join(' · ')}</span><span>by Nooks</span></span>
  </button>;
}

function NookDetail({ nook, current, onJoin, headingId }: { nook: PublicNook; current: boolean; onJoin: () => void; headingId: string }) {
  const rewards = getRoomRewards(nook.id);
  const revealed = rewards.rewards.filter(reward => !reward.surprise).slice(0, 3);
  return <div className="nd-detail">
    <div className="nd-detail-image"><img src={nook.scene.image} alt={`${nook.title} study nook`} /><span className="nd-image-caption">{nook.scene.caption}</span></div>
    <div className="nd-detail-body">
      <div className="nd-detail-copy"><div className="nd-detail-byline"><span>STUDY NOOK</span></div><h2 id={headingId}>{nook.title}</h2><p>{nook.description}</p>
        <div className="nd-audiences" aria-label="People who study here">{nook.audiences.map(audience => <span key={audience}>{audience}</span>)}</div>
        <div className="nd-host"><img src="/images/nook-cat-logo.webp" alt="" /><div><span>Hosted by <strong>Nooks</strong></span><small>An original Nooks study space</small></div></div>
      </div>
      <aside className="nd-discoveries"><span className="nd-small-label">A LITTLE SOMETHING TO WORK TOWARD</span><h3>{rewards.progression === 'growth' ? 'Watch your progress grow' : 'Your next discoveries'}</h3>
        <div className="nd-rewards">{revealed.map(reward => <div key={reward.id}><RewardDrawing art={reward.art} size={72} alt="" /><strong>{reward.name}</strong><small>{reward.minutes} min of focus</small></div>)}</div>
        <p>Your collection stays in this nook. Keep studying to discover more.</p>
      </aside>
    </div>
    <div className="nd-detail-footer"><span>A place to focus.<br /><small>Your own progress to keep.</small></span><button type="button" className="nd-primary" onClick={onJoin}>{current ? 'Back to this nook' : 'Study here'}<ArrowRight size={17} /></button></div>
  </div>;
}

export function NookDiscovery({ currentNookId, onClose, onJoin, onCreate, drafts = [], onJoinDraft, onCommunity }: NookDiscoveryProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]['id']>('all');
  const [sort, setSort] = useState('popular');
  const [selected, setSelected] = useState<PublicNook | null>(null);
  const dialog = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const dismiss = useSoftDismiss(dialog, onClose);
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  const lastNookId = useRef<string | null>(null), gridScroll = useRef(0);
  const heading = useId(), disclosure = useId();
  const closeRef = useRef(() => dismiss()), selectedRef = useRef(selected); closeRef.current = () => dismiss(); selectedRef.current = selected;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    searchInput.current?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (consumeDismissEscape(event, dialog.current)) { if (selectedRef.current) setSelected(null); else closeRef.current(); }
      if (event.key !== 'Tab' || event.defaultPrevented || !isTopmostDismissTarget(dialog.current)) return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKey, true); requestAnimationFrame(() => { if (previous?.isConnected && isTopmostDismissTarget(previous)) previous.focus({ preventScroll: true }); }); };
  }, []);

  useEffect(() => {
    if (selected) { scroller.current?.scrollTo({ top: 0 }); backButton.current?.focus({ preventScroll: true }); }
    else if (lastNookId.current) {
      scroller.current?.scrollTo({ top: gridScroll.current });
      const card = dialog.current?.querySelector<HTMLButtonElement>(`[data-nook-id="${lastNookId.current}"] button`);
      card?.focus({ preventScroll: true });
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return publicNooks.filter(nook => (category === 'all' || (category === 'creators' ? nook.owner.isCreator : nook.scene.category === category)) && (!term || [nook.title, nook.description, nook.scene.style, nook.owner.name, nook.owner.handle, ...nook.audiences].join(' ').toLowerCase().includes(term)))
      .sort((a, b) => sort === 'alphabetical' ? a.title.localeCompare(b.title) : 0);
  }, [search, category, sort]);
  const filteredDrafts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return drafts.filter(draft => !term || `${draft.name} ${draft.description}`.toLowerCase().includes(term))
      .sort((a, b) => sort === 'alphabetical' ? a.name.localeCompare(b.name) : b.createdAt.localeCompare(a.createdAt));
  }, [drafts, search, sort]);
  const isMine = category === 'mine';

  return <div className="nd-overlay" {...backdrop}>
    <div className="nd-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={heading} aria-describedby={disclosure} tabIndex={-1}>
      <header className="nd-header"><div className="nd-wordmark"><img src="/images/nook-cat-logo.webp" alt="" /><span>Nooks</span></div><div className="nd-header-actions">{onCommunity&&<button className="nd-create" type="button" onClick={()=>dismiss(onCommunity)}>Study together</button>}<button className="nd-create" type="button" onClick={() => dismiss(onCreate)}><Plus size={15} />Create a nook</button><button className="nd-close" type="button" onClick={() => dismiss()} aria-label="Close nook discovery"><X size={21} /></button></div></header>
      <div className="nd-scroll" ref={scroller}>
        {selected ? <><div className="nd-back-row"><button ref={backButton} type="button" onClick={() => setSelected(null)}><ArrowLeft size={16} />All nooks</button><span>Your work comes with you.</span></div><NookDetail nook={selected} current={selected.id === currentNookId} headingId={heading} onJoin={() => onJoin(selected.scene)} /></> : <>
          <div className="nd-intro"><span className="nd-small-label">EXPLORE</span><h1 id={heading}>Find your next nook.</h1><p>Find a setting that makes you want to stay.</p></div>
          <div className="nd-search"><Search size={19} aria-hidden="true" /><input ref={searchInput} aria-label="Search public nooks" type="search" placeholder="Search rain, garden, anime…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear nook search" onClick={() => { setSearch(''); searchInput.current?.focus(); }}><X size={17} /></button>}</div>
          <nav className="nd-categories" aria-label="Nook categories">{categories.map(item => <button type="button" key={item.id} aria-pressed={item.id === category} onClick={() => setCategory(item.id)}>{item.label}</button>)}</nav>
          <div className="nd-results-heading"><span aria-live="polite">{isMine ? `${filteredDrafts.length} saved ${filteredDrafts.length === 1 ? 'draft' : 'drafts'}` : `${filtered.length} ${filtered.length === 1 ? 'nook' : 'nooks'}`}</span><label>Sort by<select aria-label="Sort public nooks" value={sort} onChange={event => setSort(event.target.value)}><option value="popular">{isMine ? 'Recently created' : 'Curated'}</option><option value="alphabetical">Name</option></select></label></div>
          {isMine ? <><p className="nd-local-note">Your drafts are saved on this device. Public and private sharing are previews for now.</p>{filteredDrafts.length ? <div className="nd-grid">{filteredDrafts.map(draft => {
            const base = publicNooks.find(nook => nook.id === draft.sceneId) ?? publicNooks[0];
            return <button type="button" className="nd-card nd-draft" key={draft.id} aria-label={`Preview your nook ${draft.name}`} onClick={() => onJoinDraft ? onJoinDraft(draft) : onJoin(base.scene)}><span className="nd-card-image"><img src={base.scene.image} alt="" loading="lazy" /><span className="nd-current">{draft.visibility === 'public' ? 'Public nook draft' : 'Private nook draft'}</span><span className="nd-card-enter" aria-hidden="true"><ArrowRight size={19} /></span></span><span className="nd-card-title"><strong>{draft.name}</strong><span className="nd-draft-label">Preview</span></span><span className="nd-card-caption">{draft.description || 'Your own little study world.'}</span><span className="nd-card-bottom">Created by you · Saved locally</span></button>;
          })}</div> : <div className="nd-empty"><img src="/images/nook-cat-logo.webp" alt="" /><h2>{search ? 'No matching drafts.' : 'A little world, made by you.'}</h2><p>{search ? 'Try another name, or create a new nook.' : 'Choose a backdrop and make a study nook your own.'}</p><button type="button" onClick={() => dismiss(onCreate)}>Create a nook<ArrowRight size={16} /></button></div>}</> : filtered.length ? <div className="nd-grid">{filtered.map(nook => <div key={nook.id} data-nook-id={nook.id}><NookCard nook={nook} current={nook.id === currentNookId} onSelect={() => { gridScroll.current = scroller.current?.scrollTop ?? 0; lastNookId.current = nook.id; setSelected(nook); }} /></div>)}</div> : <div className="nd-empty"><img src="/images/nook-cat-logo.webp" alt="" /><h2>No nooks found just yet.</h2><p>Try “rain,” “anime,” or a subject you love.</p><button type="button" onClick={() => { setSearch(''); setCategory('all'); searchInput.current?.focus(); }}>Show all nooks<ArrowRight size={16} /></button></div>}
          <div className="nd-create-note"><span>Have a little world in mind?</span><button type="button" onClick={() => dismiss(onCreate)}>Create your own nook<ArrowRight size={15} /></button></div>
        </>}
      </div>
      <footer className="nd-disclosure" id={disclosure}>Your private materials stay with you when you change nooks.</footer>
    </div>
  </div>;
}

export default NookDiscovery;
