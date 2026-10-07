import { useEffect, useRef, useState } from 'react';
import { useCrashDraft } from '../WorkspaceErrorBoundary';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { allRoomScenes, roomScenes } from '../personalization/types';
import { useModalFocus } from '../personalization/PersonalizePanel';
import { MemberAvatar, memberAvatarCount } from './NookCommunity';
import type { NookDraft } from './nookCatalog';
import './NookCreator.css';

export interface NookProfile { name: string; avatar: number }

export function NookIdentityDialog({ profile, onClose, onSave }: { profile: NookProfile; onClose: () => void; onSave: (profile: NookProfile) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [name, setName] = useCrashDraft('identity:name', profile.name);
  const [avatar, setAvatar] = useCrashDraft('identity:avatar', profile.avatar);
  useModalFocus(panel, onClose);
  return <div className="nooks-creator-overlay" onClick={onClose}><div className="nooks-identity" ref={panel} role="dialog" aria-modal="true" aria-labelledby="nooks-identity-title" onClick={event => event.stopPropagation()}>
    <button className="nooks-create-close" aria-label="Close study profile" onClick={onClose}><X size={20}/></button>
    <MemberAvatar index={avatar} size={96}/>
    <span className="nooks-create-eyebrow">A LITTLE INTRODUCTION</span>
    <h2 id="nooks-identity-title">Make yourself at home.</h2>
    <p>Pick a little face for your study adventures.</p>
    <form onSubmit={event => { event.preventDefault(); if (name.trim()) onSave({ name: name.trim(), avatar }); }}>
      <div className="nooks-avatar-picker" role="group" aria-label="Choose your study avatar">{Array.from({length:memberAvatarCount},(_,index)=><button key={index} type="button" aria-label={`Choose companion ${index+1}`} aria-pressed={avatar===index} onClick={()=>setAvatar(index)}><MemberAvatar index={index} size={49}/>{avatar===index&&<Check size={12}/>}</button>)}</div>
      <label>What should we call you?<input value={name} onChange={event=>setName(event.target.value)} maxLength={28} autoComplete="given-name" placeholder="Your first name" required/></label>
      <button className="nooks-create-primary" type="submit" disabled={!name.trim()}>This is me <ArrowRight size={17}/></button>
    </form>
    <small>Preview profile · saved on this device. No account needed.</small>
  </div></div>;
}

export function NookCreator({ onClose, onCreate }: { onClose: () => void; onCreate: (draft: NookDraft) => void }) {
  const panel=useRef<HTMLDivElement>(null);
  const [step,setStep]=useState(0);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [sceneId,setSceneId]=useState('rainy-library');
  const [visibility,setVisibility]=useState<'public'|'private'>('public');
  const scene=allRoomScenes.find(item=>item.id===sceneId)??roomScenes[0];
  useModalFocus(panel,onClose);
  function submit(){onCreate({id:crypto.randomUUID(),name:name.trim(),description:description.trim()||'A little corner to study together.',sceneId,visibility,createdAt:new Date().toISOString()});}
  return <div className="nooks-creator-overlay" onClick={onClose}><div className="nooks-creator" ref={panel} role="dialog" aria-modal="true" aria-labelledby="nooks-create-title" onClick={event=>event.stopPropagation()}>
    <button className="nooks-create-close" aria-label="Close nook creator" onClick={onClose}><X size={20}/></button>
    <div className="nooks-create-photo" style={{backgroundImage:`url("${scene.image}")`}}><span>YOUR NEXT LITTLE WORLD</span><h2>{name.trim()||'A nook of your own.'}</h2><p>{visibility==='public'?'A place for your community.':'A place for your favorite people.'}</p></div>
    <div className="nooks-create-form"><div className="nooks-create-steps"><span className={step===0?'active':''}>01 · The vibe</span><i/><span className={step===1?'active':''}>02 · The people</span></div>
      <h2 id="nooks-create-title">{step===0?'Start with a feeling.':'Who’s it for?'}</h2>
      <p>{step===0?'Give your future study nook a name and a view.':'A public home for your followers, or a quiet corner with friends.'}</p>
      {step===0?<form onSubmit={event=>{event.preventDefault();if(name.trim())setStep(1);}}>
        <label>Nook name<input autoFocus value={name} onChange={event=>setName(event.target.value)} maxLength={54} placeholder="e.g. The midnight book club" required/></label>
        <label>A little about this nook<textarea value={description} onChange={event=>setDescription(event.target.value)} maxLength={220} placeholder="Who’s gathering here? What are you working toward?" rows={3}/></label>
        <label>Choose a starting view<select value={sceneId} onChange={event=>setSceneId(event.target.value)}>{roomScenes.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button className="nooks-create-primary" disabled={!name.trim()}>Next <ArrowRight size={17}/></button>
      </form>:<div>
        <div className="nooks-visibility-options" role="group" aria-label="Nook visibility"><button aria-pressed={visibility==='public'} onClick={()=>setVisibility('public')}><strong>Public nook</strong><span>Discoverable by anyone. A home for your community.</span><i>{visibility==='public'&&<Check size={13}/>}</i></button><button aria-pressed={visibility==='private'} onClick={()=>setVisibility('private')}><strong>Private nook</strong><span>Just your people. Study together by invitation.</span><i>{visibility==='private'&&<Check size={13}/>}</i></button></div>
        <div className="nooks-create-future"><span>IN YOUR NOOK</span><p>Your own leaderboard, collective study time, and a collection worth coming back for.</p><small>Custom prizes, publishing, and friend invites come later. This creates a local preview only.</small></div>
        <div className="nooks-create-actions"><button className="nooks-create-back" onClick={()=>setStep(0)}><ArrowLeft size={15}/> Back</button><button className="nooks-create-primary" onClick={submit}>Preview my nook <ArrowRight size={17}/></button></div>
      </div>}
    </div>
  </div></div>;
}

export function NookPortal({ title, image }: { title: string; image: string }) {
  const portal=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;portal.current?.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  return <div ref={portal} tabIndex={-1} className="nooks-portal" role="status" aria-live="polite" onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault();portal.current?.focus();}}}><div className="nooks-portal-haze" aria-hidden="true"/><div className="nooks-portal-view" style={{backgroundImage:`url("${image}")`}}/><div className="nooks-portal-rim" aria-hidden="true"/><div className="nooks-portal-label"><span>STEP INTO</span><strong>{title}</strong><small>Your next little chapter.</small></div></div>;
}
