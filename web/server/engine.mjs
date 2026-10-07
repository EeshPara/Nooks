import { getPracticeCheckpoint, savePracticeCheckpoint } from './practice-checkpoints.mjs';
import { normalizeWorkspaceLayout, updateWorkspaceLayout, validateWorkspaceLayoutChange } from './workspace-layout.mjs';
import { WORKSPACE_SESSION_VIEWS, workspaceSessionToolNames, validateWorkspaceSessionArgs, openWorkspaceSession, pollWorkspaceSession, navigateWorkspaceSession } from './workspace-session.mjs';
const randomUUID = () => crypto.randomUUID();
import { organizationToolNames, readOnlyOrganizationTools, normalizeOrganization, callOrganization, prepareArtifactSave, removeArtifactOrganizationReferences } from './organization.mjs';
import { createWorkspace } from './seed.mjs';
import { defaultSpace, validateSpace } from './space.mjs';
import { activeRoomId, validateProgressRoom, roomState, activeFocusMilliseconds, hydrateRoomProgress, placeRoomReward, publicRoomDisplay, rewardCatalog } from './room-progress.mjs';

import { InputError } from './errors.mjs';
import { isVerifiedSupabaseIdentity } from './supabase-auth.mjs';
export { InputError } from './errors.mjs';
const object = (value, name) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${name} must be an object.`); return value; };
const text = (value, name, max = 2000, optional = false) => {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`${name} must be nonempty text of at most ${max} characters.`);
  return value.trim();
};
const id = (value, name = 'id') => { const result = text(value, name, 128); if (['__proto__', 'constructor', 'prototype'].includes(result)) throw new InputError('Reserved identifier.'); return result; };
const integer = (value, name, min, max) => { if (!Number.isInteger(value) || value < min || value > max) throw new InputError(`${name} must be an integer from ${min} to ${max}.`); return value; };
const list = (value, name, min, max) => { if (!Array.isArray(value) || value.length < min || value.length > max) throw new InputError(`${name} must contain ${min}–${max} items.`); return value; };
const uniqueIds = items => { if (new Set(items.map(item => item.id)).size !== items.length) throw new InputError('Item IDs must be unique.'); return items; };
const normalize = value => value.toLocaleLowerCase().replace(/[.,!?;:]/g, '').trim().replace(/\s+/g, ' ');
const date = value => { const d = new Date(value); if (!Number.isFinite(d.valueOf())) throw new InputError('Invalid date.'); return d; };
const workspaceViews = new Set(WORKSPACE_SESSION_VIEWS);
const spaceFields = new Set(['name', 'tagline', 'theme', 'room', 'accent', 'companion', 'layout', 'decorations', 'backgroundImage']);

function customizeSpace(current, input) {
  const patch = object(input, 'space');
  if (Object.keys(patch).some(key => !spaceFields.has(key))) throw new InputError('Space contains an unsupported setting.');
  if (patch.backgroundImage !== undefined && typeof patch.backgroundImage !== 'string') throw new InputError('Background must be an image data URL, or empty text to remove it.');
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) next[key] = value;
  // Choosing a catalog scene replaces custom artwork, including reselecting the
  // underlying scene. Rename/theme-only patches must keep privately saved pixels.
  if ((patch.room !== undefined && !Object.hasOwn(patch, 'backgroundImage')) ||
      (Object.hasOwn(patch, 'backgroundImage') && !patch.backgroundImage)) delete next.backgroundImage;
  const validated = validateSpace(next);
  if (current._storedBackground && patch.room === undefined && !Object.hasOwn(patch, 'backgroundImage')) validated._storedBackground = structuredClone(current._storedBackground);
  return validated;
}

/** Deliberately selected operational state, never a library or focus-history dump. */
function studyStatus(workspace, now) {
  const space = workspace.space ?? defaultSpace();
  const roomId = activeRoomId(space);
  const catalog = rewardCatalog.rooms[roomId];
  const progress = workspace.roomProgress?.[roomId] ?? { focusSeconds: 0, sessions: 0, practices: 0, placed: [] };
  const unlocked = catalog.rewards.filter(reward => progress.focusSeconds >= reward.minutes * 60);
  const placed = [...new Set(progress.placed ?? [])].filter(rewardId => unlocked.some(reward => reward.id === rewardId)).slice(0, 3);
  const nextReward = catalog.rewards.find(reward => progress.focusSeconds < reward.minutes * 60);
  const active = workspace.focusSessions.find(session => !session.completedAt && !session.cancelledAt);
  const activeSeconds = active ? Math.floor(Math.min(active.targetMinutes * 60000, activeFocusMilliseconds(active, now)) / 1000) : 0;
  return {
    asOf: now,
    nook: { roomId, label: catalog.label, name: space.name, theme: space.theme, layout: space.layout, customArtwork: Boolean(space.backgroundImage || space._storedBackground) },
    focusSession: active ? {
      id: active.id, state: active.pausedAt ? 'paused' : 'running', targetMinutes: active.targetMinutes,
      activeSeconds, remainingSeconds: Math.max(0, active.targetMinutes * 60 - activeSeconds), readyToComplete: activeSeconds >= active.targetMinutes * 60,
      startedAt: active.startedAt, pausedAt: active.pausedAt ?? null, roomId: active.roomId ?? null, nookId: active.nookId ?? null, artifactId: active.artifactId ?? null,
    } : null,
    roomProgress: {
      roomId, focusSeconds: progress.focusSeconds, sessions: progress.sessions, practices: progress.practices, placed,
      unlockedRewards: unlocked.map(({ id, name, minutes }) => ({ id, name, minutes, placed: placed.includes(id) })),
      nextReward: nextReward ? { id: nextReward.id, name: nextReward.name, minutes: nextReward.minutes, remainingSeconds: nextReward.minutes * 60 - progress.focusSeconds } : null,
    },
  };
}

export function validateArtifact(input, now = new Date().toISOString()) {
  object(input, 'artifact');
  if (!['note', 'quiz', 'exam', 'flashcards'].includes(input.kind)) throw new InputError('artifact.kind must be note, quiz, exam, or flashcards.');
  const artifact = {
    id: input.id === undefined ? randomUUID() : id(input.id), kind: input.kind,
    title: text(input.title, 'title', 180), subject: text(input.subject ?? 'General', 'subject', 80),
    color: ['mint', 'peach', 'lavender', 'sky'].includes(input.color) || /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color : 'mint',
    favorite: input.favorite === true, createdAt: now, updatedAt: now,
  };
  for (const key of ['description', 'source']) { const value = text(input[key] === '' ? undefined : input[key], key, key === 'source' ? 2000 : 1000, true); if (value) artifact[key] = value; }
  if (input.kind === 'note') {
    // Empty note bodies are valid documents; missing or non-string bodies are not.
    if (typeof input.content !== 'string' || input.content.length > 100000) throw new InputError('content must be text of at most 100000 characters.');
    artifact.content = input.content.trim();
  }
  if (input.kind === 'flashcards') artifact.cards = uniqueIds(list(input.cards, 'cards', 1, 200).map((card, i) => {
    object(card, `cards[${i}]`);
    const value = { id: card.id === undefined ? `card-${i + 1}` : id(card.id), front: text(card.front, 'front', 4000), back: text(card.back, 'back', 8000) };
    if (card.hint) value.hint = text(card.hint, 'hint', 1000);
    return value;
  }));
  if (['quiz', 'exam'].includes(input.kind)) artifact.questions = uniqueIds(list(input.questions, 'questions', 1, 100).map((question, i) => {
    object(question, `questions[${i}]`);
    const value = { id: question.id === undefined ? `question-${i + 1}` : id(question.id), prompt: text(question.prompt, 'prompt', 8000) };
    if (question.options !== undefined) {
      value.options = list(question.options, 'options', 2, 8).map(option => text(option, 'option', 2000));
      value.correctIndex = integer(question.correctIndex, 'correctIndex', 0, value.options.length - 1);
    } else {
      if (question.answer !== undefined) value.answer = text(question.answer, 'answer', 2000);
      if (question.acceptedAnswers !== undefined) value.acceptedAnswers = list(question.acceptedAnswers, 'acceptedAnswers', 1, 20).map(answer => text(answer, 'acceptedAnswer', 2000));
      if (!value.answer && !value.acceptedAnswers?.length) throw new InputError('Short-answer questions need an answer or acceptedAnswers.');
    }
    if (question.explanation) value.explanation = text(question.explanation, 'explanation', 4000);
    return value;
  }));
  return artifact;
}

function updateStats(workspace, now) {
  const completed = workspace.focusSessions.filter(session => session.completedAt);
  const xp = workspace.progress.reduce((sum, event) => sum + event.xp, 0) + completed.reduce((sum, session) => sum + session.xp, 0);
  const days = new Set([...workspace.progress.map(event => event.completedAt.slice(0, 10)), ...completed.map(session => session.completedAt.slice(0, 10))]);
  let streak = 0; const cursor = new Date(now); cursor.setUTCHours(0, 0, 0, 0);
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  workspace.stats = { xp, level: 1 + Math.floor(xp / 250), streak, focusMinutes: Math.floor(completed.reduce((sum, session) => sum + (session.activeSeconds ?? session.minutes * 60), 0) / 60) };
}

/** Existing native clients can attest their studied version through their own saved position. */
function checkpointRevision(workspace, artifact, args) {
  const checkpoints = workspace.practiceCheckpoints ?? {};
  const checkpoint = Object.hasOwn(checkpoints, artifact.id) ? checkpoints[artifact.id] : undefined;
  const kind = args.kind ?? artifact.kind;
  if (!checkpoint || checkpoint.version !== 1 || checkpoint.sessionId !== args.sessionId || checkpoint.kind !== kind ||
      !Number.isSafeInteger(checkpoint.artifactRevision) || checkpoint.artifactRevision !== (artifact.revision ?? 1)) return undefined;
  const prior = kind === 'flashcards' ? checkpoint.state?.firstAnswers : checkpoint.state?.answers;
  const submitted = kind === 'flashcards' ? args.cardRatings : args.answers;
  if (!['quiz', 'exam', 'flashcards'].includes(kind) || !prior || typeof prior !== 'object' || Array.isArray(prior) ||
      !submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return undefined;
  for (const [index, answer] of Object.entries(prior)) {
    if (!/^(0|[1-9]\d*)$/.test(index)) return undefined;
    const item = (kind === 'flashcards' ? artifact.cards : artifact.questions)?.[Number(index)];
    if (!item || !Object.hasOwn(submitted, item.id)) return undefined;
    if (kind === 'flashcards' ? typeof answer !== 'boolean' || submitted[item.id] !== (answer ? 'good' : 'again') : submitted[item.id] !== answer) return undefined;
  }
  return checkpoint.artifactRevision;
}

export class StudyEngine {
  constructor(store, { clock = () => new Date(), shareBaseUrl = 'http://127.0.0.1:8787' } = {}) { this.store = store; this.clock = clock; this.shareBaseUrl = shareBaseUrl; }
  async call(name, args = {}, user = null) {
    object(args, 'arguments');
    const now = this.clock().toISOString();
    const envelope = value => ({ authenticated: !!user, mode: user?.demo ? 'local-demo' : user ? 'connected' : 'preview', ...value,
      ...(value?.workspace && isVerifiedSupabaseIdentity(user) ? { recoveryScope: `account:${user.id}` } : {}),
    });
    if (name === 'workspace_get' || name === 'workspace_render') {
      const hasArtifact = name === 'workspace_render' && Object.hasOwn(args, 'artifact');
      const hasArtifactId = name === 'workspace_render' && Object.hasOwn(args, 'artifactId');
      const hasView = name === 'workspace_render' && Object.hasOwn(args, 'view');
      if ([hasArtifact, hasArtifactId, hasView].filter(Boolean).length > 1) throw new InputError('Choose only one of artifactId for saved work, artifact for an unsaved preview, or view for navigation.');
      if (hasView && !workspaceViews.has(args.view)) throw new InputError('Choose an available study workspace view.');
      if ((hasArtifactId || user) && !user?.id) throw new InputError('Connect your Nooks account to open saved study material.', 'AUTH_REQUIRED');
      if (user && !user.scopes?.includes('notable.read')) throw new InputError('Read permission required.', 'INSUFFICIENT_SCOPE');
      const artifactId = hasArtifactId ? id(args.artifactId, 'artifactId') : null;
      const previewArtifact = hasArtifact ? validateArtifact(args.artifact, now) : null;
      let value = user ? await this.store.read(user.id) : createWorkspace(now);
      value.space ??= defaultSpace(); value.shares ??= [];
      // Persist a server-owned migration on first hydration, including read-only accounts.
      // This changes no historic credit and prevents later room switches moving elapsed time.
      if (user && value.focusSessions.some(session => !session.roomId && !session.completedAt && !session.cancelledAt)) {
        value = (await this.store.transact(user.id, workspace => { workspace.space ??= defaultSpace(); hydrateRoomProgress(workspace, now); return {}; })).workspace;
      }
      value.roomProgress ??= {};
      value.workspaceLayout = normalizeWorkspaceLayout(value.workspaceLayout);
      normalizeOrganization(value);
      if (artifactId) {
        const artifact = value.artifacts.find(item => item.id === artifactId);
        if (!artifact) throw new InputError('This item was not found in your study space.', 'NOT_FOUND');
        return envelope({ workspace: value, artifact, unsaved: false });
      }
      if (previewArtifact) return envelope({ workspace: value, artifact: previewArtifact, unsaved: true });
      return envelope({ workspace: value, ...(hasView ? { navigation: { view: args.view } } : {}) });
    }
    if (!user?.id) throw new InputError('Connect a Nooks account to save your study space.', 'AUTH_REQUIRED');
    if (name === 'onboarding_complete') {
      if (!user?.scopes?.includes('notable.read') || !user.scopes.includes('notable.write')) throw new InputError('Connect your account to save your profile.', 'INSUFFICIENT_SCOPE');
      if (Object.keys(args).some(key => !['name','avatar'].includes(key))) throw new InputError('Unexpected profile field.');
      const profile = { name: text(args.name, 'name', 28), avatar: integer(args.avatar, 'avatar', 0, 7), completedAt: now, version: 1 };
      return envelope(await this.store.transact(user.id, workspace => { workspace.onboarding = profile; return { onboarding: profile }; }));
    }
    if (name === 'workspace_layout_update') {
      if (!user.scopes?.includes('notable.read') || !user.scopes.includes('notable.write')) throw new InputError('Read and write permission required.', 'INSUFFICIENT_SCOPE');
      const input = validateWorkspaceLayoutChange(args);
      return envelope(await this.store.transact(user.id, workspace => updateWorkspaceLayout(workspace, input)));
    }
    if (workspaceSessionToolNames.has(name)) {
      if (!user.scopes?.includes('notable.read')) throw new InputError('Read permission required.', 'INSUFFICIENT_SCOPE');
      const input = validateWorkspaceSessionArgs(name, args);
      if (name === 'workspace_session_poll') {
        if (typeof this.store.readNavigationState === 'function') {
          const state = await this.store.readNavigationState(user.id);
          const result = pollWorkspaceSession(state, input, now, { verifyArtifacts: false });
          if (!result.command?.artifactId) return envelope(result);
          // Only a new artifact command needs target metadata; never hydrate note bodies or images.
          return envelope(pollWorkspaceSession(await this.store.readNavigationState(user.id, { includeArtifacts: true }), input, now));
        }
        return envelope(pollWorkspaceSession(await this.store.read(user.id), input, now));
      }
      if (!user.scopes.includes('notable.write')) throw new InputError('Write permission required.', 'INSUFFICIENT_SCOPE');
      const result = await this.store.transact(user.id, workspace => name === 'workspace_session_open'
        ? openWorkspaceSession(workspace, input, now) : navigateWorkspaceSession(workspace, input, now));
      // Both stores append their complete workspace to transaction results. Session tools must not leak it.
      const { workspace: ignored, ...sessionResult } = result;
      return envelope(sessionResult);
    }
    if (name === 'plan_get' || name === 'study_status_get') {
      if (!user.scopes?.includes('notable.read')) throw new InputError('Read permission required.', 'INSUFFICIENT_SCOPE');
      if (Object.keys(args).length) throw new InputError('This read uses the connected account and accepts no arguments.');
      const workspace = await this.store.read(user.id);
      if (name === 'study_status_get') return envelope({ studyStatus: studyStatus(workspace, now) });
      return envelope({ workspaceRevision: workspace.revision ?? 0, plan: { tasks: (workspace.plan?.tasks ?? []).slice(0, 100).map(({ id, title, subject, done, dueDate }) => ({ id, title, subject, done, ...(dueDate ? { dueDate } : {}) })) } });
    }
    if (name === 'practice_checkpoint_get') {
      if (!user.scopes?.includes('notable.read')) throw new InputError('Read permission required.', 'INSUFFICIENT_SCOPE');
      return envelope(getPracticeCheckpoint(await this.store.read(user.id), args));
    }
    if (readOnlyOrganizationTools.has(name)) {
      if (!user.scopes?.includes('notable.read')) throw new InputError('Read permission required.', 'INSUFFICIENT_SCOPE');
      const workspace = await this.store.read(user.id);
      return envelope(callOrganization(name, args, workspace, now));
    }
    if (name === 'space_share_get') {
      if (!user.scopes?.includes('notable.read')) throw new InputError('Read permission required.', 'INSUFFICIENT_SCOPE');
      const share = await this.store.readShare(id(args.shareId, 'shareId'));
      if (!share) throw new InputError('This nook snapshot is unavailable.', 'NOT_FOUND');
      return envelope({ share });
    }
    if (!user.scopes?.includes('notable.write')) throw new InputError('The connected account does not have notable.write permission.', 'INSUFFICIENT_SCOPE');
    return envelope(await this.store.transact(user.id, async workspace => {
      workspace.space ??= defaultSpace(); workspace.shares ??= [];
      hydrateRoomProgress(workspace, now);
      normalizeOrganization(workspace);
      if (organizationToolNames.has(name)) return callOrganization(name, args, workspace, now);
      if (name === 'practice_checkpoint_save') return savePracticeCheckpoint(workspace, args, now);
      if (name === 'room_reward_place') return placeRoomReward(workspace, args);
      if (name === 'space_customize') {
        workspace.space = customizeSpace(workspace.space, args.space);
        return { space: workspace.space };
      }
      if (name === 'space_share') {
        if (workspace.shares.length >= 20) throw new InputError('Revoke an old share before creating another.');
        if (args.includeProgress !== undefined && typeof args.includeProgress !== 'boolean') throw new InputError('includeProgress must be true or false.');
        const shareId = randomUUID();
        const share = { id: shareId, url: `${this.shareBaseUrl}/?share=${shareId}`, createdAt: now, space: validateSpace(workspace.space), description: text(args.description === '' ? undefined : args.description, 'description', 500, true) ?? '' };
        if (workspace.space._storedBackground) share.space._storedBackground = structuredClone(workspace.space._storedBackground);
        if (args.includeProgress === true) share.stats = { xp: workspace.stats.xp, level: workspace.stats.level, streak: workspace.stats.streak, focusMinutes: workspace.stats.focusMinutes };
        const roomDisplay = publicRoomDisplay(workspace);
        if (roomDisplay) share.roomDisplay = roomDisplay;
        // Publication is explicit and contains no artifact content, titles or account identity.
        await this.store.publishShare(user.id, share);
        workspace.shares.push({ id: share.id, url: share.url, createdAt: now, includeProgress: args.includeProgress === true });
        return { share };
      }
      if (name === 'space_unshare') {
        const shareId = id(args.shareId, 'shareId');
        if (!await this.store.revokeShare(user.id, shareId)) throw new InputError('This share was not found in your study space.', 'NOT_FOUND');
        workspace.shares = workspace.shares.filter(share => share.id !== shareId);
        return { revokedId: shareId };
      }
      if (name === 'artifact_save') {
        // Server generation retries are additive: never replace an already committed result.
        if (args.ifAbsent === true && args.artifact?.id) {
          const existing = workspace.artifacts.find(item => item.id === args.artifact.id);
          if (existing) return { artifact: existing, duplicate: true };
        }
        const artifact = prepareArtifactSave(args.artifact, validateArtifact(args.artifact, now), workspace, now);
        const index = workspace.artifacts.findIndex(item => item.id === artifact.id);
        if (index >= 0) {
          artifact.createdAt = workspace.artifacts[index].createdAt;
          workspace.artifacts[index] = artifact;
        } else {
          if (workspace.artifacts.length >= 1000) throw new InputError('Your library has reached the 1,000-item storage limit.');
          workspace.artifacts.unshift(artifact);
        }
        return { artifact };
      }
      if (name === 'artifact_delete') {
        const artifactId = id(args.artifactId, 'artifactId');
        const index = workspace.artifacts.findIndex(item => item.id === artifactId);
        if (index < 0) throw new InputError('This item was not found in your study space.', 'NOT_FOUND');
        workspace.artifactRevisionFloor = Math.max(
          integer(workspace.artifactRevisionFloor === undefined ? 0 : workspace.artifactRevisionFloor, 'artifact revision floor', 0, Number.MAX_SAFE_INTEGER - 1),
          integer(workspace.artifacts[index].revision ?? 1, 'deleted artifact revision', 1, Number.MAX_SAFE_INTEGER - 1),
        );
        workspace.artifacts.splice(index, 1); delete workspace.reviews[artifactId];
        if (workspace.practiceCheckpoints) delete workspace.practiceCheckpoints[artifactId];
        removeArtifactOrganizationReferences(workspace, artifactId);
        return { deletedId: artifactId };
      }
      if (name === 'plan_save') {
        integer(args.expectedRevision, 'expectedRevision', 0, Number.MAX_SAFE_INTEGER);
        if (args.expectedRevision !== (workspace.revision ?? 0)) {
          const error = new InputError('Your study plan changed. Read plan_get again and merge your change into the current tasks before saving.', 'REVISION_CONFLICT');
          error.currentRevision = workspace.revision ?? 0;
          throw error;
        }
        object(args.plan, 'plan');
        const tasks = uniqueIds(list(args.plan.tasks, 'tasks', 0, 100).map((task, index) => {
          object(task, 'task');
          const item = { id: task.id === undefined ? `task-${index + 1}` : id(task.id), title: text(task.title, 'task.title', 300), subject: text(task.subject ?? 'General', 'task.subject', 80), done: task.done === true };
          if (task.dueDate) { if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) || date(task.dueDate).toISOString().slice(0, 10) !== task.dueDate) throw new InputError('dueDate must be a valid YYYY-MM-DD date.'); item.dueDate = task.dueDate; }
          return item;
        }));
        workspace.plan = { tasks }; return { plan: workspace.plan };
      }
      if (name === 'progress_record') {
        const sessionId = id(args.sessionId, 'sessionId');
        const prior = workspace.progress.find(event => event.sessionId === sessionId);
        if (prior) return { progressEvent: prior, duplicate: true };
        const artifactId = id(args.artifactId, 'artifactId');
        const artifact = workspace.artifacts.find(item => item.id === artifactId);
        if (!artifact) throw new InputError('This item was not found in your study space.', 'NOT_FOUND');
        // Indices and card IDs only identify answers within the version studied.
        // An old client must never have its answers reinterpreted as current work.
        // Committed session retries above remain idempotent, including old history.
        const artifactRevision = args.artifactRevision === undefined ? checkpointRevision(workspace, artifact, args) : integer(args.artifactRevision, 'artifactRevision', 1, Number.MAX_SAFE_INTEGER);
        if (artifactRevision === undefined) throw new InputError('This result has no verified study-material version. Keep or download the original result, then reopen the latest set for a new practice session. Do not attach the current revision to these old answers.', 'REVISION_CONFLICT');
        if (artifactRevision !== (artifact.revision ?? 1)) {
          const error = new InputError('This study set changed during practice. Your original result has not been graded against the changed material. Keep or download it, then reopen the latest set to practice again.', 'REVISION_CONFLICT');
          error.currentRevision = artifact.revision ?? 1;
          throw error;
        }
        const kind = args.kind ?? artifact.kind;
        const roomId = validateProgressRoom(args.roomId ?? activeRoomId(workspace.space));
        let score = 0, total = 0, evidenceCount = 0;
        if (['quiz', 'exam', 'sprint'].includes(kind)) {
          if (!artifact.questions) throw new InputError('This item has no questions.');
          const answers = object(args.answers, 'answers');
          evidenceCount = Object.keys(answers).length;
          if (Object.keys(answers).some(key => !artifact.questions.some(question => question.id === key))) throw new InputError('Answer references an unknown question.');
          total = kind === 'sprint' ? Object.keys(answers).length : artifact.questions.length;
          if (total === 0) throw new InputError('Answer at least one question.');
          for (const question of artifact.questions) {
            const answer = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
            if (answer === undefined) continue;
            if (question.options) {
              integer(answer, 'answer index', 0, question.options.length - 1);
              if (answer === question.correctIndex) score++;
            } else {
              const value = text(answer, 'answer', 2000);
              if ([question.answer, ...(question.acceptedAnswers ?? [])].filter(Boolean).some(expected => normalize(value) === normalize(expected))) score++;
            }
          }
        } else if (kind === 'flashcards') {
          if (!artifact.cards) throw new InputError('This item has no flashcards.');
          const ratings = object(args.cardRatings, 'cardRatings');
          if (!Object.keys(ratings).length) throw new InputError('Review at least one flashcard.');
          evidenceCount = Object.keys(ratings).length;
          // IDs are user-controlled data. An inherited key such as `toString`
          // must never resolve to a shared built-in function or another review.
          const reviewSets = object(workspace.reviews, 'saved review sets');
          const reviews = Object.hasOwn(reviewSets, artifactId) ? object(reviewSets[artifactId], 'saved card reviews') : (reviewSets[artifactId] = {});
          for (const [cardId, rating] of Object.entries(ratings)) {
            if (!artifact.cards.some(card => card.id === cardId) || !['again', 'hard', 'good', 'easy'].includes(rating)) throw new InputError('Invalid flashcard rating.');
            total++;
            if (rating !== 'again') score++;
            const previous = Object.hasOwn(reviews, cardId) ? reviews[cardId] : undefined;
            const intervalDays = Math.min(180, rating === 'again' ? 0 : rating === 'hard' ? 1 : rating === 'good' ? Math.max(2, (previous?.intervalDays ?? 1) * 2) : Math.max(4, (previous?.intervalDays ?? 1) * 3));
            reviews[cardId] = { rating, repetitions: (previous?.repetitions ?? 0) + 1, intervalDays, lastReviewedAt: now, dueAt: new Date(Date.parse(now) + intervalDays * 86400000).toISOString() };
          }
        } else if (kind === 'match') {
          if (!artifact.cards) throw new InputError('This item has no flashcards.');
          const matches = list(args.matches, 'matches', 1, artifact.cards.length);
          evidenceCount = matches.length;
          const used = new Set();
          for (const match of matches) {
            object(match, 'match');
            const card = artifact.cards.find(item => item.id === match.cardId);
            if (!card || used.has(card.id)) throw new InputError('Matches must reference unique cards.');
            used.add(card.id); total++;
            if (match.front === card.front && match.back === card.back) score++;
          }
        } else throw new InputError('Invalid progress kind.');
        const day = now.slice(0, 10);
        const alreadyRewarded = workspace.progress.some(event => event.artifactId === artifactId && event.kind === kind && event.completedAt.slice(0, 10) === day);
        const event = { artifactId, artifactRevision, kind, score, total, xp: alreadyRewarded ? 0 : Math.min(100, score * 5 + (score === total ? 10 : 0)), sessionId, roomId, completedAt: now };
        if (args.durationSeconds !== undefined) event.durationSeconds = integer(args.durationSeconds, 'durationSeconds', 0, 86400);
        workspace.progress.push(event);
        if (evidenceCount) roomState(workspace, roomId).practices++;
        // Keep all award-bearing history; dropping records would reduce points or enable replay.
        if (workspace.progress.length > 10000) throw new InputError('Progress storage limit reached.');
        updateStats(workspace, now);
        return { progressEvent: event, ...(args.artifactRevision === undefined ? { revisionSource: 'checkpoint' } : {}) };
      }
      if (name === 'focus_start') {
        const active = workspace.focusSessions.find(session => !session.completedAt && !session.cancelledAt);
        if (active) return { focusSession: active };
        if (workspace.focusSessions.length >= 10000) throw new InputError('Focus storage limit reached.');
        const selectedArtifact = args.artifactId === undefined ? null : workspace.artifacts.find(artifact => artifact.id === id(args.artifactId, 'artifactId'));
        if (args.artifactId !== undefined && !selectedArtifact) throw new InputError('This study material was not found in your library.', 'NOT_FOUND');
        const focusSession = { id: randomUUID(), startedAt: now, pausedMilliseconds: 0, targetMinutes: integer(args.minutes ?? 25, 'minutes', 1, 180), subject: text(args.subject ?? 'General', 'subject', 80), roomId: activeRoomId(workspace.space), roomCapturedAt: now, roomCreditOffsetMilliseconds: 0 };
        if (args.nookId !== undefined) { if (typeof args.nookId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(args.nookId)) throw new InputError('Invalid nook identifier.'); focusSession.nookId = args.nookId; }
        if (selectedArtifact) {
          focusSession.artifactId = selectedArtifact.id;
          focusSession.artifactRevision = selectedArtifact.revision ?? 1;
          focusSession.artifactTitle = selectedArtifact.title;
        }
        workspace.focusSessions.push(focusSession);
        return { focusSession };
      }
      if (name === 'focus_update' || name === 'focus_complete') {
        const sessionId = id(args.sessionId, 'sessionId');
        const session = workspace.focusSessions.find(item => item.id === sessionId);
        if (!session) throw new InputError('Focus session was not found.', 'NOT_FOUND');
        if (session.completedAt) return { focusSession: session, duplicate: true };
        if (session.cancelledAt) throw new InputError('This focus session has ended.', 'NOT_FOUND');
        if (name === 'focus_update') {
          if (!['pause', 'resume', 'cancel'].includes(args.action)) throw new InputError('action must be pause, resume, or cancel.');
          if (args.action === 'pause' && !session.pausedAt) session.pausedAt = now;
          if (args.action === 'resume' && session.pausedAt) {
            session.pausedMilliseconds += Math.max(0, this.clock().valueOf() - date(session.pausedAt).valueOf());
            delete session.pausedAt;
          }
          if (args.action === 'cancel') session.cancelledAt = now;
          return { focusSession: session };
        }
        const activeMilliseconds = activeFocusMilliseconds(session, now);
        const elapsed = activeMilliseconds / 60000;
        session.minutes = Math.min(session.targetMinutes, Math.floor(elapsed));
        session.activeSeconds = Math.floor(Math.min(session.targetMinutes * 60000, activeMilliseconds) / 1000);
        session.focusSeconds = Math.max(0, Math.floor((Math.min(session.targetMinutes * 60000, activeMilliseconds) - (session.roomCreditOffsetMilliseconds ?? 0)) / 1000));
        session.completedAt = now;
        if (session.focusSeconds > 0) {
          const progress = roomState(workspace, session.roomId);
          progress.focusSeconds += session.focusSeconds;
          progress.sessions++;
        }
        session.xp = session.minutes >= session.targetMinutes ? Math.min(100, session.minutes * 2) : 0;
        updateStats(workspace, now);
        return { focusSession: session };
      }
      throw new InputError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }));
  }
}
