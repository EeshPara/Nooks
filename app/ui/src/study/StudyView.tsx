import { useEffect, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Artifact, ProgressEvent } from './types';
import './Study.css';
import './StudyClose.css';
import StudyEditor from './StudyEditor';
import FlashcardsSession from './FlashcardsSession';
import QuizSession from './QuizSession';

export interface StudyViewProps {
  artifact: Artifact;
  /** Unsaved chat previews practice locally until explicitly saved. */
  saved?: boolean;
  roomId?: string;
  onExit: () => void;
  /** Close the study surface; Library navigation remains onExit. */
  onClose?: () => void;
  onProgress: (event: ProgressEvent) => void;
  onSave?: (artifact: Artifact) => void | Promise<void | Artifact>;
  onEditingChange?: (editing: boolean) => void;
  recoveryScope?: string;
}

export default function StudyView(props: StudyViewProps) {
  const [editing, setEditing] = useState(false);
  const editingCallback = useRef(props.onEditingChange); editingCallback.current = props.onEditingChange;
  useEffect(() => { editingCallback.current?.(editing); return () => editingCallback.current?.(false); }, [editing]);
  return <div className="study-workspace"><div data-workspace-backdrop hidden={editing}><div className="study-edit-toolbar study-dismiss-toolbar">{props.onSave && <button className="study-secondary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit study set</button>}<button type="button" className="study-surface-close" aria-label="Close study material" title="Close study material" onClick={props.onClose ?? props.onExit}><X size={20} aria-hidden="true" /></button></div>{props.artifact.kind === 'flashcards'
    ? <FlashcardsSession key={`${props.artifact.id}-${props.artifact.revision ?? 1}-${props.artifact.updatedAt}-${props.saved===false?'preview':'saved'}`} {...props} />
    : <QuizSession key={`${props.artifact.id}-${props.artifact.revision ?? 1}-${props.artifact.updatedAt}-${props.saved===false?'preview':'saved'}`} {...props} />}</div>{editing && props.onSave && <StudyEditor recoveryScope={props.recoveryScope} artifact={props.artifact} onSave={props.onSave} onCancel={() => setEditing(false)} />}</div>;
}

export { StudyView };
