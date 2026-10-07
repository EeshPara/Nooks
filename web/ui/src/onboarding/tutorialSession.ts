/** A tour runs in its own document. Its storage and tool writes live only in memory. */
export type TutorialSeed = { token:string; workspace:Record<string,any>; profile:{name:string;avatar:number} };
function readSeed():TutorialSeed|null {
 if(window.parent===window||!new URLSearchParams(window.location.search).has('tutorial-practice'))return null;
 try { const seed=JSON.parse(window.name);window.name='';return typeof seed.token==='string'&&seed.workspace&&typeof seed.profile?.name==='string'?seed:null; } catch{return null;}
}
export const tutorialSeed=readSeed();
export const isTutorialPractice=!!tutorialSeed;
function memoryStorage():Storage {
 const values=new Map<string,string>();
 return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(String(key))??null,setItem:(key,value)=>{values.set(String(key),String(value));},removeItem:key=>{values.delete(String(key));},clear:()=>values.clear()};
}
if(isTutorialPractice){
 // Never copy account tokens, recovery records, or saved playback state into practice.
 Object.defineProperty(window,'localStorage',{value:memoryStorage(),configurable:true});
 Object.defineProperty(window,'sessionStorage',{value:memoryStorage(),configurable:true});
 localStorage.setItem('nooks:profile:device',JSON.stringify(tutorialSeed!.profile));
 // External destinations/account authorization are outside the practice workspace.
 document.addEventListener('click',event=>{const link=(event.target as Element)?.closest?.('a[href]');if(link){event.preventDefault();}},true);
}
export function finishTutorialPractice(){if(tutorialSeed)window.parent.postMessage({type:'nooks:tutorial-finished',token:tutorialSeed.token},window.location.origin);}
