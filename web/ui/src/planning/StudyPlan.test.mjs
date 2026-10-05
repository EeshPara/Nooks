import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./StudyPlan.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StudyPlan.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ast.statements.filter(item => ts.isFunctionDeclaration(item) && ['validatedPlanTask', 'editedPlanTasks'].includes(item.name?.text)).map(item => item.getText(ast)).join('\n');
const code = ts.transpileModule(selected, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { validatedPlanTask, editedPlanTasks } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const task = { id: 'step-1', title: '  Review chapter one  ', subject: '  ', done: false };
test('task draft trims fields and leaves optional deadline absent', () => {
  assert.deepEqual(validatedPlanTask({ ...task, dueDate: '' }), { id: 'step-1', title: 'Review chapter one', subject: 'General', done: false });
});
test('invalid or rolled-over date rejects without destroying the draft', () => {
  for (const dueDate of ['2026-02-30', '2026-13-01', 'tomorrow']) assert.throws(() => validatedPlanTask({ ...task, dueDate }), /valid due date/);
  assert.equal(validatedPlanTask({ ...task, dueDate: '2028-02-29' }).dueDate, '2028-02-29');
});
test('editing preserves current completion and other steps while removing cleared date', () => {
  const current = [{ ...task, done: true, dueDate: '2026-10-02' }, { ...task, id: 'step-2' }];
  const updated = editedPlanTasks(current, validatedPlanTask({ ...task, title: 'Review chapter two' }));
  assert.equal(updated[0].done, true); assert.equal(updated[0].dueDate, undefined); assert.equal(updated[0].title, 'Review chapter two'); assert.equal(updated[1], current[1]);
  assert.equal(current[0].dueDate, '2026-10-02');
});
test('deleted step and empty or excessive task fields fail visibly', () => {
  assert.throws(() => editedPlanTasks([], validatedPlanTask(task)), /no longer/);
  assert.throws(() => validatedPlanTask({ ...task, title: '  ' }), /title/);
  assert.throws(() => validatedPlanTask({ ...task, title: 'x'.repeat(181) }), /title/);
  assert.throws(() => validatedPlanTask({ ...task, subject: 'x'.repeat(61) }), /subject/);
});

const appSource = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const appAst = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let savePlanSource;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'savePlan') savePlanSource = node.getText(appAst); ts.forEachChild(node, visit); }
visit(appAst); assert.ok(savePlanSource);
const savePlanCode = ts.transpileModule(`export const create=({perform,workspace})=>{${savePlanSource};return savePlan;};`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { create: createSavePlan } = await import('data:text/javascript;base64,' + Buffer.from(savePlanCode).toString('base64'));
test('plan writes use the loaded revision and a conflict refreshes without resubmitting stale steps', async () => {
  const calls = [], draft = [{ ...task, title: 'My unsaved edit' }];
  const save = createSavePlan({ workspace: { revision: 12 }, perform: async (name, args) => {
    calls.push({ name, args });
    if (name === 'plan_save') throw Object.assign(new Error('Changed elsewhere'), { code: 'REVISION_CONFLICT' });
    return { workspace: { revision: 13 } };
  } });
  await assert.rejects(save(draft), /draft is still here.*save again/);
  assert.equal(calls.length, 2); assert.equal(calls[0].name, 'plan_save'); assert.equal(calls[0].args.expectedRevision, 12);
  assert.equal(calls[1].name, 'workspace_get'); assert.equal(draft[0].title, 'My unsaved edit');
});
