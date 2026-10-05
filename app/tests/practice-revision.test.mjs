import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudyEngine } from '../server/engine.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { listTools } from '../server/tools.mjs';
import { modelSafeResult } from '../server/model-result.mjs';

const student = { id: 'practice-revision-student', scopes: ['notable.read', 'notable.write'] };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-practice-revision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(directory, { seeded: false });
  return { store, engine: new StudyEngine(store) };
}
const question = { id: 'q', prompt: 'Which word means cat?', options: ['gato', 'perro'], correctIndex: 0 };
const card = { id: 'c', front: 'Cat in Spanish?', back: 'gato' };
const legacySession = '149adf46-638a-4f28-af67-64cbf68be72b';
function checkpoint(kind, revision = 1, sessionId = legacySession) {
  return { version: 1, kind, artifactRevision: revision, sessionId, elapsedSeconds: 12,
    state: kind === 'flashcards'
      ? { queue: [0], known: [], firstAnswers: { 0: false }, flipped: true, showHint: false, complete: false, duration: 0 }
      : { index: 0, answers: { 0: 0 }, checked: kind === 'quiz' ? { 0: true } : {}, flagged: {}, optionOrders: [[0, 1]], stage: 'questions', reviewFilter: 'all' },
  };
}

for (const kind of ['quiz', 'exam', 'sprint', 'flashcards', 'match']) {
  test(`${kind} refuses old evidence after material changes, without altering results or rewards`, async t => {
    const { store, engine } = await fixture(t);
    const cards = kind === 'flashcards' || kind === 'match';
    const first = await engine.call('artifact_save', { artifact: {
      id: 'material', kind: cards ? 'flashcards' : kind === 'exam' ? 'exam' : 'quiz', title: 'Vocabulary', subject: 'Spanish',
      ...(cards ? { cards: [card] } : { questions: [question] }),
    } }, student);
    // IDs stay stable while answer meaning changes in a second editor.
    const second = await engine.call('artifact_save', { artifact: { ...first.artifact,
      ...(cards ? { cards: [{ ...card, front: 'Dog in Spanish?', back: 'perro' }] }
        : { questions: [{ ...question, options: ['perro', 'gato'], correctIndex: 1 }] }),
    } }, student);
    const evidence = kind === 'match' ? { matches: [{ cardId: 'c', front: card.front, back: card.back }] }
      : cards ? { cardRatings: { c: 'good' } } : { answers: { q: 0 } };
    const before = await store.read(student.id);
    await assert.rejects(engine.call('progress_record', {
      artifactId: 'material', artifactRevision: first.artifact.revision, sessionId: 'stale-session', kind, ...evidence,
    }, student), error => error.code === 'REVISION_CONFLICT' && error.currentRevision === second.artifact.revision);
    assert.deepEqual(await store.read(student.id), before, 'stale work must not alter scores, card reviews, XP, or nook progress');
    const currentEvidence = kind === 'match' ? { matches: [{ cardId: 'c', front: 'Dog in Spanish?', back: 'perro' }] }
      : cards ? evidence : { answers: { q: 1 } };
    const saved = await engine.call('progress_record', {
      artifactId: 'material', artifactRevision: second.artifact.revision, sessionId: 'new-session', kind, ...currentEvidence,
    }, student);
    assert.equal(saved.progressEvent.score, 1);
    assert.equal(saved.progressEvent.artifactRevision, 2);
  });
}

test('new unversioned results from old clients fail closed instead of guessing a revision', async t => {
  const { store, engine } = await fixture(t);
  const first = await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student);
  for (const revision of [1, 2]) {
    if (revision === 2) await engine.call('artifact_save', { artifact: { ...first.artifact, title: 'Revised quiz' } }, student);
    const before = await store.read(student.id);
    await assert.rejects(engine.call('progress_record', { artifactId: first.artifact.id, sessionId: `legacy-${revision}`, answers: { q: 0 } }, student), { code: 'REVISION_CONFLICT' });
    assert.deepEqual(await store.read(student.id), before);
  }
});

test('confirmed versioned sessions remain idempotent after edits, with no regrading or duplicate awards', async t => {
  const { store, engine } = await fixture(t);
  const first = await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student);
  const input = { artifactId: 'quiz', artifactRevision: 1, sessionId: 'committed', answers: { q: 0 } };
  const initial = await engine.call('progress_record', input, student);
  await engine.call('artifact_save', { artifact: { ...first.artifact, questions: [{ ...question, options: ['perro', 'gato'], correctIndex: 1 }] } }, student);
  const before = await store.read(student.id);
  for (const retry of [input, { artifactId: 'quiz', sessionId: 'committed', answers: { q: 1 } }]) {
    const result = await engine.call('progress_record', retry, student);
    assert.equal(result.duplicate, true);
    assert.deepEqual(result.progressEvent, initial.progressEvent);
    const after = await store.read(student.id);
    assert.deepEqual(after.progress, before.progress); assert.deepEqual(after.stats, before.stats);
    assert.deepEqual(after.roomProgress, before.roomProgress);
  }
});

test('pre-upgrade completed history without a revision is returned unchanged on retry', async t => {
  const { engine, store } = await fixture(t);
  await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student);
  const oldEvent = { artifactId: 'quiz', sessionId: 'legacy-saved', kind: 'quiz', score: 1, total: 1, xp: 15, roomId: 'rainy-library', completedAt: '2026-10-01T00:00:00Z' };
  await store.transact(student.id, workspace => { workspace.progress.push(oldEvent); return {}; });
  const retry = await engine.call('progress_record', { artifactId: 'quiz', sessionId: oldEvent.sessionId, answers: { q: 1 } }, student);
  assert.equal(retry.duplicate, true); assert.deepEqual(retry.progressEvent, oldEvent);
  assert.equal(retry.workspace.progress.length, 1);
  assert.equal(Object.hasOwn(retry.progressEvent, 'artifactRevision'), false, 'historic results are never relabeled');
});

test('deleting and recreating an ID cannot reset its revision or reinterpret old results', async t => {
  const { engine, store } = await fixture(t);
  const first = await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student);
  const event = { artifactId: 'quiz', artifactRevision: first.artifact.revision, kind: 'quiz', sessionId: 'original-session', answers: { q: 0 } };
  const recorded = await engine.call('progress_record', event, student);
  await engine.call('artifact_delete', { artifactId: 'quiz' }, student);
  const deleted = await store.read(student.id);
  await assert.rejects(engine.call('progress_record', { ...event, sessionId: 'uncommitted-old-session' }, student), { code: 'NOT_FOUND' });
  assert.deepEqual(await store.read(student.id), deleted);
  const replay = await engine.call('progress_record', event, student);
  assert.equal(replay.duplicate, true); assert.deepEqual(replay.progressEvent, recorded.progressEvent);
  let current = await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'New quiz', questions: [{ ...question, options: ['perro', 'gato'], correctIndex: 1 }] } }, student);
  assert.equal(current.artifact.revision, 2);
  await assert.rejects(engine.call('progress_record', { ...event, sessionId: 'uncommitted-old-session' }, student), { code: 'REVISION_CONFLICT' });
  const updated = await engine.call('artifact_save', { artifact: { ...current.artifact, title: 'Edited new quiz' } }, student);
  assert.equal(updated.artifact.revision, 3);
  await engine.call('artifact_delete', { artifactId: 'quiz' }, student);
  current = await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Third quiz', questions: [question] } }, student);
  assert.equal(current.artifact.revision, 4);
  assert.equal(current.workspace.artifactRevisionFloor, 3);
  assert.deepEqual(current.workspace.progress, [recorded.progressEvent], 'recreation preserves old history without relabeling');
});

test('deletion reserves a high historic revision without changing other active artifacts', async t => {
  const { engine, store } = await fixture(t);
  const first = await engine.call('artifact_save', { artifact: { id: 'historic', kind: 'quiz', title: 'Historic', questions: [question] } }, student);
  const untouched = await engine.call('artifact_save', { artifact: { id: 'active', kind: 'quiz', title: 'Active session', questions: [question] } }, student);
  // Model an imported pre-document-revision artifact whose own revision is high.
  await store.transact(student.id, workspace => { workspace.artifacts.find(item => item.id === 'historic').revision = 450; return {}; });
  await engine.call('artifact_delete', { artifactId: 'historic' }, student);
  const replacement = await engine.call('artifact_save', { artifact: { ...first.artifact, revision: undefined } }, student);
  assert.equal(replacement.artifact.revision, 451);
  assert.deepEqual(replacement.workspace.artifacts.find(item => item.id === 'active'), untouched.artifact);
});

test('a stale editor cannot resurrect deleted notes or study sets', async t => {
  const { engine, store } = await fixture(t);
  for (const kind of ['note', 'quiz', 'flashcards']) {
    const first = await engine.call('artifact_save', { artifact: { id: kind, kind, title: 'Original',
      ...(kind === 'note' ? { content: 'My writing' } : kind === 'quiz' ? { questions: [question] } : { cards: [card] }),
    } }, student);
    await engine.call('artifact_delete', { artifactId: kind }, student);
    const before = await store.read(student.id);
    await assert.rejects(engine.call('artifact_save', { artifact: { ...first.artifact, title: 'Autosave after deletion' } }, student), { code: 'REVISION_CONFLICT' });
    await assert.rejects(engine.call('artifact_save', { artifact: { ...first.artifact, revision: undefined, expectedRevision: first.artifact.revision } }, student), { code: 'REVISION_CONFLICT' });
    assert.deepEqual(await store.read(student.id), before);
  }
});

test('invalid or overflowing persisted revision floors cannot recreate an ID with an unsafe version', async t => {
  const { engine, store } = await fixture(t);
  for (const floor of [-1, '1', Number.MAX_SAFE_INTEGER, Infinity]) {
    await store.transact(student.id, workspace => { workspace.artifactRevisionFloor = floor; return {}; });
    await assert.rejects(engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student));
    assert.equal((await store.read(student.id)).artifacts.length, 0);
  }
});

for (const kind of ['quiz', 'exam', 'flashcards']) {
  test(`already-open legacy ${kind} can finish using its exact saved checkpoint version`, async t => {
    const { engine } = await fixture(t);
    await engine.call('artifact_save', { artifact: { id: 'legacy-material', kind, title: 'Existing study session',
      ...(kind === 'flashcards' ? { cards: [card] } : { questions: [question] }),
    } }, student);
    await engine.call('practice_checkpoint_save', { artifactId: 'legacy-material', checkpoint: checkpoint(kind) }, student);
    const result = await engine.call('progress_record', { artifactId: 'legacy-material', kind, sessionId: legacySession,
      ...(kind === 'flashcards' ? { cardRatings: { c: 'again' } } : { answers: { q: 0 } }),
    }, student);
    assert.equal(result.progressEvent.artifactRevision, 1);
    assert.equal(result.progressEvent.score, kind === 'flashcards' ? 0 : 1);
    assert.equal(result.revisionSource, 'checkpoint');
    const exposed = modelSafeResult({ structuredContent: result }).structuredContent;
    assert.equal(exposed.progressEvent.artifactRevision, 1);
    assert.equal(exposed.revisionSource, 'checkpoint');
  });
}

test('legacy completion may add a final answer after its last checkpoint, without inventing a version', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student);
  const position = checkpoint('quiz'); position.state.answers = {}; position.state.checked = {};
  await engine.call('practice_checkpoint_save', { artifactId: 'quiz', checkpoint: position }, student);
  const result = await engine.call('progress_record', { artifactId: 'quiz', kind: 'quiz', sessionId: legacySession, answers: { q: 0 } }, student);
  assert.equal(result.progressEvent.score, 1); assert.equal(result.revisionSource, 'checkpoint');
});

test('legacy checkpoint fallback rejects another session, contradictory answers, kind, artifact, or owner', async t => {
  const { engine, store } = await fixture(t);
  const input = { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] };
  await engine.call('artifact_save', { artifact: input }, student);
  await engine.call('artifact_save', { artifact: { ...input, id: 'other-quiz' } }, student);
  const otherStudent = { ...student, id: 'other-student' };
  await engine.call('artifact_save', { artifact: input }, otherStudent);
  await engine.call('practice_checkpoint_save', { artifactId: 'quiz', checkpoint: checkpoint('quiz') }, student);
  const event = { artifactId: 'quiz', kind: 'quiz', sessionId: legacySession, answers: { q: 0 } };
  for (const [args, owner] of [
    [{ ...event, sessionId: 'different-session' }, student],
    [{ ...event, answers: { q: 1 } }, student],
    [{ ...event, kind: 'exam' }, student],
    [{ ...event, artifactId: 'other-quiz' }, student],
    [event, otherStudent],
  ]) {
    const before = await store.read(owner.id);
    await assert.rejects(engine.call('progress_record', args, owner), { code: 'REVISION_CONFLICT' });
    assert.deepEqual(await store.read(owner.id), before);
  }
});

test('an old checkpoint cannot attest a changed artifact or override an explicitly stale revision', async t => {
  const { engine, store } = await fixture(t);
  const first = await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [question] } }, student);
  await engine.call('practice_checkpoint_save', { artifactId: 'quiz', checkpoint: checkpoint('quiz') }, student);
  await engine.call('artifact_save', { artifact: { ...first.artifact, questions: [{ ...question, options: ['perro', 'gato'], correctIndex: 1 }] } }, student);
  const event = { artifactId: 'quiz', kind: 'quiz', sessionId: legacySession, answers: { q: 0 } };
  const before = await store.read(student.id);
  await assert.rejects(engine.call('progress_record', event, student), { code: 'REVISION_CONFLICT' });
  assert.deepEqual(await store.read(student.id), before);
  await engine.call('practice_checkpoint_save', { artifactId: 'quiz', checkpoint: checkpoint('quiz', 2) }, student);
  await assert.rejects(engine.call('progress_record', { ...event, artifactRevision: 1 }, student), { code: 'REVISION_CONFLICT' });
  assert.equal((await store.read(student.id)).progress.length, 0);
});

test('progress schema describes the studied revision and limits legacy omission to saved checkpoints', () => {
  const tool = listTools().find(tool => tool.name === 'progress_record');
  assert.equal(tool.inputSchema.properties.artifactRevision.minimum, 1);
  assert.match(tool.description, /Never replace a stale or missing revision/);
  assert.match(tool.inputSchema.properties.artifactRevision.description, /New clients must supply it/);
  assert.match(tool.description, /exact compatible server-saved checkpoint/);
});
