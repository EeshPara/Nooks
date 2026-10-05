import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, MoreHorizontal, Plus, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { NoteAppearance, defaultNoteAppearance, noteAppearanceClasses } from '../world/NoteAppearance';
import type { Artifact, ArtifactKind } from './types';
import { callTool } from '../bridge';
import { OrganizationDialog } from '../organization/StudyLibrary';
import { createNoteAutosave, noteIsDirty } from './noteAutosave';
import { createNoteRecovery } from './noteRecovery';
import RichNoteEditor from './RichNoteEditor';
import './NoteWorkspace.css';

export interface NoteAskContext {
  selection?: { text: string; artifactId?: string; title?: string };
  draft?: Artifact;
}

export interface NoteWorkspaceProps {
  artifact: Artifact;
  saved: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** Only pass an explicit browser account/device scope; never infer native host identity. */
  recoveryScope?: string;
  onBack: () => void;
  /** Dismiss the document after autosaving, independently of Library navigation. */
  onClose?: () => void;
  onSave: (artifact: Artifact) => Promise<void | Artifact>;
  onRead?: (artifactId: string, offset: number) => Promise<Record<string, any>>;
  onCreate: () => void;
  onAsk: (prompt: string, context?: NoteAskContext) => void;
  onCreateFrom?: (kind: ArtifactKind, draft: Artifact) => void;
  /** Current editor snapshot, including unsaved typing; null when this editor closes. */
  onContextChange?: (draft: Artifact | null) => void;
  location?: ReactNode;
  history?: ReactNode;
}
const readableDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function NoteWorkspace({ artifact, saved, onDirtyChange, onBack, onClose, onSave, onRead, onCreate, onAsk, onCreateFrom, onContextChange, location, history, recoveryScope }: NoteWorkspaceProps) {
  const [appearance, setAppearance] = useState(defaultNoteAppearance);
  const saveCallback = useRef(onSave); saveCallback.current = onSave;
  const dirtyCallback = useRef(onDirtyChange); dirtyCallback.current = onDirtyChange;
  const contextCallback = useRef(onContextChange); contextCallback.current = onContextChange;
  const [recovery] = useState(() => createNoteRecovery(recoveryScope));
  const recovered = useRef(false);
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [autosave] = useState(() => {
    const queue = createNoteAutosave(artifact, saved, value => saveCallback.current(value));
    const prior = recovery.get(artifact.id);
    if (prior) {
      recovered.current = queue.recover(prior.draft, prior.baseline, prior.persisted);
      if (!recovered.current) recovery.remove(artifact.id);
    }
    return queue;
  });
  const state = useSyncExternalStore(autosave.subscribe, autosave.snapshot, autosave.snapshot);
  const { draft, phase, persisted } = state;
  const dirty = noteIsDirty(state);
  const [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [review, setReview] = useState<Artifact | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const editor = useRef<Editor | null>(null);
  const titleField = useRef<HTMLTextAreaElement>(null);
  const documentSurface = useRef<HTMLElement>(null);
  const readTicket = useRef(0);
  const words = draft.content.split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    const retain = () => { setRecoveryWarning(!recovery.retain(autosave.snapshot())); };
    const unsubscribe = autosave.subscribe(retain);
    retain(); autosave.start();
    return () => { recovery.retain(autosave.snapshot()); unsubscribe(); autosave.stop(); readTicket.current++; dirtyCallback.current(false); };
  }, [autosave, recovery]);
  useEffect(() => {
    if (!contextCallback.current) return;
    const timer = window.setTimeout(() => {
      const current = autosave.snapshot();
      contextCallback.current?.({ ...current.artifact, ...current.draft });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [autosave, artifact.id, draft.title, draft.content, state.artifact.revision, state.artifact.courseId, state.artifact.topicId]);
  useEffect(() => () => { contextCallback.current?.(null); }, [artifact.id]);
  useEffect(() => { dirtyCallback.current(dirty); }, [dirty]);
  useEffect(() => { autosave.receive(artifact, saved); }, [autosave, artifact.id, artifact.updatedAt, artifact.revision, artifact.title, artifact.content, saved]);
  useEffect(() => { setReviewOpen(false); setReview(null); setNotice(''); readTicket.current++; }, [artifact.id]);
  useLayoutEffect(() => {
    const field = titleField.current;
    if (field) { field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; }
  }, [draft.title]);
  useLayoutEffect(() => {
    const field = titleField.current;
    if (!field) return;
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      field.style.height = 'auto';
      field.style.height = `${field.scrollHeight}px`;
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [artifact.id]);
  useEffect(() => {
    const closeMenus = (event: MouseEvent | KeyboardEvent) => {
      const escape = event instanceof KeyboardEvent && event.key === 'Escape';
      if (event instanceof KeyboardEvent && !escape) return;
      documentSurface.current?.querySelectorAll<HTMLDetailsElement>('.nooks-doc-top-actions>details[open]').forEach(menu => {
        if (escape || !menu.contains(event.target as Node)) {
          menu.open = false;
          if (escape) menu.querySelector<HTMLElement>('summary')?.focus();
        }
      });
    };
    document.addEventListener('click', closeMenus, true);
    document.addEventListener('keydown', closeMenus);
    return () => { document.removeEventListener('click', closeMenus, true); document.removeEventListener('keydown', closeMenus); };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !document.querySelector('[aria-modal="true"],dialog[open]')) {
        event.preventDefault(); void autosave.flush();
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (noteIsDirty(autosave.snapshot())) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('keydown', keydown); window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('beforeunload', beforeUnload); };
  }, [autosave]);

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([draft.content], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${draft.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 100) || 'note'}.md`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Markdown download prepared.');
    } catch { setNotice('The download could not start. Your writing is still here.'); }
  }
  function ask(kind: 'flashcards' | 'quiz' | 'summary' | 'exam') {
    const current = autosave.snapshot();
    const snapshot = { ...current.artifact, ...current.draft };
    if (onCreateFrom && kind !== 'summary') { onCreateFrom(kind, snapshot); return; }
    const instruction = kind === 'flashcards'
      ? 'Create a flashcard set of the key ideas and save the structured flashcards using Nooks artifact_save.'
      : kind === 'quiz'
        ? 'Create a quiz with explanations and save the resulting quiz using Nooks artifact_save.'
        : kind === 'exam' ? 'Create a practice exam covering this note with varied question types, explanations, and a clear score. Save the structured exam using Nooks artifact_save.' : 'Explain the key ideas in a concise study summary in our conversation. Keep the original note unchanged.';
    onAsk(instruction, { draft: snapshot });
  }
  async function leave(destination = onBack) {
    if (leaving) return;
    setLeaving(true);
    const clean = await autosave.flush();
    setLeaving(false);
    if (clean || (!draft.content.trim() && !persisted) || window.confirm('This note has unsaved writing. Leave without it?')) destination();
  }
  function closeReview() { setReviewOpen(false); setReviewBusy(false); readTicket.current++; }
  async function loadReview() {
    const ticket = ++readTicket.current;
    setReviewOpen(true); setReviewBusy(true); setReviewError(''); setReview(null);
    try {
      let offset = 0; let content = ''; let first: Artifact | null = null;
      for (let page = 0; page < 4; page++) {
        const result = onRead ? await onRead(artifact.id, offset) : await callTool('artifact_get', { artifactId: artifact.id, offset, maxChars: 40000 });
        const item = result.artifact as Artifact;
        if (!item || item.kind !== 'note' || item.id !== artifact.id) throw new Error('The saved note could not be loaded.');
        if (!first) first = { ...state.artifact, ...item };
        if (item.revision !== first.revision) throw new Error('The note changed while loading. Try again to compare the latest version.');
        content += item.content ?? '';
        if (content.length > 100000) throw new Error('The saved note is too large to compare here.');
        if (result.nextOffset == null) { if (ticket === readTicket.current) setReview({ ...first, content }); return; }
        if (result.nextOffset <= offset) throw new Error('The complete saved note could not be loaded.');
        offset = result.nextOffset;
      }
      throw new Error('The complete saved note could not be loaded.');
    } catch (reason) { if (ticket === readTicket.current) setReviewError(reason instanceof Error ? reason.message : 'Could not load the saved note.'); }
    finally { if (ticket === readTicket.current) setReviewBusy(false); }
  }
  function resolve(keepDraft: boolean) {
    const previous = autosave.snapshot().draft;
    if (review && autosave.resolve(review, keepDraft)) { if (!keepDraft) recovery.remove(artifact.id, previous); setReviewOpen(false); setReview(null); }
  }

  const status = phase === 'saving' ? 'Saving…' : phase === 'conflict' ? 'Review needed' : phase === 'error' ? 'Not saved' : !draft.title.trim() ? 'Add a title to save' : !persisted && !draft.content.trim() ? 'Saves as you write' : dirty ? 'Waiting to save…' : persisted ? 'Saved' : 'Saves automatically';
  return <section ref={documentSurface} className={`nooks-note nooks-document ${noteAppearanceClasses(appearance)}`} aria-label="Note document">
    <header className="nooks-doc-topbar">
      <button type="button" className="nooks-doc-back" disabled={leaving} onClick={() => void leave()} aria-label="Back to library"><ArrowLeft size={17}/><span>Library</span></button>
      <span className="nooks-doc-bar-divider"/>
      <div className="nooks-doc-location">{location ?? <span>{artifact.subject}</span>}</div>
      <div className="nooks-doc-top-actions">
        <button type="button" className="nooks-doc-quick-study" disabled={!draft.content.trim()} onClick={() => ask('flashcards')}>Flashcards</button>
        <button type="button" className="nooks-doc-quick-study" disabled={!draft.content.trim()} onClick={() => ask('quiz')}>Quiz</button>
        <details className="nooks-doc-study-menu"><summary>Study<ChevronDown size={14}/></summary><div className="nooks-doc-menu" role="group" aria-label="Study this note">{(['flashcards','quiz','summary','exam'] as const).map(kind => <button type="button" key={kind} disabled={!draft.content.trim()} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); ask(kind); }}>{kind === 'flashcards' ? 'Make flashcards' : kind === 'quiz' ? 'Quiz me' : kind === 'summary' ? 'Summarize' : 'Practice exam'}<ArrowRight size={14}/></button>)}</div></details>
        <details className="nooks-doc-options"><summary aria-label="Document options" title="Document options"><MoreHorizontal size={20}/></summary><div className="nooks-doc-menu nooks-doc-options-menu">
          <NoteAppearance artifactId={artifact.id} onChange={setAppearance}/>
          {history}
          <button type="button" onClick={download}><Download size={15}/> Download Markdown</button>
          <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onCreate(); }}><Plus size={15}/> New study material</button>
          <div className="nooks-doc-details"><span>{artifact.subject}</span><span>Updated {readableDate(state.artifact.updatedAt)}</span>{artifact.source && <p>{artifact.source}</p>}</div>
        </div></details>
        <button type="button" className="nooks-doc-close" disabled={leaving} onClick={() => void leave(onClose ?? onBack)} aria-label="Close note" title="Close note"><X size={20} aria-hidden="true"/></button>
      </div>
    </header>
    {recoveryWarning && <div className="nooks-note-notice" role="status"><span>Browser recovery is full or unavailable. Keep this note open until it saves, or download your writing.</span><button type="button" onClick={download}>Download writing</button></div>}
    {recovered.current && phase !== 'conflict' && phase !== 'error' && <div className="nooks-note-notice" role="status"><span>Your unfinished writing was recovered from this tab.</span><button type="button" onClick={() => { recovered.current = false; setNotice('Recovered writing is ready.'); }}>Dismiss</button></div>}
    {(phase === 'conflict' || phase === 'error') && <div className="nooks-note-notice" role="alert"><span>{state.error}</span><div>{phase === 'error' && <button type="button" onClick={() => void autosave.retry()}>Retry</button>}<button type="button" onClick={() => void loadReview()}>Review saved version</button></div></div>}
    <RichNoteEditor key={artifact.id} value={draft.content} onChange={content => autosave.update({content})} onBlur={() => { void autosave.flush(); }} autoFocus={!saved && !artifact.content?.trim()} onReady={instance => {editor.current=instance;}}
      onSelectionAsk={(action,text) => {
        const current = autosave.snapshot();
        if ((action === 'flashcards' || action === 'quiz') && onCreateFrom) {
          onCreateFrom(action, { ...current.artifact, ...current.draft, id: `${current.artifact.id}:selection`, title: `${current.draft.title} · selected passage`, content: text });
          return;
        }
        const instruction = action === 'explain' ? 'Explain this selected passage clearly.' : action === 'simplify' ? 'Simplify this selected passage without changing the original note.' : action === 'quiz' ? 'Create a quiz from this selected passage and save it using Nooks artifact_save.' : 'Make flashcards from this selected passage and save them using Nooks artifact_save.';
        onAsk(instruction, { selection: { text, artifactId: current.artifact.id, title: current.draft.title } });
      }}
      title={<header className="nooks-doc-title"><textarea ref={titleField} rows={1} aria-label="Note title" placeholder="Untitled note" value={!persisted && draft.title === 'Untitled note' ? '' : draft.title} onChange={event => autosave.update({title:event.target.value.replace(/\n/g,' ')})} onBlur={() => { if (!autosave.snapshot().draft.title.trim()) autosave.update({title:'Untitled note'}); void autosave.flush(); }} onKeyDown={event => { if(event.key==='Enter'){event.preventDefault();editor.current?.commands.focus('start');} }} maxLength={180}/>{!draft.content.trim() && <div className="nooks-doc-empty-actions"><button type="button" onClick={onCreate}><Plus size={14}/> Add study material</button><span>Paste text or choose from your library</span></div>}</header>}/>
    <footer className="nooks-doc-statusbar"><span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span><span className={`nooks-doc-save-status is-${phase}`} role="status">{!dirty && persisted && phase === 'saved' && <Check size={12}/>}<i aria-hidden="true"/>{status}</span></footer>
    {reviewOpen && <OrganizationDialog title="Keep the right version" onClose={closeReview} wide>
      <p className="nooks-note-compare-intro">Your writing stays here while you compare. Choosing your version creates a new saved revision.</p>
      {reviewBusy && <p role="status">Loading the saved version…</p>}
      {reviewError && <p className="nooks-org-error" role="alert">{reviewError} <button type="button" onClick={() => void loadReview()}>Try again</button></p>}
      {review && <><div className="nooks-note-compare"><section><h3>Saved version · {review.revision}</h3><strong>{review.title}</strong><pre>{review.content}</pre></section><section><h3>Your writing</h3><strong>{draft.title}</strong><pre>{draft.content}</pre></section></div><footer className="nooks-note-compare-actions"><button type="button" onClick={download}>Download my writing</button><button type="button" onClick={() => resolve(false)}>Use saved version</button><button type="button" className="is-primary" onClick={() => resolve(true)}>Save my version</button></footer></>}
    </OrganizationDialog>}
    <span className="nooks-note-sr" role="status" aria-live="polite">{notice}</span>
  </section>;
}
