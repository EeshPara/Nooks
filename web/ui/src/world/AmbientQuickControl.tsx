import { Pause, Play, VolumeX } from 'lucide-react';
import { useSoundSources } from './soundPlayback';
export function AmbientQuickControl({ onOpen }: { onOpen: () => void }) {
  const sound = useSoundSources().find(source => source.id === 'ambient');
  if (!sound) return null;
  const silent = sound.muted || sound.volume === 0;
  return <button type="button" data-sound-trigger aria-label={sound.playing && !silent ? 'Pause nook ambience' : 'Play nook ambience'}
    title={sound.error || sound.subtitle} disabled={sound.busy} aria-pressed={sound.playing && !silent}
    onClick={() => { if (sound.error) onOpen(); else if (sound.playing && silent) { sound.setVolume(sound.volume || .45); } else sound.togglePlayback(); }}>
    {silent ? <VolumeX size={15}/> : sound.playing ? <Pause size={15}/> : <Play size={15}/>}
    <span>{sound.busy ? 'Starting sound…' : sound.playing && !silent ? 'Ambience on' : 'Play ambience'}</span>
  </button>;
}
