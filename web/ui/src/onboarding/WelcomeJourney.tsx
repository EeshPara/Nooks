import { isTutorialPractice } from './tutorialSession';
import { TutorialPractice } from './TutorialPractice';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { MemberAvatar, memberAvatarNames } from '../community/NookCommunity';
import type { NookProfile } from '../community/NookCreator';
import { useCrashDraft } from '../WorkspaceErrorBoundary';
import { useModalFocus } from '../personalization/PersonalizePanel';
import './WelcomeJourney.css';


/** Round each corner of a closed polygon, including the inner corner of the reward L. */
function roundedSpotlight(points:[number,number][],radius:number){
 if(points.length<3)return '';
 const corners=points.map((point,i)=>{const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];const incoming=Math.hypot(before[0]-point[0],before[1]-point[1]),outgoing=Math.hypot(after[0]-point[0],after[1]-point[1]);const r=Math.min(radius,incoming/2,outgoing/2);return {point,start:[point[0]+(before[0]-point[0])*r/incoming,point[1]+(before[1]-point[1])*r/incoming],end:[point[0]+(after[0]-point[0])*r/outgoing,point[1]+(after[1]-point[1])*r/outgoing]};});
 return `M${corners[0].start.join(' ')}${corners.map(c=>`L${c.start.join(' ')}Q${c.point.join(' ')} ${c.end.join(' ')}`).join('')}Z`;
}

export const tourStops = [
 {target:'.study-home-timer',page:'study',title:'Make a little time for focus.',text:'Your focus timer follows the Pomodoro rhythm: a focused stretch, then a well-earned break. Choose a duration, press Start, and build your day one session at a time.'},
 {target:'.study-home-tasks',page:'study',title:'One thing at a time.',text:'Keep a to-do list beside your timer. Add the things on your mind, then check them off as you go.'},
 {target:'[data-sound-trigger]',page:'study',title:'Set the mood.',text:'Open Music here to choose ambient sounds or a Spotify playlist. Your music card also gives you a quick way back to your listening controls.'},
 {target:'.collection-timeline-card,.collection-next-compact',page:'study',title:'A little reward for showing up.',text:'Every nook has its own collection of keepsakes. Saved focus time fills the timeline and brings you closer to your next reward.'},
 {target:'.study-focus-trigger',page:'study',title:'Time to lock in.',text:'Focus mode clears the surrounding cards so you can settle into your nook. Your mini timer stays visible. Click again whenever you want your tools back.'},
 {target:'.nooks-people-position',page:'study',title:'You have company.',text:'The people counter opens your nook’s community: see what others are studying and explore the leaderboard. In a connected room, you can make your nook private and invite friends with a shareable link.'},
 {target:'.nooks-community-cover,.nooks-live>header',page:'people',title:'A nook for your people.',text:'Explore People and Leaderboard here. In a connected nook you own, Public can become Private; Invite then gives you a link to copy and send to friends. Preview profiles are examples until your account is connected.'},
 {target:'.study-home-quick-actions',page:'study',title:'Turn curiosity into understanding.',text:'Create notes, flashcards, quizzes, and tests right here. Each gives you a different way to make sense of what you’re learning. In ChatGPT, describe what you want to study and Nooks can turn it into practice.'},
 {target:'[data-library-tab]',page:'library',title:'Everything you’re learning, together.',text:'Your Library holds your notes and practice. Bring in passages from the internet, create study materials, organize them into courses, and share files or folders with view, comment, or edit access when connected.'},
 {target:'[data-nooks-tab]',page:'study',title:'A change of scenery.',text:'Open Nooks to switch the mood, join another study space, or create a nook of your own. Choose a soothing spot and make yourself at home.'},
 {target:'.nd-dialog',page:'nooks',title:'Find your next favorite spot.',text:'Browse the Nooks here, save a favorite with the heart, or use the plus beside search to describe and create a new setting.'},
 {target:'[data-tour-replay]',page:'study',title:'Thanks again. Enjoy your time in Nooks!',text:'This little corner is yours. Come back to the circled info button beside the people counter whenever you want to replay this tour.'},
] as const;
export type TourPage = typeof tourStops[number]['page'];

export function TourReplayButton({onClick}:{onClick:()=>void}) {
 return <button className="nooks-tour-info" data-tour-replay type="button" aria-label="Replay Nooks tour" title="Take a tour of Nooks" onClick={onClick}><span aria-hidden="true">i</span></button>;
}

export function WelcomeJourney({workspace,scope,initialProfile,replay,onNavigate,onFinish,connected,onConnect,onProfile}:{workspace:Record<string,any>;scope:string;initialProfile:NookProfile;replay:boolean;onNavigate:(page:TourPage)=>void;onFinish:(profile:NookProfile)=>Promise<void>;connected:boolean;onConnect?:(profile:NookProfile)=>Promise<void>;onProfile:(profile:NookProfile)=>void}) {
 const [phase,setPhase]=useCrashDraft<'name'|'avatar'|'envelope'|'letter'>('welcome:phase','name',scope);
 const [name,setName]=useCrashDraft('welcome:name',initialProfile.name==='friend'?'':initialProfile.name,scope);
 const [avatar,setAvatar]=useCrashDraft('welcome:avatar',initialProfile.avatar,scope);
 const [tipHidden,setTipHidden]=useState(false);
 const [tour,setTour]=useState(replay),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const panel=useRef<HTMLDivElement>(null), callbacks=useRef({onNavigate,onFinish,onProfile});callbacks.current={onNavigate,onFinish,onProfile};
 const [cornerRadius,setCornerRadius]=useState(24);
 const [rect,setRect]=useState<{left:number;top:number;width:number;height:number}|null>(null);
 const [points,setPoints]=useState<[number,number][]>([]),[holes,setHoles]=useState<{left:number;top:number;width:number;height:number}[]>([]);
 const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight});
 const stop=tourStops[step];
 async function finish(){if(busy)return;setBusy(true);setError('');try{await callbacks.current.onFinish({name:name.trim()||initialProfile.name,avatar});}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useModalFocus(panel,()=>{if(tour&&!busy)void finish();},!tour);
 useLayoutEffect(()=>{if(!tour||!isTutorialPractice)return;callbacks.current.onNavigate(stop.page);const selector=stop.page==='people'?'.nooks-community,.nooks-live':stop.page==='library'?'.nooks-library':stop.page==='nooks'?'.nd-dialog':null;if(!selector)return;let frame=0,attempts=0,target:Element|null=null;const arrive=()=>{target=document.querySelector(selector);if(target){target.classList.add('nooks-tour-local-arrival');window.dispatchEvent(new Event('resize'));}else if(attempts++<20)frame=requestAnimationFrame(arrive);};frame=requestAnimationFrame(arrive);return()=>{cancelAnimationFrame(frame);target?.classList.remove('nooks-tour-local-arrival');};},[tour,step]);
 useEffect(()=>{if(phase==='letter'&&!tour){panel.current?.querySelector<HTMLElement>('#welcome-letter-heading')?.focus({preventScroll:true});return;}panel.current?.querySelector<HTMLElement>('input,button:not([disabled])')?.focus();},[phase,tour,step]);
 useLayoutEffect(()=>{
  if(!tour||!isTutorialPractice)return;let frame=0,count=0;let element:Element|null=null;
  const measure=()=>{const elements=[...document.querySelectorAll(stop.target)];element=elements[0]??null;let bounds=elements.map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);if(bounds.length&&count===0){const upper=Math.min(...bounds.map(r=>r.top)),lower=Math.max(...bounds.map(r=>r.bottom));if(lower-upper<window.innerHeight-32){const delta=upper<16?upper-16:lower>window.innerHeight-16?lower-window.innerHeight+16:0;if(delta)window.scrollBy({top:delta,behavior:'instant'});}else element?.scrollIntoView({block:'center',behavior:'instant'});bounds=elements.map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);}
   const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
   let shape:[number,number][]=[];
   if(element){const radius=parseFloat(getComputedStyle(element).borderTopLeftRadius);setCornerRadius(radius>0?radius+7:24);}
   if(bounds.length){const left=Math.min(...bounds.map(r=>r.left))-7,top=Math.min(...bounds.map(r=>r.top))-7,right=Math.max(...bounds.map(r=>r.right))+7,bottom=Math.max(...bounds.map(r=>r.bottom))+7;const next={left,top,width:right-left,height:bottom-top};setRect(old=>same(old,next)?old:next);
    const bar=elements.find(e=>e.matches('.collection-next-compact'))?.getBoundingClientRect(),track=elements.find(e=>e.matches('.collection-timeline-card'))?.getBoundingClientRect();
    shape=step===3&&bar&&track&&bar.top<track.top&&bar.left<track.left?[[left,top],[right,top],[right,bottom],[track.left-7,bottom],[track.left-7,bar.bottom+7],[left,bar.bottom+7]]:[[left,top],[right,top],[right,bottom],[left,bottom]];
   }else setRect(null);
   setPoints(old=>same(old,shape)?old:shape);
   const extra=[...document.querySelectorAll('[role="dialog"]:not(.nooks-tour-card),.world-sound-panel.open,.nooks-active-work,.nooks-library'+(step===2?',.spotify-card':''))].filter(e=>!e.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(e).visibility!=='hidden').map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({left:r.left-3,top:r.top-3,width:r.width+6,height:r.height+6}));
   const filtered=extra.filter((r,i)=>!extra.some((o,j)=>j!==i&&o.left<=r.left&&o.top<=r.top&&o.left+o.width>=r.left+r.width&&o.top+o.height>=r.top+r.height&&(o.width*o.height>r.width*r.height||j<i)));
   setHoles(old=>same(old,filtered)?old:filtered);setViewport(old=>old.width===window.innerWidth&&old.height===window.innerHeight?old:{width:window.innerWidth,height:window.innerHeight});};
  const settle=()=>{measure();if(count++<12)frame=requestAnimationFrame(settle);};frame=requestAnimationFrame(settle);
  const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);});observer.observe(document.body,{childList:true,subtree:true,attributes:true});
  window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
 },[tour,step]);
 async function connect(){if(!onConnect||busy)return;setBusy(true);setError('');try{await onConnect({name:name.trim(),avatar});}catch(e){setError(e instanceof Error?e.message:'Please try connecting again.');}finally{setBusy(false);}}
 const cardWidth=Math.min(370,viewport.width-32);
 const below=rect&&rect.top+rect.height+310<viewport.height;
 const beside=rect&&!below&&rect.left+rect.width+cardWidth+32<viewport.width;
 const freeLeft=holes.filter(r=>r.width*r.height>viewport.width*viewport.height*.1&&r.left>cardWidth+36).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
 const collectionOnLeft=step===3&&rect&&rect.left>cardWidth+36;
 const left=freeLeft?freeLeft.left-cardWidth-20:collectionOnLeft?rect.left-cardWidth-20:rect?Math.max(16,Math.min(beside?rect.left+rect.width+16:rect.left,viewport.width-cardWidth-16)):(viewport.width-cardWidth)/2;
 const top=freeLeft?Math.max(16,Math.min(freeLeft.top,viewport.height-320)):collectionOnLeft?Math.max(16,Math.min(rect.top,viewport.height-320)):rect&&below?rect.top+rect.height+16:rect&&beside?Math.max(16,Math.min(rect.top,viewport.height-320)):rect&&rect.top>320?rect.top-310:Math.max(16,viewport.height-320);
 function begin(){callbacks.current.onProfile({name:name.trim(),avatar});setTour(true);}
 const contains=(r:{left:number;top:number;width:number;height:number},p:[number,number])=>p[0]>=r.left&&p[0]<=r.left+r.width&&p[1]>=r.top&&p[1]<=r.top+r.height;
 const windows=holes.map(r=>[[r.left,r.top],[r.left+r.width,r.top],[r.left+r.width,r.top+r.height],[r.left,r.top+r.height]] as [number,number][]);
 if(points.length&&!holes.some(r=>points.every(p=>contains(r,p))))windows.push(points);
 const shadePath=`M0 0H${viewport.width}V${viewport.height}H0Z`+windows.map(p=>roundedSpotlight(p,cornerRadius)).join('');
 const cutout=`path(evenodd,"${shadePath}")`;
 return createPortal(tour&&!isTutorialPractice?<TutorialPractice error={error} workspace={workspace} profile={{name:name.trim()||initialProfile.name,avatar}} onFinish={()=>void finish()}/>:tour?<div className="nooks-tour-overlay">
  <div className="nooks-tour-interaction-shade" style={{clipPath:cutout}}/>
  {points.length>0&&<svg className="nooks-tour-outline" width={viewport.width} height={viewport.height} aria-hidden="true"><path d={roundedSpotlight(points,cornerRadius)} fill="none" stroke="#eed9b4" strokeWidth="2" strokeLinejoin="round"/></svg>}
  <div className="nooks-tour-card" ref={panel} role="dialog" aria-modal="false" aria-labelledby="nooks-tour-heading" style={{left,top,width:cardWidth,maxHeight:Math.max(80,viewport.height-top-16)}}>
   <header><span>YOUR NOOKS TOUR · {step+1} / {tourStops.length}</span><button type="button" className="nooks-tour-tip-toggle" aria-expanded={!tipHidden} onClick={()=>setTipHidden(v=>!v)}>{tipHidden?'Show tip':'Hide tip'}</button></header>
   <h2 id="nooks-tour-heading">{stop.title}</h2>{!tipHidden&&<><p>{stop.text}</p><p className="nooks-tour-practice-hint">Try it out. Changes during this tour won’t be saved.</p></>}
   {step===tourStops.length-1&&!replay&&onConnect&&!connected&&<button className="welcome-connect" disabled={busy} onClick={()=>void connect()}>Connect my account</button>}
   {error&&<p role="alert" className="welcome-error">{error}</p>}
   <footer><button disabled={busy} onClick={()=>step?setStep(step-1):void finish()}>{step?'Back':'Finish later'}</button><button className="welcome-primary" disabled={busy} onClick={()=>step===tourStops.length-1?void finish():setStep(step+1)}>{busy?'Saving…':step===tourStops.length-1?'Enjoy Nooks':'Next'}<ArrowRight size={16}/></button></footer>
  </div>
 </div>:<div className={`nooks-welcome-screen is-${phase}${phase==='letter'?' is-opening':''}`}><div className="welcome-nook-cutout" aria-hidden="true"/><div className="nooks-welcome-content" ref={panel} role="dialog" aria-modal="true" aria-labelledby={phase==='letter'?'welcome-letter-heading':'welcome-heading'}>
  {phase==='name'?<><p className="welcome-kicker">Hi there!</p><h1 id="welcome-heading">Welcome to Nooks</h1><p className="welcome-subtitle">Your sanctuary within ChatGPT</p><form className="welcome-name-form" onSubmit={e=>{e.preventDefault();if(name.trim())setPhase('avatar');}}><label className="welcome-sr" htmlFor="welcome-name">What’s your name?</label><input id="welcome-name" value={name} onChange={e=>setName(e.target.value)} maxLength={28} placeholder="What’s your name?" autoComplete="given-name" required/><button className="welcome-primary" disabled={!name.trim()}>Continue<ArrowRight size={19}/></button></form></>:phase==='avatar'?<><p className="welcome-kicker">Nice to meet you, {name.trim()}</p><h1 id="welcome-heading">Choose an Avatar</h1><p className="welcome-subtitle">A little face for your study adventures.<br/>Choose an animal that feels like you.</p><div className="welcome-avatars" role="group" aria-label="Choose your avatar">{memberAvatarNames.map((label,index)=><button key={label} type="button" aria-label={label} aria-pressed={avatar===index} onClick={()=>setAvatar(index)}><MemberAvatar index={index} size={88}/>{avatar===index&&<span className="welcome-avatar-check"><Check size={15}/></span>}</button>)}</div><div className="welcome-actions"><button onClick={()=>setPhase('name')}><ArrowLeft size={16}/>Back</button><button className="welcome-primary" onClick={()=>setPhase('envelope')}>This is me<ArrowRight size={18}/></button></div></>:<><div className="welcome-mail-intro"><p className="welcome-kicker">One last thing…</p><h1 id="welcome-heading">Welcome, {name.trim()}</h1><p className="welcome-subtitle">A note from the Nooks Team</p></div><div className={`welcome-mail-stage${phase==='letter'?' is-unsealed':''}`}><div className="mail-back" aria-hidden="true"/><div className="mail-flap" aria-hidden="true"/><div className="mail-sheet" aria-hidden={phase!=='letter'}><div className="welcome-letter"><p className="welcome-kicker">A NOTE FROM THE NOOKS TEAM</p><h1 id="welcome-letter-heading" tabIndex={-1}>Dear {name.trim()},</h1><p>Thank you for being here.</p><p>Nooks is an all-in-one study app built to bring a sense of community to something that can feel isolating. It’s a place to organize your ideas, practice what you’re learning, and find a little focus alongside other people doing the same.</p><p>We hope these quiet spaces, familiar faces, and small rewards make showing up a little easier. You don’t have to figure everything out at once. Settle in, take your time, and make this corner your own.</p><p>We’re glad you found us.<br/><strong>With love, the Nooks Team</strong></p><button className="welcome-primary" disabled={phase!=='letter'} onClick={begin}>Show me around<ArrowRight size={17}/></button></div></div><div className="mail-left" aria-hidden="true"/><div className="mail-right" aria-hidden="true"/><div className="mail-bottom" aria-hidden="true"/>{phase==='envelope'&&<button className="mail-open-hit" aria-label="Open your welcome letter" onClick={()=>setPhase('letter')}/>}</div>{phase==='envelope'&&<div className="welcome-mail-caption"><p className="welcome-envelope-hint">A little letter, just for you. Click to open.</p><button className="welcome-back" onClick={()=>setPhase('avatar')}>Back</button></div>}</>}

 </div></div>,document.body);
}
