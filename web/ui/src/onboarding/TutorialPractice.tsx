import { useEffect, useRef, useState } from 'react';
import type { TutorialSeed } from './tutorialSession';

export function TutorialPractice({workspace,profile,onFinish,error}:{workspace:Record<string,any>;profile:TutorialSeed['profile'];onFinish:()=>void;error?:string}) {
 const frame=useRef<HTMLIFrameElement>(null);
 const [seed]=useState<TutorialSeed>(()=>({token:crypto.randomUUID(),workspace:structuredClone(workspace),profile}));
 const finished=useRef(onFinish);finished.current=onFinish;
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin===window.location.origin&&event.source===frame.current?.contentWindow&&event.data?.type==='nooks:tutorial-finished'&&event.data.token===seed.token)finished.current();};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[seed]);
 return <><iframe ref={frame} className="nooks-tutorial-practice" title="Nooks interactive practice tour" name={JSON.stringify(seed)} src={`${window.location.pathname}?tutorial-practice=1`} sandbox="allow-scripts allow-same-origin allow-forms"/>{error&&<p className="nooks-practice-save-error" role="alert">{error} Please try finishing the tour again.</p>}</>;
}
