import { createWorkspace } from './seed.mjs';
import { InputError } from './errors.mjs';
import { validateSpace } from './space.mjs';
import { validateCommunityAction } from './community-tools.mjs';
import { isVerifiedSupabaseIdentity, serviceHeaders, sha256, supabaseOrigin } from './supabase-auth.mjs';
import { ARTWORK_BUCKET, ARTWORK_UUID, parseArtworkReference } from './artwork-lifecycle.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const HASH = /^[a-f0-9]{64}$/;
const MAX_ARTWORK_BYTES = 1048576;
const bytes64 = bytes => { let value=''; for(let i=0;i<bytes.length;i+=8192) value+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(value); };
// Enumerate only known appearance records; never recursively rewrite note/reference content.
const appearances = value => [value?.space, ...(Array.isArray(value?.nookCreator?.drafts) ? value.nookCreator.drafts.map(draft => draft?.space) : [])].filter(space => space && typeof space === 'object' && !Array.isArray(space));
const sceneIdentity = value => {
  if (!ARTWORK_UUID.test(value?.id ?? '') || !HASH.test(value?.snapshotHash ?? '')) throw new Error('Invalid published nook scene.');
  return { id: value.id, snapshotHash: value.snapshotHash };
};
function sceneAppearance(value) {
  const required = ['name', 'tagline', 'theme', 'accent', 'companion', 'layout', 'decorations'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && key !== 'room')) throw new Error('Invalid published nook appearance.');
  const result = validateSpace(value);
  if (Object.keys(value).length !== Object.keys(result).length || Object.keys(result).some(key => JSON.stringify(value[key]) !== JSON.stringify(result[key]))) throw new Error('Invalid published nook appearance.');
  return result;
}
async function boundedArtworkBytes(response) {
  if (!response.ok) throw new Error('Saved artwork is temporarily unavailable.');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_ARTWORK_BYTES)) { await response.body?.cancel(); throw new Error('Saved artwork exceeds its storage limit.'); }
  if (!response.body) throw new Error('Saved artwork is empty.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_ARTWORK_BYTES) throw new Error('Saved artwork exceeds its storage limit.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (!size) throw new Error('Saved artwork is empty.');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Request-scoped, account-bound store. Never put the service key in a browser bundle. */
export class SupabaseStore {
  constructor({ url, serviceKey, identity, fetchImpl = fetch, clock = () => new Date(), maxWorkspaceBytes = 16 * 1024 * 1024, onArtworkUnavailable = () => {} }) {
    if (!isVerifiedSupabaseIdentity(identity)) throw new Error('A server-verified Nooks identity is required.');
    this.origin=supabaseOrigin(url); this.headers=serviceHeaders(serviceKey); this.identity=identity;
    // Call as a free function: Workers' native fetch rejects the store as its receiver.
    this.fetch=(...args)=>fetchImpl(...args); this.clock=clock; this.maxWorkspaceBytes=maxWorkspaceBytes; this.pending=null; this.busy=false; this.knownImages=new Set(); this.hydratedImages=new Map(); this.preparedImages=new Map(); this.onArtworkUnavailable=onArtworkUnavailable;
  }
  account(userId) { if (userId !== this.identity.id) throw new InputError('This study space belongs to another account.','FORBIDDEN'); return this.identity.id; }
  async rpc(name, args) {
    const response=await this.fetch(`${this.origin}/rest/v1/rpc/${name}`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...this.headers,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(!response.ok){ let code; try { code=(await response.json()).code; } catch {}
      if(code==='42501') throw new InputError('You do not have access to this nook or study item.','FORBIDDEN');
      if(code==='22023'||code==='22P02') throw new InputError('Nooks could not use these details. Check the selected nook and try again.','INVALID_INPUT');
      if(code==='54000'&&name==='nooks_artwork_reserve')throw new InputError('Artwork uploads are limited to 100 new images per day and 128 pending or retained image uploads. Try again later; removed images remain retained until retention cleanup.','ARTWORK_LIMIT');
      if(code==='54000') throw new InputError('Your study storage is full. Remove older items before saving more.','STORAGE_FULL');
      if(code==='40001') throw new InputError('Your saved artwork changed or is no longer available. Refresh and retry; your existing study work is unchanged.','ARTWORK_CONFLICT');
      throw new Error('Nooks storage is temporarily unavailable. Your existing work has not been replaced.');
    }
    return response.json();
  }
  empty(){const value=createWorkspace(this.clock().toISOString());value.revision=0;value.artifacts=[];value.plan.tasks=[];value.roomProgress={};return value;}
  async prepareArtwork(value, owner=this.identity.id, { requireGeneration = false } = {}){
    const stored=structuredClone(value),images=new Map();
    // Hydration warnings describe this read, never durable workspace content.
    delete stored.artworkWarnings;
    for(const space of appearances(stored)){
      const original=space._storedBackground?parseArtworkReference(space._storedBackground,owner):null;
      if(!space.backgroundImage)continue;
      validateSpace(space);
      const image=space.backgroundImage,mime=image.slice(5,image.indexOf(';')),content=Uint8Array.from(atob(image.slice(image.indexOf(',')+1)),c=>c.charCodeAt(0));
      const hash=await sha256(content);
      // Keep the exact generation, including legacy refs, through hydrate/repack.
      // Server normalization may remove the private field; only a full-path
      // cache entry whose downloaded bytes match may restore it in that case.
      let ref=original?.hash===hash&&original.mime===mime?{path:original.path,mime}:null;
      if(!ref)for(const [key,cached] of this.hydratedImages){if(cached===image&&key.startsWith(`${owner}/`)){const path=key.slice(0,key.lastIndexOf(':'));const source=parseArtworkReference({path,mime},owner);if(source.hash===hash){ref={path,mime};break;}}}
      if(requireGeneration && ref && !parseArtworkReference(ref,owner).generation)ref=null;
      delete space.backgroundImage;
      if(ref){space._storedBackground=ref;continue;}
      if(owner!==this.identity.id)throw new InputError('Artwork can only be uploaded to the connected account.','FORBIDDEN');
      const key=`${owner}/${hash}:${mime}`;
      let upload=this.preparedImages.get(key);
      if(!upload){const requestId=crypto.randomUUID();upload={owner,hash,mime,content,image,requestId,path:`${owner}/${hash}/${requestId}`,targets:[]};this.preparedImages.set(key,upload);}
      space._storedBackground={path:upload.path,mime};upload.targets.push(space);images.set(key,upload);
    }
    return {stored,images};
  }
  async uploadArtwork(prepared){
    for(const [key,upload] of prepared.images){
      const {owner,hash,mime,content,image,requestId}=upload;
      try{
        if(!upload.uploaded){
          const reservation=await this.rpc('nooks_artwork_reserve',{p_account:owner,p_hash:hash,p_mime:mime,p_request_id:requestId});
          const ref=parseArtworkReference({path:reservation?.path,mime:reservation?.mime},owner);
          if(ref.hash!==hash||ref.mime!==mime||!ref.generation||ref.generation!==reservation.generation||!ARTWORK_UUID.test(reservation.pinToken??'')||!Number.isFinite(Date.parse(reservation.pinUntil))||Date.parse(reservation.pinUntil)<=this.clock().valueOf()||!['reserved','ready'].includes(reservation.state))throw new Error('Invalid artwork reservation.');
          upload.path=ref.path;
          for(const target of upload.targets)target._storedBackground={path:ref.path,mime};
          // Never upsert a generation. An ambiguous upload/409 is left reserved
          // for cleanup; only a successful response can authorize completion.
          if(reservation.state==='ready'){
            const verify=await this.fetch(`${this.origin}/storage/v1/object/authenticated/${ARTWORK_BUCKET}/${ref.path}`,{headers:this.headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
            if(await sha256(await boundedArtworkBytes(verify))!==hash)throw new Error('Artwork upload could not be verified.');
          }else{
            const response=await this.fetch(`${this.origin}/storage/v1/object/${ARTWORK_BUCKET}/${ref.path}`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...this.headers,'Content-Type':mime,'x-upsert':'false'},body:content});
            if(!response.ok)throw new Error('Artwork upload outcome is unknown.');
            const complete=await this.rpc('nooks_artwork_complete',{p_account:owner,p_path:ref.path,p_pin_token:reservation.pinToken});
            if(complete?.accepted!==true||complete.state!=='ready')throw new Error('Artwork upload reservation expired.');
          }
          upload.uploaded=true;this.knownImages.add(`${ref.path}:${mime}`);this.hydratedImages.set(`${ref.path}:${mime}`,image);
        }
      }catch(error){
        // A later user retry receives a fresh generation. Never clear a pin on
        // an uncertain outcome: the fixed SQL deadline and tombstone reaper own it.
        this.preparedImages.delete(key);
        if(error?.code==='ARTWORK_LIMIT')throw error;
        throw new Error('Your image could not be saved. Your existing work is unchanged.');
      }
    }
  }
  async pack(value, owner=this.identity.id){
    const prepared=await this.prepareArtwork(value,owner);
    await this.uploadArtwork(prepared);
    return prepared.stored;
  }
  /** Called only with a draft loaded from this account's authoritative workspace.
   * Legacy pixels get a new immutable generation through the normal upload path. */
  async preparePublicationArtwork(space) {
    const owner = this.identity.id;
    let ref = space?._storedBackground ? parseArtworkReference(space._storedBackground, owner) : null;
    if (!ref?.generation) {
      const image = space?.backgroundImage ?? (ref ? await this.readArtwork(ref, owner) : null);
      if (!image) throw new InputError('Save and review your custom image before publishing.', 'INVALID_INPUT');
      const prepared = await this.prepareArtwork({ space: { ...validateSpace(space), backgroundImage: image } }, owner, { requireGeneration: true });
      await this.uploadArtwork(prepared);
      ref = parseArtworkReference(prepared.stored.space._storedBackground, owner);
      space._storedBackground = { path: ref.path, mime: ref.mime };
    }
    // Review binds only a ready generation belonging to this verified owner.
    // Publication rechecks it atomically under the database artwork lock.
    const url = new URL(`${this.origin}/rest/v1/nooks_artwork_assets`);
    url.searchParams.set('account_id', `eq.${owner}`); url.searchParams.set('generation', `eq.${ref.generation}`);
    url.searchParams.set('select', 'account_id,generation,content_hash,mime,path,state'); url.searchParams.set('limit', '2');
    const response = await this.fetch(url.toString(), { headers: this.headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Your saved artwork could not be verified. Try reviewing it again.');
    const rows = await response.json(), asset = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!asset || asset.account_id !== owner || asset.generation !== ref.generation || asset.path !== ref.path || asset.content_hash !== ref.hash || asset.mime !== ref.mime || asset.state !== 'ready') throw new InputError('Your saved artwork changed or is no longer available. Reload the draft before publishing.', 'ARTWORK_CONFLICT');
    return ref.generation;
  }
  async publishNookArtwork(args) {
    if (!args || Object.keys(args).some(key => !['intentId', 'snapshotHash'].includes(key)) || !ARTWORK_UUID.test(args.intentId ?? '') || !HASH.test(args.snapshotHash ?? '')) throw new InputError('Invalid reviewed publication.');
    const result = await this.rpc('nooks_nook_publish_artwork', { p_actor: this.identity.id, p_intent_id: args.intentId, p_snapshot_hash: args.snapshotHash });
    const scene = sceneIdentity(result?.scene), nookScene = sceneIdentity(result?.nook?.scene);
    if (scene.id !== nookScene.id || scene.snapshotHash !== args.snapshotHash || nookScene.snapshotHash !== args.snapshotHash || !ARTWORK_UUID.test(result?.nook?.id ?? '')) throw new Error('The published scene could not be verified. Retry this publication.');
    // Never leak the RPC's internal generation receipt into model/browser data.
    return { nook: { ...result.nook, scene: nookScene }, scene, duplicate: result.duplicate === true };
  }
  async readArtwork(reference, owner) {
    const ref = parseArtworkReference({ path: reference.path, mime: reference.mime }, owner), cacheKey = `${ref.path}:${ref.mime}`;
    if (this.hydratedImages.has(cacheKey)) return this.hydratedImages.get(cacheKey);
    const response = await this.fetch(`${this.origin}/storage/v1/object/authenticated/${ARTWORK_BUCKET}/${ref.path}`, { headers: this.headers, redirect: 'manual', signal: AbortSignal.timeout(3000), cache: 'no-store' });
    const bytes = await boundedArtworkBytes(response);
    if (await sha256(bytes) !== ref.hash) throw new Error('Saved artwork content does not match its reference.');
    const result = `data:${ref.mime};base64,${bytes64(bytes)}`;
    validateSpace({ backgroundImage: result });
    this.hydratedImages.set(cacheKey, result);
    return result;
  }
  async readNookScene(nookId) {
    if (!ARTWORK_UUID.test(nookId ?? '')) throw new InputError('Invalid nookId.');
    // Reauthorize before every cache access, including on a reused request store.
    const result = await this.rpc('nooks_nook_scene_read', { p_actor: this.identity.id, p_nook: nookId });
    if (result?.nookId !== nookId) throw new Error('The selected nook scene could not be verified.');
    if (result.scene === null) return { nookId, scene: null, appearance: null, recoveryScope: `account:${this.identity.id}` };
    const scene = sceneIdentity(result.scene), appearance = sceneAppearance(result.scene?.appearance), artwork = result.artwork;
    if (!artwork || !ARTWORK_UUID.test(artwork.accountId ?? '') || !HASH.test(artwork.contentHash ?? '')) throw new Error('Invalid authorized nook artwork.');
    const ref = parseArtworkReference({ path: artwork.path, mime: artwork.mime }, artwork.accountId);
    if (!ref.generation || ref.generation !== result.scene.generation || ref.hash !== artwork.contentHash) throw new Error('Invalid authorized nook artwork.');
    const backgroundImage = await this.readArtwork(ref, artwork.accountId);
    return { nookId, scene, appearance: { ...appearance, backgroundImage }, recoveryScope: `account:${this.identity.id}` };
  }
  async unpack(value, owner=this.identity.id){
    const workspace=structuredClone(value), spaces=appearances(workspace), loads=new Map();
    delete workspace.artworkWarnings;
    for(const space of spaces)if(space._storedBackground)parseArtworkReference(space._storedBackground,owner);
    // Artwork is optional for studying. Hydrate different images together, and a repeated
    // reference only once, within one short timeout rather than one timeout per draft.
    await Promise.all(spaces.map(async space=>{
      const ref=space._storedBackground;if(!ref)return;
      const cacheKey=`${ref.path}:${ref.mime}`;
      let image=this.hydratedImages.get(cacheKey);
      if(!image){
        if(!loads.has(cacheKey))loads.set(cacheKey,(async()=>{
          return this.readArtwork(ref,owner);
        })());
        try{image=await loads.get(cacheKey);}catch{
          // Keep the owned address so a storage outage cannot erase saved artwork.
          delete space.backgroundImage;
          (workspace.artworkWarnings??=[]).push({code:'ARTWORK_UNAVAILABLE',message:'Saved artwork could not be loaded. Your image reference is preserved; other study work remains available.'});
          return;
        }
      }
      this.knownImages.add(cacheKey);
      space.backgroundImage=image;
    }));
    if(workspace.artworkWarnings?.length)try{Promise.resolve(this.onArtworkUnavailable({count:Math.min(workspace.artworkWarnings.length,100)})).catch(()=>{});}catch{}
    return workspace;
  }
  async load(userId){
    const owner=this.account(userId),record=await this.rpc('nooks_workspace_read',{p_account:owner});
    if(!record?.workspace)return {revision:0,workspace:this.empty()};
    if(!Number.isSafeInteger(record.revision)||record.revision<0)throw new Error('Invalid authoritative workspace revision.');
    const workspace=await this.unpack(record.workspace);
    // The database counter wins over any legacy or client-supplied document field.
    workspace.revision=record.revision;
    return {revision:record.revision,workspace};
  }
  async read(userId){return (await this.load(userId)).workspace;}
  /** Poll only the session JSON; fetch bounded id/kind metadata solely for a pending target. */
  async readNavigationState(userId, { includeArtifacts = false } = {}) {
    const owner = this.account(userId);
    const readRows = async (table, select, limit) => {
      const url = new URL(`${this.origin}/rest/v1/${table}`);
      url.searchParams.set('account_id', `eq.${owner}`);
      url.searchParams.set('select', select);
      url.searchParams.set('limit', String(limit));
      // Workers supports manual redirects; reject 3xx below without forwarding credentials.
      const response = await this.fetch(url.toString(), { headers: this.headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Nooks tab connection is temporarily unavailable.');
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > limit) throw new Error('Invalid Nooks tab connection response.');
      return rows;
    };
    const rows = await readRows('nooks_workspaces', 'sessions:document->workspaceSessions', 1);
    const state = { workspaceSessions: rows[0]?.sessions ?? [] };
    if (includeArtifacts) {
      const artifacts = await readRows('nooks_artifacts', 'id,kind', 1001);
      if (artifacts.length > 1000 || artifacts.some(item => typeof item?.id !== 'string' || typeof item?.kind !== 'string')) throw new Error('Invalid study item metadata.');
      state.artifacts = artifacts.map(({ id, kind }) => ({ id, kind }));
    }
    return state;
  }
  async transact(userId,mutate){
    const owner=this.account(userId);if(this.busy)throw new Error('Use one SupabaseStore per request.');this.busy=true;
    try{for(let attempt=0;attempt<5;attempt++){
      const {revision,workspace}=await this.load(userId);if(revision>=Number.MAX_SAFE_INTEGER)throw new Error('Workspace revision limit reached.');this.pending=[];let value;
      try{value=await mutate(workspace);}catch(error){this.pending=null;throw error;}
      const operations=this.pending;this.pending=null;workspace.revision=revision+1;workspace.updatedAt=this.clock().toISOString();
      const prepared=await this.prepareArtwork(workspace),stored=prepared.stored,serialized=JSON.stringify(stored);
      if(encoder.encode(serialized).length>this.maxWorkspaceBytes)throw new InputError('Your study storage is full. Remove older items before saving more.','STORAGE_FULL');
      const packedOperations=[],shareArtwork=[];for(const op of operations){if(op.kind==='publish'){const publication=await this.prepareArtwork(op.snapshot);shareArtwork.push(publication);packedOperations.push({...op,snapshot:publication.stored});}else packedOperations.push(op);}
      // Validate every local payload and the packed workspace limit before any
      // external upload. CAS/network failures still require deferred cleanup.
      await this.uploadArtwork(prepared);for(const publication of shareArtwork)await this.uploadArtwork(publication);
      const commit=await this.rpc('nooks_workspace_commit',{p_account:owner,p_expected_revision:revision,p_workspace:stored,p_share_operations:packedOperations});
      if(commit?.committed===true){
        if(!appearances(workspace).some(space=>space._storedBackground&&!space.backgroundImage))delete workspace.artworkWarnings;
        return {...value,workspace:structuredClone(workspace)};
      }
    }throw new InputError('Your study space changed in another session. Try saving again.','CONFLICT');}
    finally{this.pending=null;this.busy=false;}
  }
  async publishShare(userId,snapshot){this.account(userId);if(!this.pending)throw new Error('Share publication requires a workspace transaction.');
    if(!UUID.test(snapshot?.id??'')||Object.keys(snapshot).some(key=>!['id','url','createdAt','space','description','stats','roomDisplay'].includes(key)))throw new InputError('Only appearance and explicitly selected progress can be shared.');
    this.pending.push({kind:'publish',id:snapshot.id,snapshot:structuredClone(snapshot)});
  }
  async readShare(id){if(!UUID.test(id??''))return null;const record=await this.rpc('nooks_share_read',{p_share:id});return record?.snapshot?this.unpack(record.snapshot,record.owner):null;}
  async revokeShare(userId,id){const owner=this.account(userId);if(!this.pending)throw new Error('Share revocation requires a workspace transaction.');if(!UUID.test(id??''))return false;
    const record=await this.rpc('nooks_share_read',{p_share:id});if(record?.owner!==owner)return false;this.pending.push({kind:'revoke',id});return true;
  }
  async community(action,args={}){
    const safe=validateCommunityAction(action,args);
    if(action==='nook_scene_get')return this.readNookScene(safe.nookId);
    let token;
    if(action==='create_invite'){token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');safe.tokenHash=await sha256(token);}
    if(action==='accept_invite'){if(typeof safe.token!=='string'||!/^[a-f0-9]{64}$/i.test(safe.token))throw new InputError('Invalid invitation token.');safe.tokenHash=await sha256(safe.token);delete safe.token;}
    const result=await this.rpc('nooks_community',{p_actor:this.identity.id,p_action:action,p_args:safe});
    if(action==='list_nooks'){
      // A directory refresh restores the caller's chosen profile, never another
      // member's display name or client-supplied identity. No workspace hydration.
      const url=new URL(`${this.origin}/rest/v1/nooks_profiles`);
      url.searchParams.set('account_id',`eq.${this.identity.id}`);url.searchParams.set('select','account_id,display_name,avatar');url.searchParams.set('limit','1');
      const response=await this.fetch(url.toString(),{headers:this.headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Your study profile is temporarily unavailable.');
      const rows=await response.json(),profile=Array.isArray(rows)&&rows.length===1?rows[0]:null;
      if(!profile||profile.account_id!==this.identity.id||typeof profile.display_name!=='string'||!profile.display_name.trim()||profile.display_name.length>80||!Number.isSafeInteger(profile.avatar)||profile.avatar<0||profile.avatar>7)throw new Error('Your saved study profile could not be verified.');
      result.profile={id:this.identity.id,displayName:profile.display_name,avatar:profile.avatar};
    }
    if(token&&result?.invite)result.invite.token=token;
    // The model-result boundary removes this UI-only owner binding.
    return {...result,recoveryScope:`account:${this.identity.id}`};
  }
}

/** Service-only dispatcher client; instantiate separately from user request adapters. */
export function createSupabaseOutbox({url,serviceKey,fetchImpl=fetch}){
  const origin=supabaseOrigin(url),headers=serviceHeaders(serviceKey);
  const rpc=async(name,args)=>{const response=await fetchImpl(`${origin}/rest/v1/rpc/${name}`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!response.ok)throw new Error('Nooks event delivery is temporarily unavailable.');return response.json();};
  return {
    claim:({limit=25,leaseSeconds=60}={})=>rpc('nooks_outbox_claim',{p_limit:limit,p_lease_seconds:leaseSeconds}),
    acknowledge:({id,leaseToken,success,error})=>rpc('nooks_outbox_ack',{p_id:id,p_lease_token:leaseToken,p_success:success,p_error:error??null}),
    ingest:({source,eventId,payloadHash,eventType})=>rpc('nooks_webhook_receive',{p_source:source,p_event_id:eventId,p_payload_hash:payloadHash,p_event_type:eventType}),
  };
}
