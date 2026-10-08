import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStudyChunkGraph } from '../scripts/study-split-plugin.mjs';
function fixture() {
  const chunk = (fileName, extra = {}) => ({ type: 'chunk', fileName, isEntry: false, imports: [], dynamicImports: [], exports: [], modules: {}, ...extra });
  return {
    'entry.js': chunk('entry.js', { isEntry: true, imports: ['shared.js'] }),
    'shared.js': chunk('shared.js', { modules: { '/node_modules/react/index.js': {} } }),
    'study.js': chunk('study.js', { isEntry: true, imports: ['shared.js'], exports: ['NoteWorkspace', 'StudyReference'] }),
  };
}
test('one deferred chunk can import the already-loaded shared React/runtime graph', () => {
  assert.doesNotThrow(() => verifyStudyChunkGraph(fixture(), 'study.js'));
});
test('release gate rejects graph shapes that make a retry incomplete or duplicate React', () => {
  for (const mutate of [
    bundle => { bundle['study.js'].exports = ['NoteWorkspace']; },
    bundle => { bundle['study.js'].dynamicImports = ['second-deferred.js']; },
    bundle => { bundle['study.js'].imports = ['second-deferred.js']; },
    bundle => { bundle['study.js'].viteMetadata = { importedCss: new Set(['deferred.css']) }; },
    bundle => { bundle['study.js'].modules['/node_modules/react/index.js'] = {}; },
    bundle => { bundle['study.js'].modules['/node_modules/react-dom/client.js'] = {}; },
    bundle => { bundle['entry.js'].imports.push('study.js'); },
  ]) { const bundle = fixture(); mutate(bundle); assert.throws(() => verifyStudyChunkGraph(bundle, 'study.js')); }
});
