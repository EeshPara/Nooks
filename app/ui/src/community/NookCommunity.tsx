import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronRight, LockKeyhole, UnlockKeyhole, X } from 'lucide-react';
import type { RoomScene } from '../personalization/types';
import { useModalFocus } from '../personalization/PersonalizePanel';
import { getRoomRewards } from '../world/RoomJourney';
import { RewardDrawing } from '../world/RewardDrawing';
import { getPublicNook } from './nookCatalog';
import { formatStudyTime, getNookMembers, memberAvatarCount, memberAvatarNames, type NookMember } from './memberData';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import './NookCommunity.css';

export { memberAvatarCount, memberAvatarNames } from './memberData';

const avatarTones = ['#f3e1db', '#f1dec4', '#e9e1d1', '#f2ddd7', '#e5e0ed', '#e2e8d9', '#f1e5cc', '#e4e7ed'];
const demoStartedAt = Date.now();

function sampleSessionSeconds(member: NookMember, elapsed = Math.floor((Date.now() - demoStartedAt) / 1000)) {
  return member.sessionSeconds + (member.status === 'focusing' ? elapsed : 0);
}

export function MemberAvatar({ index, size = 44 }: { index: number; size?: number }) {
  const cell = ((Math.floor(Number.isFinite(index) ? index : 0) % memberAvatarCount) + memberAvatarCount) % memberAvatarCount;
  return <span className="nooks-member-avatar" style={{ width: size, height: size, backgroundColor: avatarTones[cell] } as CSSProperties} role="img" aria-label={memberAvatarNames[cell]}><span style={{ backgroundPosition: `${cell % 4 / 3 * 100}% ${cell < 4 ? 0 : 100}%` }} /></span>;
}

function SessionClock({ member }: { member: NookMember }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - demoStartedAt) / 1000));
  useEffect(() => {
    if (member.status !== 'focusing') return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - demoStartedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [member.status]);
  const seconds = sampleSessionSeconds(member, elapsed);
  return <span className="nooks-session-clock" aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds in this sample session`}>{String(Math.floor(seconds / 60)).padStart(2, '0')}<span>:</span>{String(seconds % 60).padStart(2, '0')}</span>;
}

function PresenceFaces({ members, motion }: { members: NookMember[]; motion: boolean }) {
  const faceIndexes = useRef([0, 1, 2]);
  const nextPerson = useRef(3);
  const nextSlot = useRef(0);
  const [display, setDisplay] = useState<{ indexes: number[]; outgoing: { slot: number; index: number } | null }>({ indexes: [0, 1, 2], outgoing: null });
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval: number | undefined;
    let fadeTimeout: number | undefined;
    function clearTimers() { window.clearInterval(interval); window.clearTimeout(fadeTimeout); }
    function syncActivity() {
      clearTimers();
      setDisplay(current => current.outgoing ? { ...current, outgoing: null } : current);
      if (!motion || reducedMotion.matches || document.hidden || members.length <= 3) return;
      interval = window.setInterval(() => {
        const slot = nextSlot.current;
        let incoming = nextPerson.current % members.length;
        while (faceIndexes.current.includes(incoming)) incoming = (incoming + 1) % members.length;
        const outgoing = { slot, index: faceIndexes.current[slot] };
        const indexes = [...faceIndexes.current];
        indexes[slot] = incoming;
        faceIndexes.current = indexes;
        nextPerson.current = (incoming + 1) % members.length;
        nextSlot.current = (slot + 1) % 3;
        setDisplay({ indexes, outgoing });
        fadeTimeout = window.setTimeout(() => setDisplay(current => ({ ...current, outgoing: null })), 900);
      }, 12000);
    }
    syncActivity();
    document.addEventListener('visibilitychange', syncActivity);
    reducedMotion.addEventListener('change', syncActivity);
    return () => { clearTimers(); document.removeEventListener('visibilitychange', syncActivity); reducedMotion.removeEventListener('change', syncActivity); };
  }, [members, motion]);
  return <span className="nooks-presence-faces" aria-hidden="true">{display.indexes.map((index, slot) => <span className="nooks-presence-portrait" key={slot}><span className={display.outgoing?.slot === slot ? 'is-arriving' : undefined}><MemberAvatar index={members[index].avatar} size={27} /></span>{display.outgoing?.slot === slot && <span className="is-departing"><MemberAvatar index={members[display.outgoing.index].avatar} size={27} /></span>}</span>)}</span>;
}

export function NookPresenceTab({ scene, onClick, motion = true }: { scene: RoomScene; onClick: () => void; motion?: boolean }) {
  const members = useMemo(() => getNookMembers(scene.id), [scene.id]);
  return <button className="nooks-presence-tab" type="button" onClick={onClick} aria-label={`See people in ${scene.title}, ${members.length} sample profiles`}><PresenceFaces key={scene.id} members={members} motion={motion} /><span className="nooks-presence-copy"><strong>Study together</strong><small>Preview</small></span><ChevronRight size={12} aria-hidden="true" /></button>;
}

function ProfileDetail({ member, rank, scene, onBack }: { member: NookMember; rank: number; scene: RoomScene; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const rewards = getRoomRewards(scene.id).rewards;
  const earned = rewards.filter(reward => member.totalMinutes >= reward.minutes);
  const maxDay = Math.max(...member.weeklyMinutes, 1);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [member.id]);
  return <div className="nooks-member-detail" key={member.id}>
    <button type="button" className="nooks-community-back" onClick={onBack}><ArrowLeft size={15} /> Everyone in this nook</button>
    <div className="nooks-member-identity"><MemberAvatar index={member.avatar} size={96} /><div><span className="nooks-member-status"><i className={member.status === 'focusing' ? 'is-focusing' : ''} />{member.status === 'focusing' ? 'In a focus session' : 'Taking a little break'}</span><h3 tabIndex={-1} ref={heading}>{member.name}</h3><p>{member.subject}</p></div></div>
    <div className="nooks-profile-session"><div><span>{member.status === 'focusing' ? 'Current focus' : 'Last focus session'}</span><SessionClock member={member} /><small>Sample session</small></div><div className="nooks-profile-rank"><span>#{rank}</span><p>in this nook’s<br />sample standings</p></div></div>
    <dl className="nooks-member-statline"><div><dt>Completed focus</dt><dd>{formatStudyTime(member.totalMinutes)}</dd></div><div><dt>Current streak</dt><dd>{member.streak}<small> days</small></dd></div><div><dt>Study sessions</dt><dd>{member.sessions}</dd></div></dl>
    <section className="nooks-member-week" aria-label="Sample focus history"><header><h4>Focus this week</h4><span>Past 7 days</span></header><div className="nooks-week-bars">{member.weeklyMinutes.map((minutes, index) => <div key={index} title={`${index === 6 ? 'Today' : `${6 - index} days ago`}: ${minutes} focus minutes`}><div><span style={{ height: `${Math.max(3, minutes / maxDay * 100)}%` }} /></div><small>{index === 6 ? 'Today' : `${6 - index}d`}</small></div>)}</div></section>
    <section className="nooks-member-collection"><header><div><h4>Collected in this nook</h4><p>Unlocked with completed focus time.</p></div><span>{earned.length}/{rewards.length}</span></header><div>{rewards.map(reward => { const unlocked = member.totalMinutes >= reward.minutes; return <div className={unlocked ? 'is-unlocked' : 'is-unearned'} key={reward.id}><RewardDrawing art={reward.art} size={76} alt={unlocked ? reward.name : ''} /><strong>{unlocked ? reward.name : 'Still to discover'}</strong><small>{unlocked ? 'Unlocked' : `${reward.minutes} focus minutes`}</small></div>; })}</div></section>
  </div>;
}

export function NookCommunity({ scene, onClose, profile, localDraft = false, pendingInvite = false, onConnect }: { scene: RoomScene; onClose: () => void; profile: { name: string; avatar: number }; localDraft?: boolean; pendingInvite?: boolean; onConnect?: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const dismiss = useSoftDismiss(dialog, onClose, { direction: 'right' });
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  const scroller = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const heading = useId();
  const description = useId();
  const memberButtons = useRef(new Map<string, HTMLButtonElement>());
  const [tab, setTab] = useState<'studying' | 'leaderboard'>('studying');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewPrivate, setPreviewPrivate] = useState(localDraft);
  const [showInvite, setShowInvite] = useState(false);
  useEffect(() => { setPreviewPrivate(localDraft); setShowInvite(false); }, [scene.id, localDraft]);
  const members = useMemo(() => getNookMembers(scene.id), [scene.id]);
  const ranked = useMemo(() => [...members].sort((a, b) => b.totalMinutes - a.totalMinutes), [members]);
  const selected = members.find(member => member.id === selectedId);
  const nook = getPublicNook(scene.id);
  const rewards = getRoomRewards(scene.id).rewards;
  function backToMembers() {
    const previous = selectedId;
    setSelectedId(null);
    requestAnimationFrame(() => { scroller.current?.scrollTo({ top: listScroll.current }); if (previous) memberButtons.current.get(previous)?.focus({ preventScroll: true }); });
  }
  useModalFocus(dialog, () => { if (showInvite) setShowInvite(false); else if (selectedId) backToMembers(); else dismiss(); });
  useEffect(() => { if (selectedId) scroller.current?.scrollTo({ top: 0 }); }, [selectedId]);
  function showMember(id: string) { listScroll.current = scroller.current?.scrollTop ?? 0; setSelectedId(id); }
  function selectTab(next: typeof tab) { setShowInvite(false); setTab(next); setSelectedId(null); scroller.current?.scrollTo({ top: 0 }); }
  return <div className="nooks-community-overlay" {...backdrop}>
    <div className="nooks-community" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={heading} aria-describedby={description} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <header className="nooks-community-cover"><div className="nooks-community-cover-top"><button type="button" aria-label="Close nook community" onClick={() => dismiss()}><X size={18} /></button></div><div className="nooks-community-cover-copy"><h2 id={heading}>{scene.title}</h2><div className="nooks-privacy-row"><button type="button" className={`nooks-privacy-pill ${previewPrivate ? 'is-private' : ''}`} aria-label={`Nook is ${previewPrivate ? 'private' : 'public'}, change preview privacy`} aria-pressed={previewPrivate} title="Preview nook privacy" onClick={() => { setPreviewPrivate(value => !value); setShowInvite(false); }}>{previewPrivate ? 'Private' : 'Public'}{previewPrivate ? <LockKeyhole size={10} /> : <UnlockKeyhole size={10} />}</button><span className="nooks-people-count"><i />{localDraft ? 1 : members.length} people</span></div><p id={description} className="nooks-community-preview-label">{localDraft ? 'Local preview' : 'Design preview · Connect your account for live people and private invitations'}</p></div></header>
      {!pendingInvite && <nav className="nooks-community-tabs" aria-label="Nook community views">{(['studying', 'leaderboard'] as const).map(value => <button type="button" key={value} aria-current={tab === value && !selected && !showInvite ? 'page' : undefined} className={tab === value && !selected && !showInvite ? 'is-active' : ''} onClick={() => selectTab(value)}>{value === 'studying' ? 'People' : 'Leaderboard'}<span>{value === 'studying' ? (localDraft ? 1 : members.length) : 'Preview'}</span></button>)}{previewPrivate && <button type="button" className="nooks-community-invite-tab" onClick={() => { setShowInvite(true); setSelectedId(null); }}>Invite</button>}</nav>}
      <div className="nooks-community-scroll" ref={scroller}>
        {showInvite ? <div className="nooks-community-invite-panel"><button type="button" className="nooks-community-back" onClick={() => setShowInvite(false)}><ArrowLeft size={15} />Back to people</button><h3>Invite a friend.</h3><p>Connect your account to create a secure, copyable invitation link for your private nook.</p><button type="button" className="nooks-community-connect" onClick={onConnect}>Connect account</button><small>This design preview does not change a live room’s privacy.</small></div> : pendingInvite ? <div className="nooks-local-community"><h3>Someone saved you a seat.</h3><p>Connect your study account to accept this invitation. Your invitation stays available while you sign in.</p><button type="button" className="nooks-privacy-pill" onClick={onConnect}>Connect account</button></div> : localDraft ? <div className="nooks-local-community"><MemberAvatar index={profile.avatar} size={100} /><h3>It starts with you, {profile.name || 'friend'}.</h3><p>Your local nook preview. Publishing and invites come later.</p><span>A place for your people, when you’re ready.</span></div> : selected ? <ProfileDetail member={selected} rank={ranked.findIndex(member => member.id === selected.id) + 1} scene={scene} onBack={backToMembers} /> : <div className="nooks-community-list-panel" key={tab}>
          <div className="nooks-community-intro"><h3>{tab === 'studying' ? 'People in this nook' : 'Leaderboard'}</h3><p>{tab === 'studying' ? 'Meet the sample community. Tap someone to see their study profile.' : 'Sample rankings by completed focus time in this nook.'}</p>{tab === 'studying' && <div className="nooks-community-audiences">{nook?.audiences.slice(0, 3).map(audience => <span key={audience}>{audience}</span>)}</div>}</div>
          {tab === 'leaderboard' && <div className="nooks-leaderboard-labels"><span>Sample standings · {members.length} profiles</span><span>Focus time</span></div>}
          <ol className={`nooks-member-list ${tab === 'leaderboard' ? 'is-leaderboard' : ''}`} aria-label={tab === 'studying' ? 'Sample students in this nook' : 'Sample nook leaderboard'}>{(tab === 'studying' ? members : ranked).map((member, index) => {
            const earned = rewards.filter(reward => member.totalMinutes >= reward.minutes);
            return <li key={member.id}><button type="button" ref={element => { if (element) memberButtons.current.set(member.id, element); else memberButtons.current.delete(member.id); }} onClick={() => showMember(member.id)} aria-label={`View ${member.name}'s sample study profile`}>
              {tab === 'leaderboard' && <span className={`nooks-member-rank ${index < 3 ? 'is-top' : ''}`}>{String(index + 1).padStart(2, '0')}</span>}
              <span className="nooks-member-face-wrap"><MemberAvatar index={member.avatar} size={50} />{tab === 'studying' && <i className={member.status === 'focusing' ? 'is-focusing' : ''} />}</span>
              <span className="nooks-member-row-copy"><strong>{member.name}</strong><small>{tab === 'studying' ? member.subject : `${earned.length} keepsakes · ${member.streak}-day streak`}</small></span>
              <span className="nooks-member-row-meta">{tab === 'studying' ? <><span>{member.status === 'focusing' ? `${Math.floor(sampleSessionSeconds(member) / 60)} min in` : 'On a break'}</span><small>{earned.length} collected</small></> : <><strong>{formatStudyTime(member.totalMinutes)}</strong><span className="nooks-member-mini-prize">{earned.at(-1) && <RewardDrawing art={earned.at(-1)!.art} size={28} />}</span></>}</span>
              <ChevronRight className="nooks-member-row-arrow" size={14} aria-hidden="true" />
            </button></li>;
          })}</ol>
          <p className="nooks-community-sample-note">These profiles, sessions, and rankings are examples. Your own study progress is separate.</p>
        </div>}
      </div>
      <footer className="nooks-community-footer"><MemberAvatar index={profile.avatar} size={40} /><div><strong>{profile.name || 'You'} <span>you</span></strong><p>Your own focus and keepsakes stay yours.</p></div><span className="nooks-community-footer-note">Unranked<br /><small>Preview</small></span></footer>
    </div>
  </div>;
}
