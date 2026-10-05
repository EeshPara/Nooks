import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { MarkdownManager } from '@tiptap/markdown';
import { Editor } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { undo, undoDepth } from '@tiptap/pm/history';

const source = fs.readFileSync(new URL('./RichNoteEditor.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${quote}${import.meta.resolve(specifier)}${quote}`);
const { richNoteExtensions, safeNoteLink, storedNoteMarkdown, replaceNoteDocument, NOTE_MARKDOWN_LIMIT } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const manager = () => new MarkdownManager({ extensions: richNoteExtensions(), markedOptions: { gfm: true, breaks: false } });
const nodes = (node, type) => [...(node.type === type ? [node] : []), ...(node.content ?? []).flatMap(child => nodes(child, type))];

test('headings, bold, italic, links, quotes, nested lists and fenced code survive Markdown round trips', () => {
  const markdown = '# Cell energy\n\nA **bold** idea, an *italic* phrase, and [a source](https://example.com/biology).\n\n> Explain it in your own words.\n\n- First idea\n  - Nested detail\n- Second idea\n\n3. Third step\n4. Fourth step\n\n```js\nconst ATP = 36;\n```';
  const md = manager(); const before = md.parse(markdown); const serialized = md.serialize(before); const after = md.parse(serialized);
  assert.deepEqual(after, before);
  assert.equal(nodes(after, 'heading')[0].attrs.level, 1);
  assert.equal(nodes(after, 'codeBlock')[0].attrs.language, 'js');
  assert.equal(nodes(after, 'orderedList')[0].attrs.start, 3);
  assert.equal(nodes(after, 'bulletList').length, 2);
});

test('GFM table alignment, links and escaped pipes survive editing serialization', () => {
  const markdown = '| Structure | Function |\n| :--- | ---: |\n| **Mitochondria** | A \\| B |\n| [Source](https://example.com) | ATP |';
  const md = manager(); const before = md.parse(markdown); const output = md.serialize(before); const after = md.parse(output);
  assert.deepEqual(after, before);
  assert.equal(nodes(after, 'table').length, 1);
  assert.equal(nodes(after, 'tableRow').length, 3);
  assert.match(output, /\\\|/);
});

test('task completion and nested checklists remain portable Markdown', () => {
  const md = manager(); const before = md.parse('- [x] Review notes\n- [ ] Practice\n  - [x] First question\n  - [ ] Second question');
  const output = md.serialize(before); const after = md.parse(output);
  assert.deepEqual(after, before);
  assert.deepEqual(nodes(after, 'taskItem').map(item => item.attrs.checked), [true, false, true, false]);
  assert.match(output, /\[x\] Review notes/);
});

test('initial Markdown loading never invokes the autosave update callback', () => {
  let changes = 0;
  const editor = new Editor({ element: null, extensions: richNoteExtensions(), content: '## Ready to write\n\n**Saved text.**', contentType: 'markdown', onUpdate: () => { changes++; } });
  assert.equal(changes, 0);
  assert.match(editor.getMarkdown(), /\*\*Saved text\.\*\*/);
  assert.equal(editor.extensionManager.extensions.some(extension => extension.name === 'underline'), false);
  editor.destroy();
});

test('opening and selecting a note never changes its final block or saved Markdown', () => {
  const endings = {
    table: '| Topic | Status |\n| --- | --- |\n| Cells | Ready |',
    taskList: '- [x] Read the chapter\n- [ ] Review it',
    bulletList: '- One idea\n- Another idea',
    orderedList: '1. First step\n2. Next step',
    codeBlock: '```js\nconst energy = 36;\n```',
    blockquote: '> Explain this in your own words.',
  };
  for (const [type, markdown] of Object.entries(endings)) {
    const editor = new Editor({ element: null, extensions: richNoteExtensions(), content: markdown, contentType: 'markdown' });
    // Headless Editor has no view plugins until mount. Install the actual extension
    // plugins so this exercises the same appendTransaction path as a mounted view.
    let state = EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.extensionManager.plugins });
    const original = state.doc;
    const before = editor.markdown.serialize(original.toJSON());
    assert.equal(original.lastChild.type.name, type);
    for (const transaction of [current => current.tr.setMeta('focus', true), current => current.tr.setSelection(TextSelection.atEnd(current.doc))]) {
      const result = state.applyTransaction(transaction(state));
      assert.equal(result.transactions.some(item => item.docChanged), false, `${type}: opening must not append a trailing paragraph`);
      state = result.state;
      assert.ok(state.doc.eq(original), type);
      assert.equal(editor.markdown.serialize(state.doc.toJSON()), before, type);
    }
    editor.destroy();
  }
});

const editingState = editor => editor.view.updateState(EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.extensionManager.plugins }));
const applyEdit = (editor, transaction) => {
  const result = editor.state.applyTransaction(transaction);
  editor.view.updateState(result.state);
  return result;
};

test('a trimmed autosave echo preserves empty paragraphs, caret and undo after Saved', () => {
  const editor = new Editor({ element: null, extensions: richNoteExtensions(), content: 'Original body', contentType: 'markdown' });
  editingState(editor);
  const edit = editor.state.tr.insertText(' marker', editor.state.doc.content.size - 1);
  edit.insert(edit.doc.content.size, editor.schema.nodes.paragraph.create());
  applyEdit(editor, edit);
  applyEdit(editor, editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
  const liveDocument = editor.state.doc;
  const liveSelection = editor.state.selection;
  const rawMarkdown = editor.getMarkdown();
  const savedMarkdown = storedNoteMarkdown(rawMarkdown);
  assert.notEqual(rawMarkdown, savedMarkdown, 'live trailing blank paragraph represents the server-trimmed echo case');
  assert.ok(undoDepth(editor.state) > 0);
  assert.equal(replaceNoteDocument(editor, savedMarkdown, rawMarkdown), false);
  assert.ok(editor.state.doc.eq(liveDocument));
  assert.ok(editor.state.selection.eq(liveSelection));
  assert.ok(undoDepth(editor.state) > 0, 'Save must not clear Undo');
  assert.equal(undo(editor.state, transaction => applyEdit(editor, transaction)), true);
  assert.doesNotMatch(editor.getMarkdown(), /marker/);
  editor.destroy();
});

test('an explicit historical replacement clears old undo history and clamps the caret', () => {
  let changes = 0;
  const editor = new Editor({ element: null, extensions: richNoteExtensions(), content: 'Current saved version', contentType: 'markdown', onUpdate: () => { changes++; } });
  editingState(editor);
  applyEdit(editor, editor.state.tr.insertText(' with later writing', editor.state.doc.content.size - 1));
  applyEdit(editor, editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
  assert.ok(undoDepth(editor.state) > 0);
  assert.equal(replaceNoteDocument(editor, 'Older', null), true);
  assert.equal(editor.getMarkdown(), 'Older');
  assert.equal(undoDepth(editor.state), 0);
  assert.ok(editor.state.selection.from <= editor.state.doc.content.size);
  assert.equal(changes, 0, 'explicit replacement must not emit another autosave');
  editor.destroy();
});

test('the Markdown length guard rejects an entire oversized edit without truncating the draft', () => {
  const notices = [];
  const editor = new Editor({ element: null, extensions: richNoteExtensions(exceeded => notices.push(exceeded)), content: 'a'.repeat(NOTE_MARKDOWN_LIMIT - 1), contentType: 'markdown' });
  editingState(editor);
  assert.equal(applyEdit(editor, editor.state.tr.insertText('b', editor.state.doc.content.size - 1)).transactions.length, 1);
  assert.equal(editor.getMarkdown().length, NOTE_MARKDOWN_LIMIT);
  const original = editor.state.doc;
  const depth = undoDepth(editor.state);
  assert.equal(applyEdit(editor, editor.state.tr.insertText('extra pasted material', editor.state.doc.content.size - 1)).transactions.length, 0);
  assert.ok(editor.state.doc.eq(original));
  assert.equal(undoDepth(editor.state), depth);
  assert.deepEqual(notices, [false, true]);
  // Formatting characters count toward the same server limit as visible text.
  assert.equal(applyEdit(editor, editor.state.tr.addMark(1, 5, editor.schema.marks.bold.create())).transactions.length, 0);
  assert.ok(editor.state.doc.eq(original));
  editor.destroy();
});

test('link entry accepts web and email addresses and rejects executable or malformed URLs', () => {
  assert.equal(safeNoteLink('example.com/notes'), 'https://example.com/notes');
  assert.equal(safeNoteLink('https://example.com?q=biology'), 'https://example.com/?q=biology');
  assert.equal(safeNoteLink('mailto:student@example.com'), 'mailto:student@example.com');
  for (const input of ['javascript:alert(1)', 'data:text/html,hello', 'vbscript:msgbox(1)', 'file:///tmp/private', 'https://', 'hello world', 'mailto:invalid']) assert.equal(safeNoteLink(input), null, input);
});
