import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./studyRecoveryScope.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { setNativeRecoveryScope, getNativeRecoveryScope } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
test('native recovery accepts only the verified account scope shape, never artifact or session identifiers', () => {
  const scope = 'account:928c5afe-b1ae-4f3c-8fa0-b15fcc86c16c';
  assert.equal(setNativeRecoveryScope(scope), scope); assert.equal(getNativeRecoveryScope(), scope);
  for (const invalid of [null, undefined, 'host', 'device', 'account:note-id', { recoveryScope: scope }]) {
    assert.equal(setNativeRecoveryScope(invalid), undefined); assert.equal(getNativeRecoveryScope(), undefined);
  }
});
