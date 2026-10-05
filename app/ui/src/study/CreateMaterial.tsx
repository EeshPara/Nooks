import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Clipboard, Plus, X } from 'lucide-react';
import { useModalFocus } from '../personalization/PersonalizePanel';
import { Artifact, ArtifactKind, Flashcard, StudyQuestion } from './types';
import { deleteQuestionOption, validateStudyArtifact } from './editorHelpers';
import { isEmbedded } from '../bridge';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import { useCrashDraft } from '../WorkspaceErrorBoundary';
import MaterialSourcePicker, { MaterialSourceChips } from './MaterialSourcePicker';
import { buildDirectStudyGenerationInput, buildStudyCreationPrompt, readSelectedMaterials, stableStudyGenerationRequest, suggestedStudyTitle, type DirectStudyGenerationRequest } from './materialSources';
import './CreateMaterial.css';

export interface CreateMaterialProps {
  onClose: () => void;
  onSave: (artifact: Artifact) => Promise<void>;
  onAsk: (prompt: string) => void | Promise<void>;
  onBlankNote: (draft?: { title?: string; subject?: string; content?: string }) => void;
  initialKind?: ArtifactKind;
  /** Picker metadata; summaries are never used as complete generation input. */
  materials?: Artifact[];
  initialMaterialIds?: string[];
  initialInstruction?: string;
  initialSource?: string;
  /** Open directly to the material entry point chosen in the workspace. */
  initialSourceMode?: 'paste' | 'library';
  /** Read all pages of current content, or return the selected editor's current draft. */
  onReadMaterial?: (artifactId: string) => Promise<Artifact>;
  /** Returns only after the server has generated and saved the new artifact. */
  onGenerate?: (request: DirectStudyGenerationRequest) => Promise<void>;
  /** Distinguishes unfinished material in separate library courses/topics. */
  draftKey?: string;
}
const freshId = () => globalThis.crypto?.randomUUID?.() ?? `material-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const kinds = [
  { id: 'note' as const, label: 'study notes', short: 'Notes' },
  { id: 'flashcards' as const, label: 'flashcards', short: 'Flashcards' },
  { id: 'quiz' as const, label: 'a quiz', short: 'Quiz' },
  { id: 'exam' as const, label: 'a practice exam', short: 'Exam' },
];
const colorFor = { note: 'mint', flashcards: 'peach', quiz: 'lavender', exam: 'sky' };
const placeholders = {
  note: 'Turn my notes on cellular respiration into a clear study guide…',
  flashcards: 'Make cards for the key ideas in cellular respiration…',
  quiz: 'Quiz me on cellular respiration, one concept at a time…',
  exam: 'Make a practice exam on cellular respiration with explanations…',
};
type MaterialDraft = {
  kind: ArtifactKind;
  mode: 'chat' | 'manual';
  title: string; subject: string; idea: string; source: string;
  selectedIds: string[]; useConversation: boolean;
  cards: Flashcard[]; questions: StudyQuestion[];
  artifactId: string; createdAt: string;
  generationAttempt?: DirectStudyGenerationRequest;
};
// Closing a popup should not erase the student's writing. Keep a bounded draft
// in this tab's memory only; saved work still belongs in the library.
const dismissedDrafts = new Map<string, MaterialDraft>();
const noMaterials: Artifact[] = [];
const noSelection: string[] = [];

export default function CreateMaterial({ onClose, onSave, onAsk, onBlankNote, initialKind = 'note', draftKey = '', materials = noMaterials, initialMaterialIds = noSelection, initialInstruction = '', initialSource = '', initialSourceMode, onReadMaterial, onGenerate }: CreateMaterialProps) {
  // A new request from the welcome composer must not revive an unrelated draft.
  // Match the request field's maximum size and retain at most 12 draft entries.
  const cacheKey = JSON.stringify([draftKey, initialKind, initialMaterialIds, initialInstruction.slice(0, 25000), initialSource.slice(0, 25000), initialSourceMode ?? null]);
  const restored = useRef(dismissedDrafts.get(cacheKey));
  const [kind, setKind] = useCrashDraft<ArtifactKind>('create:kind', restored.current?.kind ?? initialKind);
  const [mode, setMode] = useCrashDraft<'chat' | 'manual'>('create:mode', restored.current?.mode ?? 'chat');
  const [title, setTitle] = useCrashDraft('create:title', restored.current?.title ?? '');
  const [subject, setSubject] = useCrashDraft('create:subject', restored.current?.subject ?? '');
  const [idea, setIdea] = useCrashDraft('create:idea', restored.current?.idea ?? initialInstruction);
  const [source, setSource] = useCrashDraft('create:source', restored.current?.source ?? initialSource);
  const [selectedIds, setSelectedIds] = useCrashDraft<string[]>('create:selected', () => restored.current?.selectedIds ?? [...new Set(initialMaterialIds)]);
  const [useConversation, setUseConversation] = useCrashDraft('create:conversation', restored.current?.useConversation ?? false);
  const [showPicker, setShowPicker] = useState(initialSourceMode === 'library');
  const [showPaste, setShowPaste] = useState(initialSourceMode === 'paste' || Boolean(restored.current?.source || initialSource));
  const [handoffPrompt, setHandoffPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [cards, setCards] = useCrashDraft<Flashcard[]>('create:cards', () => restored.current?.cards ?? [{ id: freshId(), front: '', back: '' }]);
  const [questions, setQuestions] = useCrashDraft<StudyQuestion[]>('create:questions', () => restored.current?.questions ?? [{ id: freshId(), prompt: '', options: ['', ''], correctIndex: 0, explanation: '' }]);
  const [pending, setPending] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const modal = useRef<HTMLDivElement>(null);
  const request = useRef<HTMLTextAreaElement>(null);
  const sourceField = useRef<HTMLTextAreaElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const closeRequested = useRef(false);
  const completed = useRef(false);
  const isClosing = useRef(false);
  const mounted = useRef(true);
  const [retainedArtifactId] = useCrashDraft('create:id', () => restored.current?.artifactId ?? freshId());
  const [retainedCreatedAt] = useCrashDraft('create:created', () => restored.current?.createdAt ?? new Date().toISOString());
  const artifactId = useRef(retainedArtifactId);
  const createdAt = useRef(retainedCreatedAt);
  const generationAttempt = useRef<DirectStudyGenerationRequest | undefined>(restored.current?.generationAttempt);
  const canGenerateHere = !isEmbedded && Boolean(onGenerate);
  function keepDraft() {
    const hasWriting = [title, subject, idea, source, ...cards.flatMap(card => [card.front, card.back, card.hint ?? '']), ...questions.flatMap(question => [question.prompt, question.answer ?? '', question.explanation ?? '', ...(question.options ?? []), ...(question.acceptedAnswers ?? [])])].some(value => value.trim());
    dismissedDrafts.delete(cacheKey);
    if (!hasWriting && !selectedIds.length && !useConversation) return;
    dismissedDrafts.set(cacheKey, { kind, mode, title, subject, idea, source, selectedIds, useConversation, cards, questions, artifactId: artifactId.current, createdAt: createdAt.current, generationAttempt: generationAttempt.current });
    if (dismissedDrafts.size > 12) dismissedDrafts.delete(dismissedDrafts.keys().next().value!);
  }
  function dismiss() {
    if (!mounted.current || isClosing.current) return;
    if (busy.current) { closeRequested.current = true; return; }
    closeRequested.current = false;
    isClosing.current = true;
    if (!completed.current) keepDraft();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    busy.current = true; setClosing(true);
    closeTimer.current = setTimeout(onClose, 140);
  }
  const backdrop = useBackdropDismiss<HTMLDivElement>(dismiss);
  useModalFocus(modal, dismiss);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; closeRequested.current = false; if (closeTimer.current !== null) clearTimeout(closeTimer.current); }; }, []);
  useEffect(() => { if (!pending && !busy.current && closeRequested.current) dismiss(); }, [pending]);
  function finishPending() {
    if (!mounted.current) return;
    busy.current = false; setPending(false);
    // Even a fast response may batch both pending states into one render.
    if (mounted.current && closeRequested.current) dismiss();
  }
  useEffect(() => {
    if (showPicker) modal.current?.querySelector<HTMLInputElement>('.nooks-create-source-search input')?.focus({ preventScroll: true });
    else if (!showPaste) request.current?.focus();
  }, []);
  useEffect(() => { if (showPaste && !showPicker) sourceField.current?.focus({ preventScroll: true }); }, [showPaste]);
  const canAsk = Boolean(idea.trim() || source.trim() || selectedIds.length || (isEmbedded && useConversation));
  const clearFeedback = () => { completed.current = false; setErrors([]); setStatus(''); setHandoffPrompt(''); setCopied(false); };
  function closePicker(restoreFocus = true) { setShowPicker(false); if (restoreFocus) pickerTrigger.current?.focus({ preventScroll: true }); }
  function openNote() {
    if (busy.current) return;
    keepDraft();
    onBlankNote({ title: title.trim(), subject: subject.trim(), content: source });
  }
  function chooseKind(nextKind: ArtifactKind) {
    if (mode === 'manual' && nextKind === 'note') { openNote(); return; }
    setKind(nextKind); clearFeedback();
  }
  function writeManually() {
    if (kind === 'note') { openNote(); return; }
    setMode('manual'); clearFeedback();
  }
  function updateCard(index: number, patch: Partial<Flashcard>) {
    setCards(value => value.map((card, i) => i === index ? { ...card, ...patch } : card)); clearFeedback();
  }
  function updateQuestion(index: number, patch: Partial<StudyQuestion>) {
    setQuestions(value => value.map((question, i) => i === index ? { ...question, ...patch } : question)); clearFeedback();
  }
  function clearCompletedDraft(ownedDraft: MaterialDraft | undefined) {
    // Parent success handlers may unmount this form before returning. Clean up
    // its saved draft, but never a newer draft from a replacement form.
    if (dismissedDrafts.get(cacheKey) === ownedDraft) dismissedDrafts.delete(cacheKey);
  }
  async function save() {
    if (!mounted.current || busy.current) return;
    if (kind === 'note') { openNote(); return; }
    const artifact: Artifact = {
      id: artifactId.current, title: suggestedStudyTitle(kind, title, kind === 'flashcards' ? cards[0]?.front : questions[0]?.prompt), subject: subject.trim() || 'Personal', color: colorFor[kind], kind,
      createdAt: createdAt.current, updatedAt: new Date().toISOString(),
    };
    if (kind === 'flashcards') artifact.cards = cards.map(card => ({ ...card, front: card.front.trim(), back: card.back.trim(), hint: card.hint?.trim() || undefined }));
    else artifact.questions = questions.map(question => ({ ...question, prompt: question.prompt.trim(), options: question.options?.map(option => option.trim()), answer: question.answer?.trim(), acceptedAnswers: question.acceptedAnswers?.map(answer => answer.trim()).filter(Boolean), explanation: question.explanation?.trim() }));
    const problems = validateStudyArtifact(artifact);
    setErrors(problems); setStatus('');
    if (problems.length) { window.setTimeout(() => alert.current?.focus(), 0); return; }
    const ownedDraft = dismissedDrafts.get(cacheKey);
    busy.current = true; completed.current = false; setPending(true);
    try { await onSave(artifact); clearCompletedDraft(ownedDraft); if (!mounted.current) return; completed.current = true; }
    catch { if (mounted.current) setErrors(['Couldn’t save. Your draft is still here; try again.']); }
    finally { finishPending(); }
  }
  async function ask() {
    if (!mounted.current || busy.current || !canAsk) return;
    const ownedDraft = dismissedDrafts.get(cacheKey);
    busy.current = true; setPending(true); clearFeedback();
    try {
      const selected = await readSelectedMaterials(selectedIds, materials, onReadMaterial);
      if (!mounted.current) return;
      if (canGenerateHere && onGenerate) {
        const input = buildDirectStudyGenerationInput({ kind, title, subject, instruction: idea, pastedText: source, materials: selected, embedded: false });
        const attempt = stableStudyGenerationRequest(input, generationAttempt.current);
        generationAttempt.current = attempt;
        await onGenerate(attempt);
        clearCompletedDraft(ownedDraft);
        if (!mounted.current) return;
        completed.current = true;
        setStatus('Created and saved to your library.');
        return;
      }
      const prompt = buildStudyCreationPrompt({ kind, title, subject, instruction: idea, pastedText: source, materials: selected, useCurrentConversation: isEmbedded && useConversation, embedded: isEmbedded });
      if (isEmbedded) {
        await onAsk(prompt); clearCompletedDraft(ownedDraft); if (!mounted.current) return; completed.current = true; setStatus('Sent to your ChatGPT conversation.');
      } else {
        setHandoffPrompt(prompt);
        let clipboardTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          // A browser permission prompt can leave clipboard access pending.
          // Always return control to the student and keep manual copying available.
          await Promise.race([
            navigator.clipboard.writeText(prompt),
            new Promise<never>((_, reject) => { clipboardTimeout = setTimeout(() => reject(new Error('Clipboard request timed out.')), 1000); }),
          ]);
          if (!mounted.current) return;
          setCopied(true); setStatus('Copied. Paste it into ChatGPT to create your material.');
        }
        catch { if (mounted.current) setStatus('Select and copy the prompt below, then paste it into ChatGPT.'); }
        finally { if (clipboardTimeout !== undefined) clearTimeout(clipboardTimeout); }
      }
    }
    catch (failure) { if (mounted.current) setErrors([failure instanceof Error ? failure.message : 'Couldn’t send. Your request is still here; try again.']); }
    finally { finishPending(); }
  }

  return <div className={`nooks-create-overlay${closing ? ' is-closing' : ''}`} {...backdrop}>
    <div className="nooks-create-dialog" ref={modal} role="dialog" aria-modal="true" aria-labelledby="create-material-title" tabIndex={-1} onClick={event => event.stopPropagation()}
      onKeyDownCapture={event => { if (closing && event.key === 'Tab') { event.preventDefault(); modal.current?.focus(); } }}>
      <header><h2 id="create-material-title">Create something to study</h2><button type="button" className="nooks-material-close" aria-label="Close material creation" disabled={closing} onClick={dismiss}><X size={19} /></button></header>
      <form onSubmit={event => { event.preventDefault(); void (mode === 'chat' ? ask() : save()); }} onKeyDown={event => {
        // Enter in a metadata or answer field must not submit an unfinished set.
        if (event.key === 'Enter' && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) event.preventDefault();
      }}>
        <div className="nooks-create-scroll"><fieldset disabled={pending || closing}>
          <div className="nooks-create-formats" role="group" aria-label="Study material type">{kinds.map(item => <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => chooseKind(item.id)}>{item.short}</button>)}</div>
          {mode === 'chat' ? <>
            <label className="nooks-create-request"><span className="nooks-create-sr">What would you like to study?</span><textarea ref={request} rows={4} value={idea} onChange={event => { setIdea(event.target.value); clearFeedback(); }} placeholder={selectedIds.length || source.trim() ? `What should your ${kind === 'note' ? 'notes' : kind === 'exam' ? 'exam' : kind} focus on? (optional)` : placeholders[kind]} maxLength={canGenerateHere ? 4000 : 25000} /></label>
            <MaterialSourceChips materials={materials} selectedIds={selectedIds} onRemove={id => { setSelectedIds(value => value.filter(item => item !== id)); clearFeedback(); }} pastedText={source} onEditPasted={() => { setShowPaste(true); sourceField.current?.focus(); }} onRemovePasted={() => { setSource(''); setShowPaste(false); clearFeedback(); }}/>
            <div className="nooks-create-input-actions"><button type="button" onClick={() => { setShowPaste(value => !value); clearFeedback(); }} aria-expanded={showPaste} aria-controls="nooks-create-paste"><Plus size={15}/>Paste material</button><button type="button" ref={pickerTrigger} onClick={() => setShowPicker(value => !value)} aria-expanded={showPicker}><BookOpen size={15}/>From library{selectedIds.length ? <span>{selectedIds.length}</span> : null}</button></div>
            {showPaste && <section id="nooks-create-paste" className="nooks-create-paste"><label><span>Source material</span><textarea ref={sourceField} rows={5} value={source} onChange={event => { setSource(event.target.value); setUseConversation(false); clearFeedback(); }} placeholder="Paste a passage, class notes, or a transcript…" maxLength={25000}/></label><button type="button" className="nooks-create-text" onClick={() => { setSource(''); setShowPaste(false); clearFeedback(); request.current?.focus(); }}>Remove</button></section>}
            {showPicker && <MaterialSourcePicker trigger={pickerTrigger} materials={materials} selectedIds={selectedIds} onChange={ids => { setSelectedIds(ids); setUseConversation(false); clearFeedback(); }} onClose={closePicker}/>}
            <div className="nooks-create-tools">{isEmbedded && !selectedIds.length && !source.trim() ? <button type="button" className="nooks-create-text" aria-pressed={useConversation} onClick={() => { setUseConversation(value => !value); clearFeedback(); }}>{useConversation ? 'Using this conversation ✓' : 'Use this conversation'}</button> : <span className="nooks-create-scope-hint">{selectedIds.length || source.trim() ? 'Only the material you choose.' : 'Start with a topic or your own material.'}</span>}<button type="button" className="nooks-create-text" onClick={writeManually}>{kind === 'note' ? 'Write a note' : 'Write it myself'}</button></div>
            <details className="nooks-create-details"><summary tabIndex={0}>Title &amp; subject <span>optional</span></summary><div className="nooks-create-metadata"><label>Title<input value={title} onChange={event => { setTitle(event.target.value); clearFeedback(); }} placeholder={canGenerateHere ? 'Name automatically' : 'Let ChatGPT name it'} maxLength={180} /></label><label>Subject<input value={subject} onChange={event => { setSubject(event.target.value); clearFeedback(); }} placeholder="Biology" maxLength={60} /></label></div></details>
          </> : <>
            <div className="nooks-create-manual-heading"><span>{kind === 'flashcards' ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}` : `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`}</span><button type="button" className="nooks-create-text" onClick={() => { setMode('chat'); clearFeedback(); }}>{canGenerateHere ? 'Generate with AI' : 'Use ChatGPT'}</button></div>
            <label className="nooks-create-title">Title <span className="nooks-create-optional">optional</span><input value={title} onChange={event => { setTitle(event.target.value); clearFeedback(); }} placeholder="Named from your first question" maxLength={180} /></label>
            {kind === 'flashcards' ? <div>{cards.map((card, index) => <article className="nooks-create-item" key={card.id}>
              <div className="nooks-create-item-heading"><strong>Card {index + 1}</strong><button type="button" className="nooks-create-remove" aria-label={`Remove card ${index + 1}`} onClick={() => { setCards(value => value.filter((_, i) => i !== index)); clearFeedback(); }}>Remove</button></div>
              <div className="nooks-create-card-sides"><label>Front<textarea value={card.front} onChange={event => updateCard(index, { front: event.target.value })} rows={3} placeholder="Question" maxLength={10000} /></label><label>Back<textarea value={card.back} onChange={event => updateCard(index, { back: event.target.value })} rows={3} placeholder="Answer" maxLength={10000} /></label></div>
              <details className="nooks-create-detail-field"><summary tabIndex={0}>Add a hint</summary><label><span className="nooks-create-sr">Hint for card {index + 1}</span><input value={card.hint ?? ''} onChange={event => updateCard(index, { hint: event.target.value })} placeholder="A clue" maxLength={1000} /></label></details>
            </article>)}<button type="button" className="nooks-create-add" onClick={() => { setCards(value => [...value, { id: freshId(), front: '', back: '' }]); clearFeedback(); }}>+ Add card</button></div> : <div>{questions.map((question, index) => <article className="nooks-create-item" key={question.id}>
              <div className="nooks-create-item-heading"><strong>Question {index + 1}</strong><button type="button" className="nooks-create-remove" aria-label={`Remove question ${index + 1}`} onClick={() => { setQuestions(value => value.filter((_, i) => i !== index)); clearFeedback(); }}>Remove</button></div>
              <label>Question<textarea rows={2} value={question.prompt} onChange={event => updateQuestion(index, { prompt: event.target.value })} placeholder="Where does glycolysis happen?" maxLength={10000} /></label>
              <label className="nooks-create-answer-style"><span className="nooks-create-sr">Answer style for question {index + 1}</span><select value={question.options?.length ? 'choice' : 'short'} onChange={event => updateQuestion(index, event.target.value === 'choice' ? { options: [question.answer ?? '', ''], correctIndex: 0, answer: undefined, acceptedAnswers: undefined } : { answer: question.options?.[question.correctIndex ?? 0] ?? '', options: undefined, correctIndex: undefined })}><option value="choice">Multiple choice</option><option value="short">Short answer</option></select></label>
              {question.options?.length ? <div className="nooks-create-options"><p>Select the correct answer.</p>{question.options.map((option, optionIndex) => <div key={optionIndex} className="nooks-create-option">
                <label className="nooks-create-radio"><input type="radio" name={`answer-${question.id}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(index, { correctIndex: optionIndex })} aria-label={`Choice ${optionIndex + 1} is correct for question ${index + 1}`} /><span aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span></label>
                <input value={option} onChange={event => updateQuestion(index, { options: question.options!.map((value, i) => i === optionIndex ? event.target.value : value) })} placeholder="Answer choice" aria-label={`Question ${index + 1}, answer choice ${optionIndex + 1}`} maxLength={3000} />
                <button type="button" className="nooks-material-close" aria-label={`Remove choice ${optionIndex + 1}`} disabled={question.options!.length <= 2} onClick={() => updateQuestion(index, deleteQuestionOption(question.options!, question.correctIndex, optionIndex))}><X size={15} /></button>
              </div>)}<button type="button" className="nooks-create-text" disabled={question.options.length >= 8} onClick={() => updateQuestion(index, { options: [...question.options!, ''] })}>+ Add answer choice</button></div> : <>
                <label>Accepted answer<input value={question.answer ?? ''} onChange={event => updateQuestion(index, { answer: event.target.value })} placeholder="Cytoplasm" maxLength={3000} /></label>
                <label>Other accepted answers <span className="nooks-create-optional">optional, separated by semicolons</span><input value={(question.acceptedAnswers ?? []).join(';')} onChange={event => updateQuestion(index, { acceptedAnswers: event.target.value.split(';') })} maxLength={3000} /></label>
              </>}
              <details className="nooks-create-detail-field"><summary tabIndex={0}>Add an explanation</summary><label><span className="nooks-create-sr">Explanation for question {index + 1}</span><textarea rows={2} value={question.explanation ?? ''} onChange={event => updateQuestion(index, { explanation: event.target.value })} placeholder="Why this answer is correct" maxLength={10000} /></label></details>
            </article>)}<button type="button" className="nooks-create-add" onClick={() => { setQuestions(value => [...value, { id: freshId(), prompt: '', options: ['', ''], correctIndex: 0, explanation: '' }]); clearFeedback(); }}>+ Add question</button></div>}
            <details className="nooks-create-details"><summary tabIndex={0}>Subject <span>optional</span></summary><label><span className="nooks-create-sr">Subject</span><input value={subject} onChange={event => { setSubject(event.target.value); clearFeedback(); }} placeholder="Biology" maxLength={60} /></label></details>
          </>}
        </fieldset>
          {errors.length > 0 && <div className="nooks-create-errors" role="alert" ref={alert} tabIndex={-1}><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
          {status && <p className="nooks-create-status" role="status">{status}</p>}
          {handoffPrompt && <div className="nooks-create-handoff"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT<ArrowUpRight size={14}/></a><details open={!copied}><summary>View prompt</summary><textarea readOnly rows={6} value={handoffPrompt} aria-label="ChatGPT study prompt" onFocus={event => event.currentTarget.select()}/></details><p>Your results stay in ChatGPT. This preview won’t import them automatically.</p></div>}
        </div>
        <footer><div>{mode === 'chat' ? <span className="nooks-create-footer-note">{isEmbedded ? 'Made with ChatGPT' : canGenerateHere ? 'Generate and save to your library' : 'AI generation happens in ChatGPT'}</span> : <button type="button" className="nooks-create-text" disabled={closing} onClick={dismiss}>Cancel</button>}</div><button type="submit" className="nooks-create-submit" disabled={pending || closing || (mode === 'chat' && !canAsk)}>{mode === 'chat' && !isEmbedded && !canGenerateHere && !pending && <Clipboard size={14}/>} {pending ? mode === 'chat' ? canGenerateHere ? 'Creating…' : 'Preparing…' : 'Saving…' : mode === 'chat' ? isEmbedded || canGenerateHere ? `${canGenerateHere ? 'Generate' : 'Create'} ${kind === 'note' ? 'notes' : kind === 'flashcards' ? 'flashcards' : kind === 'quiz' ? 'quiz' : 'exam'}` : 'Copy ChatGPT prompt' : 'Save to library'}</button></footer>
      </form>
    </div>
  </div>;
}
