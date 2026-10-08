import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('./inviteLinks.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {invitationLink,invitationToken}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('invite links round-trip through a fragment and accept legacy codes',()=>{
 const token='a'.repeat(64), link=invitationLink(token,'https://nooks.test/study');
 assert.equal(link,`https://nooks.test/#nook-invite=${token}`);
 assert.equal(new URL(link).search,'');assert.equal(invitationToken(link),token);assert.equal(invitationToken(token.toUpperCase()),token);
 for(const value of ['invalid','https://nooks.test/#nook-invite=no','https://nooks.test/?nook-invite='+token])assert.equal(invitationToken(value),undefined);
 assert.throws(()=>invitationLink('bad','https://nooks.test'));
});
