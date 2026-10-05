import { InputError } from './errors.mjs';

export const WORKSPACE_SESSION_VIEWS = Object.freeze(['study', 'library', 'explore', 'focus', 'plan', 'collection', 'music', 'people']);
export const WORKSPACE_SESSION_TTL_MS = 30 * 60 * 1000;
export const WORKSPACE_SESSION_LIMIT = 12;
export const workspaceSessionToolNames = new Set(['workspace_session_open', 'workspace_session_poll', 'workspace_navigate']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = message => { throw new InputError(message); };
const expired = () => { throw new InputError('This Nooks tab session has expired. Reconnect the open tab before navigating it.', 'SESSION_EXPIRED'); };
const fields = (value, allowed) => {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid('Unsupported workspace session arguments.');
};
const sessionId = value => {
  if (typeof value !== 'string' || !uuid.test(value)) invalid('sessionId must be a UUID issued by the open Nooks tab.');
  return value.toLowerCase();
};
const sequence = value => {
  if (!Number.isSafeInteger(value) || value < 0) invalid('afterSequence must be a nonnegative safe integer.');
  return value;
};
const artifactId = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(value.trim())) invalid('Use a valid saved study item ID.');
  return value.trim();
};
function target(input) {
  const hasArtifact = Object.hasOwn(input, 'artifactId'), hasView = Object.hasOwn(input, 'view');
  if (hasArtifact === hasView) invalid('Choose exactly one saved artifactId or workspace view.');
  if (hasView) {
    if (!WORKSPACE_SESSION_VIEWS.includes(input.view) || Object.hasOwn(input, 'alongsideArtifactId')) invalid('Choose an available workspace view without an alongside item.');
    return { view: input.view };
  }
  const result = { artifactId: artifactId(input.artifactId) };
  if (Object.hasOwn(input, 'alongsideArtifactId')) result.alongsideArtifactId = artifactId(input.alongsideArtifactId);
  return result;
}

export function validateWorkspaceSessionArgs(name, args) {
  if (name === 'workspace_session_open') {
    fields(args, ['sessionId']); return { sessionId: sessionId(args.sessionId) };
  }
  if (name === 'workspace_session_poll') {
    fields(args, ['sessionId', 'afterSequence']);
    return { sessionId: sessionId(args.sessionId), afterSequence: sequence(args.afterSequence) };
  }
  if (name === 'workspace_navigate') {
    fields(args, ['sessionId', 'artifactId', 'view', 'alongsideArtifactId']);
    return { sessionId: sessionId(args.sessionId), ...target(args) };
  }
  invalid('Unknown workspace session action.');
}

function records(workspace) {
  const saved = workspace.workspaceSessions ?? [];
  if (!Array.isArray(saved) || saved.length > WORKSPACE_SESSION_LIMIT) throw new InputError('Saved workspace sessions are invalid.', 'INVALID_STATE');
  const result = saved.map(record => {
    try {
      fields(record, ['sessionId', 'sequence', 'expiresAt', 'command']);
      const result = { sessionId: sessionId(record.sessionId), sequence: sequence(record.sequence), expiresAt: record.expiresAt, command: null };
      if (typeof record.expiresAt !== 'string' || !Number.isFinite(Date.parse(record.expiresAt))) invalid('Invalid session expiry.');
      if (record.command !== null && record.command !== undefined) {
        fields(record.command, ['sequence', 'artifactId', 'view', 'alongsideArtifactId']);
        if (sequence(record.command.sequence) !== result.sequence || result.sequence === 0) invalid('Invalid command sequence.');
        result.command = { sequence: result.sequence, ...target(record.command) };
      }
      return result;
    } catch { throw new InputError('Saved workspace sessions are invalid.', 'INVALID_STATE'); }
  });
  if (new Set(result.map(record => record.sessionId)).size !== result.length) throw new InputError('Saved workspace sessions are invalid.', 'INVALID_STATE');
  return result;
}
function active(records, id, now) {
  const record = records.find(record => record.sessionId === id);
  if (!record || Date.parse(record.expiresAt) <= Date.parse(now)) expired();
  return record;
}
function verifyTarget(workspace, command) {
  if (command.view) return;
  const main = workspace.artifacts?.find(item => item.id === command.artifactId);
  if (!main) throw new InputError('This item was not found in your study space.', 'NOT_FOUND');
  if (!['note', 'quiz', 'exam', 'flashcards'].includes(main.kind)) invalid('This study item cannot be opened.');
  if (command.alongsideArtifactId) {
    const reference = workspace.artifacts?.find(item => item.id === command.alongsideArtifactId);
    if (!reference) throw new InputError('The reference note was not found in your study space.', 'NOT_FOUND');
    if (!['quiz', 'exam', 'flashcards'].includes(main.kind) || reference.kind !== 'note') invalid('Open a quiz, exam or flashcard set alongside a saved note.');
  }
}

/** Explicit registration/renewal is the only operation that extends the idle lifetime. */
export function openWorkspaceSession(workspace, input, now) {
  const args = validateWorkspaceSessionArgs('workspace_session_open', input), saved = records(workspace);
  const prior = saved.find(record => record.sessionId === args.sessionId);
  if (prior && Date.parse(prior.expiresAt) <= Date.parse(now)) expired();
  const live = saved.filter(record => Date.parse(record.expiresAt) > Date.parse(now));
  if (!prior && live.length >= WORKSPACE_SESSION_LIMIT) throw new InputError('Twelve Nooks tabs are already connected. Close an unused tab and let its session expire before opening another.', 'SESSION_LIMIT');
  const next = { ...(prior ?? { sessionId: args.sessionId, sequence: 0, command: null }), expiresAt: new Date(Date.parse(now) + WORKSPACE_SESSION_TTL_MS).toISOString() };
  workspace.workspaceSessions = prior ? live.map(record => record.sessionId === args.sessionId ? next : record) : [...live, next];
  // Returning the current cursor on every mount prevents old commands replaying.
  return { sessionId: next.sessionId, sequence: next.sequence, expiresAt: next.expiresAt };
}

/** Read-only: even an expired or unchanged poll never renews or cleans up a session. */
export function pollWorkspaceSession(workspace, input, now, { verifyArtifacts = true } = {}) {
  const args = validateWorkspaceSessionArgs('workspace_session_poll', input);
  const record = active(records(workspace), args.sessionId, now);
  if (args.afterSequence > record.sequence) invalid('The session cursor is ahead of its current sequence. Reopen the tab session.');
  const command = record.sequence > args.afterSequence ? record.command : null;
  if (command && verifyArtifacts) verifyTarget(workspace, command);
  return { sessionId: record.sessionId, sequence: record.sequence, expiresAt: record.expiresAt, command };
}

export function navigateWorkspaceSession(workspace, input, now) {
  const args = validateWorkspaceSessionArgs('workspace_navigate', input), saved = records(workspace);
  const record = active(saved, args.sessionId, now), destination = target(args);
  verifyTarget(workspace, destination);
  if (record.sequence >= Number.MAX_SAFE_INTEGER) throw new InputError('Reconnect this Nooks tab to start a new navigation session.', 'SESSION_EXPIRED');
  const nextSequence = record.sequence + 1;
  workspace.workspaceSessions = saved.filter(item => Date.parse(item.expiresAt) > Date.parse(now)).map(item => item.sessionId === record.sessionId ? { ...item, sequence: nextSequence, command: { sequence: nextSequence, ...destination } } : item);
  return { sessionId: record.sessionId, sequence: nextSequence, expiresAt: record.expiresAt, queued: true };
}
