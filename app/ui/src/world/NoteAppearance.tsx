import { useEffect, useId, useRef, useState } from 'react';
import { Check, Palette, RotateCcw, X } from 'lucide-react';
import './NoteAppearance.css';

export type NoteAppearanceSettings = {
  paper: 'cream' | 'sage' | 'rose';
  font: 'serif' | 'sans' | 'mono';
  ruling: 'blank' | 'ruled' | 'dotted';
  large: boolean;
};

export const defaultNoteAppearance: NoteAppearanceSettings = { paper: 'cream', font: 'sans', ruling: 'blank', large: false };
export const noteAppearanceClasses = (value: NoteAppearanceSettings) => `note-sheet paper-${value.paper} type-${value.font} ruling-${value.ruling}${value.large ? ' is-large' : ''}`;

function readAppearance(artifactId: string): NoteAppearanceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(`notable:note-appearance:v1:${encodeURIComponent(artifactId)}`) || 'null');
    if (!stored || typeof stored !== 'object') return { ...defaultNoteAppearance };
    return {
      paper: ['cream', 'sage', 'rose'].includes(stored.paper) ? stored.paper : defaultNoteAppearance.paper,
      font: ['serif', 'sans', 'mono'].includes(stored.font) ? stored.font : defaultNoteAppearance.font,
      ruling: ['blank', 'ruled', 'dotted'].includes(stored.ruling) ? stored.ruling : defaultNoteAppearance.ruling,
      large: stored.large === true,
    };
  } catch { return { ...defaultNoteAppearance }; }
}

export function NoteAppearance({ artifactId, onChange }: { artifactId: string; onChange?: (settings: NoteAppearanceSettings) => void }) {
  const [settings, setSettings] = useState(() => readAppearance(artifactId));
  const [open, setOpen] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const callback = useRef(onChange); callback.current = onChange;
  const id = useId();

  useEffect(() => {
    const initial = readAppearance(artifactId);
    setSettings(initial); setOpen(false); setStorageAvailable(true);
    callback.current?.(initial);
  }, [artifactId]);

  useEffect(() => {
    if (!open) return;
    wrapper.current?.querySelector<HTMLInputElement>('.note-appearance-popover input:checked')?.focus();
    const outside = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('click', outside, true);
    wrapper.current?.addEventListener('keydown', keyboard);
    const node = wrapper.current;
    return () => { document.removeEventListener('click', outside, true); node?.removeEventListener('keydown', keyboard); };
  }, [open]);

  function change(patch: Partial<NoteAppearanceSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try { localStorage.setItem(`notable:note-appearance:v1:${encodeURIComponent(artifactId)}`, JSON.stringify(next)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
    callback.current?.(next);
  }

  return <div className="note-appearance" ref={wrapper} onBlur={event => { if (event.relatedTarget && !wrapper.current?.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button className="note-appearance-trigger" ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-popover`} onClick={() => setOpen(value => !value)}><Palette size={16} /><span>Style this note</span></button>
    {open && <div className="note-appearance-popover" id={`${id}-popover`} role="dialog" aria-labelledby={`${id}-title`}>
      <div className="note-appearance-heading"><div><strong id={`${id}-title`}>Note style</strong><p>Paper, type, and spacing.</p></div><button className="note-appearance-close" type="button" aria-label="Close note styles" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16} /></button></div>
      <fieldset><legend>Paper</legend><div className="note-appearance-choices">
        {(['cream', 'sage', 'rose'] as const).map(paper => <label className="note-appearance-choice" key={paper}><input type="radio" name={`${id}-paper`} value={paper} checked={settings.paper === paper} onChange={() => change({ paper })} /><span className={`note-paper-swatch swatch-${paper}`}><i aria-hidden="true">Aa</i><span>{paper[0].toUpperCase() + paper.slice(1)}</span>{settings.paper === paper && <Check size={12} aria-hidden="true" />}</span></label>)}
      </div></fieldset>
      <fieldset><legend>Typeface</legend><div className="note-appearance-choices">
        {([{ value: 'serif', label: 'Bookish' }, { value: 'sans', label: 'Clean' }, { value: 'mono', label: 'Typewriter' }] as const).map(font => <label className="note-appearance-choice" key={font.value}><input type="radio" name={`${id}-font`} value={font.value} checked={settings.font === font.value} onChange={() => change({ font: font.value })} aria-label={`${font.label}, ${font.value} typeface`} /><span className={`note-type-swatch type-${font.value}`}><i aria-hidden="true">Aa</i><span>{font.label}</span></span></label>)}
      </div></fieldset>
      <fieldset><legend>Page texture</legend><div className="note-appearance-choices compact-choices">
        {(['blank', 'ruled', 'dotted'] as const).map(ruling => <label className="note-appearance-choice" key={ruling}><input type="radio" name={`${id}-ruling`} value={ruling} checked={settings.ruling === ruling} onChange={() => change({ ruling })} /><span>{ruling[0].toUpperCase() + ruling.slice(1)}</span></label>)}
      </div></fieldset>
      <label className="note-large-toggle"><span><strong>Larger text</strong><small>A little more space to read.</small></span><input type="checkbox" role="switch" checked={settings.large} onChange={event => change({ large: event.target.checked })} /><i aria-hidden="true" /></label>
      <div className="note-appearance-footer"><span role="status">{storageAvailable ? 'Saved on this device.' : 'Styles work here. Device storage is unavailable.'}</span><button type="button" onClick={() => change(defaultNoteAppearance)}><RotateCcw size={12} /> Reset</button></div>
    </div>}
  </div>;
}

export default NoteAppearance;
