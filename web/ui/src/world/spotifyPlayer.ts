import { isTutorialPractice } from '../onboarding/tutorialSession';
import { useEffect, useRef, useState } from 'react';
import type { SpotifyLink } from './spotifyLink';
const key='nooks:spotify-player:v1';
const clientKey='nooks:spotify-client-id';
const redirect=()=>`${window.location.origin}${window.location.pathname}`;
type Token={access_token:string;refresh_token:string;expires:number};
export type SpotifyTrack={id:string;name:string;artists:{name:string}[];album:{images:{url:string}[]};uri:string};
let oauthPending:Promise<any>|null=null;
function readToken():Token|null {try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}}
async function tokenRequest(body:URLSearchParams){const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!response.ok)throw new Error('Spotify sign-in expired. Connect again.');return response.json();}
export function useSpotifyPlayer(link:SpotifyLink|null){
 const [clientId,setClientId]=useState(()=>localStorage.getItem(clientKey)||'');
 const [token,setToken]=useState<Token|null>(readToken);
 const tokenRef=useRef(token);tokenRef.current=token;
 const player=useRef<any>(null),device=useRef(''),practiceTrack=useRef(1);
 const showPracticeTrack=(offset=0)=>{practiceTrack.current=Math.max(1,practiceTrack.current+offset);setTrack({id:`practice-${practiceTrack.current}`,name:`Practice track ${practiceTrack.current}`,artists:[{name:'Tutorial preview'}],album:{images:[]},uri:''});};
 const [ready,setReady]=useState(false),[paused,setPaused]=useState(true),[volume,setVolumeState]=useState(.5),[track,setTrack]=useState<SpotifyTrack|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const selected=useRef('');
 function saveToken(next:Token){sessionStorage.setItem(key,JSON.stringify(next));tokenRef.current=next;setToken(next);}
 async function access(){let current=tokenRef.current;if(!current)throw new Error('Connect Spotify to play music.');if(current.expires<Date.now()+30000){const data=await tokenRequest(new URLSearchParams({grant_type:'refresh_token',refresh_token:current.refresh_token,client_id:clientId}));current={...data,refresh_token:data.refresh_token||current.refresh_token,expires:Date.now()+data.expires_in*1000};saveToken(current!);}return current!.access_token;}
 async function api(path:string,method='GET',body?:unknown){const response=await fetch(`https://api.spotify.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${await access()}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok){if(response.status===401){sessionStorage.removeItem(key);setToken(null);}throw new Error(response.status===403?'Spotify Premium and playback permission are required.':`Spotify request failed (${response.status}). Please retry.`);}return response.status===204?null:response.json();}
 useEffect(()=>{const query=new URLSearchParams(window.location.search),code=query.get('code'),state=query.get('state');if(!code)return;let active=true;const expected=sessionStorage.getItem('nooks:spotify-state'),verifier=sessionStorage.getItem('nooks:spotify-verifier');if(!expected||state!==expected||!verifier){setError('Spotify sign-in could not be verified. Connect again.');return;}setBusy(true);(oauthPending??=tokenRequest(new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect(),client_id:clientId,code_verifier:verifier}))).then(data=>{if(active){saveToken({...data,expires:Date.now()+data.expires_in*1000});history.replaceState(null,'',window.location.pathname);sessionStorage.removeItem('nooks:spotify-state');sessionStorage.removeItem('nooks:spotify-verifier');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[]);
 useEffect(()=>{if(!token||!link)return;let alive=true;const host=window as any;
 const initialize=()=>{if(!alive)return;const instance=new host.Spotify.Player({name:'Nooks music',volume:.5,getOAuthToken:(callback:(value:string)=>void)=>{access().then(callback).catch(e=>setError(e.message));}});player.current=instance;
 instance.addListener('ready',({device_id}:{device_id:string})=>{if(alive){device.current=device_id;setReady(true);setError('');}});
 instance.addListener('not_ready',()=>{if(alive)setReady(false);});
 instance.addListener('player_state_changed',(state:any)=>{if(!alive||!state)return;setPaused(state.paused);setTrack(state.track_window.current_track);});
 for(const name of ['authentication_error','account_error','initialization_error','playback_error'])instance.addListener(name,({message}:{message:string})=>{if(alive)setError(message);});
 instance.connect().catch((e:Error)=>{if(alive)setError(e.message);});};
 if(host.Spotify?.Player)initialize();else{const previous=host.onSpotifyWebPlaybackSDKReady;host.onSpotifyWebPlaybackSDKReady=()=>{previous?.();initialize();};if(!document.querySelector('script[data-nooks-spotify-sdk]')){const script=document.createElement('script');script.src='https://sdk.scdn.co/spotify-player.js';script.dataset.nooksSpotifySdk='true';document.body.appendChild(script);}}
 return()=>{alive=false;player.current?.disconnect();player.current=null;device.current='';setReady(false);};
 },[!!token,clientId,!!link]);
 async function run(action:()=>Promise<unknown>){setError('');setBusy(true);try{await action();}catch(e){setError(e instanceof Error?e.message:'Spotify could not complete that action.');}finally{setBusy(false);}}
 async function connect(){if(!/^[a-f0-9]{32}$/i.test(clientId.trim())){setError('Enter the Client ID from your Spotify Developer app.');return;}localStorage.setItem(clientKey,clientId.trim());const bytes=crypto.getRandomValues(new Uint8Array(64));const verifier=Array.from(bytes,b=>('0'+b.toString(16)).slice(-2)).join('');const state=crypto.randomUUID();sessionStorage.setItem('nooks:spotify-verifier',verifier);sessionStorage.setItem('nooks:spotify-state',state);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const query=new URLSearchParams({client_id:clientId.trim(),response_type:'code',redirect_uri:redirect(),code_challenge_method:'S256',code_challenge:challenge,state,scope:'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state'});window.location.assign(`https://accounts.spotify.com/authorize?${query}`);}
 if(isTutorialPractice)return {ready:!!link,paused,volume,track,error:'',busy:false,clientId,setClientId,connect:async()=>{},stop:async()=>{setPaused(true);setTrack(null);},toggle:async()=>{showPracticeTrack();setPaused(v=>!v);},previous:async()=>{showPracticeTrack(-1);},next:async()=>{showPracticeTrack(1);},setVolume:(v:number)=>setVolumeState(Math.min(1,Math.max(0,v))),queue:async()=>({queue:[]}),redirectUrl:redirect()};
 return {ready,paused,volume,track,error,busy,clientId,setClientId,connect,
 stop:async()=>{const instance=player.current;selected.current='';try{await instance?.pause();}finally{instance?.disconnect();player.current=null;device.current='';setTrack(null);setPaused(true);setReady(false);setError('');}},
 toggle:()=>run(async()=>{if(!link||!device.current)throw new Error('Connect Spotify first.');await player.current.activateElement();if(selected.current!==link.uri){await api(`me/player/play?device_id=${encodeURIComponent(device.current)}`,'PUT',link.kind==='track'?{uris:[link.uri]}:{context_uri:link.uri});selected.current=link.uri;}else await player.current.togglePlay();}),
 previous:()=>run(()=>player.current.previousTrack()),next:()=>run(()=>player.current.nextTrack()),
 setVolume:(value:number)=>{const instance=player.current;if(!ready||!instance)return;instance.setVolume(value).then(()=>setVolumeState(value)).catch((e:Error)=>setError(e.message));},
 queue:()=>api('me/player/queue'),redirectUrl:redirect(),
 };
}
