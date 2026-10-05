import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, History } from 'lucide-react';
import { OrganizationDialog } from './StudyLibrary';
import { errorMessage, friendlyTime, resultData } from './types';
import type { NoteProposal, NoteRevision, OrganizationTool, OrganizedArtifact } from './types';
import './NoteHistory.css';

export interface NoteHistoryProps {
  artifact: OrganizedArtifact;
  onTool: OrganizationTool;
  onApplied?: (artifact: OrganizedArtifact) => void;
  /** Root sets this while the editor has an unsaved human draft. Viewing is still allowed. */
  disabled?: boolean;
}
type HistoryData = { currentRevision: number; revisions: NoteRevision[]; proposals: NoteProposal[]; retention?: { revisionsPerNote: number; workspaceHistoryCharacters: number } };
type Comparison = { kind: 'revision' | 'proposal'; title: string; before: { title: string; content: string; revision: number }; after: { title: string; content: string; revision?: number }; proposal?: NoteProposal; stale?: boolean };

export default function NoteHistory({ artifact, onTool, onApplied, disabled = false }: NoteHistoryProps) {
  const [open, setOpen] = useState(false); const [data, setData] = useState<HistoryData | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const request = useRef(0); const tool = useRef(onTool); tool.current = onTool;
  useEffect(() => {
    if (!open) { request.current++; return; }
    const ticket = ++request.current; setBusy('history'); setComparison(null); setError('');
    tool.current('note_revision_list', { artifactId: artifact.id }).then(raw => { if (request.current === ticket) setData(resultData<HistoryData>(raw)); }).catch(reason => { if (request.current === ticket) setError(errorMessage(reason)); }).finally(() => { if (request.current === ticket) setBusy(''); });
    return () => { request.current++; };
  }, [open, artifact.id, artifact.revision]);

  async function wholeNote(version?: number) {
    let offset = 0; let content = ''; let first: any = null;
    for (let page = 0; page < 5; page++) {
      const result = resultData(await onTool('artifact_get', { artifactId: artifact.id, ...(version === undefined ? {} : { revision: version }), offset, maxChars: 40000 }));
      if (result.artifact.kind !== 'note') throw new Error('This saved item is not a note.');
      if (!first) first = result;
      if (result.artifact.revision !== first.artifact.revision) throw new Error('This note changed while it was loading. Open its history again to compare the current version.');
      content += result.artifact.content ?? '';
      if (content.length > 100000) throw new Error('This note is too large to compare here.');
      if (result.nextOffset === null || result.nextOffset === undefined) return { title: first.artifact.title as string, content, revision: first.artifact.revision as number };
      if (result.nextOffset <= offset) throw new Error('The note could not be loaded completely. Try again.');
      offset = result.nextOffset;
    }
    throw new Error('The note could not be loaded completely. Try again.');
  }
  async function loadRevision(item: NoteRevision) {
    const ticket = ++request.current; setBusy(`revision-${item.revision}`); setError(''); setNotice('');
    try { const [before, after] = await Promise.all([wholeNote(), wholeNote(item.revision)]); if (ticket === request.current) setComparison({ kind: 'revision', title: `Version ${item.revision}`, before, after }); }
    catch (reason) { if (ticket === request.current) setError(errorMessage(reason)); } finally { if (ticket === request.current) setBusy(''); }
  }
  async function loadProposal(item: NoteProposal) {
    const ticket = ++request.current; setBusy(`proposal-${item.id}`); setError(''); setNotice('');
    try {
      const result = resultData<{ proposal: NoteProposal & { content: string }; current: { title: string; content: string; revision: number } }>(await onTool('note_revision_get', { proposalId: item.id }));
      if (ticket === request.current) setComparison({ kind: 'proposal', title: 'Suggested changes', before: result.current, after: { title: result.proposal.title, content: result.proposal.content }, proposal: result.proposal, stale: result.proposal.baseRevision !== result.current.revision });
    } catch (reason) { if (ticket === request.current) setError(errorMessage(reason)); } finally { if (ticket === request.current) setBusy(''); }
  }
  async function apply() {
    if (!comparison || disabled || comparison.stale) return;
    setBusy('apply'); setError('');
    try {
      const result = resultData<{ artifact: OrganizedArtifact }>(await onTool(comparison.kind === 'proposal' ? 'note_revision_apply' : 'note_update', comparison.kind === 'proposal'
        ? { proposalId: comparison.proposal!.id, expectedRevision: comparison.before.revision, confirmed: true }
        : { artifactId: artifact.id, expectedRevision: comparison.before.revision, title: comparison.after.title, content: comparison.after.content }));
      onApplied?.(result.artifact); setComparison(null); setNotice(comparison.kind === 'proposal' ? 'Changes applied.' : 'Earlier text restored as a new version.');
      const refreshed = resultData<HistoryData>(await onTool('note_revision_list', { artifactId: artifact.id })); setData(refreshed);
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function discard(proposal: NoteProposal) {
    setBusy('discard'); setError('');
    try { resultData(await onTool('note_revision_discard', { proposalId: proposal.id })); setData(value => value ? { ...value, proposals: value.proposals.filter(item => item.id !== proposal.id) } : value); setComparison(null); setNotice('Suggestion discarded. Your saved note is unchanged.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  if (artifact.kind !== 'note') return null;
  return <>
    <button type="button" className="nooks-note-history-trigger" onClick={() => { setNotice(''); setOpen(true); }}><History size={14}/> Note history</button>
    {open && <OrganizationDialog title={comparison?.title ?? 'Note history'} onClose={() => setOpen(false)} busy={busy === 'apply' || busy === 'discard'} wide={!!comparison}><div className="nooks-note-history">
      {error && <p role="alert" className="nooks-org-error">{error}</p>}{notice && <p className="nooks-history-notice" role="status"><Check size={14}/>{notice}</p>}
      {comparison ? <>
        <button className="nooks-history-back" disabled={!!busy} onClick={() => setComparison(null)}><ArrowLeft size={14}/> All versions</button>
        {comparison.proposal?.reason && <p className="nooks-history-reason">{comparison.proposal.reason}</p>}
        <div className="nooks-note-comparison"><section><header><span>Current saved note</span><small>Version {comparison.before.revision}</small></header><h3>{comparison.before.title}</h3><pre>{comparison.before.content}</pre></section><section className="is-proposed"><header><span>{comparison.kind === 'proposal' ? 'Suggested note' : 'Earlier version'}</span>{comparison.after.revision && <small>Version {comparison.after.revision}</small>}</header><h3>{comparison.after.title}</h3><pre>{comparison.after.content}</pre></section></div>
        {comparison.stale && <p className="nooks-history-warning">This note has changed since the suggestion was created. Discard it and ask for a new suggestion based on the current version.</p>}
        {disabled && <p className="nooks-history-warning">You have an unsaved draft in the editor. Save or discard that draft before replacing the saved note.</p>}
        <footer className="nooks-history-actions">{comparison.proposal ? <button className="nooks-org-text" disabled={!!busy} onClick={() => discard(comparison.proposal!)}>{busy === 'discard' ? 'Discarding…' : 'Discard suggestion'}</button> : <span>Your current version stays in history.</span>}<button className="nooks-org-primary" disabled={!!busy || disabled || comparison.stale} onClick={apply}>{busy === 'apply' ? 'Saving…' : comparison.kind === 'proposal' ? 'Apply these changes' : 'Restore this version'}</button></footer>
      </> : <>
        <div className="nooks-history-current"><div><span>Current note</span><h3>{artifact.title}</h3></div><span>Version {data?.currentRevision ?? artifact.revision ?? 1}</span></div>
        {busy === 'history' ? <p className="nooks-history-empty" role="status">Loading saved versions…</p> : <>
          {!!data?.proposals.length && <section className="nooks-history-section"><h3>Suggestions to review</h3>{data.proposals.map(proposal => <div className="nooks-history-proposal" key={proposal.id}><button disabled={!!busy} onClick={() => loadProposal(proposal)}><strong>{proposal.title}</strong><span>{proposal.reason}</span><small>{proposal.stale ? 'Needs a new version' : `Based on version ${proposal.baseRevision}`}</small></button><button className="nooks-history-review" disabled={!!busy} onClick={() => loadProposal(proposal)}>{busy === `proposal-${proposal.id}` ? 'Opening…' : 'Review'}</button></div>)}</section>}
          <section className="nooks-history-section"><h3>Previous versions</h3>{data?.revisions.length ? data.revisions.map(item => <button className="nooks-history-version" key={item.id} disabled={!!busy} onClick={() => loadRevision(item)}><span>Version {item.revision}<small>{friendlyTime(item.savedAt)}</small></span><span>{busy === `revision-${item.revision}` ? 'Opening…' : 'View'}</span></button>) : <p className="nooks-history-empty">No earlier versions yet. Your next saved edit will appear here.</p>}</section>
          <p className="nooks-history-retention">Up to {data?.retention?.revisionsPerNote ?? 10} earlier versions per note, within your library’s history storage limit.</p>
        </>}
      </>}
    </div></OrganizationDialog>}
  </>;
}
