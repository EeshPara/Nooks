import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./materialSources.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { filterStudyMaterials, toggleMaterialSelection, readSelectedMaterials, materialForPrompt, buildStudyCreationPrompt, buildDirectStudyGenerationInput, stableStudyGenerationRequest, suggestedStudyTitle, MAX_CREATE_SOURCE_CHARACTERS } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const note = (id, content, title = id) => ({ id, kind: 'note', title, subject: 'Biology', content, revision: 2 });
const request = overrides => ({ kind: 'flashcards', instruction: '', pastedText: '', materials: [], embedded: true, ...overrides });

test('search finds titles, subjects and kinds without touching private note bodies', () => {
  const materials = [note('one', 'secret grapefruit', 'Cell energy'), { ...note('two', '', 'Week 3'), subject: 'History' }];
  assert.deepEqual(filterStudyMaterials(materials, 'BIOLOGY cell').map(item => item.id), ['one']);
  assert.deepEqual(filterStudyMaterials(materials, 'grapefruit'), []);
  assert.equal(filterStudyMaterials(materials, '   ').length, 2);
});

test('selection is explicit, removable, unique and bounded', () => {
  assert.deepEqual(toggleMaterialSelection([], 'one'), ['one']);
  assert.deepEqual(toggleMaterialSelection(['one', 'two'], 'one'), ['two']);
  const eight = Array.from({ length: 8 }, (_, index) => String(index));
  assert.deepEqual(toggleMaterialSelection(eight, 'ninth'), eight);
  assert.equal(toggleMaterialSelection(eight, '0').length, 7);
});

test('only selected IDs are read and the resolver current draft wins over stale list content', async () => {
  const calls = [];
  const available = [note('one', 'stale sentence'), note('private-unselected', 'NEVER SEND THIS')];
  const result = await readSelectedMaterials(['one', 'one'], available, async id => { calls.push(id); return note(id, 'last unsaved sentence'); });
  assert.deepEqual(calls, ['one']);
  assert.equal(result[0].content, 'last unsaved sentence');
  const prompt = buildStudyCreationPrompt(request({ materials: result }));
  assert.match(prompt, /last unsaved sentence/);
  assert.doesNotMatch(prompt, /stale sentence|NEVER SEND THIS|private-unselected/);
});

test('deleted items, unavailable readers and metadata-only results fail clearly rather than using excerpts', async () => {
  const available = [note('one', 'full text')];
  await assert.rejects(readSelectedMaterials(['deleted'], available, async () => available[0]), /no longer available/);
  await assert.rejects(readSelectedMaterials(['one'], available), /couldn’t be opened/);
  await assert.rejects(readSelectedMaterials(['one'], available, async () => ({ ...available[0], content: undefined, excerpt: 'NOT COMPLETE' })), /no text/);
  await assert.rejects(readSelectedMaterials(['one'], available, async () => note('other-user-item', 'wrong item')), /couldn’t be opened/);
});

test('selection-free requests never read the library', async () => {
  const result = await readSelectedMaterials([], [note('private', 'private')], () => { throw new Error('must not fetch'); });
  assert.deepEqual(result, []);
  assert.throws(() => buildStudyCreationPrompt(request()), /Add a topic/);
  assert.match(buildStudyCreationPrompt(request({ instruction: 'Cell respiration' })), /topic-based/);
});

test('explicit sources take priority over conversation scope and survive changes of output kind', () => {
  const materials = [note('one', 'Glycolysis occurs in the cytoplasm.', 'Cell energy')];
  for (const kind of ['note', 'flashcards', 'quiz', 'exam']) {
    const prompt = buildStudyCreationPrompt(request({ kind, materials, useCurrentConversation: true, pastedText: 'ATP stores usable energy.' }));
    assert.match(prompt, /Glycolysis occurs in the cytoplasm/);
    assert.match(prompt, /ATP stores usable energy/);
    assert.match(prompt, /Do not silently add other library items or conversation material/);
    assert.doesNotMatch(prompt, /Use the relevant study passage from this current conversation/);
    assert.match(prompt, new RegExp(`kind "${kind}"`));
  }
});

test('quiz and card source content includes answers and explanations, omitting irrelevant metadata', () => {
  const cards = { id: 'cards', title: 'Energy', kind: 'flashcards', subject: 'Biology', cards: [{ id: 'c1', front: 'Where?', back: 'Cytoplasm', hint: 'Inside the cell' }], privateMetadata: 'do-not-send' };
  const quiz = { id: 'quiz', title: 'Energy quiz', kind: 'quiz', questions: [{ id: 'q1', prompt: 'Where?', options: ['Cytoplasm', 'Nucleus'], correctIndex: 0, explanation: 'The enzymes are in the cytosol.' }] };
  assert.equal(materialForPrompt(cards).cards[0].back, 'Cytoplasm');
  assert.equal(materialForPrompt(quiz).questions[0].correctIndex, 0);
  const prompt = buildStudyCreationPrompt(request({ materials: [cards, quiz] }));
  assert.match(prompt, /cytosol/);
  assert.doesNotMatch(prompt, /do-not-send|privateMetadata/);
});

test('oversized sources are rejected whole instead of silently truncated', () => {
  assert.throws(() => buildStudyCreationPrompt(request({ materials: [note('large', 'a'.repeat(MAX_CREATE_SOURCE_CHARACTERS))] })), /Choose fewer items/);
  assert.throws(() => buildStudyCreationPrompt(request({ instruction: 'a'.repeat(MAX_CREATE_SOURCE_CHARACTERS), pastedText: 'some text' })), /Choose fewer items/);
});

test('standalone handoff does not claim native generation or automatic saving', () => {
  const prompt = buildStudyCreationPrompt(request({ instruction: 'Make 5 cards about cell energy.', embedded: false }));
  assert.match(prompt, /If Nooks tools are available/);
  assert.match(prompt, /does not import results automatically/);
  assert.match(prompt, /without a successful tool response/);
});

test('manual creation gets a bounded title without requiring another field', () => {
  assert.equal(suggestedStudyTitle('flashcards', '', '  What\n is ATP?  '), 'What is ATP?');
  assert.equal(suggestedStudyTitle('quiz', 'My quiz', 'first question'), 'My quiz');
  assert.equal(suggestedStudyTitle('exam', ''), 'New practice exam');
  assert.ok(suggestedStudyTitle('quiz', '', 'a'.repeat(150)).length <= 72);
});

test('direct generation carries selected current snapshots and metadata without host tool instructions', () => {
  const input = buildDirectStudyGenerationInput(request({
    instruction: 'Test me on these ideas.', title: 'Revision', subject: 'Biology', pastedText: 'ATP stores usable energy.',
    materials: [note('selection:unsaved', 'LATEST UNSAVED PASSAGE')], embedded: false,
  }));
  assert.equal(input.kind, 'flashcards');
  assert.match(input.instruction, /Test me on these ideas/);
  assert.match(input.instruction, /Requested title: "Revision"/);
  assert.match(input.instruction, /Subject: "Biology"/);
  const source = JSON.parse(input.source);
  assert.equal(source.selectedMaterials[0].content, 'LATEST UNSAVED PASSAGE');
  assert.equal(source.pastedText, 'ATP stores usable energy.');
  assert.doesNotMatch(input.instruction, /artifact_save|conversation|ChatGPT/);
});

test('direct topic requests carry no invented reference material', () => {
  const input = buildDirectStudyGenerationInput(request({ instruction: 'Make a quiz on mitosis.', materials: [], kind: 'quiz' }));
  assert.equal(input.source, '');
  assert.throws(() => buildDirectStudyGenerationInput(request()), /Add a topic/);
});

test('direct source and instruction limits reject whole requests rather than truncating study material', () => {
  assert.throws(() => buildDirectStudyGenerationInput(request({ instruction: 'x'.repeat(4001) })), /4,000 characters/);
  assert.throws(() => buildDirectStudyGenerationInput(request({ instruction: 'x'.repeat(3995), title: 'A title' })), /4,000 characters/);
  assert.throws(() => buildDirectStudyGenerationInput(request({ pastedText: 'x'.repeat(MAX_CREATE_SOURCE_CHARACTERS) })), /Choose fewer items/);
  assert.throws(() => buildDirectStudyGenerationInput(request({ materials: Array.from({ length: 9 }, (_, index) => note(String(index), 'text')) })), /up to 8/);
});

test('identical retries preserve generation identity while edited instructions, kinds, or source versions get new IDs', () => {
  let counter = 0;
  const id = () => `request-${++counter}`;
  const input = buildDirectStudyGenerationInput(request({ instruction: 'Make 5 cards', materials: [note('one', 'Original text')] }));
  const attempt = stableStudyGenerationRequest(input, undefined, id);
  assert.equal(attempt.requestId, 'request-1');
  const retried = stableStudyGenerationRequest({ ...input }, JSON.parse(JSON.stringify(attempt)), id);
  assert.equal(retried.requestId, 'request-1');
  assert.equal(counter, 1);
  for (const update of [{ instruction: 'Make 10 cards' }, { kind: 'quiz' }, { source: 'Latest unsaved text' }]) {
    const changed = stableStudyGenerationRequest({ ...input, ...update }, attempt, id);
    assert.notEqual(changed.requestId, attempt.requestId);
  }
});
