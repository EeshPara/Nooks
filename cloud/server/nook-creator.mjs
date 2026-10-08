import { InputError } from './errors.mjs';
import { ROOM_IDS, validateSpace } from './space.mjs';
import { isVerifiedSupabaseIdentity } from './supabase-auth.mjs';
import { artworkToolNames, validateArtworkArgs, callArtwork, artworkStatus, artworkDraftForUI, preserveArtworkRequest, pruneArtworkMetadata } from './nook-artwork.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const styles = ['illustration', 'anime', 'watercolor', 'pixel', 'realistic', 'cinematic'];
const reads = new Set(['nook_drafts_list', 'nook_draft_get', 'nook_draft_preview']);
export const creatorToolNames = new Set([...reads, ...artworkToolNames, 'nook_draft_save', 'nook_draft_delete', 'nook_publish_prepare', 'nook_publish_commit']);
const id = (value, label) => { if (typeof value !== 'string' || !UUID.test(value)) throw new InputError(`${label} must be a UUID.`); return value.toLowerCase(); };
const text = (value, label, max, optional = false) => { if (optional && value === undefined) return ''; if (typeof value !== 'string' || value.length > max || !optional && !value.trim()) throw new InputError(`${label} must be text of up to ${max} characters.`); return value.trim(); };
const revision = value => { if (!Number.isSafeInteger(value) || value < 0) throw new InputError('expectedRevision must be a nonnegative integer.'); return value; };
const copy = value => structuredClone(value);
function stateOf(workspace) {
  if (workspace.nookCreator === undefined) workspace.nookCreator = { schemaVersion: 1, drafts: [], publicationIntents: [] };
  const state = workspace.nookCreator;
  if (state?.schemaVersion !== 1 || !Array.isArray(state.drafts) || !Array.isArray(state.publicationIntents)) throw new InputError('Saved nook drafts could not be read safely.', 'STORAGE_INVALID');
  return state;
}
function enforceBudget(state) {
  if (state.drafts.length > 24 || state.publicationIntents.length > 100) throw new InputError('Remove old drafts before creating more.', 'STORAGE_FULL');
  if (state.drafts.filter(draft => draft.space?.backgroundImage || draft.space?._storedBackground).length > 3) throw new InputError('You can keep three custom-image drafts. Remove an older image draft before adding another.', 'STORAGE_FULL');
  if (new TextEncoder().encode(JSON.stringify(state)).length > 4 * 1024 * 1024) throw new InputError('Your private nook drafts have reached their storage limit.', 'STORAGE_FULL');
}
function getDraft(state, draftId) { const draft = state.drafts.find(item => item.id === draftId); if (!draft) throw new InputError('This private nook draft was not found.', 'NOT_FOUND'); return draft; }
function summary(draft, now) { return { id: draft.id, title: draft.title, description: draft.description, revision: draft.revision, style: draft.style, artworkMode: draft.artworkMode, roomId: draft.space.backgroundImage || draft.space._storedBackground ? 'custom' : roomOf(draft.space), hasArtwork: !!(draft.space.backgroundImage || draft.space._storedBackground), visibility: draft.visibility, createdAt: draft.createdAt, updatedAt: draft.updatedAt, ...(draft.artworkRequest ? { artworkRequest: artworkStatus(draft.artworkRequest, now) } : {}) }; }
function roomOf(space) { return ROOM_IDS.includes(space.room) ? space.room : ({ botanical: 'rainy-library', moonlight: 'rainy-library', sunrise: 'sakura-garden', lavender: 'sakura-garden', sky: 'midnight-train' })[space.theme] ?? 'rainy-library'; }
export function nookDraftReadiness(draft) {
  const blockers = [];
  if (draft.artworkMode !== 'curated' && !draft.space.backgroundImage && !draft.space._storedBackground) blockers.push({ code: 'IMAGE_NOT_RECEIVED', message: 'Your custom image has not been saved yet. Complete the artwork handoff or choose an image before previewing this nook.' });
  if (draft.space.backgroundImage || draft.space._storedBackground || draft.artworkMode !== 'curated') blockers.push({ code: 'CUSTOM_PUBLICATION_UNAVAILABLE', message: 'Custom artwork can be saved privately. Choose a gallery scene to publish a shared nook.' });
  return { readyToPublish: blockers.length === 0, blockers, supportedAction: blockers.length ? null : 'curated_publish', createsNewNook: true, guidance: 'Publication creates a separate community from the reviewed curated backdrop. It never silently edits or unlists an existing community.' };
}
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
async function digest(value) { const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))); return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function validateDraft(input, previous = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('draft must be an object.');
  const title = text(input.title, 'title', 54), description = text(input.description === undefined ? previous?.description : input.description, 'description', 220, true);
  if (input.space !== undefined && (!input.space || typeof input.space !== 'object' || Array.isArray(input.space))) throw new InputError('draft.space must be an appearance object.');
  const appearance = { ...(previous?.space ?? {}), ...(input.space ?? {}), name: title, tagline: description };
  const style = input.style ?? previous?.style ?? 'illustration', artworkMode = input.artworkMode ?? previous?.artworkMode ?? (appearance.backgroundImage ? 'upload' : 'curated');
  if (!styles.includes(style) || !['curated', 'upload', 'chatgpt'].includes(artworkMode)) throw new InputError('Choose a supported scene style and image source.');
  if (input.visibility !== undefined && !['private', 'public'].includes(input.visibility)) throw new InputError('visibility must be private or public.');
  if (input.pathTemplate !== undefined && input.pathTemplate !== 'none') throw new InputError('Creator reward paths are not available yet. Choose no path for now.');
  // Selecting a curated scene is an explicit replacement. Other partial edits
  // preserve the prior pixels whether they are hydrated or temporarily offline.
  if (input.artworkMode === 'curated') delete appearance.backgroundImage;
  const space = validateSpace(appearance);
  if (previous?.space?._storedBackground && input.artworkMode !== 'curated' && !Object.hasOwn(input.space ?? {}, 'backgroundImage')) space._storedBackground = copy(previous.space._storedBackground);
  return { id: input.id === undefined ? crypto.randomUUID() : id(input.id, 'draft.id'), title, description, space, style, artworkMode, scenePrompt: text(input.scenePrompt === undefined ? previous?.scenePrompt : input.scenePrompt, 'scenePrompt', 2000, true), visibility: input.visibility ?? previous?.visibility ?? 'private', pathTemplate: 'none' };
}

/** Owner-only drafts. Never receives actor IDs or performs autonomous image generation. */
export class NookCreator {
  constructor(store, { clock = () => new Date() } = {}) { this.store = store; this.clock = clock; }
  async call(name, args = {}, user = null) {
    if (!creatorToolNames.has(name)) throw new InputError('Unknown nook creator action.');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new InputError('Arguments must be an object.');
    if (!user?.id) throw new InputError('Connect your account to save or read private nook drafts.', 'AUTH_REQUIRED');
    const permission = reads.has(name) ? 'notable.read' : 'notable.write';
    if (!user.scopes?.includes(permission)) throw new InputError(`The account needs ${permission} permission.`, 'INSUFFICIENT_SCOPE');
    if (artworkToolNames.has(name) && !user.scopes.includes('notable.read')) throw new InputError('The account needs notable.read and notable.write permission.', 'INSUFFICIENT_SCOPE');
    const artworkArgs = artworkToolNames.has(name) ? validateArtworkArgs(name, args) : null;
    const envelope = result => ({ authenticated: true, mode: user.demo ? 'local-demo' : 'connected', ...result,
      ...(isVerifiedSupabaseIdentity(user) ? { recoveryScope: `account:${user.id}` } : {}),
    });
    if (reads.has(name)) {
      const workspace = await this.store.read(user.id), state = stateOf(workspace);
      const now = this.clock().toISOString();
      if (name === 'nook_drafts_list') return envelope({ drafts: state.drafts.map(draft => summary(draft, now)), publications: state.publicationIntents.map(item => ({ id: item.id, draftId: item.draftId, draftRevision: item.draftRevision, status: item.status, visibility: item.visibility, nookId: item.nookId, createdAt: item.createdAt })) });
      const draft = getDraft(state, id(args.draftId, 'draftId'));
      return envelope({ draft: artworkDraftForUI(draft, now), readiness: nookDraftReadiness(draft) });
    }
    if (name === 'nook_publish_commit') return envelope(await this.commit(args, user));
    const now = this.clock().toISOString();
    return envelope(await this.store.transact(user.id, async workspace => {
      const state = stateOf(workspace);
      pruneArtworkMetadata(state, now);
      if (artworkArgs) { const result = await callArtwork(name, artworkArgs, state, now); enforceBudget(state); return { ...result, readiness: nookDraftReadiness(result.draft) }; }
      if (name === 'nook_draft_save') {
        const prior = args.draft?.id === undefined ? null : state.drafts.find(item => item.id === id(args.draft.id, 'draft.id'));
        const input = validateDraft(args.draft, prior), expected = revision(args.expectedRevision);
        if (prior ? expected !== prior.revision : expected !== 0) throw new InputError('This draft changed. Reload its current version before saving.', 'CONFLICT');
        if (prior && state.publicationIntents.some(item => item.draftId === prior.id && ['publishing', 'retry-needed'].includes(item.status))) throw new InputError('Finish or retry this draft’s pending publication before editing it.', 'CONFLICT');
        const draft = { ...input, revision: (prior?.revision ?? 0) + 1, createdAt: prior?.createdAt ?? now, updatedAt: now };
        await preserveArtworkRequest(prior, draft, now);
        if (prior) state.drafts[state.drafts.indexOf(prior)] = draft; else state.drafts.push(draft);
        enforceBudget(state); return { draft: artworkDraftForUI(draft, now), readiness: nookDraftReadiness(draft) };
      }
      const draft = getDraft(state, id(args.draftId, 'draftId'));
      if (revision(args.expectedRevision) !== draft.revision) throw new InputError('This draft changed. Review its current version before continuing.', 'CONFLICT');
      if (name === 'nook_draft_delete') {
        if (state.publicationIntents.some(item => item.draftId === draft.id && ['publishing', 'retry-needed'].includes(item.status))) throw new InputError('Finish or retry pending publication before discarding this draft.', 'CONFLICT');
        state.drafts = state.drafts.filter(item => item.id !== draft.id);
        for (const intent of state.publicationIntents) if (intent.draftId === draft.id && intent.status === 'prepared') intent.status = 'discarded';
        return { deleted: true, draftId: draft.id };
      }
      if (name === 'nook_publish_prepare') {
        if (args.reviewed !== true) throw new InputError('Review the displayed nook and explicitly choose its audience before preparing publication.');
        if (!['private', 'public'].includes(args.visibility)) throw new InputError('Explicitly choose private or public publication.');
        const readiness = nookDraftReadiness(draft);
        if (!readiness.readyToPublish) return { draft: copy(draft), readiness, prepared: false };
        const requestId = id(args.requestId, 'requestId');
        const manifest = { schemaVersion: 1, draftId: draft.id, draftRevision: draft.revision, title: draft.title, description: draft.description, roomId: roomOf(draft.space), visibility: args.visibility, pathTemplate: 'none' };
        const snapshotHash = await digest(manifest), existing = state.publicationIntents.find(item => item.requestId === requestId);
        if (existing) {
          if (existing.snapshotHash !== snapshotHash) throw new InputError('This publication request was already used for different details. Review again with a new request ID.', 'CONFLICT');
          if (['discarded', 'failed'].includes(existing.status)) throw new InputError('This publication cannot continue. Prepare a new reviewed request.', 'CONFLICT');
          return { publication: copy(existing), readiness, prepared: true, duplicate: true };
        }
        const publication = { id: crypto.randomUUID(), requestId, draftId: draft.id, draftRevision: draft.revision, visibility: args.visibility, manifest, snapshotHash, status: 'prepared', createdAt: now, communityArguments: { requestId, title: manifest.title, description: manifest.description, roomId: manifest.roomId, visibility: manifest.visibility } };
        state.publicationIntents.push(publication); enforceBudget(state);
        return { publication: copy(publication), readiness, prepared: true };
      }
      throw new InputError('Unknown nook creator action.');
    }));
  }
  async commit(args, user) {
    if (args.confirmed !== true) throw new InputError('Publish only after the user explicitly confirms the reviewed nook and its audience.');
    if (typeof this.store.community !== 'function') throw new InputError('Shared nook publication needs the production community backend. Your private draft is saved.', 'FEATURE_UNAVAILABLE');
    const intentId = id(args.intentId, 'intentId');
    const reservation = await this.store.transact(user.id, workspace => {
      const state = stateOf(workspace), intent = state.publicationIntents.find(item => item.id === intentId);
      if (!intent || intent.status === 'discarded') throw new InputError('This reviewed publication was not found.', 'NOT_FOUND');
      if (intent.status === 'published') return { publication: copy(intent), duplicate: true };
      if (intent.status === 'prepared') {
        const draft = getDraft(state, intent.draftId);
        if (draft.revision !== intent.draftRevision) throw new InputError('The draft changed after review. Preview and prepare its new version before publishing.', 'CONFLICT');
        if (!nookDraftReadiness(draft).readyToPublish) throw new InputError('This artwork cannot be published by the current community backend.', 'FEATURE_UNAVAILABLE');
      }
      if (!['prepared', 'publishing', 'retry-needed'].includes(intent.status)) throw new InputError('This publication cannot continue.', 'CONFLICT');
      intent.status = 'publishing'; return { publication: copy(intent) };
    });
    if (reservation.publication.status === 'published') return { ...reservation, nookId: reservation.publication.nookId };
    const publication = reservation.publication;
    let nook;
    try {
      const result = await this.store.community('create_nook', copy(publication.communityArguments));
      nook = result?.nook;
      if (!UUID.test(nook?.id ?? '') || ['title', 'description', 'roomId', 'visibility'].some(key => nook[key] !== publication.manifest[key])) throw new InputError('The publication request ID belongs to different nook details. Prepare a new reviewed request.', 'CONFLICT');
    } catch (error) {
      // A timeout might occur after creation: retain the SAME idempotency key for recovery.
      await this.store.transact(user.id, workspace => {
        const intent = stateOf(workspace).publicationIntents.find(item => item.id === intentId);
        if (intent && intent.status !== 'published') intent.status = error.code === 'CONFLICT' ? 'failed' : 'retry-needed';
        return {};
      }).catch(() => {});
      throw error;
    }
    return this.store.transact(user.id, workspace => {
      const intent = stateOf(workspace).publicationIntents.find(item => item.id === intentId);
      if (!intent || intent.snapshotHash !== publication.snapshotHash) throw new InputError('The publication could not be finalized. Retry the same reviewed request.', 'CONFLICT');
      const duplicate = intent.status === 'published';
      intent.status = 'published'; intent.nookId = nook.id; intent.publishedAt ??= this.clock().toISOString();
      return { publication: copy(intent), nook: copy(nook), nookId: nook.id, duplicate };
    });
  }
}
