import { InputError } from './errors.mjs';
import { ROOM_IDS } from './space.mjs';
const id = { type: 'string', format: 'uuid' };
const page = { offset: { type: 'integer', minimum: 0, maximum: 100000 }, limit: { type: 'integer', minimum: 1, maximum: 50 } };
const schema = (properties = {}, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const definitions = [
 ['nooks_list', 'Discover study nooks', 'List accessible public and joined private study nooks with current online counts. No sample people are returned.', 'list_nooks', schema({...page,joinedOnly:{type:'boolean'}}), true],
 ['nook_join', 'Join a study nook', 'Join a public study nook the user chose. Private nooks require an invitation. Membership allows the user’s study profile to appear to other members.', 'join_nook', schema({nookId:id}, ['nookId']), false],
 ['nook_leave', 'Leave a study nook', 'Leave a joined study nook. Previous earned focus history remains in the account.', 'leave_nook', schema({nookId:id}, ['nookId']), false],
 ['nook_snapshot', 'Read a study lobby', 'Read the current members and verified focus leaderboard in a nook the user belongs to.', 'nook_snapshot', schema({nookId:id,...page}, ['nookId']), true],
 ['nook_scene_get', 'Open a nook backdrop', 'Load the immutable backdrop of one selected accessible nook. Public nooks require a connected account; private nooks require active membership. Artwork and appearance are delivered only to the interface, never as model context.', 'nook_scene_get', schema({nookId:id}, ['nookId']), true],
 ['nook_presence', 'Update study presence', 'Record that the user is currently viewing a joined nook. Presence never awards study points.', 'heartbeat', schema({nookId:id}, ['nookId']), false],
 ['profile_update', 'Save your study profile', 'Set the display name and illustrated avatar visible to other members of your study nooks. Never derive a real name without the user choosing it.', 'update_profile', schema({displayName:{type:'string',minLength:1,maxLength:28},avatar:{type:'integer',minimum:0,maximum:7}}, ['displayName','avatar']), false],
 ['nook_create', 'Create a study nook', 'Create a public or invitation-only nook from an existing illustrated backdrop. Only publish publicly when the user explicitly chooses public. Reuse requestId on retry.', 'create_nook', schema({requestId:id,title:{type:'string',minLength:1,maxLength:54},description:{type:'string',maxLength:220},roomId:{type:'string',enum:ROOM_IDS},visibility:{type:'string',enum:['public','private']}},['requestId','title','roomId','visibility']), false],
 ['nook_invite_create', 'Create a private nook invitation', 'Create an expiring invitation only for a nook you own. Share the returned code only with people you choose.', 'create_invite', schema({nookId:id,expiresInHours:{type:'integer',minimum:1,maximum:168},maxUses:{type:'integer',minimum:1,maximum:25}},['nookId']), false],
 ['nook_archive', 'Archive your study nook', 'Archive a nook you own only after the user explicitly asks to close it. Removes it from discovery, ends memberships and stops community focus credit. Saved study material and earned history remain.', 'archive_nook', schema({nookId:id},['nookId']), false],
 ['nook_invites_list', 'Review your nook invitations', 'List invitation status for a nook you own. No invitation codes or token hashes are returned. Use nextOffset to continue.', 'list_invites', schema({nookId:id,...page},['nookId']), true],
 ['nook_invite_revoke', 'Revoke a nook invitation', 'Disable a selected invitation for a nook you own. People who have already joined remain members.', 'revoke_invite', schema({nookId:id,inviteId:id},['nookId','inviteId']), false],
 ['nook_invite_accept', 'Accept a nook invitation', 'Join the nook represented by an invitation code provided by the user.', 'accept_invite', schema({token:{type:'string',minLength:64,maxLength:64,pattern:'^[a-fA-F0-9]{64}$'}},['token']), false],
];
export const communityTools = definitions.map(([name,title,description,action,inputSchema,readOnly]) => ({ name,title,description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:['nook_leave','nook_archive','nook_invite_revoke'].includes(name),idempotentHint:!['nook_invite_create'].includes(name),openWorldHint:['nook_create','nook_join','nook_invite_create'].includes(name)},_meta:{'openai/widgetAccessible':true} }));
const actions = new Map(definitions.map(([name,,,action]) => [name,action]));
const actionSchemas = new Map(definitions.map(([,,,action,inputSchema]) => [action, inputSchema]));
/** Enforce the advertised limits even when a client bypasses MCP schema validation. */
export function validateCommunityAction(action, args = {}) {
  const shape = actionSchemas.get(action);
  if (!shape || !args || typeof args !== 'object' || Array.isArray(args)) throw new InputError('Invalid nook action.');
  const safe = { ...args };
  // Identity is always bound by the server; legacy clients may still send these ignored keys.
  for (const key of ['actor', 'accountId', 'userId']) delete safe[key];
  if (action === 'create_nook' && !ROOM_IDS.includes(safe.roomId)) throw new InputError('Choose an available curated nook scene.');
  if (Object.keys(safe).some(key => !Object.hasOwn(shape.properties, key))) throw new InputError('Unsupported nook setting.');
  for (const key of shape.required) if (safe[key] === undefined) throw new InputError(`${key} is required.`);
  for (const [key, value] of Object.entries(safe)) {
    const rule = shape.properties[key];
    if (rule.type === 'integer') {
      if (!Number.isSafeInteger(value) || value < rule.minimum || value > rule.maximum) throw new InputError(`${key} must be an integer from ${rule.minimum} to ${rule.maximum}.`);
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') throw new InputError(`Invalid ${key}.`);
    } else {
      if (typeof value !== 'string' || value.length > (rule.maxLength ?? 256) || value.trim().length < (rule.minLength ?? 0)) throw new InputError(`Invalid ${key}.`);
      if (rule.format === 'uuid' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new InputError(`Invalid ${key}.`);
      if (rule.enum && !rule.enum.includes(value) || rule.pattern && !new RegExp(rule.pattern).test(value)) throw new InputError(`Invalid ${key}.`);
      safe[key] = rule.format === 'uuid' || key === 'token' ? value.toLowerCase() : value.trim();
    }
  }
  return safe;
}
export const isCommunityTool = name => actions.has(name);
export async function invokeCommunity(store, name, args) {
  const action=actions.get(name); if (!action) throw new Error('Unknown community action.');
  return store.community(action,args);
}
