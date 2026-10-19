import { DeferredStudySurface } from './DeferredStudySurface';
import { useLayoutEffect, useRef, useState } from 'react';
import type { NoteWorkspaceProps } from './NoteWorkspace';
import type { Artifact } from './types';
import { createNoteRecovery } from './noteRecovery';
import { leaveDeferredNote, protectDeferredNote } from './deferredNoteProtection';
import studyUrl from 'virtual:nooks-study-url';
import { createStudyContentLoader } from './studyContentLoader';
// Keep the practice/reference grid stable while its content is downloading.
import './StudyReference.css';
// Failed CSS preloads are cached by Vite; keep editor styles out of that retry path.
import './NoteWorkspace.css';
import '../world/NoteAppearance.css';
// Public-only split: native widgets still bundle their editor with the entry.
const loadContent = createStudyContentLoader<typeof import('./DeferredStudyContent')>(studyUrl, window.location.origin, import.meta.env.DEV);
const loadNote = () => loadContent().then(module => ({ default: module.NoteWorkspace }));
const loadReference = () => loadContent().then(module => ({ default: module.StudyReference }));

export function NoteWorkspace(props: NoteWorkspaceProps) {
  const pending = useRef({ dirty: false, transferred: false });
  const callbacks = useRef(props); callbacks.current = props;
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  useLayoutEffect(() => {
    const current = callbacks.current;
    const protection = protectDeferredNote(current.artifact, current.saved, createNoteRecovery(current.recoveryScope));
    pending.current = { dirty: protection.dirty, transferred: false };
    setRecoveryWarning(!protection.retained);
    current.onDirtyChange(protection.dirty);
    return () => { if (!pending.current.transferred) callbacks.current.onDirtyChange(false); };
  }, [props.artifact.id, props.recoveryScope]);
  const componentProps = { ...props, onDirtyChange: (dirty: boolean) => {
    pending.current.transferred = true;
    setRecoveryWarning(false);
    callbacks.current.onDirtyChange(dirty);
  } };
  const back = () => leaveDeferredNote(!pending.current.transferred && pending.current.dirty, message => window.confirm(message), props.onBack);
  return <>{recoveryWarning && <p role="alert">Keep this tab open until your note finishes loading. A recovery copy couldn’t be stored.</p>}<DeferredStudySurface load={loadNote} componentProps={componentProps} label="Note" onBack={back} backLabel="Back to library"/></>;
}
export function StudyReference(props: { artifact: Artifact; onClose: () => void }) {
  return <DeferredStudySurface load={loadReference} componentProps={props} label="Reference note" onBack={props.onClose} backLabel="Close reference note"/>;
}
