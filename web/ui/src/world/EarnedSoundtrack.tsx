import { useEffect, useRef, useState } from 'react';
import { useSoundPlayback } from './soundPlayback';

export type EarnedTrackId = 'moonlit-piano' | 'vinyl-evening';
export const earnedTracks: Record<EarnedTrackId, { title: string; subtitle: string; bpm: number }> = {
  'moonlit-piano': { title: 'Moonlit piano', subtitle: 'Original · quiet keys under the stars', bpm: 58 },
  'vinyl-evening': { title: 'Vinyl evening', subtitle: 'Original · mellow, unhurried keys', bpm: 72 },
};
interface Composition { melody: readonly (number | null)[]; chords: readonly (readonly number[])[]; bass: readonly number[] }
const compositions: Record<EarnedTrackId, Composition> = {
  'moonlit-piano': { melody: [76, null, 79, 83, 81, null, 79, 76, 74, 76, null, 79, 78, null, 76, 74, 72, null, 76, 79, 77, 76, null, 74, 71, null, 74, 78, 76, null, 74, null], chords: [[52, 59, 64], [48, 55, 60], [50, 57, 62], [47, 54, 59]], bass: [40, 36, 38, 35] },
  'vinyl-evening': { melody: [69, 72, null, 76, 74, 72, 69, null, 67, null, 71, 74, 72, null, 71, 67, 65, 69, null, 72, 71, 69, 65, null, 67, null, 69, 72, 71, 67, null, null], chords: [[53, 60, 64], [55, 62, 65], [50, 57, 60], [52, 59, 62]], bass: [41, 43, 38, 40] },
};
export function midiFrequency(note: number) { return 440 * 2 ** ((note - 69) / 12); }
interface Voice { oscillators: OscillatorNode[]; envelope: GainNode }
interface Player { context: AudioContext; master: GainNode; filter: BiquadFilterNode; limiter: DynamicsCompressorNode; voices: Set<Voice>; timer?: ReturnType<typeof setInterval>; step: number; nextAt: number; closed: boolean }
function stopVoices(player: Player) { for (const voice of player.voices) { for (const oscillator of voice.oscillators) { try { oscillator.stop(); } catch { /* Already completed. */ } oscillator.disconnect(); } voice.envelope.disconnect(); } player.voices.clear(); }
function key(player: Player, midi: number, at: number, strength: number, duration = 3.1) {
  const context = player.context, envelope = context.createGain(), fundamental = midiFrequency(midi);
  const voice: Voice = { oscillators: [], envelope }; player.voices.add(voice);
  envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(strength, at + .018); envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, strength * .22), at + .32); envelope.gain.exponentialRampToValueAtTime(.0001, at + duration); envelope.connect(player.filter);
  for (const [multiple, weight] of [[1, 1], [2, .23], [3, .075]] as const) {
    const oscillator = context.createOscillator(), partial = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(fundamental * multiple, at); oscillator.detune.setValueAtTime(multiple === 1 ? 0 : multiple === 2 ? 1.8 : -1.3, at); partial.gain.value = weight;
    oscillator.connect(partial); partial.connect(envelope); voice.oscillators.push(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); partial.disconnect(); if (oscillator === voice.oscillators[0]) { player.voices.delete(voice); envelope.disconnect(); } };
    oscillator.start(at); oscillator.stop(at + duration + .04);
  }
}
function createPlayer(): Player {
  const context = new AudioContext(), filter = context.createBiquadFilter(), master = context.createGain(), limiter = context.createDynamicsCompressor();
  filter.type = 'lowpass'; filter.frequency.value = 2150; filter.Q.value = .4;
  limiter.threshold.value = -22; limiter.knee.value = 12; limiter.ratio.value = 8; limiter.attack.value = .006; limiter.release.value = .3;
  master.gain.value = 0; filter.connect(limiter); limiter.connect(master); master.connect(context.destination);
  return { context, master, filter, limiter, voices: new Set(), step: 0, nextAt: 0, closed: false };
}
function schedule(player: Player, track: EarnedTrackId) {
  if (player.closed || player.context.state !== 'running') return;
  const composition = compositions[track], stepLength = 60 / earnedTracks[track].bpm / 2;
  // Skip elapsed steps after a throttled tab instead of creating a burst of old notes.
  if (player.nextAt < player.context.currentTime - .15) { player.step += Math.floor((player.context.currentTime - player.nextAt) / stepLength); player.nextAt = player.context.currentTime + .05; }
  while (player.nextAt < player.context.currentTime + .2) {
    const index = player.step % composition.melody.length, bar = Math.floor(index / 8), melody = composition.melody[index];
    if (melody !== null) key(player, melody, player.nextAt, .095, track === 'moonlit-piano' ? 3.2 : 2.7);
    if (index % 8 === 0) { composition.chords[bar].forEach((note, i) => key(player, note, player.nextAt + i * .055, .038, 3.8)); key(player, composition.bass[bar], player.nextAt, .033, 3.4); }
    else if (index % 8 === 4) key(player, composition.chords[bar][1] + 12, player.nextAt, .031, 2.5);
    player.step++; player.nextAt += stepLength;
  }
}
function dispose(player: Player | null) { if (!player || player.closed) return; player.closed = true; if (player.timer) clearInterval(player.timer); stopVoices(player); player.filter.disconnect(); player.limiter.disconnect(); player.master.disconnect(); if (player.context.state !== 'closed') void player.context.close().catch(() => {}); }

export function EarnedSoundtrack({ track, onClose }: { track: EarnedTrackId | null; onClose: () => void }) {
  const [playing, setPlaying] = useState(false), [volume, setVolume] = useState(.25), [muted, setMuted] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const player = useRef<Player | null>(null), alive = useRef(true), activeTrack = useRef(track), action = useRef(false), epoch = useRef(0);
  activeTrack.current = track;
  useEffect(() => { setPlaying(false); setBusy(false); setError(''); epoch.current++; dispose(player.current); player.current = null; action.current = false; }, [track]);
  useEffect(() => { alive.current = true; const teardown = () => { epoch.current++; action.current = false; dispose(player.current); player.current = null; if (alive.current) { setPlaying(false); setBusy(false); } }; window.addEventListener('notable:teardown', teardown); return () => { alive.current = false; epoch.current++; window.removeEventListener('notable:teardown', teardown); dispose(player.current); player.current = null; }; }, []);
  useEffect(() => { const current = player.current; if (current && !current.closed) current.master.gain.setTargetAtTime(muted ? 0 : volume * .28, current.context.currentTime, .03); }, [volume, muted]);
  async function toggle() {
    if (!track || action.current) return;
    const requested = track, token = ++epoch.current; action.current = true; setBusy(true); setError('');
    try {
      let current = player.current;
      if (playing && current) { if (current.timer) clearInterval(current.timer); current.timer = undefined; current.master.gain.setValueAtTime(0, current.context.currentTime); stopVoices(current); await current.context.suspend(); if (alive.current && activeTrack.current === requested) setPlaying(false); return; }
      if (!current || current.closed || current.context.state === 'closed') { current = createPlayer(); player.current = current; }
      await current.context.resume();
      if (!alive.current || epoch.current !== token || activeTrack.current !== requested || current.closed) { dispose(current); return; }
      current.master.gain.setValueAtTime(0, current.context.currentTime); current.master.gain.linearRampToValueAtTime(muted ? 0 : volume * .28, current.context.currentTime + .15); current.nextAt = current.context.currentTime + .07;
      schedule(current, requested); current.timer = setInterval(() => schedule(current!, requested), 100); setPlaying(true);
    } catch { if (epoch.current === token) { if (alive.current && activeTrack.current === requested) { setError('Audio couldn’t start. Try Play again.'); setPlaying(false); } dispose(player.current); player.current = null; } }
    finally { if (epoch.current === token) { action.current = false; if (alive.current && activeTrack.current === requested) setBusy(false); } }
  }
  function stop() {
    epoch.current++; action.current = false;
    dispose(player.current); player.current = null;
    setPlaying(false); setBusy(false); onClose();
  }
  const metadata = track ? earnedTracks[track] : null;
  useSoundPlayback('earned-soundtrack', metadata ? {
    title: metadata.title, subtitle: metadata.subtitle, kind: 'soundtrack',
    playing, volume, muted, busy, error, togglePlayback: toggle,
    toggleMuted: () => setMuted(value => !value),
    setVolume: value => { setVolume(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0); if (value > 0) setMuted(false); },
    stop,
  } : null);
  return null;
}
export default EarnedSoundtrack;
