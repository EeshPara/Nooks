import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { UsersRound, Copy, Plus } from 'lucide-react';
import { callTool, isEmbedded } from '../bridge';
import { AccountDialog, useNooksAccount } from '../account';
import { OrganizationDialog } from './StudyLibrary';
import { resultData, type OrganizedArtifact } from './types';
import type { Artifact } from '../study/types';
import StudyView from '../study/StudyView';
import StudyEditor from '../study/StudyEditor';
import './LibrarySharing.css';
export type LibraryShare = { id:string;kind:'course'|'material';targetId:string;title:string;permission:'owner'|'edit'|'comment'|'view';owned:boolean;url?:string };
type SharedData = {share:LibraryShare;materials:OrganizedArtifact[];comments:{id:string;artifactId:string;body:string;author:string;createdAt:string}[];artifact?:OrganizedArtifact};
const request = async (name:string,args:Record<string,unknown>={}) => {
 const raw:any = await callTool(`library_share_${name}`,args); return raw?._meta?.notableData ?? raw?.structuredContent ?? raw;
};
const failure = (e:unknown) => e instanceof Error ? e.message : 'Please try again.';
export function ShareLibraryDialog({target,onClose,onShared,onRevoked,existing}:{target:{kind:'course'|'material';id:string;title:string};onClose:()=>void;onShared:(share:LibraryShare)=>void;onRevoked?:()=>void;existing?:LibraryShare}) {
 const account=useNooksAccount(!isEmbedded); const [permission,setPermission]=useState<'view'|'comment'|'edit'>(existing?.permission === 'edit' || existing?.permission === 'comment' ? existing.permission : 'view');
 const [share,setShare]=useState<LibraryShare>();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[signIn,setSignIn]=useState(false);
 async function create() {setBusy(true);setError('');try {const data=await request('create',{kind:target.kind,targetId:target.id,permission});setShare(data.share);onShared(data.share);}catch(e){setError(failure(e));}finally{setBusy(false);}}
 async function revoke(){if(!existing && !share)return;setBusy(true);try{await request('revoke',{shareId:(share??existing)!.id});onRevoked?.();onClose();}catch(e){setError(failure(e));}finally{setBusy(false);}}
 return <><OrganizationDialog title={`Share ${target.kind === 'course' ? 'course' : 'material'}`} onClose={onClose} busy={busy}><div className="nooks-org-form library-share-form"><h3>{target.title}</h3><p>{target.kind==='course'?'People with access can open this folder and its materials.':'Give friends access to this material in Nooks.'}</p><label>People with the link can<select value={permission} disabled={busy} onChange={e=>{setPermission(e.target.value as typeof permission);setShare(undefined);setCopied(false);}}><option value="view">View</option><option value="comment">Comment</option><option value="edit">Edit</option></select></label><p className="nooks-org-helper">{permission==='edit'?'Can view, comment, edit materials, and add files to a shared course.':permission==='comment'?'Can view materials and leave comments.':'Can view and study materials.'} Friends sign in to Nooks to join.</p>{share?.url && <label>Shareable link<div className="library-share-copy"><input readOnly value={share.url} aria-label="Shareable link"/><button type="button" className="nooks-library-share" onClick={async()=>{try{await navigator.clipboard.writeText(share.url!);setCopied(true);}catch{setError('Select and copy the link above.');}}}><Copy size={14}/>{copied?'Copied':'Copy'}</button></div></label>}{error && <p role="alert" className="nooks-org-error">{error}</p>}{account.status!=='signed-in' && <p className="nooks-org-helper">Connect a Nooks account to create a working link. Device-only materials stay private.</p>}<footer>{(existing||share) && <button className="nooks-org-secondary" disabled={busy} onClick={()=>void revoke()}>Stop sharing</button>}<button className="nooks-org-secondary" disabled={busy} onClick={onClose}>Done</button>{account.status==='signed-in'?<button className="nooks-org-primary" disabled={busy} onClick={()=>void create()}>{busy?'Saving…':share?'New link':existing?'Update link':'Create link'}</button>:<button className="nooks-org-primary" onClick={()=>setSignIn(true)}>Connect account</button>}</footer>{existing && <p className="nooks-org-helper">Updating the link replaces the previous invitation. Current collaborators follow the new permission.</p>}</div></OrganizationDialog>{signIn && <AccountDialog onClose={()=>setSignIn(false)}/>}</>;
}
export function useLibraryShares() {
 const account=useNooksAccount(!isEmbedded);const [shares,setShares]=useState<LibraryShare[]>([]);const [error,setError]=useState('');const key=account.workspaceKey;
 useEffect(()=>{let alive=true;setShares([]);setError('');if(account.status==='signed-in')request('list').then(d=>{if(alive)setShares(d.shares);}).catch(e=>{if(alive)setError(failure(e));});return()=>{alive=false;};},[key,account.status]);
 return {shares,error,setShares};
}
type RoomNavigationGuard = { owner: string; canNavigate: () => boolean };
type SharedRoomProps = { shareId:string;token?:string;onClose:()=>void;myMaterials?:OrganizedArtifact[];navigationGuard?:Ref<RoomNavigationGuard> };
export function SharedLibraryRoom(props: SharedRoomProps) {
 const account=useNooksAccount(!isEmbedded);
 // A different identity never renders the previous identity's loaded room, even before effects run.
 return <SharedLibraryRoomContent key={JSON.stringify([account.workspaceKey,account.status,props.shareId,props.token])} {...props} owner={account.workspaceKey} signedIn={account.status==='signed-in'}/>;
}
function SharedLibraryRoomContent({shareId,token,onClose,myMaterials=[],navigationGuard,owner,signedIn}:SharedRoomProps & {owner:string;signedIn:boolean}) {
 const [data,setData]=useState<SharedData>();const [selected,setSelected]=useState<OrganizedArtifact>();const [draft,setDraftValue]=useState<OrganizedArtifact>();const [busy,setBusyValue]=useState(false),[error,setError]=useState(''),[comment,setCommentValue]=useState(''),[signIn,setSignIn]=useState(false);const [addExisting,setAddExisting]=useState(false);const [availableMaterials,setAvailableMaterials]=useState(myMaterials);
 const [navigationNotice,setNavigationNotice]=useState('');
 const work=useRef({busy:false,draft:undefined as OrganizedArtifact|undefined,comment:''});
 const lifetime=useRef({active:false});
 function setDraft(value:OrganizedArtifact|undefined){work.current.draft=value;setDraftValue(value);}
 function setComment(value:string){work.current.comment=value;setCommentValue(value);}
 function setBusy(value:boolean){work.current.busy=value;setBusyValue(value);}
 function canNavigate(){
  if(!lifetime.current.active)return false;
  if(work.current.busy){setNavigationNotice('Wait for your shared-library request to finish, then open the other invitation again.');return false;}
  if(work.current.draft||work.current.comment.trim()){setNavigationNotice('Save or cancel your edit, or send or clear your comment, then open the other invitation again.');return false;}
  return true;
 }
 useImperativeHandle(navigationGuard,()=>({owner,canNavigate}),[owner]);
 const editable=data?.share.permission==='owner'||data?.share.permission==='edit';const canComment=editable||data?.share.permission==='comment';
 useEffect(()=>{
  const session={active:true};lifetime.current=session;
  if(signedIn)request(token?'join':'get',{shareId,...(token?{token}:{})}).then(d=>{if(session.active)setData(d);}).catch(e=>{if(session.active)setError(failure(e));});
  return()=>{session.active=false;};
 },[]);
 function beginWork(){
  const session=lifetime.current;
  if(!session.active||work.current.busy)return null;
  setBusy(true);setError('');setNavigationNotice('');
  return()=>session.active&&lifetime.current===session;
 }
 async function openMaterialPicker(){
  if(addExisting){setAddExisting(false);return;}
  const current=beginWork();if(!current)return;
  try{const workspace=resultData<any>(await callTool('workspace_get',{}));if(current()){setAvailableMaterials(workspace.workspace.artifacts??[]);setAddExisting(true);}}
  catch(e){if(current())setError(failure(e));}finally{if(current())setBusy(false);}
 }
 async function refresh(){
  const current=beginWork();if(!current)return;
  try{const d=await request('get',{shareId});if(current()){setData(d);if(selected)setSelected(d.materials.find((a:Artifact)=>a.id===selected.id));}}
  catch(e){if(current())setError(failure(e));}finally{if(current())setBusy(false);}
 }
 async function save(artifact:Artifact){
  const current=beginWork();if(!current)throw new Error('This shared library is busy or no longer open.');
  try{const d=await request('save',{shareId,artifact,expectedRevision:draft?.revision??selected?.revision});if(!current())throw new Error('This shared library is no longer open.');setData(d);setSelected(d.artifact);setDraft(undefined);setAddExisting(false);return d.artifact;}
  catch(e){if(current())setError(failure(e));throw e;}finally{if(current())setBusy(false);}
 }
 function leaveStudyView(){
  if(work.current.busy||work.current.comment.trim()){setNavigationNotice('Finish your request, or send or clear your comment, before leaving this material.');return;}
  setSelected(undefined);
 }
 async function sendComment(){
  if(!selected)return;const current=beginWork();if(!current)return;
  try{const d=await request('comment',{shareId,artifactId:selected.id,body:work.current.comment});if(current()){setData(d);setComment('');}}
  catch(e){if(current())setError(failure(e));}finally{if(current())setBusy(false);}
 }
 return <><OrganizationDialog title={data?.share.title??'Shared files'} onClose={onClose} busy={busy||!!draft||!!comment.trim()} wide><div className="library-shared-room">{navigationNotice && <p role="status" className="nooks-org-helper">{navigationNotice}</p>}{!signedIn?<div className="nooks-library-empty"><UsersRound size={30}/><h2>Study together</h2><p>Sign in to open this shared folder or material.</p><button className="nooks-org-primary" onClick={()=>setSignIn(true)}>Connect account</button></div>:data?<><div className="library-shared-toolbar"><span><UsersRound size={16}/> {data.share.permission==='owner'?'Owner':`${data.share.permission[0].toUpperCase()}${data.share.permission.slice(1)} access`}</span><button className="nooks-org-secondary" disabled={busy||!!draft||!!comment.trim()} onClick={()=>void refresh()}>Refresh</button>{editable && data.share.kind==='course' && <><button className="nooks-library-share" disabled={busy||!!draft||!!comment.trim()} onClick={()=>void openMaterialPicker()}>Add material</button><button className="nooks-org-primary" disabled={busy||!!draft||!!comment.trim()} onClick={()=>setDraft({id:crypto.randomUUID(),kind:'note',title:'Untitled note',subject:'General',content:'',color:'mint',favorite:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}><Plus size={14}/>New note</button></>}</div>{addExisting && <div className="library-shared-picker"><p>Add a copy from your library</p>{!availableMaterials.length && <p>Your library is empty. Use New note to add the first material.</p>}{availableMaterials.map(item=><button className="nooks-org-secondary" key={item.id} disabled={busy||!!draft||!!comment.trim()} onClick={()=>void save({...item,id:crypto.randomUUID()}).catch(()=>{})}>{item.title}</button>)}</div>}<div className="library-shared-materials">{data.materials.map(item=><button className={`nooks-org-secondary ${selected?.id===item.id?'is-selected':''}`} disabled={busy||!!draft||!!comment.trim()} key={item.id} onClick={()=>{setSelected(item);setComment('');}}>{item.title}<UsersRound size={14}/></button>)}{!data.materials.length && !draft && <p>This folder is ready for its first material.</p>}</div>{draft?.kind==='note'?<form className="nooks-org-form" onSubmit={e=>{e.preventDefault();void save(draft).catch(()=>{});}}><label>Title<input required maxLength={180} value={draft.title} disabled={busy} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Note<textarea value={draft.content??''} maxLength={100000} disabled={busy} onChange={e=>setDraft({...draft,content:e.target.value})}/></label><footer><button type="button" className="nooks-org-secondary" disabled={busy} onClick={()=>setDraft(undefined)}>Cancel</button><button className="nooks-org-primary" disabled={busy||!draft.title.trim()}>{busy?'Saving…':'Save note'}</button></footer></form>:draft?<StudyEditor artifact={draft} recoveryScope={owner} onSave={save} onCancel={()=>setDraft(undefined)}/>:selected?<section className="library-shared-selected"><div className="library-shared-toolbar"><h2>{selected.title}</h2>{editable && <button className="nooks-library-share" disabled={busy||!!comment.trim()} onClick={()=>setDraft(selected)}>Edit</button>}</div>{selected.kind==='note'?<pre className="library-shared-note">{selected.content}</pre>:<StudyView key={`${selected.id}:${selected.revision}`} artifact={selected} saved={false} onExit={leaveStudyView} onProgress={()=>{}}/>}<section className="library-shared-comments"><h3>Comments</h3>{data.comments.filter(c=>c.artifactId===selected.id).map(c=><article key={c.id}><strong>{c.author}</strong><p>{c.body}</p></article>)}{canComment?<form onSubmit={e=>{e.preventDefault();void sendComment();}}><label>Add a comment<textarea maxLength={4000} value={comment} disabled={busy} onChange={e=>setComment(e.target.value)}/></label><button className="nooks-org-primary" disabled={busy||!comment.trim()}>Comment</button></form>:<p>You have view access. Ask the owner for comment or edit access.</p>}</section></section>:null}</>:!error?<p>Opening shared materials…</p>:null}{error && <p className="nooks-org-error" role="alert">{error}</p>}</div></OrganizationDialog>{signIn && <AccountDialog onClose={()=>setSignIn(false)}/>}</>;
}
export function LibraryInvitation() {
 const account=useNooksAccount(!isEmbedded);
 const [invitation,setInvitation]=useState(()=>window.location.hash.slice(1));const [closed,setClosed]=useState(false);
 const accepted=useRef(invitation),currentOwner=useRef(account.workspaceKey),navigationGuard=useRef<RoomNavigationGuard|null>(null);
 currentOwner.current=account.workspaceKey;
 function receiveInvitation(){
  const incoming=window.location.hash.slice(1);if(incoming===accepted.current)return;
  const guard=navigationGuard.current;
  if(guard?.owner===currentOwner.current&&!guard.canNavigate()){
   window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search+(accepted.current?'#'+accepted.current:''));return;
  }
  accepted.current=incoming;setInvitation(incoming);setClosed(false);
 }
 useEffect(()=>{window.addEventListener('hashchange',receiveInvitation);return()=>window.removeEventListener('hashchange',receiveInvitation);},[]);
 const params=new URLSearchParams(invitation),id=params.get('library-share');
 return id&&!closed?<SharedLibraryRoom shareId={id} token={params.get('token')??undefined} navigationGuard={navigationGuard} onClose={()=>{setClosed(true);accepted.current='';setInvitation('');window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}}/>:null;
}
