import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspace } from '../server/seed.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { StudyEngine, validateArtifact } from '../server/engine.mjs';
import { ORGANIZATION_LIMITS, normalizeOrganization, callOrganization, prepareArtifactSave, validateArtifactOrganizationMeta, removeArtifactOrganizationReferences, organizationToolNames, readOnlyOrganizationTools } from '../server/organization.mjs';
import { listOrganizationTools } from '../server/organization-tools.mjs';

const now = '2026-10-02T03:00:00.000Z';
const later = '2026-10-02T04:00:00.000Z';
function fixture() { const workspace = createWorkspace(now); workspace.artifacts = []; normalizeOrganization(workspace); return workspace; }
function call(workspace, name, args = {}, when = now) { return callOrganization(name, args, workspace, when); }
function save(workspace, input, when = now) {
  const artifact = prepareArtifactSave(input, validateArtifact(input, when), workspace, when);
  const index = workspace.artifacts.findIndex(item => item.id === artifact.id);
  if (index < 0) workspace.artifacts.push(artifact); else workspace.artifacts[index] = artifact;
  return artifact;
}
function course(workspace, title = 'Biology') { return call(workspace, 'course_save', { course: { title } }).course; }
function note(workspace, fields = {}) { return save(workspace, { id: 'note-1', kind: 'note', title: 'Cell respiration', subject: 'Biology', content: '# Respiration\n\nATP stores usable energy.', ...fields }); }

test('legacy material starts Unfiled at revision 1; corrupt organization fails closed', () => {
  const workspace = createWorkspace(now); const before = workspace.artifacts.map(item => item.content);
  const organization = normalizeOrganization(workspace);
  assert.deepEqual(organization.courses, []);
  assert.ok(workspace.artifacts.every(item => item.revision === 1 && !item.courseId));
  assert.deepEqual(workspace.artifacts.map(item => item.content), before);
  workspace.organization = { schemaVersion: 2 };
  assert.throws(() => normalizeOrganization(workspace), { code: 'INVALID_STATE' });
});

test('courses and topics require current revisions for edits and keep referential ownership', () => {
  const alice = fixture(); const bob = fixture(); const biology = course(alice);
  const topic = call(alice, 'topic_save', { topic: { courseId: biology.id, title: 'Cells' } }).topic;
  assert.equal(topic.courseId, biology.id);
  assert.throws(() => call(bob, 'topic_save', { topic: { courseId: biology.id, title: 'Stolen reference' } }), { code: 'NOT_FOUND' });
  assert.throws(() => call(alice, 'course_save', { course: { id: biology.id, title: 'Edited' }, expectedRevision: 2 }), { code: 'REVISION_CONFLICT' });
  const archived = call(alice, 'course_save', { course: { id: biology.id, title: 'Biology 101', archived: true }, expectedRevision: 1 }).course;
  assert.equal(archived.revision, 2); assert.equal(archived.archived, true);
  const chemistry = course(alice, 'Chemistry');
  assert.throws(() => call(alice, 'topic_save', { topic: { id: topic.id, courseId: chemistry.id, title: 'Cells' }, expectedRevision: 1 }), /cannot move/);
  assert.throws(() => call(alice, 'course_save', { course: { title: 'Bad date', examDate: '2026-02-30' } }), /valid YYYY-MM-DD/);
});

test('artifact links cannot cross courses or accounts; explicit null moves to Unfiled', () => {
  const workspace = fixture(); const biology = course(workspace); const chemistry = course(workspace, 'Chemistry');
  const topic = call(workspace, 'topic_save', { topic: { courseId: biology.id, title: 'Cells' } }).topic;
  assert.deepEqual(validateArtifactOrganizationMeta({ topicId: topic.id }, workspace), { courseId: biology.id, topicId: topic.id });
  assert.throws(() => validateArtifactOrganizationMeta({ courseId: chemistry.id, topicId: topic.id }, workspace), /different course/);
  assert.throws(() => validateArtifactOrganizationMeta({ courseId: biology.id }, fixture()), { code: 'NOT_FOUND' });
  const saved = note(workspace, { topicId: topic.id });
  const moved = call(workspace, 'artifact_organize', { artifactId: saved.id, expectedRevision: 1, courseId: null }).artifact;
  assert.equal(moved.courseId, undefined); assert.equal(moved.topicId, undefined); assert.equal(moved.revision, 2);
  assert.equal(workspace.organization.noteRevisions[0].courseId, biology.id);
});

test('human edits preserve prior content and reject stale full-artifact or direct saves', () => {
  const workspace = fixture(); const saved = note(workspace);
  const updated = call(workspace, 'note_update', { artifactId: saved.id, expectedRevision: 1, content: '# Updated\n\nHuman-authored detail.' }, later).artifact;
  assert.equal(updated.revision, 2); assert.equal(updated.createdAt, now); assert.equal(updated.updatedAt, later);
  assert.equal(workspace.organization.noteRevisions[0].content, saved.content);
  const after = JSON.stringify(workspace);
  assert.throws(() => call(workspace, 'note_update', { artifactId: saved.id, expectedRevision: 1, content: 'Stale draft' }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => save(workspace, { ...saved, content: 'Another stale draft' }), { code: 'REVISION_CONFLICT' });
  assert.equal(JSON.stringify(workspace), after);
  const current = call(workspace, 'artifact_get', { artifactId: saved.id }).artifact;
  assert.equal(current.content, updated.content);
  assert.equal(call(workspace, 'artifact_get', { artifactId: saved.id, revision: 1 }).artifact.content, saved.content);
});

test('cleared note bodies persist through both save paths and remain recoverable in revision history', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-empty-note-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const engine = new StudyEngine(new WorkspaceStore(directory, { seeded: false }));
  const user = { id: 'student-clearing-note', scopes: ['notable.read', 'notable.write'] };
  const { artifact: original } = await engine.call('artifact_save', { artifact: { kind: 'note', title: 'Biology', content: 'Keep this earlier writing in history.' } }, user);
  const { artifact: cleared } = await engine.call('artifact_save', { artifact: { ...original, content: '' } }, user);
  assert.equal(cleared.content, ''); assert.equal(cleared.revision, 2);
  const reopened = new StudyEngine(new WorkspaceStore(directory, { seeded: false }));
  assert.equal((await reopened.call('artifact_get', { artifactId: original.id }, user)).artifact.content, '');
  assert.equal((await reopened.call('artifact_get', { artifactId: original.id, revision: 1 }, user)).artifact.content, original.content);
  await assert.rejects(() => reopened.call('artifact_save', { artifact: { ...original, content: '' } }, user), { code: 'REVISION_CONFLICT' });
  const { artifact: rewritten } = await reopened.call('note_update', { artifactId: original.id, expectedRevision: 2, content: 'New writing.' }, user);
  const emptyRevision = await reopened.call('artifact_get', { artifactId: original.id, revision: 2 }, user);
  assert.equal(emptyRevision.artifact.content, '');
  const { artifact: restored } = await reopened.call('note_update', { artifactId: original.id, expectedRevision: rewritten.revision, content: emptyRevision.artifact.content }, user);
  assert.equal(restored.content, ''); assert.equal(restored.revision, 4);
  await assert.rejects(() => reopened.call('note_update', { artifactId: original.id, expectedRevision: rewritten.revision, content: '' }, user), { code: 'REVISION_CONFLICT' });
  assert.equal((await reopened.call('artifact_get', { artifactId: original.id, revision: 3 }, user)).artifact.content, 'New writing.');
});

test('empty note support does not relax required strings, limits or other study-material validation', () => {
  const input = { kind: 'note', title: 'Note', content: '' };
  assert.equal(validateArtifact(input).content, '');
  for (const content of [undefined, null, false, 42, {}, 'x'.repeat(100001)]) assert.throws(() => validateArtifact({ ...input, content }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateArtifact({ ...input, title: '' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateArtifact({ kind: 'flashcards', title: 'Cards', cards: [{ front: '', back: 'Answer' }] }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateArtifact({ kind: 'quiz', title: 'Quiz', questions: [{ prompt: '', answer: 'Answer' }] }), { code: 'INVALID_INPUT' });
  const workspace = fixture(); const original = note(workspace);
  for (const content of [null, false, 42, {}, 'x'.repeat(100001)]) assert.throws(() => call(workspace, 'note_update', { artifactId: original.id, expectedRevision: 1, content }), { code: 'INVALID_INPUT' });
  assert.throws(() => call(workspace, 'note_update', { artifactId: original.id, expectedRevision: 1, title: '' }), { code: 'INVALID_INPUT' });
  assert.equal(workspace.artifacts[0].revision, 1); assert.equal(workspace.organization.noteRevisions.length, 0);
});

test('AI proposals cannot mutate notes before review or overwrite intervening human changes', () => {
  const workspace = fixture(); const original = note(workspace);
  const proposed = call(workspace, 'note_revision_propose', { artifactId: original.id, expectedRevision: 1, content: 'Suggested AI explanation.', reason: 'Clarify the ATP example.' });
  assert.equal(proposed.requiresReview, true); assert.equal(workspace.artifacts[0].content, original.content);
  assert.throws(() => call(workspace, 'note_revision_apply', { proposalId: proposed.proposal.id, expectedRevision: 1 }), { code: 'CONFIRMATION_REQUIRED' });
  call(workspace, 'note_update', { artifactId: original.id, expectedRevision: 1, content: 'Student addition made during review.' });
  assert.throws(() => call(workspace, 'note_revision_apply', { proposalId: proposed.proposal.id, expectedRevision: 2, confirmed: true }), { code: 'REVISION_CONFLICT' });
  assert.equal(workspace.artifacts[0].content, 'Student addition made during review.');
  const history = call(workspace, 'note_revision_list', { artifactId: original.id });
  assert.equal(history.proposals[0].stale, true); assert.equal('content' in history.proposals[0], false);
  const comparison = call(workspace, 'note_revision_get', { proposalId: proposed.proposal.id });
  assert.equal(comparison.proposal.content, 'Suggested AI explanation.'); assert.equal(comparison.current.revision, 2);
  assert.equal(comparison.proposal.stale, true);
  assert.throws(() => call(fixture(), 'note_revision_get', { proposalId: proposed.proposal.id }), { code: 'NOT_FOUND' });
  call(workspace, 'note_revision_discard', { proposalId: proposed.proposal.id });
  assert.equal(workspace.organization.noteProposals.length, 0);
});

test('accepted suggestions advance one revision and retain the previous note', () => {
  const workspace = fixture(); const original = note(workspace);
  const { proposal } = call(workspace, 'note_revision_propose', { artifactId: original.id, expectedRevision: 1, content: 'Reviewed and approved.', title: 'Better title' });
  assert.throws(() => call(fixture(), 'note_revision_apply', { proposalId: proposal.id, expectedRevision: 1, confirmed: true }), { code: 'NOT_FOUND' });
  const applied = call(workspace, 'note_revision_apply', { proposalId: proposal.id, expectedRevision: 1, confirmed: true });
  assert.equal(applied.artifact.revision, 2); assert.equal(applied.artifact.content, 'Reviewed and approved.');
  assert.equal(workspace.organization.noteRevisions[0].content, original.content);
  assert.equal(workspace.organization.noteProposals.length, 0);
  assert.throws(() => call(workspace, 'note_revision_apply', { proposalId: proposal.id, expectedRevision: 2, confirmed: true }), { code: 'NOT_FOUND' });
});

test('revision retention is bounded without changing the current note; old content can be restored as a new revision', () => {
  const workspace = fixture(); const original = note(workspace);
  for (let i = 1; i <= 15; i++) call(workspace, 'note_update', { artifactId: original.id, expectedRevision: i, content: `Version ${i + 1}` });
  assert.equal(workspace.artifacts[0].revision, 16);
  const history = call(workspace, 'note_revision_list', { artifactId: original.id });
  assert.equal(history.revisions.length, ORGANIZATION_LIMITS.revisionsPerNote);
  assert.equal(history.revisions[0].revision, 15);
  assert.throws(() => call(workspace, 'artifact_get', { artifactId: original.id, revision: 1 }), { code: 'NOT_FOUND' });
  const previous = call(workspace, 'artifact_get', { artifactId: original.id, revision: 10 }).artifact;
  const restored = call(workspace, 'note_update', { artifactId: original.id, expectedRevision: 16, content: previous.content });
  assert.equal(restored.artifact.revision, 17); assert.equal(restored.artifact.content, 'Version 10');
});

test('search and paged material retrieval remain scoped and do not flood context', () => {
  const workspace = fixture(); const biology = course(workspace); const chemistry = course(workspace, 'Chemistry');
  for (let i = 0; i < 6; i++) note(workspace, { id: `note-${i}`, title: `ATP ${i}`, content: 'A'.repeat(50_000), courseId: biology.id });
  note(workspace, { id: 'chemical', title: 'ATP elsewhere', courseId: chemistry.id });
  const first = call(workspace, 'library_search', { courseId: biology.id, query: 'ATP', limit: 2 });
  const second = call(workspace, 'library_search', { courseId: biology.id, query: 'ATP', limit: 2, offset: first.nextOffset });
  assert.equal(first.total, 6); assert.equal(first.nextOffset, 2);
  assert.equal(first.items.some(item => second.items.some(other => other.id === item.id)), false);
  assert.ok(first.items.every(item => !('content' in item) && item.excerpt.length <= 220));
  const page = call(workspace, 'artifact_get', { artifactId: 'note-1', maxChars: 1000 });
  assert.equal(page.artifact.content.length, 1000); assert.equal(page.nextOffset, 1000);
  assert.throws(() => call(workspace, 'context_get', { courseId: biology.id, artifactIds: ['chemical'] }), /outside/);
});

test('session summaries require review, link only private scoped study material and reject chat logs', () => {
  const workspace = fixture(); const biology = course(workspace); const saved = note(workspace, { courseId: biology.id });
  const session = { title: 'Cells review', summary: 'I can explain ATP; review the electron transport chain next.', courseId: biology.id, artifactIds: [saved.id], goals: ['Prepare for Friday'], nextSteps: ['Practice electron transport'], openQuestions: ['Why does oxygen matter?'] };
  assert.throws(() => call(workspace, 'session_save', { session }), { code: 'CONFIRMATION_REQUIRED' });
  assert.throws(() => call(workspace, 'session_save', { session: { ...session, messages: [{ role: 'user', content: 'full conversation' }] }, confirmed: true }), /not supported/);
  assert.throws(() => call(workspace, 'session_save', { session: { ...session, artifactIds: ['another-users-note'] }, confirmed: true }), { code: 'NOT_FOUND' });
  const { session: stored } = call(workspace, 'session_save', { session, confirmed: true });
  const context = call(workspace, 'context_get', { courseId: biology.id });
  assert.equal(context.context.session.id, stored.id); assert.equal(context.context.materials[0].id, saved.id);
  assert.equal(context.context.session.nextSteps[0], session.nextSteps[0]);
  assert.throws(() => call(workspace, 'context_get', { conversationId: 'arbitrary-chat' }), /not supported/);
  assert.throws(() => call(workspace, 'session_save', { session: { ...session, id: stored.id }, expectedRevision: 2, confirmed: true }), { code: 'REVISION_CONFLICT' });
});

test('context budgets bound the entire serialized result even with maximum source metadata', () => {
  const workspace = fixture(); const biology = course(workspace, 'B'.repeat(120));
  const topic = call(workspace, 'topic_save', { topic: { title: 'T'.repeat(120), courseId: biology.id } }).topic;
  for (let i = 0; i < 20; i++) note(workspace, { id: `${i}`.padEnd(128, 'n'), title: 'N'.repeat(180), subject: 'S'.repeat(80), content: 'x'.repeat(100_000), topicId: topic.id });
  const { session } = call(workspace, 'session_save', { session: { title: 'S'.repeat(160), summary: 'Z'.repeat(4000), courseId: biology.id, topicId: topic.id, artifactIds: workspace.artifacts.map(item => item.id), goals: Array(8).fill('G'.repeat(300)), nextSteps: Array(8).fill('N'.repeat(300)), openQuestions: Array(8).fill('Q'.repeat(300)) }, confirmed: true });
  for (const maxChars of [2000, 2500, 8000, 16000]) {
    const result = call(workspace, 'context_get', { sessionId: session.id, courseId: biology.id, topicId: topic.id, maxChars });
    assert.ok(JSON.stringify(result).length <= maxChars, `${JSON.stringify(result).length} exceeds ${maxChars}`);
    assert.equal(result.truncated, true); assert.ok(result.context.materials.length <= 8);
  }
});

test('deleting a study item erases its versions and proposals and repairs saved-context links', () => {
  const workspace = fixture(); const saved = note(workspace);
  call(workspace, 'note_update', { artifactId: saved.id, expectedRevision: 1, content: 'Updated.' });
  call(workspace, 'note_revision_propose', { artifactId: saved.id, expectedRevision: 2, content: 'Suggested.' });
  call(workspace, 'session_save', { session: { title: 'Review', summary: 'Continue reviewing.', artifactIds: [saved.id] }, confirmed: true });
  workspace.artifacts = []; removeArtifactOrganizationReferences(workspace, saved.id);
  assert.equal(workspace.organization.noteRevisions.length, 0); assert.equal(workspace.organization.noteProposals.length, 0);
  assert.deepEqual(workspace.organization.sessions[0].artifactIds, []);
  assert.equal(call(workspace, 'context_get', {}).context.session.summary, 'Continue reviewing.');
});

test('future sessions rehydrate from durable per-account storage without sharing another user’s data', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-organization-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(directory, { seeded: false, clock: () => new Date(now) });
  let courseId;
  await store.transact('verified-alice', workspace => {
    courseId = course(workspace).id; note(workspace, { courseId });
    return call(workspace, 'session_save', { session: { title: 'Cell exam', summary: 'Review active transport next.', courseId, artifactIds: ['note-1'], nextSteps: ['Draw a cell membrane'] }, confirmed: true });
  });
  const reopened = new WorkspaceStore(directory, { seeded: false });
  const alice = await reopened.read('verified-alice'); const bob = await reopened.read('verified-bob');
  assert.equal(call(alice, 'context_get', { courseId }).context.session.summary, 'Review active transport next.');
  assert.deepEqual(call(bob, 'library_search').items, []);
  assert.throws(() => call(bob, 'artifact_get', { artifactId: 'note-1' }), { code: 'NOT_FOUND' });
  assert.throws(() => call(bob, 'context_get', { courseId }), { code: 'NOT_FOUND' });
  const attempts = await Promise.allSettled([1, 2].map(i => reopened.transact('verified-alice', workspace => call(workspace, 'note_update', { artifactId: 'note-1', expectedRevision: 1, content: `Concurrent draft ${i}` }))));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(result => result.status === 'rejected').reason.code, 'REVISION_CONFLICT');
});

test('tool declarations match handlers, require authentication and disclose reviewed continuity boundaries', () => {
  const tools = listOrganizationTools({ oauthConfigured: true });
  assert.deepEqual(new Set(tools.map(tool => tool.name)), organizationToolNames);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, readOnlyOrganizationTools.has(tool.name));
    assert.equal(tool.securitySchemes[0].type, 'oauth2');
  }
  assert.match(tools.find(tool => tool.name === 'context_get').description, /does not fetch ChatGPT conversation history/);
});
