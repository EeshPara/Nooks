import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Headphones, Link2, Music2, Pause, Play, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import { useSoundSources } from './soundPlayback';
import { parseSpotifyLink, savedSpotifyLink, spotifyKey, spotifyMetadataKey, withSpotifyMetadata, type SpotifyLink } from './spotifyLink';
import { getNookPlaylist } from './nookPlaylists';
import { MovableWidget } from './WorkspaceLayout';
import { consumeDismissEscape, isTopmostDismissTarget } from './dismissal';
import './SoundIsland.css';

export { parseSpotifyLink } from './spotifyLink';
export interface SoundIslandProps { onOpenMixer: () => void; onClose?: () => void; mixerOpen?: boolean; roomId: string; roomTitle: string }

export function SoundIsland({ onOpenMixer, onClose, mixerOpen = false, roomId, roomTitle }: SoundIslandProps) {
  const recommendation = getNookPlaylist(roomId);
  const sources = useSoundSources();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [spotify, setSpotify] = useState(savedSpotifyLink);
  const [spotifyActivated, setSpotifyActivated] = useState(false);
  const [addingSpotify, setAddingSpotify] = useState(false);
  const [spotifyInput, setSpotifyInput] = useState('');
  const [spotifyError, setSpotifyError] = useState('');
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const source = sources.find(item => item.id === selected) ?? sources.find(item => item.playing) ?? sources[0];
  const showingSpotify = addingSpotify || (!!spotify && (selected === 'spotify' || !source));

  const changeSpotify = useCallback((link: SpotifyLink | null) => {
    setSpotify(link);
    try {
      if (link) {
        localStorage.setItem(spotifyKey, link.url);
        if (link.title) localStorage.setItem(spotifyMetadataKey, JSON.stringify({ url: link.url, title: link.title, curator: link.curator }));
        else localStorage.removeItem(spotifyMetadataKey);
      } else {
        localStorage.removeItem(spotifyKey);
        localStorage.removeItem(spotifyMetadataKey);
      }
    } catch { /* The player remains usable if preferences cannot be saved. */ }
    window.dispatchEvent(new CustomEvent('nook:spotify-changed', { detail: { link } }));
  }, []);
  const addSpotify = useCallback((value: string, metadata?: unknown) => {
    const link = parseSpotifyLink(value);
    if (!link) return false;
    changeSpotify(withSpotifyMetadata(link, metadata));
    setSpotifyActivated(true);
    setAddingSpotify(false);
    setSpotifyError('');
    setSelected('spotify');
    setExpanded(true);
    return true;
  }, [changeSpotify]);

  useEffect(() => {
    const openSpotify = () => { setSpotifyInput(spotify?.url ?? ''); setSpotifyError(''); setAddingSpotify(true); setSelected('spotify'); setExpanded(true); };
    const showSpotify = () => { if (!spotify) return; setSpotifyActivated(true); setAddingSpotify(false); setSelected('spotify'); setExpanded(true); };
    const receiveSpotify = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: unknown; title?: unknown; curator?: unknown }>).detail;
      if (typeof detail?.url === 'string') addSpotify(detail.url, detail);
    };
    const teardown = () => { setSpotify(null); setSpotifyActivated(false); setAddingSpotify(false); setExpanded(false); };
    window.addEventListener('nook:spotify-open', openSpotify);
    window.addEventListener('nook:spotify-show', showSpotify);
    window.addEventListener('nook:spotify-add', receiveSpotify);
    window.addEventListener('notable:teardown', teardown);
    return () => {
      window.removeEventListener('nook:spotify-open', openSpotify);
      window.removeEventListener('nook:spotify-show', showSpotify);
      window.removeEventListener('nook:spotify-add', receiveSpotify);
      window.removeEventListener('notable:teardown', teardown);
    };
  }, [spotify?.url, addSpotify]);
  useEffect(() => { if (mixerOpen) setExpanded(false); }, [mixerOpen]);
  useEffect(() => { if (addingSpotify && expanded) linkInput.current?.focus(); }, [addingSpotify, expanded]);
  useEffect(() => {
    if (!expanded) return;
    const player = root.current?.closest<HTMLElement>('.sound-island-position');
    if (!player) return;
    const viewport = window.visualViewport;
    const fitViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const bottom = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      player.style.setProperty('--sound-viewport-height', `${height}px`);
      player.style.setProperty('--sound-viewport-bottom', `${bottom}px`);
    };
    fitViewport();
    window.addEventListener('resize', fitViewport, { passive: true });
    viewport?.addEventListener('resize', fitViewport);
    viewport?.addEventListener('scroll', fitViewport);
    return () => {
      window.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
      player.style.removeProperty('--sound-viewport-height');
      player.style.removeProperty('--sound-viewport-bottom');
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: MouseEvent) => {
      // The move handle is part of this player even though it sits outside the
      // playback surface, so grabbing it must not close the expanded controls.
      const player = root.current?.closest('.sound-island-position') ?? root.current;
      if (event.button === 0 && isTopmostDismissTarget(root.current) && !player?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (consumeDismissEscape(event, root.current)) {
        setExpanded(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('click', dismiss, true);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', dismiss, true); document.removeEventListener('keydown', escape); };
  }, [expanded]);
  useEffect(() => { if (!sources.length && !spotify && !addingSpotify) { setExpanded(false); setSelected(null); } }, [sources.length, spotify, addingSpotify]);

  function saveSpotify(event: React.FormEvent) {
    event.preventDefault();
    if (!addSpotify(spotifyInput)) setSpotifyError('Use a playlist, album, or song link from open.spotify.com.');
  }
  function removeSpotify() {
    changeSpotify(null);
    setSpotifyActivated(false);
    setAddingSpotify(false);
    setSelected(null);
    setSpotifyError('');
    if (!sources.length) setExpanded(false);
    onClose?.();
  }

  if (!source && !spotify && !addingSpotify) return null;
  const audible = !showingSpotify && source?.playing && !source.muted && source.volume > 0;
  const status = showingSpotify ? addingSpotify ? 'Add a playlist or song' : spotify?.curator ? `by ${spotify.curator} · Spotify` : 'Spotify player' : source?.busy ? 'Loading audio' : source?.playing ? audible ? 'Playing' : 'Muted' : 'Paused';
  const title = showingSpotify ? addingSpotify ? 'Spotify' : spotify?.title ?? 'Your Spotify music' : source?.kind === 'ambient' ? 'Nook sounds' : source?.title ?? 'Your audio';
  const kind = showingSpotify ? 'spotify' : source?.kind;

  return <MovableWidget id="spotify" label="Music player" className={`sound-island-position ${expanded ? 'is-expanded' : ''}`}>
    <aside ref={root} className={`sound-island ${expanded ? 'is-expanded' : ''} ${audible ? 'is-playing' : ''}`} aria-label="Audio player">
    <button ref={trigger} type="button" className="sound-island-trigger" style={expanded ? { paddingRight: 58 } : undefined} onClick={() => { if (!expanded && spotify && showingSpotify) setSpotifyActivated(true); setExpanded(value => !value); }} aria-expanded={expanded} aria-controls={panelId} aria-label={`${title}. ${status}. ${expanded ? 'Hide' : 'Show'} playback controls`}>
      <span className={`sound-island-cover is-${kind}`} aria-hidden="true">{kind === 'ambient' ? <Headphones size={16}/> : <Music2 size={16}/>}</span>
      <span className="sound-island-label"><strong>{title}</strong><small aria-hidden={!expanded}>{status}</small></span>
      {!showingSpotify && <span className="sound-island-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span>}
      {!expanded && <ChevronDown size={14} className="sound-island-chevron" aria-hidden="true"/>}
    </button>
    {expanded && <button type="button" className="sound-island-icon" style={{ position: 'absolute', top: 10, right: 10, width: 40, height: 40 }} aria-label="Close music controls" title="Close controls · music keeps playing" onClick={() => { setExpanded(false); trigger.current?.focus({ preventScroll: true }); }}><X size={18}/></button>}
    <div className={`sound-island-panel ${expanded ? '' : 'is-collapsed'}`} id={panelId} aria-hidden={!expanded} inert={!expanded}>
      <div className="sound-island-panel-clip"><div className="sound-island-panel-body">
      {sources.length + (spotify || addingSpotify ? 1 : 0) > 1 && <div className="sound-island-sources" role="group" aria-label="Choose audio player">{sources.map(item => <button type="button" key={item.id} onClick={() => { setSelected(item.id); setAddingSpotify(false); }} aria-pressed={!showingSpotify && item.id === source?.id}><span className={item.playing && !item.muted && item.volume > 0 ? 'is-active' : ''}/>{item.kind === 'ambient' ? 'Sounds' : 'Audio file'}</button>)}{(spotify || addingSpotify) && <button type="button" onClick={() => { setSelected('spotify'); setSpotifyActivated(true); }} aria-pressed={showingSpotify}>Spotify</button>}</div>}
      {showingSpotify && addingSpotify && <form className="sound-island-spotify-form" onSubmit={saveSpotify}>
        <label htmlFor={`${panelId}-link`}>Spotify link</label>
        <div><Link2 size={15}/><input ref={linkInput} id={`${panelId}-link`} type="text" inputMode="url" placeholder="Paste a playlist, album, or song" value={spotifyInput} onChange={event => { setSpotifyInput(event.currentTarget.value); setSpotifyError(''); }} autoComplete="off" spellCheck={false} aria-invalid={!!spotifyError} aria-describedby={spotifyError ? `${panelId}-error` : undefined}/></div>
        {spotifyError && <p id={`${panelId}-error`} className="sound-island-error" role="alert">{spotifyError}</p>}
        <div className="sound-island-form-actions"><button className="sound-island-cancel" type="button" onClick={() => { setAddingSpotify(false); setSelected(spotify ? 'spotify' : null); if (spotify) setSpotifyActivated(true); }}>Cancel</button><button className="sound-island-save" type="submit" disabled={!spotifyInput.trim()}>Add to nook</button></div>
      </form>}
      {/* Collapse the UI, not the iframe: closing a popup must not restart music. */}
      {spotify && spotifyActivated && <div className={`sound-island-spotify-player ${showingSpotify && !addingSpotify ? '' : 'is-concealed'}`} inert={!showingSpotify || addingSpotify} aria-hidden={!showingSpotify || addingSpotify}>
        <iframe key={spotify.uri} src={spotify.embed} title={spotify.title ? `${spotify.title} — Spotify music player` : 'Spotify music player'} width="100%" height="152" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="eager"/>
        <div className="sound-island-spotify-caption"><span>Playback by Spotify</span><a href={spotify.url} target="_blank" rel="noopener noreferrer">Open Spotify <ExternalLink size={12}/></a></div>
      </div>}
      {showingSpotify && !addingSpotify && spotify?.url !== recommendation.url && <button type="button" className="sound-island-recommendation" onClick={() => { setExpanded(false); onOpenMixer(); }}><span>For {roomTitle}</span><strong>{recommendation.title}</strong><ChevronDown size={13}/></button>}
      {!showingSpotify && source && <><p className="sound-island-subtitle">{source.subtitle}</p>
        <div className="sound-island-controls">
          <button type="button" className="sound-island-play" disabled={source.busy} onClick={source.togglePlayback} aria-label={source.playing ? 'Pause audio' : 'Play audio'}>{source.playing ? <Pause size={17}/> : <Play size={17}/>}</button>
          <button type="button" className="sound-island-icon" onClick={source.toggleMuted} aria-label={source.muted ? 'Unmute audio' : 'Mute audio'} aria-pressed={source.muted}>{source.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button>
          <input className="sound-island-volume" aria-label="Audio volume" aria-valuetext={`${Math.round(source.volume * 100)} percent`} type="range" min="0" max="1" step=".01" value={source.volume} onChange={event => source.setVolume(Number(event.currentTarget.value))}/>
          <span className="sound-island-volume-value">{Math.round(source.volume * 100)}%</span>
        </div>
        {source.error && <p className="sound-island-error" role="alert">{source.error}</p>}
      </>}
      {!addingSpotify && <div className="sound-island-footer"><button type="button" onClick={() => { setExpanded(false); onOpenMixer(); }}><SlidersHorizontal size={13}/> Sounds</button>{showingSpotify ? <><button type="button" onClick={() => { setSpotifyInput(spotify?.url ?? ''); setAddingSpotify(true); }}>Change link</button><button type="button" aria-label="Remove Spotify player and stop its audio" onClick={removeSpotify}><X size={13}/> Remove</button></> : <button type="button" aria-label="Stop audio and close player" onClick={() => { source?.stop(); if (sources.length === 1 && !spotify) setExpanded(false); onClose?.(); }}><X size={13}/> Stop</button>}</div>}
      </div></div>
    </div>
    </aside>
  </MovableWidget>;
}

export default SoundIsland;
