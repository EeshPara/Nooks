import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const editorUrl = dataUrl(compile(fs.readFileSync(new URL('./RichNoteEditor.tsx', import.meta.url), 'utf8')).replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${quote}${import.meta.resolve(specifier)}${quote}`));
const code = compile(fs.readFileSync(new URL('./StudyReference.tsx', import.meta.url), 'utf8').replace(/^import '\.\/StudyReference.css';\n/m, ''))
  .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${quote}${specifier === './RichNoteEditor' ? editorUrl : import.meta.resolve(specifier)}${quote}`);
const { default: StudyReference, referenceContent } = await import(dataUrl(code));

test('read-only reference renders note headings, lists, code, tables and links through the note schema', () => {
  const body = '# Cell energy\n\n**ATP** stores energy. [Read more](https://example.com/notes).\n\n- First idea\n- Second idea\n\n- [x] Reviewed\n- [ ] Practice\n\n| Part | Role |\n| --- | --- |\n| ATP | Energy |\n\n```js\nconst energy = 36;\n```';
  const output = renderToStaticMarkup(createElement(StudyReference, { artifact: { id: 'note', kind: 'note', title: 'Cell energy', content: body }, onClose() {} }));
  assert.match(output, /aria-label="Reference note: Cell energy"/);
  assert.match(output, /<strong>ATP<\/strong>/); assert.match(output, /<table>/); assert.match(output, /<pre><code>/);
  assert.match(output, /href="https:\/\/example.com\/notes"/); assert.match(output, /rel="noopener noreferrer"/);
  assert.match(output, /Completed task/); assert.match(output, /Incomplete task/);
  assert.match(output, /aria-label="Close reference note"/);
  assert.doesNotMatch(output, /contenteditable|<textarea|<input|<form/i, 'a reference cannot edit or save the source note');
});

test('untrusted note HTML and unsafe URLs never become executable markup in the reference', () => {
  const malicious = '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[bad](javascript:alert) [file](file:///etc/passwd)\n\n```html\n<iframe src="https://example.com"></iframe>\n```';
  const output = renderToStaticMarkup(referenceContent(malicious));
  assert.doesNotMatch(output, /<script|<img|<iframe|href="(?:javascript|data|file):|<[^>]+\sonerror=/i);
  assert.match(output, /&lt;iframe/);
});

test('empty and unusual source text remains readable without a writer or background side effect', () => {
  const output = renderToStaticMarkup(createElement(StudyReference, { artifact: { id: 'empty', kind: 'note', title: '', content: '' }, onClose() {} }));
  assert.match(output, /Untitled note/); assert.match(output, /This note has no text yet/);
  assert.match(renderToStaticMarkup(referenceContent('A < B & C > D')), /A &lt; B &amp; C &gt; D/);
});
