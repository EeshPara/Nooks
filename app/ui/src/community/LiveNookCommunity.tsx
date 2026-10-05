import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, KeyRound, LockKeyhole, Plus, RefreshCw, Users, X } from 'lucide-react';
import { roomScenes } from '../personalization/types';
import { useModalFocus } from '../personalization/PersonalizePanel';
import { MemberAvatar, memberAvatarNames } from './NookCommunity';
import type { LiveInvite, LiveNook, LiveNooksState } from './useLiveNooks';
import { NookOwnerControls } from './NookOwnerControls';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import './LiveNookCommunity.css';

type View = 'directory' | 'members' | 'leaderboard' | 'create' | 'profile' | 'invite' | 'manage';
const minutes = (value: number) => value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`;

export function LiveNookCommunity({ live, onClose, onSelectNook, onCreateNook }: { live: LiveNooksState; onClose: () => void; onSelectNook?: (nook: LiveNook) => void; onCreateNook?:()=>void }) {
  const [view, setView] = useState<View>(live.activeNookId ? 'members' : 'directory');
  const [name, setName] = useState(live.profile?.displayName ?? '');
  const [avatar, setAvatar] = useState(live.profile?.avatar ?? 0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState<string>(roomScenes[0].id);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [inviteCode, setInviteCode] = useState('');
  const [invite, setInvite] = useState<LiveInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const createId = useRef(crypto.randomUUID()), modal = useRef<HTMLDivElement>(null), selected = useRef<string | undefined>(undefined);
  const heading = useId();
  const dismiss = useSoftDismiss(modal, onClose, { direction: 'right' });
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  useModalFocus(modal, dismiss);
  const nook = live.snapshot?.nook ?? live.nooks.find(item => item.id === live.activeNookId);
  const scene = roomScenes.find(item => item.id === nook?.roomId);
  const isOwner = nook?.role === 'owner';
  useEffect(() => {
    if (live.snapshot?.nook.id && selected.current !== live.snapshot.nook.id) {
      selected.current = live.snapshot.nook.id; onSelectNook?.(live.snapshot.nook);
    }
  }, [live.snapshot?.nook.id, onSelectNook]);
  useEffect(() => { if (live.profile) { setName(live.profile.displayName); setAvatar(live.profile.avatar); } }, [live.profile]);
  async function act(work: () => Promise<unknown>) {
    setLocalError(null);
    try { await work(); } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'This action could not be completed.'); }
  }
  async function enter(item: LiveNook) {
    await act(async () => {
      if (!item.joined) await live.join(item.id); else live.select(item.id);
      selected.current = item.id; onSelectNook?.({ ...item, joined: true }); setView('members'); setInvite(null);
    });
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      await live.create({ requestId: createId.current, title: title.trim(), description: description.trim(), roomId, visibility });
      createId.current = crypto.randomUUID(); setView('members'); setTitle(''); setDescription('');
    });
  }
  async function copy() {
    if (!invite?.token) return;
    try { await navigator.clipboard.writeText(invite.token); setCopied(true); }
    catch { setLocalError('Copy the invitation code from the field below.'); }
  }
  const error = localError ?? live.error;
  return <div className="nooks-live-overlay" {...backdrop}>
    <div className="nooks-live" ref={modal} role="dialog" aria-modal="true" aria-labelledby={heading}>
      <header className={`nooks-live-cover ${scene && view !== 'directory' ? 'has-image' : ''}`} style={scene && view !== 'directory' ? { backgroundImage: `url("${scene.image}")` } : undefined}>
        <div className="nooks-live-cover-top"><span><i /> YOUR STUDY COMPANY</span><button type="button" aria-label="Close study community" onClick={() => dismiss()}><X size={19} /></button></div>
        <h2 id={heading}>{nook && ['members', 'leaderboard', 'manage'].includes(view) ? nook.title : 'A little company. A little focus.'}</h2>
        <p>{nook && ['members', 'leaderboard', 'manage'].includes(view) ? <>{nook.visibility === 'private' ? <LockKeyhole size={13} /> : <Users size={13} />}{live.snapshot ? `${live.snapshot.onlineCount} online · ${live.snapshot.memberCount} ${live.snapshot.memberCount === 1 ? 'member' : 'members'}` : 'Refreshing this nook…'}</> : 'Find your people, or make a quiet corner of your own.'}</p>
      </header>
      <nav className="nooks-live-nav" aria-label="Community views">
        <button type="button" className={view === 'directory' ? 'is-active' : ''} onClick={() => setView('directory')}>Discover</button>
        {live.activeNookId && <><button type="button" className={view === 'members' ? 'is-active' : ''} onClick={() => setView('members')}>In this nook</button><button type="button" className={view === 'leaderboard' ? 'is-active' : ''} onClick={() => setView('leaderboard')}>Focus board</button></>}
        <button type="button" className={view === 'profile' ? 'is-active' : ''} onClick={() => setView('profile')}>Your profile</button>
        <button type="button" aria-label="Refresh study community" disabled={live.loading || live.busy} onClick={() => { setLocalError(null); void live.refresh(); }}><RefreshCw size={15} className={live.loading ? 'is-refreshing' : ''} /></button>
      </nav>
      <div className="nooks-live-scroll">
        {!live.enabled ? <div className="nooks-live-empty"><LockKeyhole size={28} /><h3>Connect your study account.</h3><p>Community opens with your connected production account.</p></div> : <>
          {error && <div className="nooks-live-error" role="alert"><span>{error}</span><button type="button" disabled={live.loading || live.busy} onClick={() => { setLocalError(null); void live.refresh(); }}>Try again</button></div>}
          {view === 'directory' && <>
            <div className="nooks-live-intro"><div><h3>Find a place to settle in.</h3><p>Public spaces and your invitation-only corners.</p></div><button type="button" className="nooks-live-primary" disabled={live.busy} onClick={() => onCreateNook ? onCreateNook() : setView('create')}><Plus size={14} />Make a nook</button></div>
            <div className="nooks-live-filters" aria-label="Filter study nooks"><button type="button" aria-pressed={!live.directory.joinedOnly} disabled={live.busy} onClick={() => live.browse(0, false)}>All nooks</button><button type="button" aria-pressed={live.directory.joinedOnly} disabled={live.busy} onClick={() => live.browse(0, true)}>Joined</button></div>
            {live.loading && !live.nooks.length ? <p className="nooks-live-empty">Looking for study company…</p> : !live.nooks.length ? <div className="nooks-live-empty"><Users size={27} /><h3>It starts with someone.</h3><p>No study nooks here yet. Create one, or accept an invitation from a friend.</p></div> : <div className="nooks-live-cards">{live.nooks.map(item => {
              const art = roomScenes.find(candidate => candidate.id === item.roomId);
              return <button type="button" className="nooks-live-card" key={item.id} disabled={live.busy} onClick={() => void enter(item)}>
                {art ? <img src={art.image} alt="" loading="lazy" /> : <div className="nooks-live-card-blank" />}
                <span className="nooks-live-card-kind">{item.visibility === 'private' ? <><LockKeyhole size={11} />Private</> : item.joined ? 'Joined' : 'Public'}</span>
                <strong>{item.title}</strong><span>{item.description || 'A little space to study together.'}</span><small><i />{item.onlineCount} online · {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}<ArrowRight size={13} /></small>
              </button>;
            })}</div>}
            {(live.directory.offset > 0 || live.directory.hasMore) && <div className="nooks-live-pagination" aria-label="Nook directory pages"><button type="button" disabled={live.loading || live.busy || live.directory.offset === 0} onClick={() => live.browse(Math.max(0, live.directory.offset - 50))}>Previous</button><span>Page {live.directory.offset / 50 + 1}</span><button type="button" disabled={live.loading || live.busy || !live.directory.hasMore} onClick={() => live.browse(live.directory.offset + 50)}>Next</button></div>}
            <button type="button" className="nooks-live-text" onClick={() => { setInvite(null); setView('invite'); }}><KeyRound size={14} />I have an invitation</button>
          </>}
          {(view === 'members' || view === 'leaderboard') && <>
            {!live.snapshot ? <div className="nooks-live-empty"><Users size={25} /><h3>{live.loading ? 'Opening this nook…' : 'This nook is unavailable.'}</h3><p>{live.loading ? 'Getting the current members and focus board.' : 'Refresh, or choose another study nook.'}</p></div> : <>
              <div className="nooks-live-intro"><div><h3>{view === 'members' ? 'Together, at your own pace.' : 'Time well spent.'}</h3><p>{view === 'members' ? 'Your study profile is visible here. Your notes stay private.' : 'Completed focus time verified by the server, in this nook.'}</p></div></div>
              <ul className="nooks-live-members">{(view === 'members' ? live.snapshot.members : live.snapshot.leaderboard).map(member => <li key={member.id}>
                {view === 'leaderboard' && <span className="nooks-live-rank">{'rank' in member ? member.rank : ''}</span>}
                <MemberAvatar index={member.avatar} size={43} /><span className="nooks-live-member-copy"><strong>{member.displayName}</strong><small>{'online' in member ? <><i className={member.online ? 'is-online' : ''} />{member.online ? 'Here now' : 'Away'}{member.role === 'owner' && ' · Host'}</> : 'Completed focus in this nook'}</small></span>
                <span className="nooks-live-member-time"><strong>{minutes(member.focusMinutes)}</strong><small>focused</small></span>
              </li>)}</ul>
              {!live.snapshot.members.length && <p className="nooks-live-empty">No current members to display.</p>}
              {live.snapshot.memberCount > live.snapshot.members.length && <p className="nooks-live-limit">Showing the first {live.snapshot.members.length} members. Focus board shows the top 50.</p>}
              <div className="nooks-live-actions">{isOwner && <button type="button" disabled={live.busy} onClick={() => setView('manage')}>Manage nook</button>}{isOwner ? <button type="button" disabled={live.busy} onClick={() => void act(async () => { setInvite(await live.createInvite(live.snapshot!.nook.id)); setCopied(false); setView('invite'); })}><KeyRound size={14} />Invite a friend</button> : <button type="button" disabled={live.busy} onClick={() => void act(async () => { await live.leave(live.snapshot!.nook.id); setView('directory'); })}>Leave this nook</button>}</div>
            </>}
          </>}
          {view === 'manage' && nook && isOwner && <NookOwnerControls key={nook.id} live={live} nook={nook} onInvite={value => { setInvite(value); setCopied(false); setView('invite'); }} onArchived={() => { setInvite(null); setView('directory'); }} />}
          {view === 'profile' && <form className="nooks-live-form" onSubmit={event => { event.preventDefault(); void act(async () => { await live.updateProfile(name.trim(), avatar); setView(live.activeNookId ? 'members' : 'directory'); }); }}>
            <h3>A familiar face in your nooks.</h3><p>Choose the name and little character other members will see. Your notes and private study library are never part of this profile.</p>
            <label>Display name<input value={name} maxLength={28} required placeholder="What should we call you?" onChange={event => setName(event.target.value)} /></label>
            <fieldset><legend>Your illustrated avatar</legend><div className="nooks-live-avatars">{memberAvatarNames.map((label, index) => <button type="button" aria-label={label} aria-pressed={avatar === index} key={label} onClick={() => setAvatar(index)}><MemberAvatar index={index} size={49} />{avatar === index && <Check size={13} />}</button>)}</div></fieldset>
            <button className="nooks-live-primary" type="submit" disabled={live.busy || !name.trim()}>Save your profile</button>
          </form>}
          {view === 'create' && <form className="nooks-live-form" onSubmit={event => void create(event)}>
            <button className="nooks-live-text" type="button" onClick={() => setView('directory')}><ArrowLeft size={13} />Back to your nooks</button><h3>A nook of your own.</h3><p>Start with an invitation-only space. Choose public if you want other students to discover it.</p>
            <label>Nook name<input value={title} required maxLength={54} placeholder="The quiet chapter club" onChange={event => setTitle(event.target.value)} /></label>
            <label>A little introduction<textarea value={description} maxLength={220} rows={3} placeholder="Who is this little corner for?" onChange={event => setDescription(event.target.value)} /></label>
            <label>Your starting view<select value={roomId} onChange={event => setRoomId(event.target.value)}>{roomScenes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label>Who can find it?<select value={visibility} onChange={event => setVisibility(event.target.value as 'private' | 'public')}><option value="private">Invitation only</option><option value="public">Public — discoverable by other students</option></select></label>
            <button className="nooks-live-primary" type="submit" disabled={live.busy || !title.trim()}>{visibility === 'public' ? 'Create a public nook' : 'Create a private nook'}</button>
          </form>}
          {view === 'invite' && <div className="nooks-live-form"><button className="nooks-live-text" type="button" onClick={() => setView(live.activeNookId ? 'members' : 'directory')}><ArrowLeft size={13} />Back</button>
            {invite ? <><h3>A little invitation.</h3><p>This one-use code expires {new Date(invite.expiresAt).toLocaleString()}. Share it only with the person you want in your nook.</p><label>Invitation code<input readOnly value={invite.token} onFocus={event => event.target.select()} /></label><button className="nooks-live-primary" type="button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy invitation'}</button></> : <form onSubmit={event => { event.preventDefault(); void act(async () => { await live.acceptInvite(inviteCode.trim()); setInviteCode(''); setView('members'); }); }}><h3>Someone saved you a seat.</h3><p>Paste the invitation code your friend shared.</p><label>Invitation code<input value={inviteCode} required autoComplete="off" maxLength={256} onChange={event => setInviteCode(event.target.value)} /></label><button className="nooks-live-primary" type="submit" disabled={live.busy || !inviteCode.trim()}>Accept invitation</button></form>}
          </div>}
        </>}
      </div>
      <footer className="nooks-live-footer"><span><i />{live.busy ? 'Saving your changes…' : live.loading ? 'Refreshing…' : live.updatedAt ? 'Updated while you are here · every 20 seconds' : 'Only real account activity appears here'}</span><small>Your study library stays private.</small></footer>
    </div>
  </div>;
}
