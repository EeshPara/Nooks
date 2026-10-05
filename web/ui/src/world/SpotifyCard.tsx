import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, X } from 'lucide-react';
import { MovableWidget } from './WorkspaceLayout';
import { parseSpotifyLink, savedSpotifyLink, spotifyKey, spotifyMetadataKey, withSpotifyMetadata } from './spotifyLink';
import { useSpotifyPlayer, type SpotifyTrack } from './spotifyPlayer';
import { useModalFocus } from '../personalization/PersonalizePanel';
import './SpotifyCard.css';
function SpotifyOverlay({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);useModalFocus(ref,onClose);
 return <div className="spotify-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className="spotify-dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button aria-label="Close Spotify overlay" onClick={onClose}><X size={18}/></button></header>{children}</div></div>;
}
export function SpotifyCard(){
 const [link,setLink]=useState(savedSpotifyLink),[cover,setCover]=useState<{url:string;image:string;title:string}|null>(null),[overlay,setOverlay]=useState<'connect'|'queue'|null>(null),[queue,setQueue]=useState<SpotifyTrack[]>([]),[queueLoading,setQueueLoading]=useState(false),[queueError,setQueueError]=useState('');
 const player=useSpotifyPlayer(link);
 useEffect(()=>{const add=(event:Event)=>{const detail=(event as CustomEvent).detail;const parsed=typeof detail?.url==='string'?parseSpotifyLink(detail.url):null;if(!parsed)return;const next=withSpotifyMetadata(parsed,detail);setLink(next);localStorage.setItem(spotifyKey,next.url);localStorage.setItem(spotifyMetadataKey,JSON.stringify(next));window.dispatchEvent(new CustomEvent('nook:spotify-changed',{detail:{link:next}}));};window.addEventListener('nook:spotify-add',add);return()=>window.removeEventListener('nook:spotify-add',add);},[]);
 useEffect(()=>{if(!link){setCover(null);return;}const controller=new AbortController();fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`,{signal:controller.signal,credentials:'omit'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{const image=new URL(data.thumbnail_url);if(image.protocol==='https:'&&(image.hostname.endsWith('.spotifycdn.com')||image.hostname.endsWith('.scdn.co')))setCover({url:link.url,image:image.href,title:data.title});}).catch(()=>{});return()=>controller.abort();},[link?.url]);
 async function viewQueue(){setOverlay('queue');setQueueError('');setQueue([]);if(!player.ready)return;setQueueLoading(true);try{const data=await player.queue();setQueue(data.queue||[]);}catch(e){setQueueError(e instanceof Error?e.message:'Could not load your queue.');}finally{setQueueLoading(false);}}
 if(!link)return null;
 const title=link.title||(cover?.url===link.url?cover.title:'Spotify playlist');
 return <><MovableWidget id="spotify" label="Music card" className="spotify-card-position"><section className="spotify-card" aria-label="Spotify music player">
 <div className="spotify-card-cover">{cover?.url===link.url?<img src={cover.image} alt={`${title} playlist cover`}/>:<Music2 size={38} aria-label="Loading playlist artwork"/>}</div>
 <div className="spotify-card-label"><strong>{player.track?`${player.track.name} · ${player.track.artists.map(a=>a.name).join(', ')}`:player.ready?'Choose play to begin':'Not playing'}</strong><small>{title}</small></div>
 <div className="spotify-card-controls" role="group" aria-label="Playback controls"><button aria-label="Previous song" disabled={!player.ready||player.busy} onClick={player.previous}><SkipBack fill="currentColor"/></button><button aria-label={player.paused?'Play Spotify':'Pause Spotify'} disabled={player.busy} onClick={()=>player.ready?void player.toggle():setOverlay('connect')}>{player.paused?<Play fill="currentColor"/>:<Pause fill="currentColor"/>}</button><button aria-label="Next song" disabled={!player.ready||player.busy} onClick={player.next}><SkipForward fill="currentColor"/></button></div>
 <div className="spotify-card-volume"><Volume1 size={15}/><input type="range" aria-label="Spotify volume" aria-valuetext={`${Math.round(player.volume*100)} percent`} min="0" max="1" step=".01" value={player.volume} disabled={!player.ready} onChange={e=>player.setVolume(Number(e.target.value))} style={{background:`linear-gradient(to right,#e9d9bc ${player.volume*100}%,#e9d9bc33 ${player.volume*100}%)`}}/><Volume2 size={15}/></div>
 <button className="spotify-card-queue" onClick={()=>void viewQueue()}>View queue</button>
 {!player.ready&&<button className="spotify-card-connect" onClick={()=>setOverlay('connect')}>{player.busy?'Connecting…':'Connect Spotify'}</button>}
 {player.error&&<p className="spotify-card-error" role="alert">{player.error}</p>}
 </section></MovableWidget>
 {overlay&&<SpotifyOverlay title={overlay==='queue'?'Your queue':'Connect Spotify'} onClose={()=>setOverlay(null)}>
 {overlay==='connect'?<><p>Sign in with Spotify Premium to play music, skip songs, and adjust Spotify volume.</p><label>Spotify app Client ID<input value={player.clientId} onChange={e=>player.setClientId(e.target.value)} placeholder="Your public Spotify Client ID" autoComplete="off"/></label><p className="spotify-setup">In your Spotify Developer app, add this redirect URL: <code>{player.redirectUrl}</code></p><button className="spotify-signin" onClick={()=>void player.connect()}>Sign in with Spotify</button>{player.error&&<p role="alert">{player.error}</p>}</>:!player.ready?<><p>Connect Spotify to see your actual playback queue.</p><button className="spotify-signin" onClick={()=>setOverlay('connect')}>Connect Spotify</button></>:<>{player.track&&<div className="spotify-queue-current"><small>Now playing</small><strong>{player.track.name}</strong><span>{player.track.artists.map(a=>a.name).join(', ')}</span></div>}{queueLoading?<p role="status">Loading queue…</p>:queueError?<p role="alert">{queueError}</p>:queue.length?<ol className="spotify-queue-list">{queue.map((track,i)=><li key={`${track.uri}-${i}`}>{track.album.images[0]&&<img src={track.album.images[0].url} alt=""/>}<div><strong>{track.name}</strong><small>{track.artists.map(a=>a.name).join(', ')}</small></div></li>)}</ol>:<p>Your queue is empty.</p>}</>}
 </SpotifyOverlay>}
 </>;
}
