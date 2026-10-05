import { useEffect, useState } from 'react';
import { Check, Clock3, Sparkles, Sprout, Star } from 'lucide-react';
import { defaultSpace, getRoomScene, getSpaceStyle, WorkspaceSpace } from './types';
import './Personalization.css';

export function Companion({ companion, small = false }: { companion: WorkspaceSpace['companion']; small?: boolean }) {
  const [message, setMessage] = useState('');
  const [pets, setPets] = useState(0);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3500); return () => window.clearTimeout(timer); }, [message]);
  if (companion === 'none') return null;
  const phrases = ['One little step is enough.', 'A stretch break is a good idea.', 'I’m rooting for you.', 'Water, a deep breath, then one more idea.', 'Your progress is growing.'];
  return <div className={`space-companion-wrap ${small ? 'is-small' : ''}`}><button className={`space-companion pet-${companion} ${message ? 'is-petted' : ''}`} aria-label={companion === 'sleepy-dog' ? 'Pet your sleepy study dog' : companion === 'cat' ? 'Say hello to your study cat' : 'Encourage your little sprout'} onClick={() => { setPets(value => value + 1); setMessage(phrases[pets % phrases.length]); }}>
    {companion === 'sleepy-dog' ? <><img src="/images/sleeping-dog.webp" alt="Sleepy golden study dog" /><span className="pet-zzz" aria-hidden="true">z <span>z</span></span></> : companion === 'sprout' ? <span className="space-vector-pot"><Sprout size={small ? 43 : 69} strokeWidth={1.3} /><span /></span> : <><img src="/images/study-cat.webp" alt="Sleepy cream and slate study cat with a mint book" /><span className="pet-zzz" aria-hidden="true">z <span>z</span></span></>}
    {message && <span className="pet-heart" aria-hidden="true">♡</span>}
  </button>{message && <span className="pet-speech" role="status">{message}</span>}</div>;
}

export function SpaceScene({ space = defaultSpace, miniature = false, showCards = true }: { space?: WorkspaceSpace; miniature?: boolean; showCards?: boolean }) {
  const room = getRoomScene(space);
  return <div className={`space-scene theme-${space.theme} ${miniature ? 'is-miniature' : ''} layout-${space.layout}`} style={getSpaceStyle(space)}>
    <div className="space-scene-room" style={{ backgroundImage: `url("${room.image}")` }}>
      <span className="space-room-caption">{room.title}</span>
    </div>
    <div className="space-scene-heading"><span className="space-eyebrow">YOUR STUDY NOOK</span><h2>{space.name || 'My study nook'}</h2><p>{space.tagline || defaultSpace.tagline}</p></div>

  </div>;
}

export { defaultSpace, getSpaceStyle } from './types';
