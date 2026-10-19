import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { MemberAvatar } from './NookCommunity';
import './StudyPresencePill.css';

export interface StudyPresenceMember {
  id: string;
  avatar: number;
  displayName: string;
  online: boolean;
}

export interface StudyPresencePillProps {
  sceneTitle: string;
  members?: StudyPresenceMember[];
  onlineCount?: number;
  connected: boolean;
  communityAvailable?: boolean;
  onClick: () => void;
  motion?: boolean;
}

const sampleAvatars = [0, 1, 2];

/** A compact entry to the community. Sample portraits never imply live presence. */
export function StudyPresencePill({ sceneTitle, members = [], onlineCount, connected, communityAvailable = false, onClick, motion = true }: StudyPresencePillProps) {
  const onlineMembers = useMemo(() => {
    const seen = new Set<string>();
    return members.filter(member => member.online && !seen.has(member.id) && seen.add(member.id));
  }, [members]);
  // Polls can replace member objects without changing who is online. Keep the
  // rotation cadence stable so it feels quiet even when presence updates often.
  const rosterKey = JSON.stringify(onlineMembers.map(member => member.id));
  const [faceIds, setFaceIds] = useState<string[]>([]);

  useEffect(() => {
    const ids: string[] = JSON.parse(rosterKey);
    let currentIds = ids.slice(0, 3);
    setFaceIds(currentIds);
    let nextPerson = 3;
    let nextSlot = 0;
    let timer: number | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      window.clearInterval(timer);
      if (!connected || !motion || reducedMotion.matches || document.hidden || ids.length <= 3) return;
      timer = window.setInterval(() => {
        const slot = nextSlot;
        nextSlot = (nextSlot + 1) % 3;
        let incoming = nextPerson % ids.length;
        while (currentIds.includes(ids[incoming])) incoming = (incoming + 1) % ids.length;
        nextPerson = (incoming + 1) % ids.length;
        currentIds = currentIds.map((id, index) => index === slot ? ids[incoming] : id);
        setFaceIds(currentIds);
      }, 12000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
    };
  }, [rosterKey, connected, motion, sceneTitle]);

  const visibleMembers = (faceIds.length ? faceIds : onlineMembers.slice(0, 3).map(member => member.id))
    .map(id => onlineMembers.find(member => member.id === id)).filter((member): member is StudyPresenceMember => !!member);
  const count = Number.isFinite(onlineCount) && onlineCount! >= 0 ? Math.floor(onlineCount!) : onlineMembers.length;
  const displayedCount = connected ? count : undefined;
  const label = displayedCount === undefined ? 'Study together' : `${displayedCount.toLocaleString()} ${displayedCount === 1 ? 'person' : 'people'}`;

  return <button
    type="button"
    className={`study-presence-pill${connected ? ' is-connected' : ' is-preview'}${motion ? '' : ' is-still'}`}
    onClick={onClick}
    aria-label={connected ? `See people in ${sceneTitle}, ${label}` : communityAvailable ? 'Find a study nook to join' : `Explore the community preview for ${sceneTitle}`}
    aria-haspopup="dialog"
  >
    {(!connected || visibleMembers.length > 0) && <span className="study-presence-pill__faces" aria-hidden="true">
      {connected ? visibleMembers.map((member, index) => <span className="study-presence-pill__portrait" key={index}><span key={member.id}><MemberAvatar index={member.avatar} size={29} /></span></span>) : sampleAvatars.map(avatar => <span className="study-presence-pill__portrait" key={avatar}><span><MemberAvatar index={avatar} size={29} /></span></span>)}
    </span>}
    <span className="study-presence-pill__copy"><strong>{label}</strong><small>{sceneTitle}</small></span>
    <ChevronRight size={12} aria-hidden="true" />
  </button>;
}
