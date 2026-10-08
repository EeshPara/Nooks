import { fileURLToPath } from 'node:url';

const virtualId = 'virtual:nooks-study-url';
const resolvedId = '\0' + virtualId;
const contentPath = fileURLToPath(new URL('../ui/src/study/DeferredStudyContent.tsx', import.meta.url));

/** Retry is safe only when one URL contains the entire deferred dependency set. */
export function verifyStudyChunkGraph(bundle, studyFile) {
  const study = bundle[studyFile];
  if (study?.type !== 'chunk' || !['NoteWorkspace', 'StudyReference'].every(name => study.exports.includes(name))) throw new Error('Deferred study exports are missing.');
  const loaded = new Set();
  function visit(file) {
    if (loaded.has(file)) return;
    const chunk = bundle[file];
    if (chunk?.type !== 'chunk') throw new Error('Unknown static study dependency.');
    loaded.add(file); chunk.imports.forEach(visit);
  }
  for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk' && chunk.isEntry && chunk.fileName !== studyFile) visit(chunk.fileName);
  if (loaded.has(studyFile)) throw new Error('The editor must not load with the entry.');
  if (study.dynamicImports.length || study.imports.some(file => !loaded.has(file))) throw new Error('Study retries require all dependencies to be in the loaded entry graph.');
  if (study.viteMetadata?.importedCss?.size) throw new Error('Deferred study styles must remain eager.');
  if (Object.keys(study.modules).some(id => /\/node_modules\/(?:react|react-dom)\//.test(id))) throw new Error('Deferred study must share the loaded React runtime.');
}

export function studySplitPlugin() {
  let command, reference;
  return {
    name: 'nooks-retryable-study-chunk',
    configResolved(config) { command = config.command; },
    resolveId(id) { if (id === virtualId) return resolvedId; },
    load(id) {
      if (id !== resolvedId) return;
      if (command === 'serve') return 'export default "/src/study/DeferredStudyContent.tsx";';
      reference = this.emitFile({ type: 'chunk', id: contentPath, name: 'study-content', preserveSignature: 'strict' });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    generateBundle(_options, bundle) {
      if (!reference) throw new Error('Deferred study chunk was not emitted.');
      verifyStudyChunkGraph(bundle, this.getFileName(reference));
    },
  };
}
