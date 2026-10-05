import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Bold, Code2, Italic, Link2, List, ListOrdered, ListTodo, Quote, Redo2, Table2, Undo2, X } from 'lucide-react';

export interface RichNoteEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  onBlur: () => void;
  autoFocus?: boolean;
  title: ReactNode;
  onSelectionAsk?: (action: 'explain' | 'simplify' | 'flashcards' | 'quiz', text: string) => void;
  onReady?: (editor: Editor) => void;
}

export const NOTE_MARKDOWN_LIMIT = 100_000;
// Match the backend's stored representation without deleting empty blocks inside
// the live editor. An autosave acknowledgement must not reset typing history.
export const storedNoteMarkdown = (markdown: string) => markdown.trim();

export function replaceNoteDocument(editor: Editor, value: string, lastEmitted: string | null): boolean {
  const stored = storedNoteMarkdown(value);
  if (stored === lastEmitted || stored === storedNoteMarkdown(editor.getMarkdown())) return false;
  const parsed = editor.markdown?.parse(value);
  if (!parsed) return false;
  const nextDoc = editor.schema.nodeFromJSON(parsed);
  if (nextDoc.eq(editor.state.doc)) return false;
  // Reinitializing plugin state clears undo history only for an actual external
  // replacement, including an explicitly accepted historical note version.
  const position = Math.min(editor.state.selection.from, nextDoc.content.size);
  editor.view.updateState(EditorState.create({ schema: editor.schema, doc: nextDoc, plugins: editor.state.plugins, selection: TextSelection.near(nextDoc.resolve(position)) }));
  return true;
}

function markdownLimit(onLimit?: (exceeded: boolean) => void) {
  return Extension.create({
    name: 'noteMarkdownLimit',
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [new Plugin({
        key: new PluginKey('noteMarkdownLimit'),
        filterTransaction(transaction) {
          if (!transaction.docChanged) return true;
          const markdown = editor.markdown?.serialize(transaction.doc.toJSON());
          const exceeded = markdown !== undefined && storedNoteMarkdown(markdown).length > NOTE_MARKDOWN_LIMIT;
          onLimit?.(exceeded);
          // Reject the entire edit; never truncate a pasted passage or an existing draft.
          return !exceeded;
        },
      })];
    },
  });
}

export function safeNoteLink(input: string): string | null {
  const value = input.trim();
  if (!value || /[\u0000-\u0020]/.test(value)) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (hasScheme && !/^(https?:|mailto:)/i.test(value)) return null;
  try {
    const url = new URL(hasScheme ? value : `https://${value}`);
    if (url.protocol === 'mailto:') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url.pathname) ? url.href : null;
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) ? url.href : null;
  } catch { return null; }
}

/** The same extension set is exported for focused Markdown round-trip checks. */
export function richNoteExtensions(onLimit?: (exceeded: boolean) => void) {
  return [
    StarterKit.configure({
      // Underline has no portable Markdown representation. Do not offer a lossy format.
      underline: false,
      // Opening/focusing a saved block must not append an unsaved paragraph.
      trailingNode: false,
      link: { openOnClick: false, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }, isAllowedUri: (url, context) => context.defaultValidate(url) && safeNoteLink(url) !== null },
    }),
    Table.configure({ resizable: false, renderWrapper: true }), TableRow, TableCell, TableHeader,
    TaskList, TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start writing, or bring an idea from ChatGPT…' }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
    markdownLimit(onLimit),
  ];
}

function FormatButton({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="nooks-doc-format-button" aria-label={label} aria-pressed={active} title={`${label}${shortcut ? ` (${shortcut})` : ''}`} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onClick}>{children}</button>;
}

export default function RichNoteEditor({ value, onChange, onBlur, autoFocus = false, title, onSelectionAsk, onReady }: RichNoteEditorProps) {
  const callbacks = useRef({ onChange, onBlur, onSelectionAsk, onReady }); callbacks.current = { onChange, onBlur, onSelectionAsk, onReady };
  const [limitExceeded, setLimitExceeded] = useState(false);
  const [extensions] = useState(() => richNoteExtensions(setLimitExceeded));
  const appliedValue = useRef(value);
  const emittedValue = useRef<string | null>(null);
  const applyingExternal = useRef(false);
  const [transactionVersion, setTransactionVersion] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');
  const linkPopover = useRef<HTMLDivElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const linkTrigger = useRef<HTMLButtonElement>(null);
  const linkRange = useRef({ from: 1, to: 1 });
  const linkId = useId();
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: autoFocus ? 'start' : false,
    editorProps: { attributes: { role: 'textbox', 'aria-label': 'Note content', 'aria-multiline': 'true', spellcheck: 'true' } },
    onUpdate: ({ editor: instance, transaction }) => {
      if (applyingExternal.current || !transaction.docChanged) return;
      const markdown = storedNoteMarkdown(instance.getMarkdown());
      if (markdown === emittedValue.current) return;
      emittedValue.current = markdown;
      callbacks.current.onChange(markdown);
    },
    onBlur: () => { callbacks.current.onBlur(); },
  });

  useEffect(() => {
    if (!editor) return;
    const changed = () => setTransactionVersion(version => version + 1);
    editor.on('transaction', changed); editor.on('selectionUpdate', changed);
    callbacks.current.onReady?.(editor);
    return () => { editor.off('transaction', changed); editor.off('selectionUpdate', changed); };
  }, [editor]);

  useEffect(() => {
    if (!editor || appliedValue.current === value || editor.view.composing) return;
    appliedValue.current = value;
    // Parent autosave echoes do not touch selection, focus, or the undo stack.
    applyingExternal.current = true;
    try {
      if (!replaceNoteDocument(editor, value, emittedValue.current)) return;
      emittedValue.current = null;
      setLinkOpen(false); setLimitExceeded(false); setTransactionVersion(version => version + 1);
    } finally { applyingExternal.current = false; }
  }, [editor, value, transactionVersion]);

  useEffect(() => {
    if (!linkOpen) return;
    linkInput.current?.focus(); linkInput.current?.select();
    const outside = (event: MouseEvent) => {
      if (!linkPopover.current?.contains(event.target as Node) && !linkTrigger.current?.contains(event.target as Node)) setLinkOpen(false);
    };
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, [linkOpen]);

  function openLink() {
    if (!editor) return;
    if (editor.isActive('link')) editor.commands.extendMarkRange('link');
    linkRange.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setLinkValue(editor.getAttributes('link').href ?? ''); setLinkError(''); setLinkOpen(true);
  }
  function closeLink(restoreFocus = true) {
    setLinkOpen(false);
    if (restoreFocus && editor) editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(linkRange.current).run();
  }
  function applyLink() {
    if (!editor) return;
    const href = safeNoteLink(linkValue);
    if (!href) { setLinkError('Enter a website address or email link.'); linkInput.current?.focus(); return; }
    const { from, to } = linkRange.current;
    const command = editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from, to });
    if (from === to) command.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    else command.setLink({ href }).run();
    setLinkOpen(false); setLinkError('');
  }
  function removeLink() {
    editor?.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(linkRange.current).extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  }
  function blockStyle(style: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (style === 'paragraph') chain.setParagraph().run();
    else if (style === 'code') chain.setCodeBlock().run();
    else chain.setHeading({ level: Number(style) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  }
  function tableAction(action: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (action === 'row') chain.addRowAfter().run();
    else if (action === 'column') chain.addColumnAfter().run();
    else if (action === 'delete-row') chain.deleteRow().run();
    else if (action === 'delete-column') chain.deleteColumn().run();
    else if (action === 'delete-table') chain.deleteTable().run();
  }
  const headingLevel = editor?.isActive('heading') ? Number(editor.getAttributes('heading').level) : 0;
  const currentBlock = headingLevel ? String(headingLevel) : editor?.isActive('codeBlock') ? 'code' : 'paragraph';
  const selection = editor?.state.selection;
  const selectedText = selection && !selection.empty ? editor?.state.doc.textBetween(selection.from, selection.to, '\n').trim() ?? '' : '';
  const ready = !!editor;

  return <div className="nooks-doc-editor" onKeyDownCapture={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); event.stopPropagation(); openLink(); }
    if (linkOpen && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLink(); }
  }}>
    <div className="nooks-doc-formatbar" role="toolbar" aria-label="Note formatting">
      <div className="nooks-doc-format-group">
        <FormatButton label="Undo" shortcut="⌘/Ctrl Z" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16}/></FormatButton>
        <FormatButton label="Redo" shortcut="⌘/Ctrl Shift Z" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16}/></FormatButton>
      </div>
      <div className="nooks-doc-format-group"><select className="nooks-doc-block-select" aria-label="Text style" value={currentBlock} disabled={!ready} onChange={event => blockStyle(event.target.value)}><option value="paragraph">Normal text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>{headingLevel > 3 && <option value={headingLevel}>Heading {headingLevel}</option>}<option value="code">Code block</option></select></div>
      <div className="nooks-doc-format-group">
        <FormatButton label="Bold" shortcut="⌘/Ctrl B" active={editor?.isActive('bold')} disabled={!ready} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16}/></FormatButton>
        <FormatButton label="Italic" shortcut="⌘/Ctrl I" active={editor?.isActive('italic')} disabled={!ready} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16}/></FormatButton>
        <FormatButton label="Inline code" active={editor?.isActive('code')} disabled={!ready} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={16}/></FormatButton>
        <div className="nooks-doc-link-wrap">
          <button type="button" ref={linkTrigger} className="nooks-doc-format-button" aria-label="Insert or edit link" title="Link (⌘/Ctrl K)" aria-pressed={editor?.isActive('link')} aria-expanded={linkOpen} aria-controls={linkId} disabled={!ready} onMouseDown={event => event.preventDefault()} onClick={openLink}><Link2 size={16}/></button>
          {linkOpen && <div className="nooks-doc-link-popover" ref={linkPopover} id={linkId} role="dialog" aria-label="Edit link"><form onSubmit={event => { event.preventDefault(); applyLink(); }}><label htmlFor={`${linkId}-input`}>Link address</label><div className="nooks-doc-link-input-row"><input ref={linkInput} id={`${linkId}-input`} type="text" inputMode="url" autoComplete="url" placeholder="https://example.com" value={linkValue} onChange={event => { setLinkValue(event.target.value); setLinkError(''); }} aria-invalid={!!linkError} aria-describedby={linkError ? `${linkId}-error` : undefined}/><button type="button" aria-label="Close link editor" onClick={() => closeLink()}><X size={15}/></button></div>{linkError && <p className="nooks-doc-link-error" id={`${linkId}-error`} role="alert">{linkError}</p>}<div className="nooks-doc-link-actions"><button type="button" disabled={!editor?.isActive('link')} onClick={removeLink}>Remove link</button><button type="submit">Apply</button></div></form></div>}
        </div>
      </div>
      <div className="nooks-doc-format-group">
        <FormatButton label="Bullet list" active={editor?.isActive('bulletList')} disabled={!ready} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={17}/></FormatButton>
        <FormatButton label="Numbered list" active={editor?.isActive('orderedList')} disabled={!ready} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={17}/></FormatButton>
        <FormatButton label="Checklist" active={editor?.isActive('taskList')} disabled={!ready} onClick={() => editor?.chain().focus().toggleTaskList().run()}><ListTodo size={17}/></FormatButton>
        <FormatButton label="Quote" active={editor?.isActive('blockquote')} disabled={!ready} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16}/></FormatButton>
      </div>
      <div className="nooks-doc-format-group">
        <FormatButton label="Insert table" disabled={!ready || editor?.isActive('table')} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17}/></FormatButton>
        {editor?.isActive('table') && <select className="nooks-doc-block-select nooks-doc-table-select" aria-label="Table actions" value="" onChange={event => tableAction(event.target.value)}><option value="">Table</option><option value="row">Add row below</option><option value="column">Add column right</option><option value="delete-row">Delete row</option><option value="delete-column">Delete column</option><option value="delete-table">Delete table</option></select>}
      </div>
    </div>
    {limitExceeded && <div className="nooks-doc-limit-notice" role="alert"><span>This note has reached the 100,000-character limit. Add the extra material to a new note.</span><button type="button" aria-label="Dismiss note length notice" onClick={() => setLimitExceeded(false)}><X size={14}/></button></div>}
    {onSelectionAsk && selectedText && !linkOpen && <div className="nooks-doc-selection-strip" role="toolbar" aria-label="Study selected text"><span>Selected text</span>{(['explain', 'simplify', 'flashcards', 'quiz'] as const).map(action => <button type="button" key={action} disabled={selectedText.length > 12000} onMouseDown={event => event.preventDefault()} onClick={() => callbacks.current.onSelectionAsk?.(action, selectedText)}>{action === 'flashcards' ? 'Make cards' : action === 'quiz' ? 'Quiz me' : action === 'explain' ? 'Explain' : 'Simplify'}</button>)}{selectedText.length > 12000 && <small>Select a shorter passage to study.</small>}</div>}
    <div className="nooks-doc-scroll"><div className="nooks-doc-sheet">{title}<EditorContent editor={editor} className="nooks-doc-content" /></div></div>
  </div>;
}
