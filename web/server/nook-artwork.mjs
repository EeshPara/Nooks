import { InputError } from './errors.mjs';
import { validateSpace } from './space.mjs';

export const artworkToolNames = new Set(['nook_artwork_request', 'nook_artwork_receive', 'nook_artwork_complete', 'nook_artwork_cancel']);
export const ARTWORK_REQUEST_TTL_MS = 12 * 60 * 60 * 1000;
export const ARTWORK_RECEIPT_LIMIT = 100;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
// Match the editor/CSP allowlist. Add hosts only after verifying host-issued files.
const FILE_HOSTS = new Set(['files.oaiusercontent.com', 'sdmntprwestus.oaiusercontent.com', 'sdmntprcentralus.oaiusercontent.com']);
const object = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => { throw new InputError(message); };
const conflict = () => { throw new InputError('This artwork request changed or was canceled. Reopen the draft and start a new artwork request.', 'CONFLICT'); };
const id = (value, label) => { if (typeof value !== 'string' || !UUID.test(value)) invalid(`${label} must be a UUID.`); return value.toLowerCase(); };
const shortText = (value, label, max) => { if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${label} must be nonempty text of at most ${max} characters.`); return value; };
const fileId = value => { const result = shortText(value, 'fileId', 512); if (/\s/.test(result)) invalid('fileId must be the exact file identifier supplied by the host.'); return result; };
function fields(value, allowed, required = allowed) {
  if (!object(value) || Reflect.ownKeys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) invalid('Unsupported artwork request arguments.');
}
function file(value) {
  fields(value, ['download_url', 'file_id', 'mime_type', 'file_name'], ['download_url', 'file_id']);
  const downloadUrl = shortText(value.download_url, 'download_url', 8192);
  let url; try { url = new URL(downloadUrl); } catch { invalid('The host file download URL must be a valid HTTPS URL.'); }
  if (downloadUrl.trim() !== downloadUrl || /\s/.test(downloadUrl) || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) invalid('The host file download URL must be HTTPS without embedded credentials, a custom port or a fragment.');
  if (!FILE_HOSTS.has(url.hostname)) {
    // Report only a bounded DNS name so support can identify new host file
    // services. Never expose the file path, signed query, or file identifier.
    const host = /^[a-z0-9.-]{1,253}$/.test(url.hostname) ? ` (${url.hostname})` : '';
    throw new InputError(`This host file download address is not supported yet${host}. The image has not been imported.`, 'UNSUPPORTED_FILE_ORIGIN');
  }
  const result = { fileId: fileId(value.file_id), downloadUrl };
  if (Object.hasOwn(value, 'mime_type')) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(value.mime_type)) invalid('Use a PNG, JPEG or WebP artwork file.');
    result.mimeType = value.mime_type;
  }
  if (Object.hasOwn(value, 'file_name')) result.fileName = shortText(value.file_name, 'file_name', 255);
  return result;
}
export function validateArtworkArgs(name, args) {
  const common = ['draftId', 'requestId'];
  const extras = name === 'nook_artwork_request' ? ['expectedRevision'] : name === 'nook_artwork_receive' ? ['image'] : name === 'nook_artwork_complete' ? ['fileId', 'backgroundImage'] : [];
  if (!artworkToolNames.has(name)) invalid('Unknown artwork action.');
  fields(args, [...common, ...extras]);
  const result = { draftId: id(args.draftId, 'draftId'), requestId: id(args.requestId, 'requestId') };
  if (name === 'nook_artwork_request') {
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1) invalid('expectedRevision must be the positive revision of a saved draft.');
    result.expectedRevision = args.expectedRevision;
  }
  if (name === 'nook_artwork_receive') result.image = file(args.image);
  if (name === 'nook_artwork_complete') {
    result.fileId = fileId(args.fileId);
    if (typeof args.backgroundImage !== 'string' || !args.backgroundImage) invalid('The editor must supply the optimized image before completing this request.');
    result.backgroundImage = validateSpace({ backgroundImage: args.backgroundImage }).backgroundImage;
  }
  return result;
}
async function hash(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function background(space = {}) {
  if (space.backgroundImage) {
    const image = validateSpace(space).backgroundImage;
    const mime = image.slice(5, image.indexOf(';'));
    const bytes = Uint8Array.from(atob(image.slice(image.indexOf(',') + 1)), character => character.charCodeAt(0));
    return { mime, hash: await hash(bytes) };
  }
  // The adapter validates owner-scoped references before the creator reads them.
  const ref = space._storedBackground;
  if (ref) return { mime: ref.mime, hash: ref.path?.split('/')[1] };
  return null;
}
export async function artworkFingerprint(draft) {
  return hash(JSON.stringify({ scenePrompt: draft.scenePrompt ?? '', style: draft.style, artworkMode: draft.artworkMode, room: draft.space?.room ?? null, background: await background(draft.space) }));
}
export function artworkStatus(request, now) {
  if (!request) return undefined;
  const result = {};
  for (const key of ['requestId', 'status', 'createdAt', 'expiresAt', 'receivedAt', 'completedAt', 'canceledAt']) if (request[key] !== undefined) result[key] = request[key];
  if (now && ['pending', 'received'].includes(result.status) && Date.parse(result.expiresAt) <= Date.parse(now)) result.status = 'expired';
  return result;
}
export function artworkDraftForUI(draft, now) {
  const result = structuredClone(draft);
  if (result.artworkRequest) {
    const status = artworkStatus(result.artworkRequest, now);
    result.artworkRequest = { ...status, ...(status.status === 'received' && result.artworkRequest.file ? { file: result.artworkRequest.file } : {}) };
  }
  return result;
}
/** Hide expired fallback URLs on reads; remove durable copies on the next
 * successful creator mutation. Inactive workspaces/backups are not timed out. */
export function pruneArtworkMetadata(state, now) {
  const cutoff = Date.parse(now) - ARTWORK_REQUEST_TTL_MS;
  const receipts = state.artworkReceipts ?? [];
  if (!Array.isArray(receipts) || receipts.length > ARTWORK_RECEIPT_LIMIT || receipts.some(receipt => !object(receipt) || !Number.isFinite(Date.parse(receipt.createdAt)))) throw new InputError('Saved artwork request history could not be read safely.', 'STORAGE_INVALID');
  if (state.artworkReceipts) state.artworkReceipts = receipts.filter(receipt => Date.parse(receipt.createdAt) > cutoff);
  for (const draft of state.drafts) {
    const request = draft.artworkRequest;
    if (request && ['pending', 'received'].includes(request.status) && Date.parse(request.expiresAt) <= Date.parse(now)) delete request.file;
  }
}
function cancel(request, now) {
  request.status = 'canceled'; request.canceledAt = now;
  delete request.file; delete request.fingerprint; delete request.completedFingerprint; delete request.completedImageHash;
}
/** Rename/description changes keep their request; changing artwork supersedes it. */
export async function preserveArtworkRequest(previous, next, now) {
  if (!previous?.artworkRequest) return;
  const request = structuredClone(previous.artworkRequest);
  if (request.status !== 'canceled' && await artworkFingerprint(previous) !== await artworkFingerprint(next)) cancel(request, now);
  next.artworkRequest = request;
}
function active(request, requestId, now) {
  if (!request || request.requestId !== requestId || request.status === 'canceled') conflict();
  if (request.status !== 'completed' && Date.parse(request.expiresAt) <= Date.parse(now)) throw new InputError('This artwork request expired after 12 hours. Start a new request from your draft.', 'ARTWORK_REQUEST_EXPIRED');
  return request;
}
async function current(draft, request) {
  if (await artworkFingerprint(draft) !== (request.status === 'completed' ? request.completedFingerprint : request.fingerprint)) conflict();
}
/** Only stores a reference. Image network access and optimization belong to the UI. */
export async function callArtwork(name, args, state, now) {
  const draft = state.drafts.find(value => value.id === args.draftId);
  if (!draft) throw new InputError('This private nook draft was not found.', 'NOT_FOUND');
  if (state.publicationIntents.some(value => value.draftId === draft.id && ['publishing', 'retry-needed'].includes(value.status))) throw new InputError('Finish or retry this draft’s pending publication before editing its artwork.', 'CONFLICT');
  const result = (duplicate = false) => ({ draftId: draft.id, requestId: draft.artworkRequest.requestId, artworkRequest: artworkStatus(draft.artworkRequest, now), draft: artworkDraftForUI(draft, now), ...(duplicate ? { duplicate: true } : {}) });
  if (name === 'nook_artwork_request') {
    const receipts = state.artworkReceipts ?? [];
    const receipt = receipts.find(value => value.clientRequestId === args.requestId);
    if (receipt) {
      if (receipt.draftId !== draft.id || receipt.baseRevision !== args.expectedRevision) conflict();
      const request = active(draft.artworkRequest, receipt.requestId, now); await current(draft, request);
      return result(true);
    }
    if (draft.revision !== args.expectedRevision) conflict();
    if (draft.artworkMode !== 'chatgpt' || !draft.scenePrompt?.trim()) invalid('Save a scene prompt with ChatGPT artwork selected before requesting an image.');
    if (receipts.length >= ARTWORK_RECEIPT_LIMIT) throw new InputError('You can start up to 100 artwork requests in 12 hours. Try again after an earlier request is 12 hours old.', 'RATE_LIMITED');
    // The caller's key expires, but the issued identifier is never reused. A late
    // callback cannot match a later request, even if its client key is recycled.
    const requestId = crypto.randomUUID();
    draft.artworkRequest = { requestId, status: 'pending', createdAt: now, expiresAt: new Date(Date.parse(now) + ARTWORK_REQUEST_TTL_MS).toISOString(), fingerprint: await artworkFingerprint(draft) };
    state.artworkReceipts = [...receipts, { clientRequestId: args.requestId, requestId, draftId: draft.id, baseRevision: args.expectedRevision, createdAt: now }];
    return result();
  }
  if (name === 'nook_artwork_cancel') {
    const request = draft.artworkRequest;
    if (!request || request.requestId !== args.requestId) conflict();
    if (request.status === 'canceled') return result(true);
    if (request.status === 'completed') throw new InputError('This artwork is already saved. Remove or replace the image in your draft instead.', 'CONFLICT');
    cancel(request, now); return result();
  }
  const request = active(draft.artworkRequest, args.requestId, now);
  await current(draft, request);
  if (name === 'nook_artwork_receive') {
    if (request.status === 'completed') throw new InputError('This artwork request is already complete.', 'CONFLICT');
    if (request.file && request.file.fileId !== args.image.fileId) conflict();
    const duplicate = request.status === 'received';
    request.file = structuredClone(args.image); request.status = 'received'; request.receivedAt ??= now;
    return result(duplicate);
  }
  const imageHash = await hash(args.backgroundImage);
  if (request.status === 'completed') {
    if (request.file?.fileId !== args.fileId || request.completedImageHash !== imageHash) conflict();
    return result(true);
  }
  if (request.status !== 'received' || request.file?.fileId !== args.fileId) conflict();
  if (!Number.isSafeInteger(draft.revision) || draft.revision >= Number.MAX_SAFE_INTEGER) throw new InputError('This draft has reached its revision limit.', 'STORAGE_FULL');
  draft.space = { ...draft.space, backgroundImage: args.backgroundImage }; delete draft.space._storedBackground;
  draft.artworkMode = 'chatgpt'; draft.revision++; draft.updatedAt = now;
  request.status = 'completed'; request.completedAt = now; request.completedImageHash = imageHash;
  request.file = { fileId: args.fileId };
  request.completedFingerprint = await artworkFingerprint(draft); delete request.fingerprint;
  return result();
}
