import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function loadModule(name) {
  const source = fs.readFileSync(new URL(name, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const grading = await loadModule('./types.ts');
const editor = await loadModule('./editorHelpers.ts');
const base = { id: 'set', title: 'Exam preparation', subject: 'Biology', color: 'mint', createdAt: '2026-10-01', updatedAt: '2026-10-01' };

test('short-answer grading accepts normalization and alternatives but rejects empty and unrelated answers', () => {
  const question = { id: 'q', prompt: 'How can I practice?', answer: 'Active recall', acceptedAnswers: ['retrieval practice'] };
  assert.equal(grading.isCorrectAnswer(question, '  ACTIVE   recall!  '), true);
  assert.equal(grading.isCorrectAnswer(question, 'Retrieval practice.'), true);
  assert.equal(grading.isCorrectAnswer(question, 'rereading'), false);
  assert.equal(grading.isCorrectAnswer(question, ''), false);
  assert.equal(grading.isCorrectAnswer(question, '   '), false);
});

test('option shuffle preserves answer identity for server grading', () => {
  const question = { id: 'q', prompt: 'Pick one', options: ['Correct', 'Distractor', 'Another distractor'], correctIndex: 0 };
  for (let round = 0; round < 100; round++) {
    const order = grading.shuffledOptionIndices(question);
    assert.deepEqual([...order].sort(), [0, 1, 2]);
    const displayedCorrectPosition = order.indexOf(0);
    assert.equal(grading.isCorrectAnswer(question, order[displayedCorrectPosition]), true);
    assert.equal(grading.isCorrectAnswer(question, order[(displayedCorrectPosition + 1) % order.length]), false);
  }
  assert.deepEqual(question.options, ['Correct', 'Distractor', 'Another distractor']);
});

test('deleting a choice remaps the correct answer or explicitly requires choosing a replacement', () => {
  assert.deepEqual(editor.deleteQuestionOption(['A', 'B', 'C'], 2, 0), { options: ['B', 'C'], correctIndex: 1 });
  assert.deepEqual(editor.deleteQuestionOption(['A', 'B', 'C'], 1, 1), { options: ['A', 'C'], correctIndex: undefined });
  assert.deepEqual(editor.deleteQuestionOption(['A', 'B', 'C'], 0, 2), { options: ['A', 'B'], correctIndex: 0 });
});

test('invalid or incomplete edited content cannot be saved', () => {
  assert.ok(editor.validateStudyArtifact({ ...base, kind: 'flashcards', cards: [] }).length);
  assert.ok(editor.validateStudyArtifact({ ...base, kind: 'flashcards', cards: [{ id: 'c', front: 'Prompt', back: ' ' }] }).length);
  assert.ok(editor.validateStudyArtifact({ ...base, kind: 'quiz', questions: [{ id: 'q', prompt: 'Prompt', options: ['A', 'B'], correctIndex: 7 }] }).length);
  assert.ok(editor.validateStudyArtifact({ ...base, kind: 'exam', questions: [{ id: 'q', prompt: 'Prompt', answer: '' }] }).length);
  assert.equal(editor.validateStudyArtifact({ ...base, kind: 'quiz', questions: [{ id: 'q', prompt: 'Prompt', options: ['A', 'B'], correctIndex: 1 }] }).length, 0);
  assert.equal(editor.validateStudyArtifact({ ...base, kind: 'exam', questions: [{ id: 'q', prompt: 'Prompt', answer: 'Accepted' }] }).length, 0);
});
