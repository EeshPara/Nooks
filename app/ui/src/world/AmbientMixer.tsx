import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, Pause, Play, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { parseSpotifyLink, savedSpotifyLink, withSpotifyMetadata } from './spotifyLink';
import { useSoundPlayback } from './soundPlayback';
import { getNookPlaylist, type NookPlaylist } from './nookPlaylists';
import { consumeDismissEscape, isTopmostDismissTarget } from './dismissal';
import './ambient.css';

type Channel = 'rain' | 'brown' | 'fire' | 'warm';
type Levels = Record<Channel, number>;
interface Preferences { levels: Levels; master: number; local: number }
interface Engine { context: AudioContext; master: GainNode; gains: Record<Channel, GainNode>; sources: AudioScheduledSourceNode[]; audio: HTMLAudioElement; localGain: GainNode; localSource: MediaElementAudioSourceNode }
interface LocalTrack { url: string; name: string }
export interface AmbientMixerProps { open: boolean; onClose: () => void; roomId: string; roomTitle: string }

/** AudioParam never receives NaN, Infinity, or values outside the UI's safe range. */
export function safeVolume(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; }
const defaults: Preferences = { levels: { rain: .38, brown: .12, fire: .2, warm: .16 }, master: .55, local: .35 };
const preferenceKey = 'notable:ambient-levels:v1';
function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
    if (!stored || typeof stored !== 'object') return defaults;
    return { master: stored.master === undefined ? defaults.master : safeVolume(stored.master), local: stored.local === undefined ? defaults.local : safeVolume(stored.local), levels: Object.fromEntries(Object.keys(defaults.levels).map(key => [key, stored.levels?.[key] === undefined ? defaults.levels[key as Channel] : safeVolume(stored.levels[key])])) as Levels };
  } catch { return defaults; }
}

function noise(context: AudioContext, kind: 'rain' | 'brown' | 'fire'): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, rate * 18, rate);
  const samples = buffer.getChannelData(0);
  let lastBrown = 0;
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1;
    lastBrown = (lastBrown + .02 * white) / 1.02;
    samples[i] = kind === 'rain' ? white : lastBrown * (kind === 'fire' ? .9 : 3.2);
  }
  if (kind === 'fire') {
    // Small, irregular transients over a soft low-frequency bed, not a loud impulse.
    for (let i = 0; i < samples.length - rate * .06; i++) {
      if (Math.random() > 3.6 / rate) continue;
      const length = Math.floor(rate * (.008 + Math.random() * .04));
      const strength = .08 + Math.random() * .28;
      for (let j = 0; j < length; j++) samples[i + j] += (Math.random() * 2 - 1) * strength * Math.exp(-7 * j / length);
    }
  }
  // Crossfade loop edges to keep long-running procedural buffers click-free.
  const fade = Math.min(Math.floor(rate * .12), samples.length / 2);
  for (let i = 0; i < fade; i++) {
    const amount = i / fade;
    const beginning = samples[i]; const ending = samples[samples.length - fade + i];
    const mixed = beginning * amount + ending * (1 - amount);
    samples[i] = mixed; samples[samples.length - fade + i] = mixed;
  }
  return buffer;
}

function createEngine(): Engine {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser does not support ambient audio.');
  const context = new AudioContextClass();
  const master = context.createGain(); master.gain.value = 0;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -20; limiter.knee.value = 18; limiter.ratio.value = 6; limiter.attack.value = .02; limiter.release.value = .35;
  master.connect(limiter); limiter.connect(context.destination);
  const sources: AudioScheduledSourceNode[] = [];
  const gains = {} as Record<Channel, GainNode>;
  for (const channel of ['rain', 'brown', 'fire', 'warm'] as Channel[]) {
    const gain = context.createGain(); gain.gain.value = 0; gain.connect(master); gains[channel] = gain;
  }
  for (const channel of ['rain', 'brown', 'fire'] as const) {
    const source = context.createBufferSource(); source.buffer = noise(context, channel); source.loop = true; source.loopEnd = source.buffer.duration - .12;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = channel === 'rain' ? 6500 : channel === 'brown' ? 650 : 3000;
    const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = channel === 'rain' ? 180 : channel === 'brown' ? 24 : 80;
    const trim = context.createGain(); trim.gain.value = channel === 'rain' ? .16 : channel === 'brown' ? .25 : .38;
    source.connect(highpass); highpass.connect(filter); filter.connect(trim); trim.connect(gains[channel]);
    source.start(); sources.push(source);
  }
  // A quiet original three-note pad. No music files or external streaming services.
  const warmFilter = context.createBiquadFilter(); warmFilter.type = 'lowpass'; warmFilter.frequency.value = 550; warmFilter.connect(gains.warm);
  [130.81, 196, 261.63].forEach((frequency, index) => {
    const oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency; oscillator.detune.value = [-3, 2, 1][index];
    const voice = context.createGain(); voice.gain.value = .035;
    const drift = context.createOscillator(); drift.type = 'sine'; drift.frequency.value = .035 + index * .014;
    const depth = context.createGain(); depth.gain.value = .009;
    drift.connect(depth); depth.connect(voice.gain); oscillator.connect(voice); voice.connect(warmFilter);
    oscillator.start(); drift.start(); sources.push(oscillator, drift);
  });
  const audio = new Audio(); audio.loop = true; audio.preload = 'metadata';
  const localSource = context.createMediaElementSource(audio);
  const localGain = context.createGain(); localGain.gain.value = 0; localSource.connect(localGain); localGain.connect(master);
  return { context, master, gains, sources, audio, localGain, localSource };
}

function changeGain(gain: GainNode, value: number, context: AudioContext) {
  if (context.state === 'closed') return;
  gain.gain.cancelScheduledValues(context.currentTime);
  gain.gain.setTargetAtTime(safeVolume(value), context.currentTime, .08);
}
function dispose(engine: Engine) {
  engine.audio.pause(); engine.audio.removeAttribute('src'); engine.audio.load();
  engine.localSource.disconnect();
  for (const source of engine.sources) { try { source.stop(); } catch { /* Already stopped. */ } source.disconnect(); }
  void engine.context.close().catch(() => {});
}

const channels: { id: Channel; name: string }[] = [
  { id: 'rain', name: 'Window rain' },
  { id: 'brown', name: 'Brown noise' },
  { id: 'fire', name: 'Fireplace' },
  { id: 'warm', name: 'Soft synth' },
];
export function AmbientMixer({ open, onClose, roomId, roomTitle }: AmbientMixerProps) {
  const recommendation = getNookPlaylist(roomId);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [track, setTrack] = useState<LocalTrack | null>(null);
  const [started, setStarted] = useState(false);
  const [spotify, setSpotify] = useState(savedSpotifyLink);
  const [spotifyInput, setSpotifyInput] = useState('');
  const [spotifyError, setSpotifyError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const previousLevels = useRef({ ...defaults.levels });
  const engine = useRef<Engine | null>(null);
  const trackRef = useRef<LocalTrack | null>(null);
  const mounted = useRef(true);
  const action = useRef(false);
  const epoch = useRef(0);
  const close = useRef(onClose); close.current = onClose;
  const upload = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    mounted.current = true;
    const teardown = () => {
      epoch.current++; action.current = false;
      if (engine.current) { dispose(engine.current); engine.current = null; }
      if (trackRef.current) { URL.revokeObjectURL(trackRef.current.url); trackRef.current = null; }
      if (mounted.current) { setRunning(false); setStarted(false); setBusy(false); setTrack(null); }
    };
    window.addEventListener('notable:teardown', teardown);
    return () => {
      mounted.current = false;
      window.removeEventListener('notable:teardown', teardown);
      teardown();
    };
  }, []);

  useEffect(() => {
    const syncSpotify = (event: Event) => {
      const value = (event as CustomEvent<{ link?: unknown }>).detail?.link;
      if (value === null) { setSpotify(null); return; }
      if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
        const link = parseSpotifyLink(value.url);
        if (link) { setSpotify(withSpotifyMetadata(link, value)); return; }
      }
      setSpotify(savedSpotifyLink());
    };
    window.addEventListener('nook:spotify-changed', syncSpotify);
    return () => window.removeEventListener('nook:spotify-changed', syncSpotify);
  }, []);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const outside = (event: MouseEvent) => {
      if (event.button !== 0 || !isTopmostDismissTarget(panel.current) || panel.current?.contains(event.target as Node)) return;
      if ((event.target as Element)?.closest?.('[data-sound-trigger]')) return;
      close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (consumeDismissEscape(event, panel.current)) { close.current(); opener?.focus({ preventScroll: true }); }
    };
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', outside, true); document.removeEventListener('keydown', escape); };
  }, [open]);

  function addSpotify(value: string, playlist?: NookPlaylist) {
    const link = parseSpotifyLink(value);
    if (!link) { setSpotifyError('Use a playlist, album, or song link from open.spotify.com.'); return; }
    setSpotifyError(''); setSpotifyInput('');
    window.dispatchEvent(new CustomEvent('nook:spotify-add', { detail: { url: link.url, ...(playlist ? { title: playlist.title, curator: playlist.curator } : {}) } }));
    onClose();
  }
  function toggleChannel(id: Channel) {
    setPreferences(value => {
      const level = value.levels[id];
      if (level > 0) previousLevels.current[id] = level;
      return { ...value, levels: { ...value.levels, [id]: level > 0 ? 0 : previousLevels.current[id] || .3 } };
    });
  }

  useEffect(() => {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Private browsing may disable harmless preferences. */ }
    const current = engine.current;
    if (!current) return;
    for (const channel of Object.keys(preferences.levels) as Channel[]) changeGain(current.gains[channel], preferences.levels[channel], current.context);
    changeGain(current.master, muted ? 0 : preferences.master, current.context);
    changeGain(current.localGain, preferences.local, current.context);
  }, [preferences, muted]);

  async function togglePlayback() {
    if (action.current) return;
    const token = ++epoch.current;
    action.current = true; setBusy(true); setError(''); setStarted(true);
    try {
      if (running && engine.current) {
        engine.current.audio.pause(); await engine.current.context.suspend();
        if (mounted.current && token === epoch.current) setRunning(false);
      } else {
        const current = engine.current ??= createEngine();
        for (const channel of Object.keys(preferences.levels) as Channel[]) changeGain(current.gains[channel], preferences.levels[channel], current.context);
        changeGain(current.master, muted ? 0 : preferences.master, current.context);
        changeGain(current.localGain, preferences.local, current.context);
        if (trackRef.current && current.audio.src !== trackRef.current.url) current.audio.src = trackRef.current.url;
        // Both calls happen directly in the click handler, before awaiting user activation.
        const resume = current.context.resume();
        const localPlay = trackRef.current ? current.audio.play().catch(() => { if (mounted.current && token === epoch.current) setError('Your local track could not play. Try another audio file.'); }) : Promise.resolve();
        await resume; await localPlay;
        if (mounted.current && token === epoch.current) setRunning(true);
      }
    } catch (problem) { if (mounted.current && token === epoch.current) setError(problem instanceof Error ? problem.message : 'Audio could not start. Please try again.'); }
    finally { if (token === epoch.current) { action.current = false; if (mounted.current) setBusy(false); } }
  }

  function stopPlayback() {
    epoch.current++; action.current = false;
    if (engine.current) { dispose(engine.current); engine.current = null; }
    setRunning(false); setStarted(false); setBusy(false); setError('');
  }
  useSoundPlayback('ambient', {
    title: track?.name ?? 'Nook sounds',
    subtitle: track ? 'Your local track + nook sounds' : channels.filter(channel => preferences.levels[channel.id] > 0).map(channel => channel.name).join(' · ') || 'A quiet nook',
    kind: 'ambient', playing: running, muted, volume: preferences.master, busy, error,
    togglePlayback, toggleMuted: () => setMuted(value => !value),
    setVolume: value => { setPreferences(previous => ({ ...previous, master: safeVolume(value) })); if (value > 0) setMuted(false); },
    stop: stopPlayback,
  });

  function addTrack(file?: File) {
    if (!file) return;
    if ((file.type && !file.type.startsWith('audio/')) || file.size > 100 * 1024 * 1024) { setError('Choose an audio file under 100 MB.'); return; }
    const current = engine.current;
    if (current) { current.audio.pause(); current.audio.removeAttribute('src'); current.audio.load(); }
    if (trackRef.current) URL.revokeObjectURL(trackRef.current.url);
    const value = { url: URL.createObjectURL(file), name: file.name };
    trackRef.current = value; setTrack(value); setError('');
    if (current) {
      current.audio.src = value.url;
      if (running) void current.audio.play().catch(() => { if (mounted.current) setError('Press Pause, then Play, to start your local track.'); });
    }
  }
  function removeTrack() {
    if (engine.current) { engine.current.audio.pause(); engine.current.audio.removeAttribute('src'); engine.current.audio.load(); }
    if (trackRef.current) URL.revokeObjectURL(trackRef.current.url);
    trackRef.current = null; setTrack(null); setError('');
  }

  return <section ref={panel} className="ambient-mixer" role="dialog" aria-modal="false" aria-labelledby={titleId}>
    <header className="ambient-header"><div><h2 id={titleId}>Music &amp; sound</h2><p>For {roomTitle}</p></div><button type="button" className="ambient-icon" onClick={onClose} aria-label="Close music and sound"><X size={18}/></button></header>
    <section className="ambient-curated" aria-label={`Recommended playlist for ${roomTitle}`}>
      <div className="ambient-curated-label"><span>Picked for this nook</span><span>Spotify</span></div>
      <div className="ambient-curated-track"><span className="ambient-vinyl ambient-curated-vinyl" aria-hidden="true"/><div><h3>{recommendation.title}</h3><span>by {recommendation.curator}</span></div></div>
      <p>{recommendation.vibe}</p>
      <button type="button" className="ambient-curated-open" onClick={() => addSpotify(recommendation.url, recommendation)}>{spotify?.url === recommendation.url ? 'Open playlist' : 'Listen in this nook'}<ArrowUpRight size={15}/></button>
      <small>Press play in the Spotify player.</small>
    </section>
    <section className="ambient-spotify" aria-label="Add Spotify">
      <div className="ambient-spotify-heading"><strong>Or bring your own</strong></div>
      <form onSubmit={event => { event.preventDefault(); addSpotify(spotifyInput); }}>
        <label className="ambient-sr" htmlFor={`${titleId}-spotify`}>Spotify playlist, album, or song link</label>
        <div className="ambient-spotify-input"><input id={`${titleId}-spotify`} type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Paste a playlist, album, or song link" value={spotifyInput} onChange={event => { setSpotifyInput(event.target.value); setSpotifyError(''); }}/><button type="submit" disabled={!spotifyInput.trim()}>Add <ArrowUpRight size={13}/></button></div>
      </form>
      {spotifyError && <p className="ambient-error" role="alert">{spotifyError}</p>}
      {spotify && <div className="ambient-spotify-shortcuts"><button type="button" className="ambient-open-spotify" onClick={() => { window.dispatchEvent(new CustomEvent('nook:spotify-show')); onClose(); }}>Your player <ArrowUpRight size={13}/></button><span>{spotify.title ?? 'Your Spotify link'}</span></div>}
    </section>
    <section className="ambient-sound-section" aria-label="Ambient sound mixer">
      <div className="ambient-section-heading"><h3>Ambient sounds</h3><button type="button" className={`ambient-play ${running ? 'ambient-playing' : ''}`} disabled={busy} onClick={togglePlayback}>{running ? <Pause size={13}/> : <Play size={13}/>} {busy ? 'Starting…' : running ? 'Pause sounds' : 'Play sounds'}</button></div>
      <div className="ambient-channels">{channels.map(({ id, name }) => <div className={`ambient-channel ambient-${id}`} key={id}><button type="button" className="ambient-channel-toggle" role="switch" aria-label={name} aria-checked={preferences.levels[id] > 0} onClick={() => toggleChannel(id)}><span aria-hidden="true">{preferences.levels[id] > 0 && <Check size={10}/>}</span>{name}</button><input aria-label={`${name} volume`} className="ambient-slider" type="range" min="0" max="100" step="1" value={Math.round(preferences.levels[id] * 100)} onChange={event => setPreferences(value => ({ ...value, levels: { ...value.levels, [id]: safeVolume(Number(event.target.value) / 100) } }))}/><output className="ambient-percent">{Math.round(preferences.levels[id] * 100)}%</output></div>)}</div>
      <div className="ambient-master"><button type="button" className={`ambient-icon ${muted ? 'ambient-muted' : ''}`} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button><span>{muted ? 'Muted' : 'Volume'}</span><input aria-label="Master volume" className="ambient-slider" type="range" min="0" max="100" step="1" value={Math.round(preferences.master * 100)} onChange={event => setPreferences(value => ({ ...value, master: safeVolume(Number(event.target.value) / 100) }))}/><output className="ambient-percent">{Math.round(preferences.master * 100)}%</output></div>
    </section>
    <details className="ambient-local"><summary><Upload size={14}/><span>Audio from your device</span><span className="ambient-local-expand">+</span></summary>{track ? <div className="ambient-local-track"><div className="ambient-file-name" title={track.name}>{track.name}</div><button type="button" className="ambient-icon" aria-label="Remove local audio track" onClick={removeTrack}><Trash2 size={15}/></button><input aria-label="Local audio track volume" className="ambient-slider" type="range" min="0" max="100" step="1" value={Math.round(preferences.local * 100)} onChange={event => setPreferences(value => ({ ...value, local: safeVolume(Number(event.target.value) / 100) }))}/><span className="ambient-local-note">Loops with your mix · {Math.round(preferences.local * 100)}%</span></div> : <button type="button" className="ambient-upload" onClick={() => upload.current?.click()}>Choose an audio file</button>}<input ref={upload} className="ambient-file-input" type="file" accept="audio/*" onChange={event => { addTrack(event.target.files?.[0]); event.currentTarget.value = ''; }}/><p className="ambient-privacy">Your file stays on this device.</p></details>
    {error && <p className="ambient-error" role="alert">{error}</p>}
    <footer className="ambient-footer">Layer your music and sounds. Play when you’re ready.</footer>
  </section>;
}
export default AmbientMixer;
