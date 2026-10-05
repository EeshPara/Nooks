import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./ChatAnchor.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ChatAnchor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = ast.statements.filter(statement => ts.isFunctionDeclaration(statement) && ['makePreviewReply', 'getChatShortcuts', 'getChatPlaceholder'].includes(statement.name?.text) || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'cleanExcerpt')).map(statement => statement.getText(ast)).join('\n');
const code = ts.transpileModule(helpers, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { makePreviewReply, getChatShortcuts, getChatPlaceholder } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const material = { id: 'a', title: 'Biology', kind: 'note', content: '## Energy\nATP carries energy in cells.', cards: [{ id: 'c', front: 'What is ATP?', back: 'A cellular energy carrier.' }], questions: [{ id: 'q', prompt: 'Pick the energy carrier', options: ['DNA', 'ATP'], correctIndex: 1, explanation: 'ATP carries energy.' }] };

test('sample quizzes preserve stored correct answer and never mutate the material', () => {
  const result = makePreviewReply('Quiz me', material);
  assert.equal(result.quiz.correctIndex, 1);
  assert.deepEqual(result.quiz.options, ['DNA', 'ATP']);
  result.quiz.options[0] = 'Edited preview';
  assert.deepEqual(material.questions[0].options, ['DNA', 'ATP']);
});
test('selected text takes priority over other stored cards and questions', () => {
  const selection = { text: 'Water is essential for cellular processes.', title: 'Selected idea' };
  assert.equal(makePreviewReply('Make flashcards', material, selection).card.back, selection.text);
  assert.equal(makePreviewReply('Quiz this passage', material, selection).quiz.options[0], selection.text);
  assert.equal(makePreviewReply('Explain this', material, selection).excerpt, selection.text);
});
test('sample reply keeps source text bounded and removes heading markers without inventing its contents', () => {
  const result = makePreviewReply('Explain this', { ...material, content: '# Topic\n' + 'a'.repeat(1000) });
  assert.equal(result.excerpt.length, 380);
  assert.ok(result.excerpt.startsWith('Topic '));
});
test('empty context still supplies a complete interactive example', () => {
  const card = makePreviewReply('Make flashcards', null).card;
  assert.ok(card.front && card.back);
  const quiz = makePreviewReply('Quiz me', null).quiz;
  assert.ok(quiz.options.length >= 2);
  assert.ok(quiz.correctIndex >= 0 && quiz.correctIndex < quiz.options.length);
});
test('note sidebar samples use current unsaved source content rather than the older artifact', () => {
  const prompt = 'Using this current Nook note content: Newly edited source. My note titled "Biology" (artifact id a), create a flashcard set of the key ideas.';
  const reply = makePreviewReply(prompt, material);
  assert.equal(reply.card.back, 'Newly edited source');
});

test('area shortcuts and placeholders adapt while attached material remains the first context', () => {
  assert.equal(getChatShortcuts(null, null, 'focus')[0].title, 'Plan 25 minutes');
  assert.equal(getChatShortcuts(null, null, 'plan')[0].title, 'My priorities');
  assert.equal(getChatShortcuts(null, null, 'library')[0].title, 'Organize materials');
  assert.equal(getChatShortcuts(material, null, 'focus')[0].title, 'Explain these notes');
  assert.equal(getChatShortcuts(material, { text: 'Selected sentence' }, 'plan')[0].title, 'Explain selection');
  assert.equal(getChatPlaceholder(material, { text: 'Selected sentence' }, 'focus'), 'Ask about this passage…');
  assert.notEqual(getChatPlaceholder(null, null, 'focus'), getChatPlaceholder(null, null, 'plan'));
});
test('page-specific preview samples use the requested area and keep selected source priority', () => {
  assert.match(makePreviewReply('Plan a session', null, null, 'focus').text, /25-minute/);
  assert.match(makePreviewReply('Plan my week', null, null, 'plan').text, /Monday:/);
  assert.match(makePreviewReply('Organize materials', null, null, 'library').text, /group materials by subject/);
  assert.equal(makePreviewReply('Plan a session', material, { text: 'My actual passage' }, 'focus').excerpt, 'My actual passage');
});
