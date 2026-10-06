import { randomBytes } from 'node:crypto';
import { InputError, validateArtifact } from './engine.mjs';
import { sha256 } from './supabase-auth.mjs';
export const librarySharingTools = new Set(['library_share_create','library_share_list','library_share_get','library_share_join','library_share_revoke','library_share_save','library_share_comment']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function invokeLibrarySharing(store, identity, name, args, baseUrl) {
 const action = name.replace('library_share_', '');
 if (!librarySharingTools.has(name)) throw new InputError('Unknown sharing action.');
 const allowed = { create:['kind','targetId','permission'],list:[],get:['shareId'],join:['shareId','token'],revoke:['shareId'],save:['shareId','artifact','expectedRevision'],comment:['shareId','artifactId','body'] }[action];
 if (Object.keys(args).some(key => !allowed.includes(key))) throw new InputError('Unexpected sharing field.');
 const clean = {...args}; let token;
 if (action === 'create') {
  if (!['course','material'].includes(args.kind) || !['edit','comment','view'].includes(args.permission) || typeof args.targetId !== 'string' || !args.targetId || args.targetId.length > 128) throw new InputError('Choose a course or material and a sharing permission.');
  token=randomBytes(32).toString('hex');clean.tokenHash=await sha256(token);
 } else if (action !== 'list' && !uuid.test(args.shareId ?? '')) throw new InputError('Invalid sharing link.');
 if (action === 'join') { if (!/^[a-f0-9]{64}$/.test(args.token ?? '')) throw new InputError('This invitation is not valid.'); clean.tokenHash=await sha256(args.token);delete clean.token; }
 if (action === 'save') {
  if (args.expectedRevision !== undefined && (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1)) throw new InputError('Invalid material revision.');
  clean.artifact=validateArtifact(args.artifact);
 }
 if (action === 'comment' && (typeof args.body !== 'string' || !args.body.trim() || args.body.length > 4000 || typeof args.artifactId !== 'string' || args.artifactId.length > 128)) throw new InputError('Write a comment of up to 4000 characters.');
 const result=await store.rpc('nooks_library_action',{p_account:identity.id,p_action:action,p_args:clean});
 if (token) { const url=new URL(baseUrl); url.search='';url.hash=`library-share=${result.share.id}&token=${token}`;result.share.url=url.href; }
 return result;
}
