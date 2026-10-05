import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCheck, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import type { Artifact } from '../study/types';
import { useCrashDraft } from '../WorkspaceErrorBoundary';
import './StudyPlan.css';

export interface PlanTask { id: string; title: string; subject: string; done: boolean; dueDate?: string }
export interface StudyPlanProps { tasks: PlanTask[]; onSave: (tasks: PlanTask[]) => Promise<void>; artifacts: Artifact[]; onOpen: (artifact: Artifact) => void }

export function validatedPlanTask(task: PlanTask): PlanTask {
  const title = task.title.trim(), subject = task.subject.trim() || 'General';
  if (!title || title.length > 180) throw new Error('Give this step a title of up to 180 characters.');
  if (subject.length > 60) throw new Error('Keep the subject to 60 characters or fewer.');
  const dueDate = task.dueDate?.trim() || undefined;
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new Error('Choose a valid due date, or leave it empty.');
  return { id: task.id, title, subject, done: task.done, ...(dueDate ? { dueDate } : {}) };
}
export function editedPlanTasks(tasks: PlanTask[], task: PlanTask): PlanTask[] {
  if (!tasks.some(item => item.id === task.id)) throw new Error('This step is no longer in your plan. Choose another step to edit.');
  return tasks.map(item => item.id === task.id ? { ...item, ...task, done: item.done, dueDate: task.dueDate } : item);
}
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function dueLabel(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

export function StudyPlan({ tasks, onSave, artifacts, onOpen }: StudyPlanProps) {
  const [title, setTitle] = useCrashDraft('plan:title', ''), [subject, setSubject] = useCrashDraft('plan:subject', ''), [dueDate, setDueDate] = useCrashDraft('plan:due', '');
  const [editing, setEditing] = useCrashDraft<string | null>('plan:editing', null), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const [retainedId, setRetainedId] = useCrashDraft('plan:new-id', () => crypto.randomUUID());
  const taskRef = useRef(tasks), gate = useRef(false), newId = useRef(retainedId), titleInput = useRef<HTMLInputElement>(null);
  taskRef.current = tasks;
  const completed = tasks.filter(task => task.done), unfinished = tasks.filter(task => !task.done), today = localDate();
  async function save(next: () => PlanTask[], success?: () => void) {
    if (gate.current) return;
    gate.current = true; setPending(true); setError(null);
    try { await onSave(next()); success?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Your plan could not save. Your changes are still here; try again.'); }
    finally { gate.current = false; setPending(false); }
  }
  function clearForm() { setEditing(null); setTitle(''); setSubject(''); setDueDate(''); newId.current = crypto.randomUUID(); setRetainedId(newId.current); }
  function edit(task: PlanTask) { setEditing(task.id); setTitle(task.title); setSubject(task.subject); setDueDate(task.dueDate ?? ''); setError(null); requestAnimationFrame(() => titleInput.current?.focus()); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await save(() => {
      const current = taskRef.current;
      const task = validatedPlanTask({ id: editing ?? newId.current, title, subject, done: false, dueDate });
      if (editing) return editedPlanTasks(current, task);
      if (current.some(item => item.id === task.id)) return editedPlanTasks(current, task);
      if (current.length >= 100) throw new Error('Your plan has 100 steps. Remove older steps before adding another.');
      return [...current, task];
    }, clearForm);
  }
  function toggle(task: PlanTask) { void save(() => taskRef.current.map(item => item.id === task.id ? { ...item, done: !item.done } : item)); }
  function remove(task: PlanTask) { void save(() => taskRef.current.filter(item => item.id !== task.id), () => { if (editing === task.id) clearForm(); }); }
  function row(task: PlanTask) {
    const overdue = !task.done && !!task.dueDate && task.dueDate < today;
    return <li key={task.id} className={task.done ? 'is-complete' : ''}>
      <button className="nooks-plan-check" type="button" role="checkbox" aria-checked={task.done} aria-label={`${task.done ? 'Mark unfinished' : 'Complete'}: ${task.title}`} disabled={pending} onClick={() => toggle(task)}>{task.done && <Check size={13} />}</button>
      <div className="nooks-plan-task-copy"><strong>{task.title}</strong><span>{task.subject}{task.dueDate && <small className={overdue ? 'is-overdue' : ''}><CalendarDays size={10} />{overdue ? 'Overdue · ' : task.dueDate === today ? 'Today · ' : ''}{dueLabel(task.dueDate)}</small>}</span></div>
      <div className="nooks-plan-row-actions"><button type="button" aria-label={`Edit ${task.title}`} title="Edit step" disabled={pending} onClick={() => edit(task)}><Pencil size={13} /></button><button type="button" aria-label={`Delete ${task.title}`} title="Delete step" disabled={pending} onClick={() => remove(task)}><Trash2 size={13} /></button></div>
    </li>;
  }
  return <div className="nooks-plan">
    <header className="nooks-plan-heading"><div><span>YOUR NEXT SESSION</span><h1>Your study plan</h1><p>One clear next step. A little less to hold in your head.</p></div><div className="nooks-plan-count"><CheckCheck size={15} /><strong>{completed.length}</strong><span>of {tasks.length} complete</span></div></header>
    {error && <div className="nooks-plan-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss plan error" onClick={() => setError(null)}><X size={14} /></button></div>}
    <div className="nooks-plan-layout"><section className="nooks-plan-main" aria-label="Study steps">
      <div className="nooks-plan-section-heading"><h2>Your next steps</h2><span>{pending ? 'Saving…' : `${unfinished.length} to go`}</span></div>
      {unfinished.length ? <ul className="nooks-plan-tasks">{unfinished.map(row)}</ul> : <div className="nooks-plan-empty"><Target size={30} strokeWidth={1.25} /><h3>{tasks.length ? 'A little room to breathe.' : 'Start with one small thing.'}</h3><p>{tasks.length ? 'Your current steps are complete. Add another when you are ready.' : 'Choose something you can finish in your next study session.'}</p></div>}
      {completed.length > 0 && <details className="nooks-plan-completed"><summary><CheckCheck size={13} />Completed <span>{completed.length}</span></summary><ul className="nooks-plan-tasks">{completed.map(row)}</ul><button type="button" className="nooks-plan-text-button" disabled={pending} onClick={() => { const clearEditing = !!editing && taskRef.current.some(task => task.id === editing && task.done); void save(() => taskRef.current.filter(task => !task.done), () => { if (clearEditing) clearForm(); }); }}>Clear completed steps</button></details>}
      <form className="nooks-plan-form" onSubmit={event => void submit(event)}><header><h3>{editing ? 'Edit this step' : 'Your next small step'}</h3>{editing && <button type="button" className="nooks-plan-text-button" disabled={pending} onClick={clearForm}>Cancel edit</button>}</header>
        <label className="nooks-plan-title-label">What would you like to finish?<input ref={titleInput} value={title} disabled={pending} required maxLength={180} placeholder="Review five biology flashcards" onChange={event => setTitle(event.target.value)} /></label>
        <div className="nooks-plan-two"><label>Subject<input value={subject} disabled={pending} maxLength={60} placeholder="General" onChange={event => setSubject(event.target.value)} /></label><label>Do it by <span>(optional)</span><input type="date" disabled={pending} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label></div>
        <button className="nooks-plan-save" type="submit" disabled={pending || !title.trim()}>{pending ? <>Saving…</> : editing ? <><Check size={14} />Save changes</> : <><Plus size={14} />Add to your plan</>}</button>
      </form>
    </section><aside className="nooks-plan-library"><div className="nooks-plan-section-heading"><h2>From your library</h2><span>{artifacts.length} {artifacts.length === 1 ? 'item' : 'items'}</span></div><p>A few places you could pick up next.</p>{artifacts.length ? artifacts.slice(0, 4).map(artifact => <button type="button" className="nooks-plan-artifact" key={artifact.id} onClick={() => onOpen(artifact)}><span>{artifact.kind === 'note' ? 'NOTE' : artifact.kind === 'flashcards' ? 'FLASHCARDS' : artifact.kind.toUpperCase()}</span><strong>{artifact.title}</strong><small>{artifact.subject}<ArrowRight size={13} /></small></button>) : <div className="nooks-plan-library-empty">Your saved notes and practice will appear here.</div>}<div className="nooks-plan-tip"><CalendarDays size={17} strokeWidth={1.5} /><span>A small plan you can finish beats a long one you can’t start.</span></div></aside></div>
  </div>;
}
export default StudyPlan;
