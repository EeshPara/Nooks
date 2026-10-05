import type { CSSProperties } from 'react';
import './CompanionCatalog.css';

export type CompanionId = 'sleepy-dog' | 'cat' | 'sprout' | 'bunny' | 'fox' | 'capybara' | 'red-panda' | 'owl' | 'turtle' | 'bear' | 'ghost' | 'none';
export type CompanionDefinition = { id: CompanionId; name: string; caption: string; atlasCell?: number; foot: number; sizeScale?: number };
export const companionCatalog: CompanionDefinition[] = [
  { id: 'cat', name: 'Book cat', caption: 'Quiet company', foot: .84 },
  { id: 'sleepy-dog', name: 'Study dog', caption: 'Expert napper', foot: .768, sizeScale: 1.14 },
  { id: 'bunny', name: 'Scarf bunny', caption: 'Soft-eared friend', atlasCell: 0, foot: .935 },
  { id: 'fox', name: 'Amber fox', caption: 'Curious company', atlasCell: 1, foot: .935 },
  { id: 'capybara', name: 'Capybara', caption: 'Unhurried by nature', atlasCell: 2, foot: .937 },
  { id: 'red-panda', name: 'Red panda', caption: 'A cozy companion', atlasCell: 3, foot: .926 },
  { id: 'owl', name: 'Sleepy owl', caption: 'For late-night pages', atlasCell: 4, foot: .865, sizeScale: .91 },
  { id: 'turtle', name: 'Moss turtle', caption: 'At your own pace', atlasCell: 5, foot: .86, sizeScale: .92 },
  { id: 'bear', name: 'Honey bear', caption: 'Warm-hearted friend', atlasCell: 6, foot: .892 },
  { id: 'ghost', name: 'Paper ghost', caption: 'Gentle nook spirit', atlasCell: 7, foot: .862, sizeScale: .88 },
  { id: 'sprout', name: 'Desk plant', caption: 'Space to grow', foot: .88, sizeScale: .85 },
  { id: 'none', name: 'A nook to myself', caption: 'No companion', foot: 1 },
];
export function companionDefinition(kind: CompanionId): CompanionDefinition { return companionCatalog.find(item => item.id === kind) ?? companionCatalog[0]; }
export function CompanionArt({ kind, size = 72 }: { kind: CompanionId; size?: number }) {
  const definition = companionDefinition(kind);
  const style: CSSProperties = { width: size, height: size };
  if (definition.atlasCell !== undefined) return <span role="img" aria-label={definition.name} className="nook-painted-companion" style={{ ...style, backgroundPosition: `${definition.atlasCell % 4 / 3 * 100}% ${definition.atlasCell < 4 ? 0 : 100}%` }} />;
  if (kind === 'cat' || kind === 'sleepy-dog') return <img className="nook-existing-companion" style={style} src={kind === 'cat' ? '/images/study-cat.webp' : '/images/sleeping-dog.webp'} alt={definition.name} />;
  if (kind === 'sprout') return <span className="nook-companion-plant-art" role="img" aria-label="Desk plant" style={style}><span className="nook-companion-plant-inner"><i /><i /><i /><i /></span></span>;
  return <span className="nook-no-companion-art" style={style} aria-hidden="true">—</span>;
}

export function CompanionPicker({ value, onChange }: { value: CompanionId; onChange: (kind: CompanionId) => void }) {
  return <div className="nook-companion-picker" role="group" aria-label="Choose your study companion">{companionCatalog.map(companion => <button type="button" key={companion.id} className={value === companion.id ? 'is-selected' : ''} aria-pressed={value === companion.id} onClick={() => onChange(companion.id)}><CompanionArt kind={companion.id} size={67} /><strong>{companion.name}</strong><small>{companion.caption}</small><span className="nook-companion-choice-dot" aria-hidden="true" /></button>)}</div>;
}
