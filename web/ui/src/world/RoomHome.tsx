import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCrashDraft } from '../WorkspaceErrorBoundary';
import { ArrowRight, ArrowUp, Check, ChevronDown, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useBreakTimer } from './useBreakTimer';
import type { Artifact } from '../study/types';
import './StudyHome.css';
import { MovableWidget } from './WorkspaceLayout';

export interface RoomTimerProps { remaining:number; minutes:number; running:boolean; active:boolean; pending:boolean; disabled?:boolean; onStart:()=>void; onPause:()=>void; onReset:()=>void; onMinutes:(minutes:number)=>void }
export function RoomTimer(props:RoomTimerProps) {
 const breaks=useBreakTimer(props.active);const mode=breaks.mode;const breakLeft=breaks.remaining;const breaking=breaks.running;
 const focus=mode==='focus';const left=focus?props.remaining:breakLeft;const ticking=focus?props.running:breaking;
 return <section className="room-widget room-timer" aria-label="Pomodoro timer"><div className="widget-heading"><span>Focus timer</span><span className={`live-dot ${ticking?'on':''}`}/></div><div className="room-timer-tabs" role="group" aria-label="Timer mode">{(['focus','short','long'] as const).map(value=><button key={value} aria-pressed={mode===value} disabled={props.active||breaking} onClick={()=>{breaks.select(value);}}>{value==='focus'?'Pomodoro':value==='short'?'Short break':'Long break'}</button>)}</div><div className="room-digits" role="timer">{String(Math.floor(left/60)).padStart(2,'0')}<span>:</span>{String(left%60).padStart(2,'0')}</div><p>{focus?ticking?'Focus session in progress.':'Ready when you are.':ticking?'Break in progress.':'Time for a break.'}</p><div className="room-timer-actions"><button className="room-start" disabled={props.pending||props.disabled} onClick={()=>{if(focus){ticking?props.onPause():props.onStart();}else breaks.toggle();}}>{ticking?<Pause size={14}/>:<Play size={14} fill="currentColor"/>}{props.disabled?'Preview only':props.pending?'Saving…':ticking?'Pause':focus&&props.active?'Resume':'Begin session'}</button><button className="room-reset" aria-label="Reset timer" disabled={props.pending||props.disabled} onClick={()=>{if(focus)props.onReset();else breaks.reset();}}><RotateCcw size={15}/></button></div>{focus&&<label className="room-duration">Session length<input type="number" aria-label="Pomodoro minutes" min="1" max="180" value={props.minutes} disabled={props.active} onChange={e=>props.onMinutes(Math.max(1,Math.min(180,Number(e.target.value)||1)))}/><span>min</span></label>}</section>;
}

type RoomTask = { id: string; title: string; done: boolean; subject: string };
interface Props {
 displayName?: string;
 focusNotice?: string;
 journey?: ReactNode;
 rewardShelf?: ReactNode;
 name: string;
 tagline: string;
 timer: RoomTimerProps;
 tasks: RoomTask[];
 onToggleTask: (id: string) => void | Promise<void>;
 onDeleteTask: (id: string) => Promise<void>;
 onAddTask: (title: string) => Promise<void>;
 artifacts: Artifact[];
 onOpen: (artifact: Artifact) => void;
 onCreate: () => void;
 onLibrary: () => void;
 onCustomize: () => void;
 onPractice: () => void;
 onFocus: () => void;
 focusMinutes: number;
 xp: number;
 companion: string;
 sceneName: string;
 /** Last intentionally opened material, independent of the current nook. */
 resumeArtifactId?: string;
 onWriteNote?: () => void;
 onAsk?: (prompt: string) => void | Promise<void>;
 onCreateKind?: (kind: Artifact['kind'], prompt?: string) => void;
 onAddMaterial?: (prompt?: string) => void;
 chatHint?: string;
 /** The host supplies ChatGPT’s composer; never render a second chat input. */
 nativeChat?: boolean;
}

export function RoomHome(p: Props) {
 const [prompt, setPrompt] = useCrashDraft('home:prompt', '');
 const [sending, setSending] = useState(false);
 const [chatError, setChatError] = useState('');
 const [task, setTask] = useCrashDraft('home:task', '');
 const [savingTask, setSavingTask] = useState(false);
 const [taskError, setTaskError] = useState('');
 const [pendingTask, setPendingTask] = useState<string | null>(null);
 const [confirmReset, setConfirmReset] = useState(false);
 useEffect(() => { if (!p.timer.active) setConfirmReset(false); }, [p.timer.active]);
 const taskInput = useRef<HTMLInputElement>(null);
 const sendingRef = useRef(false);
 const taskBusyRef = useRef(false);
 const sorted = [...p.artifacts].sort((a, b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0));
 const continuing = sorted.find(item => item.id === p.resumeArtifactId) ?? sorted[0];
 const firstName = p.displayName?.trim().split(/\s+/)[0];
 const orderedTasks = [...p.tasks].sort((a,b) => Number(a.done)-Number(b.done));
 const completed = p.tasks.filter(item => item.done).length;
 const focusProgress = Math.max(0, Math.min(1, 1 - p.timer.remaining / Math.max(1,p.timer.minutes * 60))) * 100;
 const ask = async () => {
  if (!prompt.trim() || sendingRef.current || !p.onAsk) return;
  sendingRef.current = true; setSending(true); setChatError('');
  try { await p.onAsk(prompt.trim()); }
  catch (error) { setChatError(error instanceof Error ? error.message : 'Could not send. Your message is still here.'); }
  finally { sendingRef.current = false; setSending(false); }
 };
 const addTask = async () => {
  if (!task.trim() || taskBusyRef.current) return;
  taskBusyRef.current = true; setSavingTask(true); setTaskError('');
  try { await p.onAddTask(task.trim()); setTask(''); taskInput.current?.focus(); }
  catch (error) { setTaskError(error instanceof Error ? error.message : 'Could not save. Try again.'); }
  finally { taskBusyRef.current = false; setSavingTask(false); }
 };
 const toggleTask = async (id: string) => {
  if (taskBusyRef.current) return;
  taskBusyRef.current = true; setPendingTask(id); setTaskError('');
  try { await p.onToggleTask(id); }
  catch (error) { setTaskError(error instanceof Error ? error.message : 'Could not save. Try again.'); }
  finally { taskBusyRef.current = false; setPendingTask(null); }
 };
 const deleteTask = async (id: string) => {
  if (taskBusyRef.current) return;
  taskBusyRef.current = true; setPendingTask(id); setTaskError('');
  try { await p.onDeleteTask(id); }
  catch (error) { setTaskError(error instanceof Error ? error.message : 'Could not delete. Try again.'); }
  finally { taskBusyRef.current = false; setPendingTask(null); }
 };
 return <section className={`study-home study-home-welcome${p.nativeChat ? ' study-home-native' : ''}`} aria-label="Your study nook">
  <div className="study-home-welcome-position"><div className="study-home-content">
   <header className="study-home-heading">
    {firstName && <p className="study-home-greeting">Hi, {firstName}.</p>}
    <h1>Welcome to <span>{p.sceneName || 'your nook'}.</span></h1>
    <p>Your study sanctuary within ChatGPT</p>
    <button className="study-home-change" onClick={p.onCustomize}>Change nook <ChevronDown size={13} aria-hidden="true"/></button>
   </header>
   {!p.nativeChat && <form className={`study-home-composer ${sending ? 'is-sending' : ''}`} onSubmit={event => { event.preventDefault(); void ask(); }}>
    <textarea aria-label="Message ChatGPT" placeholder="Ask anything, or bring something to study…" rows={3} value={prompt} maxLength={25000} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} />
    <div className="study-home-composer-controls">
     <button type="button" className="study-home-source" onClick={() => p.onAddMaterial ? p.onAddMaterial(prompt) : p.onCreateKind ? p.onCreateKind('note',prompt) : p.onCreate()} aria-label="Add study material" title="Add study material"><Plus size={17} aria-hidden="true"/><span>Add material</span></button>
     <span>{p.chatHint || 'Study with ChatGPT'}</span>
     <button type="submit" className="study-home-send" aria-label={sending ? 'Sending message' : 'Send message'} disabled={!prompt.trim() || sending || !p.onAsk}><ArrowUp size={20} aria-hidden="true"/></button>
    </div>
   </form>}
   {!p.nativeChat && chatError && <p className="study-home-chat-error" role="alert">{chatError}</p>}
   {p.nativeChat && <p className="study-home-native-invitation">Ask ChatGPT, or choose something to study.</p>}
   <div className="study-home-quick-actions" aria-label="Create study material">
    {([['note','Notes'],['flashcards','Flashcards'],['quiz','Quiz'],['exam','Test']] as const).map(([kind,label]) => <button key={kind} onClick={() => p.onCreateKind ? p.onCreateKind(kind,p.nativeChat ? '' : prompt) : p.onCreate()}>{label}<ArrowRight size={12} aria-hidden="true"/></button>)}
   </div>
   {continuing && <button className="study-home-resume-link" onClick={() => p.onOpen(continuing)} title={continuing.title}><span>Pick up where you left off</span><strong>{continuing.title || 'Untitled note'}</strong><ArrowRight size={13} aria-hidden="true"/></button>}
  </div></div>
  <aside className="study-home-tools" aria-label="Focus and to-do">
   <MovableWidget id="timer" label="Pomodoro timer" className="study-home-timer-position"><section className={`study-home-timer study-home-widget ${p.timer.active ? 'is-active' : 'is-ready'}`} aria-label="Pomodoro timer">
    <div className="study-home-widget-heading"><h2>{p.timer.active ? 'Pomodoro' : 'Focus timer'}</h2><span>{p.timer.pending ? 'Saving…' : p.timer.active ? p.timer.running ? 'Focusing' : 'Paused' : `${p.timer.minutes} min`}</span></div>
    <div className="study-home-clock" role="timer" aria-label={`${Math.floor(p.timer.remaining / 60)} minutes ${p.timer.remaining % 60} seconds remaining`}>{String(Math.floor(p.timer.remaining / 60)).padStart(2,'0')}<span>:</span>{String(p.timer.remaining % 60).padStart(2,'0')}</div>
    {p.timer.active ? <div className="study-home-timer-progress" role="progressbar" aria-label="Focus session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(focusProgress)} aria-valuetext={`${Math.round(focusProgress)}% of session elapsed`}><span style={{width:`${focusProgress}%`}}/></div> : <>
     <p className="study-home-timer-state">Ready to begin</p>
     <div className="study-home-timer-presets" role="group" aria-label="Focus duration">
      {[15,25,50].map(minutes => <button key={minutes} aria-pressed={p.timer.minutes === minutes} disabled={p.timer.pending || p.timer.disabled} onClick={() => p.timer.onMinutes(minutes)}>{minutes}<span> min</span></button>)}
      <label className="study-home-timer-custom"><span>Custom</span><input aria-label="Custom focus minutes" type="number" inputMode="numeric" min="1" max="180" value={p.timer.minutes} disabled={p.timer.pending || p.timer.disabled} onChange={event => p.timer.onMinutes(Math.max(1,Math.min(180,Number(event.target.value) || 1)))}/><span>min</span></label>
     </div>
     <div className="study-home-timer-work"><span>Working on</span><strong>Independent study</strong><small>Time goes to {p.sceneName}</small></div>
    </>}
    <div className="study-home-timer-buttons"><button className="study-home-timer-start" disabled={p.timer.pending || p.timer.disabled} onClick={p.timer.running ? p.timer.onPause : p.timer.onStart}>{p.timer.running ? <Pause size={13} fill="currentColor" aria-hidden="true"/> : <Play size={13} fill="currentColor" aria-hidden="true"/>}{p.timer.pending ? 'Saving…' : p.timer.running ? 'Pause' : p.timer.active ? 'Resume' : 'Start'}</button><button className="study-home-timer-reset" aria-label="Reset focus timer" disabled={p.timer.pending || p.timer.disabled || !p.timer.active} onClick={() => setConfirmReset(true)}><RotateCcw size={14} aria-hidden="true"/></button></div>
    {confirmReset && p.timer.active && <div className="study-home-reset-confirm" role="group" aria-label="Discard this focus session?">
     <p>Discard this session? Its focus time will not be saved.</p>
     <div><button onClick={() => setConfirmReset(false)} disabled={p.timer.pending}>Keep session</button><button aria-label="Discard focus session" onClick={() => { setConfirmReset(false); p.timer.onReset(); }} disabled={p.timer.pending}>Discard</button></div>
    </div>}
    {p.focusNotice && <p className="study-home-focus-notice">{p.focusNotice}</p>}
   </section></MovableWidget>
   <MovableWidget id="tasks" label="To-do list" className="study-home-tasks-position"><section className="study-home-tasks study-home-widget" aria-label="To-do list">
    <div className="study-home-widget-heading"><h2>To-do</h2><span>{completed}/{p.tasks.length}</span></div>
    {orderedTasks.length ? <ul>{orderedTasks.map(item => <li key={item.id}><button className={item.done ? 'is-done' : ''} aria-pressed={item.done} disabled={!!pendingTask || savingTask} onClick={() => void toggleTask(item.id)}><span className="study-home-task-check" aria-hidden="true">{item.done && <Check size={11}/>}</span><span>{item.title}</span></button><button type="button" className="study-home-task-delete" aria-label={`Delete task: ${item.title}`} title="Delete task" disabled={!!pendingTask || savingTask} onClick={() => void deleteTask(item.id)}><X size={13} aria-hidden="true"/></button></li>)}</ul> : <p className="study-home-tasks-empty">What would you like to finish?</p>}
    <form onSubmit={event => { event.preventDefault(); void addTask(); }}><input ref={taskInput} aria-label="New task" placeholder="Add a task" value={task} maxLength={300} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();void addTask();}}} disabled={savingTask} onChange={event => setTask(event.target.value)} /><button type="button" onClick={() => void addTask()} disabled={!task.trim() || savingTask || !!pendingTask} aria-label={savingTask ? 'Saving task' : 'Add task'}><Plus size={16} aria-hidden="true"/></button></form>
    {taskError && <p className="study-home-task-error" role="alert">{taskError}</p>}
   </section></MovableWidget>
  </aside>
  <div className="study-home-collection-position"><aside className="study-home-collection" aria-label="Your nook collection">
   {p.journey}
   {p.rewardShelf && <div className="study-home-shelf">{p.rewardShelf}</div>}
  </aside></div>
 </section>;
}
