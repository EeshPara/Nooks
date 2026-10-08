import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Heart, Plus, Search, X } from 'lucide-react';
import type { RoomCategory, RoomScene } from '../personalization/types';
import { getRoomRewards } from '../world/RoomJourney';
import { RewardDrawing } from '../world/RewardDrawing';
import { allPublicNooks, publicNooks, getPublicNook, type PublicNook, type NookDraft } from './nookCatalog';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import { consumeDismissEscape, isTopmostDismissTarget } from '../world/dismissal';
import { savedNooksLabel, useStudioDraftListing } from './studioDraftListing';
import type { OrganizationTool } from '../organization/types';
import './NookDiscovery.css';

export interface NookDiscoveryProps {
  currentNookId: string;
  favoritesScope: string;
  onClose: () => void;
  onJoin: (scene: RoomScene) => void;
  onCreate: () => void;
  onCommunity?: () => void;
  drafts?: NookDraft[];
  onTool: OrganizationTool;
  isCurrentOwner: () => boolean;
  onOpenStudioDraft: (id: string) => void;
  onJoinDraft?: (draft: NookDraft) => void;
}

const categories: { id: RoomCategory | 'all' | 'creators' | 'mine'; label: string }[] = [
  { id: 'all', label: 'All nooks' }, { id: 'cozy', label: 'Cozy corners' },
  { id: 'nature', label: 'In nature' }, { id: 'city', label: 'City escapes' },
  { id: 'elsewhere', label: 'Somewhere else' }, 
  { id: 'mine', label: 'My Nooks' },
];

function StudyingCount({ count }: { count: number }) {
  return <span className="nd-studying"><i aria-hidden="true" />{count} studying</span>;
}

function NookCard({ nook, current, favorite, onFavorite, onSelect }: { nook: PublicNook; current: boolean; favorite: boolean; onFavorite: () => void; onSelect: () => void }) {
  return <div className="nd-card">
    <button type="button" className="nd-card-open" onClick={onSelect} aria-label={`Explore ${nook.title}`}>
      <span className="nd-card-image"><img src={nook.scene.thumbnail ?? nook.scene.image} alt="" loading="lazy" width={nook.scene.width} height={nook.scene.height}/>
        {current && <span className="nd-current"><Check size={11}/> Your current nook</span>}
        <span className="nd-card-enter" aria-hidden="true"><ArrowRight size={19}/></span>
      </span>
    </button>
    <div className="nd-card-title"><button className="nd-card-name" onClick={onSelect}><strong>{nook.title}</strong></button><button type="button" className="nd-favorite" aria-label={`Favorite ${nook.title}`} aria-pressed={favorite} onClick={onFavorite}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true"/></button></div>
    <span className="nd-card-caption">{nook.scene.caption}</span>
    <span className="nd-card-bottom"><span>{nook.audiences.slice(0, 2).join(' · ')}</span><span>by Nooks</span></span>
  </div>;
}

function readFavorites(key: string): string[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && allPublicNooks.some(nook => nook.id === id)))] : []; } catch { return []; }
}

function NookDetail({ nook, current, onJoin, headingId }: { nook: PublicNook; current: boolean; onJoin: () => void; headingId: string }) {
  const rewards = getRoomRewards(nook.id);
  const revealed = rewards.rewards.filter(reward => !reward.surprise).slice(0, 3);
  return <div className="nd-detail">
    <div className="nd-detail-image"><img src={nook.scene.image} alt={`${nook.title} study nook`} /><span className="nd-image-caption">{nook.scene.caption}</span></div>
    <div className="nd-detail-body">
      <div className="nd-detail-copy"><div className="nd-detail-byline"><span>STUDY NOOK</span></div><h2 id={headingId}>{nook.title}</h2><p>{nook.description}</p>
        <div className="nd-audiences" aria-label="People who study here">{nook.audiences.map(audience => <span key={audience}>{audience}</span>)}</div>
        <div className="nd-host"><img src="/images/nook-cat-logo.webp" alt="" /><div><span>Hosted by <strong>Nooks</strong></span><small>{nook.scene.fandom ? 'A fandom-inspired study space' : 'An original Nooks study space'}</small></div></div>
      </div>
      <aside className="nd-discoveries"><span className="nd-small-label">A LITTLE SOMETHING TO WORK TOWARD</span><h3>{rewards.progression === 'growth' ? 'Watch your progress grow' : 'Your next discoveries'}</h3>
        <div className="nd-rewards">{revealed.map(reward => <div key={reward.id}><RewardDrawing art={reward.art} size={72} alt="" /><strong>{reward.name}</strong><small>{reward.minutes} min of focus</small></div>)}</div>
        <p>Your collection stays in this nook. Keep studying to discover more.</p>
      </aside>
    </div>
    <div className="nd-detail-footer"><span>A place to focus.<br /><small>Your own progress to keep.</small></span><button type="button" className="nd-primary" onClick={onJoin}>{current ? 'Back to this nook' : 'Study here'}<ArrowRight size={17} /></button></div>
  </div>;
}

export function NookDiscovery({ favoritesScope, currentNookId, onClose, onJoin, onCreate, drafts = [], onJoinDraft, onCommunity, onTool, isCurrentOwner, onOpenStudioDraft }: NookDiscoveryProps) {
  const studioDrafts = useStudioDraftListing(favoritesScope, onTool, isCurrentOwner);
  const favoritesKey = `nooks:favorites:v1:${encodeURIComponent(favoritesScope)}`;
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites(favoritesKey));
  const [favoriteNotice, setFavoriteNotice] = useState('');
  useEffect(() => { setFavorites(readFavorites(favoritesKey)); setFavoriteNotice(''); }, [favoritesKey]);
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem(favoritesKey, JSON.stringify(next)); setFavoriteNotice(''); }
    catch { setFavoriteNotice('Favorites are available for this visit, but could not be saved on this device.'); }
  }
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
    return (category === 'mine' ? allPublicNooks : publicNooks).filter(nook => (category === 'all' || (category === 'mine' ? favorites.includes(nook.id) : category === 'creators' ? nook.owner.isCreator : nook.scene.category === category)) && (!term || [nook.title, nook.description, nook.scene.style, nook.scene.collection, nook.owner.name, nook.owner.handle, ...nook.audiences].join(' ').toLowerCase().includes(term)))
      .sort((a, b) => sort === 'alphabetical' ? a.title.localeCompare(b.title) : 0);
  }, [search, category, sort, favorites]);
  const filteredDrafts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return drafts.filter(draft => !term || `${draft.name} ${draft.description}`.toLowerCase().includes(term))
      .sort((a, b) => sort === 'alphabetical' ? a.name.localeCompare(b.name) : b.createdAt.localeCompare(a.createdAt));
  }, [drafts, search, sort]);
  const filteredStudioDrafts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return studioDrafts.drafts.filter(draft => !term || `${draft.title} ${draft.description}`.toLowerCase().includes(term))
      .sort((a, b) => sort === 'alphabetical' ? a.title.localeCompare(b.title) : (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
  }, [studioDrafts.drafts, search, sort]);
  const savedCount = filtered.length + filteredDrafts.length + filteredStudioDrafts.length;
  const isMine = category === 'mine';
  const nookCards = filtered.map(nook => <div key={nook.id} data-nook-id={nook.id}><NookCard nook={nook} current={nook.id === currentNookId} favorite={favorites.includes(nook.id)} onFavorite={() => toggleFavorite(nook.id)} onSelect={() => { gridScroll.current = scroller.current?.scrollTop ?? 0; lastNookId.current = nook.id; setSelected(nook); }}/></div>);

  return <div className="nd-overlay" {...backdrop}>
    <div className="nd-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={heading} aria-describedby={disclosure} tabIndex={-1}>
      <header className="nd-header"><div className="nd-header-actions">{onCommunity&&<button className="nd-create" type="button" onClick={()=>dismiss(onCommunity)}>Study together</button>}<button className="nd-close" type="button" onClick={() => dismiss()} aria-label="Close nook discovery"><X size={21}/></button></div></header>
      <div className="nd-scroll" ref={scroller}>
        {selected ? <><div className="nd-back-row"><button ref={backButton} type="button" onClick={() => setSelected(null)}><ArrowLeft size={16} />All nooks</button><span>Your work comes with you.</span></div><NookDetail nook={selected} current={selected.id === currentNookId} headingId={heading} onJoin={() => onJoin(selected.scene)} /></> : <>
          <div className="nd-intro"><h1 id={heading}>Find your next nook.</h1><p>Choose a soothing spot!</p></div>
          <div className="nd-search-row"><div className="nd-search"><Search size={19} aria-hidden="true" /><input ref={searchInput} aria-label="Search public nooks" type="search" placeholder="Search rain, garden, anime…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear nook search" onClick={() => { setSearch(''); searchInput.current?.focus(); }}><X size={17} /></button>}</div><button type="button" className="nd-create-circle" aria-label="Create a nook" title="Create a nook" onClick={() => dismiss(onCreate)}><Plus size={22} aria-hidden="true"/></button></div>
          <nav className="nd-categories" aria-label="Nook categories">{categories.map(item => <button type="button" key={item.id} aria-pressed={item.id === category} onClick={() => setCategory(item.id)}>{item.label}</button>)}</nav>
          <div className="nd-results-heading"><span aria-live="polite">{isMine ? savedNooksLabel(savedCount, studioDrafts.status) : `${filtered.length} ${filtered.length === 1 ? 'nook' : 'nooks'}`}</span><label>Sort by<select aria-label="Sort public nooks" value={sort} onChange={event => setSort(event.target.value)}><option value="popular">{isMine ? 'Recently created' : 'Curated'}</option><option value="alphabetical">Name</option></select></label></div>
          {isMine ? <><p className="nd-local-note">Private drafts for this workspace, alongside favorites and earlier nooks saved on this device.</p>{studioDrafts.status === 'loading' && <p className="nd-local-note" role="status">Loading your private drafts…</p>}{studioDrafts.status === 'error' && <div className="nd-drafts-status" role="alert"><p>{studioDrafts.error}</p><button type="button" onClick={studioDrafts.retry}>Retry saved drafts</button></div>}{savedCount ? <div className="nd-grid">{nookCards}{filteredStudioDrafts.map(draft => {
            const scene = draft.artworkMode === 'curated' && !draft.hasArtwork ? getPublicNook(draft.roomId)?.scene : undefined;
            return <button type="button" className="nd-card nd-draft" key={`studio:${draft.id}`} aria-label={`Open ${draft.title} in Studio`} onClick={() => dismiss(() => onOpenStudioDraft(draft.id))}><span className="nd-card-image">{scene ? <img src={scene.thumbnail ?? scene.image} alt="" loading="lazy" /> : <span className="nd-custom-art">Custom artwork</span>}<span className="nd-current">Private draft</span><span className="nd-card-enter" aria-hidden="true"><ArrowRight size={19}/></span></span><span className="nd-card-title"><strong>{draft.title}</strong></span><span className="nd-card-caption">{draft.description || 'Your own little study world.'}</span><span className="nd-card-bottom">Open in Studio</span></button>;
          })}{filteredDrafts.map(draft => {
            const base = getPublicNook(draft.sceneId) ?? publicNooks[0];
            return <button type="button" className="nd-card nd-draft" key={draft.id} aria-label={`Preview your nook ${draft.name}`} onClick={() => onJoinDraft ? onJoinDraft(draft) : onJoin(base.scene)}><span className="nd-card-image"><img src={base.scene.thumbnail ?? base.scene.image} alt="" loading="lazy" /><span className="nd-current">Private nook draft</span><span className="nd-card-enter" aria-hidden="true"><ArrowRight size={19} /></span></span><span className="nd-card-title"><strong>{draft.name}</strong><span className="nd-draft-label">Preview</span></span><span className="nd-card-caption">{draft.description || 'Your own little study world.'}</span><span className="nd-card-bottom">Created by you · Saved locally</span></button>;
          })}</div> : studioDrafts.status === 'ready' ? <div className="nd-empty"><img src="/images/nook-cat-logo.webp" alt="" /><h2>{search ? 'No matching Nooks.' : 'Your favorite Nooks belong here.'}</h2><p>{search ? 'Try another name, or create a new nook.' : 'Tap a heart to save a favorite, or create a nook of your own.'}</p><button type="button" onClick={() => dismiss(onCreate)}>Create a nook<ArrowRight size={16} /></button></div> : null}</> : filtered.length ? <div className="nd-grid">{nookCards}</div> : <div className="nd-empty"><img src="/images/nook-cat-logo.webp" alt="" /><h2>No nooks found just yet.</h2><p>Try “rain,” “anime,” or a subject you love.</p><button type="button" onClick={() => { setSearch(''); setCategory('all'); searchInput.current?.focus(); }}>Show all nooks<ArrowRight size={16} /></button></div>}
          {favoriteNotice && <p className="nd-local-note" role="status">{favoriteNotice}</p>}
          <div className="nd-create-note"><span>Have a little world in mind?</span><button type="button" onClick={() => dismiss(onCreate)}>Create your own nook<ArrowRight size={15} /></button></div>
        </>}
      </div>
      <footer className="nd-disclosure" id={disclosure}>Your private materials stay with you when you change nooks.</footer>
    </div>
  </div>;
}

export default NookDiscovery;
