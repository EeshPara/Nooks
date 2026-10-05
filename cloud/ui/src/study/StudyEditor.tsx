import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Plus, Trash2, X } from 'lucide-react';
import { Artifact, Flashcard, StudyQuestion } from './types';
import { deleteQuestionOption, validateStudyArtifact } from './editorHelpers';
import { createPendingStudyStore } from './pendingStudyStore';
import { useCrashDraft } from '../WorkspaceErrorBoundary';
import { consumeDismissEscape, isTopmostDismissTarget } from '../world/dismissal';

interface Props { artifact: Artifact; onSave: (artifact: Artifact) => void | Promise<void | Artifact>; onCancel: () => void; recoveryScope?: string }
const id = () => globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function validRecoveredStudyDraft(value: unknown, original: Artifact): value is Artifact {
  const item = value as Artifact;
  const text = (value: unknown) => typeof value === 'string';
  if (!item || item.id !== original.id || item.kind !== original.kind || !text(item.title) || !text(item.subject) || (item.description !== undefined && !text(item.description))) return false;
  if (item.kind === 'flashcards') return Array.isArray(item.cards) && item.cards.every(card => card && text(card.id) && text(card.front) && text(card.back) && (card.hint === undefined || text(card.hint)));
  return Array.isArray(item.questions) && item.questions.every(question => question && text(question.id) && text(question.prompt) &&
    (question.answer === undefined || text(question.answer)) && (question.explanation === undefined || text(question.explanation)) &&
    (question.options === undefined || Array.isArray(question.options) && question.options.every(text)) &&
    (question.acceptedAnswers === undefined || Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.every(text)));
}

export default function StudyEditor({ artifact, onSave, onCancel, recoveryScope = 'host' }: Props) {
  const [recovery] = useState(() => createPendingStudyStore(recoveryScope, 'editors'));
  const [draft, setDraft] = useCrashDraft<Artifact>(`study-editor:${artifact.id}`, () => { const previous = recovery.get(artifact.id); return validRecoveredStudyDraft(previous, artifact) ? previous : structuredClone(artifact); }, recoveryScope);
  const [errors, setErrors] = useState<string[]>([]);
  const [conflicted, setConflicted] = useState(false);
  const copyId = useRef(id());
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const closeRequested = useRef(false);
  const mounted = useRef(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(() => cancel()); cancelRef.current = () => cancel();
  const current = useRef({ draft, saving }); current.current = { draft, saving };
  useEffect(() => { editorRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  useEffect(() => {
    mounted.current = true;
    let startedOutside: boolean | null = null;
    const isMargin = (event: MouseEvent | PointerEvent) => {
      const editor = editorRef.current, target = event.target;
      if (!editor || !(target instanceof Element) || editor.contains(target) || !isTopmostDismissTarget(editor)) return false;
      if (!target.matches('.world-main, .page-content, .nooks-active-work, .nooks-study-primary, .study-workspace, [data-workspace-backdrop]')) return false;
      // Closing a menu/popover must not also dismiss the editor underneath it.
      return ![...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], dialog[open], .popover-menu, .nooks-portal')].some(panel => !panel.closest('[hidden], [aria-hidden="true"], [inert]') && panel.getClientRects().length > 0);
    };
    const pointer = (event: PointerEvent) => { startedOutside = event.button === 0 && isMargin(event); };
    const cancelled = () => { startedOutside = false; };
    const click = (event: MouseEvent) => {
      const shouldClose = event.button === 0 && startedOutside !== false && isMargin(event);
      startedOutside = null;
      if (shouldClose) { event.preventDefault(); event.stopPropagation(); cancelRef.current(); }
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('pointercancel', cancelled, true);
    document.addEventListener('click', click, true);
    return () => {
      mounted.current = false;
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('pointercancel', cancelled, true);
      document.removeEventListener('click', click, true);
    };
  }, []);
  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(artifact)) return;
    if (!recovery.retain(artifact.id, draft)) setErrors(['Tab recovery is full or unavailable. Keep this editor open until your changes save.']);
  }, [draft, artifact, recovery]);
  useEffect(() => {
    const dirty = () => JSON.stringify(current.current.draft) !== JSON.stringify(artifact);
    const leave = (event: Event) => {
      if (current.current.saving || submitting.current || (dirty() && !window.confirm('Leave without saving your study-set changes?'))) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirty() || submitting.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('nooks:leave-study-editor', leave);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('nooks:leave-study-editor', leave); window.removeEventListener('beforeunload', unload); };
  }, [artifact]);
  function cancel() {
    if (submitting.current) { closeRequested.current = true; return; }
    closeRequested.current = false;
    if (JSON.stringify(draft) !== JSON.stringify(artifact) && !window.confirm('Discard your unsaved study-set changes?')) return;
    recovery.acknowledge(artifact.id, draft);
    onCancel();
  }
  const cardSet = draft.kind === 'flashcards';
  function updateCard(index: number, patch: Partial<Flashcard>) { setDraft(value => ({ ...value, cards: value.cards?.map((card, i) => i === index ? { ...card, ...patch } : card) })); }
  function updateQuestion(index: number, patch: Partial<StudyQuestion>) { setDraft(value => ({ ...value, questions: value.questions?.map((question, i) => i === index ? { ...question, ...patch } : question) })); }
  async function save(asCopy = false) {
    if (submitting.current) return;
    const problems = validateStudyArtifact(draft);
    setErrors(problems);
    if (problems.length) { editorRef.current?.querySelector<HTMLElement>('.study-editor-errors')?.focus(); return; }
    submitting.current = true; setSaving(true);
    try {
      const now = new Date().toISOString();
      const { revision: _revision, ...copy } = draft;
      const outgoing = asCopy ? { ...copy, id: copyId.current, createdAt: now } : draft;
      await onSave({ ...outgoing, title: draft.title.trim(), subject: draft.subject.trim(), updatedAt: now });
      closeRequested.current = false;
      recovery.acknowledge(artifact.id, draft); if (mounted.current) onCancel();
    }
    catch (reason) {
      const conflict = (reason as { code?: string })?.code === 'REVISION_CONFLICT' || /changed after|revision conflict|reload revision/i.test(reason instanceof Error ? reason.message : '');
      if (conflict) setConflicted(true);
      setErrors([conflict ? 'This study set changed elsewhere. Your edits are still here. Save them as a new set to keep both versions.' : 'Your changes could not save. Your draft is still here — try again.']);
    }
    finally {
      submitting.current = false; setSaving(false);
      if (mounted.current && closeRequested.current) cancelRef.current();
    }
  }
  return <div className="study-editor" ref={editorRef} onKeyDown={event => { if (consumeDismissEscape(event.nativeEvent, editorRef.current)) cancel(); event.stopPropagation(); }}><div className="study-topline"><button className="study-back" onClick={cancel}><ArrowLeft size={17} /> Back to practice</button><div className="study-topline-actions"><span className="study-eyebrow">Make it yours</span><button type="button" className="study-surface-close" onClick={cancel} aria-label="Close study editor" title="Close study editor"><X size={20} aria-hidden="true" /></button></div></div><div className="study-heading"><div><h1>Edit your {cardSet ? 'flashcards' : draft.kind === 'exam' ? 'exam' : 'quiz'}</h1><p>Fine-tune the ideas you want to remember. Saving updated material starts a fresh practice session.</p></div></div><form onSubmit={event => { event.preventDefault(); save(); }}><fieldset disabled={saving} className="study-editor-meta"><label>Title<input value={draft.title} maxLength={180} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></label><label>Subject<input value={draft.subject} maxLength={60} onChange={event => setDraft(value => ({ ...value, subject: event.target.value }))} /></label><label className="study-editor-wide">A little description <span>Optional</span><input value={draft.description ?? ''} maxLength={500} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} /></label></fieldset>
    <fieldset disabled={saving} className="study-editor-items">{cardSet ? draft.cards?.map((card, index) => <article className="study-edit-item" key={card.id}><div className="study-edit-item-heading"><strong>Card {index + 1}</strong><button type="button" className="study-delete" aria-label={`Delete card ${index + 1}`} onClick={() => setDraft(value => ({ ...value, cards: value.cards?.filter((_, i) => i !== index) }))}><Trash2 size={15} /> Delete</button></div><label>Question<textarea value={card.front} rows={2} onChange={event => updateCard(index, { front: event.target.value })} /></label><label>Answer<textarea value={card.back} rows={3} onChange={event => updateCard(index, { back: event.target.value })} /></label><label>Hint <span>Optional</span><input value={card.hint ?? ''} onChange={event => updateCard(index, { hint: event.target.value })} /></label></article>) : draft.questions?.map((question, index) => <article className="study-edit-item" key={question.id}><div className="study-edit-item-heading"><strong>Question {index + 1}</strong><button type="button" className="study-delete" aria-label={`Delete question ${index + 1}`} onClick={() => setDraft(value => ({ ...value, questions: value.questions?.filter((_, i) => i !== index) }))}><Trash2 size={15} /> Delete</button></div><label>Question<textarea value={question.prompt} rows={2} onChange={event => updateQuestion(index, { prompt: event.target.value })} /></label><label>Answer style<select value={question.options?.length ? 'choice' : 'short'} onChange={event => updateQuestion(index, event.target.value === 'choice' ? { options: [question.answer ?? '', ''], correctIndex: 0, answer: undefined, acceptedAnswers: undefined } : { answer: question.options?.[question.correctIndex ?? 0] ?? '', options: undefined, correctIndex: undefined })}><option value="choice">Multiple choice</option><option value="short">Short answer</option></select></label>{question.options?.length ? <div className="study-edit-options"><span>Answer choices <small>Select the correct one.</small></span>{question.options.map((option, optionIndex) => <div className="study-edit-option" key={optionIndex}><label className="study-edit-radio"><input type="radio" name={`correct-${question.id}`} checked={question.correctIndex === optionIndex} aria-label={`Choice ${optionIndex + 1} is correct for question ${index + 1}`} onChange={() => updateQuestion(index, { correctIndex: optionIndex })} /><span>{String.fromCharCode(65 + optionIndex)}</span></label><input value={option} aria-label={`Question ${index + 1}, choice ${optionIndex + 1}`} onChange={event => updateQuestion(index, { options: question.options!.map((value, i) => i === optionIndex ? event.target.value : value) })} /><button type="button" className="study-delete" disabled={question.options!.length <= 2} aria-label={`Remove choice ${optionIndex + 1}`} onClick={() => updateQuestion(index, deleteQuestionOption(question.options!, question.correctIndex, optionIndex))}><Trash2 size={15} /></button></div>)}<button type="button" className="study-back" disabled={question.options.length >= 8} onClick={() => updateQuestion(index, { options: [...question.options!, ''] })}><Plus size={15} /> Add choice</button></div> : <><label>Accepted answer<input value={question.answer ?? ''} onChange={event => updateQuestion(index, { answer: event.target.value })} /></label><label>Other accepted answers <span>Optional · separate with a semicolon</span><input value={(question.acceptedAnswers ?? []).join(';')} onChange={event => updateQuestion(index, { acceptedAnswers: event.target.value.split(';') })} /></label></>}<label>Explanation <span>Optional</span><textarea value={question.explanation ?? ''} rows={2} onChange={event => updateQuestion(index, { explanation: event.target.value })} /></label></article>)}<button type="button" className="study-secondary study-add-item" onClick={() => setDraft(value => cardSet ? { ...value, cards: [...(value.cards ?? []), { id: id(), front: '', back: '' }] } : { ...value, questions: [...(value.questions ?? []), { id: id(), prompt: '', options: ['', ''], correctIndex: 0, explanation: '' }] })}><Plus size={16} /> Add {cardSet ? 'flashcard' : 'question'}</button></fieldset>
    {errors.length > 0 && <div className="study-editor-errors" role="alert" tabIndex={-1}><strong>A few things need a look.</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>{conflicted&&<button type="button" className="study-secondary" disabled={saving} onClick={()=>void save(true)}>Save as new set</button>}</div>}<div className="study-edit-savebar"><button type="button" className="study-secondary" onClick={cancel}>Cancel changes</button><button type="submit" className="study-primary" disabled={saving||conflicted}><Check size={17} /> {saving ? 'Saving…' : 'Save changes'}</button></div></form></div>;
}
