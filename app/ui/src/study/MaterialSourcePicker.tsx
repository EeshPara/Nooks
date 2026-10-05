import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Artifact } from './types';
import { filterStudyMaterials, MAX_SELECTED_MATERIALS, toggleMaterialSelection } from './materialSources';

const labels = { note: 'Note', flashcards: 'Flashcards', quiz: 'Quiz', exam: 'Exam' };

export function MaterialSourceChips({ materials, selectedIds, onRemove, pastedText, onEditPasted, onRemovePasted }: { materials: Artifact[]; selectedIds: string[]; onRemove: (id: string) => void; pastedText?: string; onEditPasted?: () => void; onRemovePasted?: () => void }) {
  if (!selectedIds.length && !pastedText?.trim()) return null;
  const byId = new Map(materials.map(material => [material.id, material]));
  return <div className="nooks-create-source-chips" aria-label="Selected material"><span>Using</span>{pastedText?.trim() && <span className="nooks-create-source-chip"><button className="nooks-create-pasted-chip" type="button" onClick={onEditPasted}>Pasted text</button><button type="button" aria-label="Remove pasted text from sources" onClick={onRemovePasted}><X size={12}/></button></span>}{selectedIds.map(id => {
    const material = byId.get(id);
    return <span className={`nooks-create-source-chip${material ? '' : ' is-unavailable'}`} key={id}>
      <span title={material?.title}>{material?.title || 'Unavailable item'}</span>
      <button type="button" aria-label={`Remove ${material?.title || 'unavailable item'} from sources`} onClick={() => onRemove(id)}><X size={12} /></button>
    </span>;
  })}</div>;
}

export default function MaterialSourcePicker({ materials, selectedIds, onChange, onClose, trigger }: {
  materials: Artifact[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: (restoreFocus?: boolean) => void;
  trigger?: RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Node)) return;
      if (panel.current?.contains(event.target) || trigger?.current?.contains(event.target)) return;
      close.current(false);
    };
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, [trigger]);
  useEffect(() => { search.current?.focus({ preventScroll: true }); }, []);
  const filtered = filterStudyMaterials(materials, query);
  const atLimit = selectedIds.length >= MAX_SELECTED_MATERIALS;
  return <section ref={panel} className="nooks-create-source-picker" aria-label="Choose saved material" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className="nooks-create-picker-heading"><strong>Choose material</strong><button type="button" className="nooks-material-close" aria-label="Close source picker" onClick={() => onClose()}><X size={16}/></button></div>
    <label className="nooks-create-source-search"><Search size={15} aria-hidden="true"/><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your library" aria-label="Search saved material" /></label>
    <div className="nooks-create-source-list">
      {filtered.map(material => {
        const selected = selectedIds.includes(material.id);
        return <label key={material.id} className={`nooks-create-source-row${selected ? ' is-selected' : ''}`}>
          <input type="checkbox" checked={selected} disabled={!selected && atLimit} onChange={() => onChange(toggleMaterialSelection(selectedIds, material.id))}/>
          <span className="nooks-create-source-tick" aria-hidden="true">{selected && <Check size={12}/>}</span>
          <span><strong>{material.title}</strong><small>{labels[material.kind]}{material.subject ? ` · ${material.subject}` : ''}</small></span>
        </label>;
      })}
      {!filtered.length && <p className="nooks-create-picker-empty">{materials.length ? 'No matching material.' : 'Your saved notes, cards, and quizzes will appear here.'}</p>}
    </div>
    <div className="nooks-create-picker-footer"><span aria-live="polite">{selectedIds.length ? `${selectedIds.length} selected${atLimit ? ' · maximum reached' : ''}` : 'Choose what to include'}</span><button type="button" onClick={() => onClose()}>Done</button></div>
  </section>;
}
