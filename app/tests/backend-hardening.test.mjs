import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyEngine } from '../server/engine.mjs';
import { createWorkspace } from '../server/seed.mjs';

const alice = { id: 'alice', scopes: ['notable.read', 'notable.write'] };
const bob = { id: 'bob', scopes: ['notable.read', 'notable.write'] };
function fixture() {
  const records = new Map();
  const clock = () => new Date('2026-10-03T12:00:00Z');
  const store = {
    async read(id) {
      if (records.has(id)) return structuredClone(records.get(id));
      const value = createWorkspace(clock().toISOString());
      value.artifacts = []; value.plan.tasks = [];
      return value;
    },
    async transact(id, mutate) {
      const workspace = await this.read(id);
      const result = await mutate(workspace);
      // Match the persistence boundary: no function/prototype-only data survives.
      records.set(id, JSON.parse(JSON.stringify(workspace)));
      return { ...result, workspace: structuredClone(records.get(id)) };
    },
  };
  return { store, engine: new StudyEngine(store, { clock }), clock };
}

test('prototype-named artifact and card IDs remain persisted, private review data', async t => {
  const { engine, store } = fixture();
  const original = Object.getOwnPropertyDescriptor(Object.prototype.toString, 'valueOf');
  t.after(() => {
    if (original) Object.defineProperty(Object.prototype.toString, 'valueOf', original);
    else delete Object.prototype.toString.valueOf;
  });
  const artifact = { id: 'toString', kind: 'flashcards', title: 'Biology', subject: 'Biology', cards: [{ id: 'valueOf', front: 'Energy currency?', back: 'ATP' }] };
  for (const user of [alice, bob]) await engine.call('artifact_save', { artifact }, user);
  await engine.call('progress_record', { artifactRevision: 1, artifactId: artifact.id, sessionId: 'alice-review', kind: 'flashcards', cardRatings: { valueOf: 'good' } }, alice);
  await engine.call('progress_record', { artifactRevision: 1, artifactId: artifact.id, sessionId: 'bob-review', kind: 'flashcards', cardRatings: { valueOf: 'easy' } }, bob);
  const aliceReview = (await store.read(alice.id)).reviews.toString.valueOf;
  const bobReview = (await store.read(bob.id)).reviews.toString.valueOf;
  assert.equal(aliceReview.repetitions, 1);
  assert.equal(aliceReview.intervalDays, 2);
  assert.equal(bobReview.repetitions, 1);
  assert.equal(bobReview.intervalDays, 4);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype.toString, 'valueOf'), original);
});

test('prototype-named unanswered quiz questions cannot pick up inherited answers', async () => {
  const { engine } = fixture();
  await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Quiz', questions: [{ id: 'toString', prompt: 'Energy currency?', answer: 'ATP' }] } }, alice);
  const result = await engine.call('progress_record', { artifactRevision: 1, artifactId: 'quiz', sessionId: 'empty-review', answers: {} }, alice);
  assert.equal(result.progressEvent.score, 0);
  assert.equal(result.progressEvent.xp, 0);
  assert.equal(result.progressEvent.total, 1);
});

test('flashcard due date uses the same 180-day cap as its saved review interval', async () => {
  const { engine, clock } = fixture();
  await engine.call('artifact_save', { artifact: { id: 'cards', kind: 'flashcards', title: 'Cards', cards: [{ id: 'one', front: 'Question', back: 'Answer' }] } }, alice);
  for (let index = 0; index < 9; index++) {
    const result = await engine.call('progress_record', { artifactRevision: 1, artifactId: 'cards', sessionId: `review-${index}`, kind: 'flashcards', cardRatings: { one: 'easy' } }, alice);
    const review = result.workspace.reviews.cards.one;
    assert.equal(Date.parse(review.dueAt) - clock().valueOf(), review.intervalDays * 86400000);
    assert.ok(review.intervalDays <= 180);
    if (index >= 5) assert.equal(review.intervalDays, 180);
  }
});

test('all editable study kinds reject revision-free and stale replacement without losing newer work', async () => {
  const { engine, store } = fixture();
  for (const kind of ['note', 'flashcards', 'quiz', 'exam']) {
    const input = {
      id: kind, kind, title: 'Original',
      ...(kind === 'note' ? { content: 'Original content' } : kind === 'flashcards' ? { cards: [{ front: 'Question', back: 'Answer' }] } : { questions: [{ prompt: 'Question', answer: 'Answer' }] }),
    };
    const first = await engine.call('artifact_save', { artifact: input }, alice);
    await assert.rejects(engine.call('artifact_save', { artifact: { ...input, title: 'Missing revision' } }, alice), { code: 'INVALID_INPUT' });
    const second = await engine.call('artifact_save', { artifact: { ...first.artifact, title: 'Newer work' } }, alice);
    assert.equal(second.artifact.revision, 2);
    await assert.rejects(engine.call('artifact_save', { artifact: { ...first.artifact, title: 'Stale replacement' } }, alice), { code: 'REVISION_CONFLICT' });
    const current = (await store.read(alice.id)).artifacts.find(item => item.id === kind);
    assert.equal(current.title, 'Newer work');
    assert.equal(current.revision, 2);
    const additiveRetry = await engine.call('artifact_save', { artifact: input, ifAbsent: true }, alice);
    assert.equal(additiveRetry.duplicate, true);
    assert.equal(additiveRetry.artifact.title, 'Newer work');
  }
});
