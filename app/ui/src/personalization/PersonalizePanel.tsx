import { useContext, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ImagePlus, Trash2, X } from 'lucide-react';
import { SpaceScene } from './SpaceScene';
import { defaultSpace, getRoomScene, roomCategories, roomScenes, RoomCategory, WorkspaceSpace } from './types';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import { consumeDismissEscape, isTopmostDismissTarget } from '../world/dismissal';
import { DraftRecoveryScope, useCrashDraft } from '../WorkspaceErrorBoundary';
import './Personalization.css';
import './RoomPicker.css';

export interface PersonalizePanelProps { space: WorkspaceSpace; onSave: (space: WorkspaceSpace) => void | Promise<void>; onClose: () => void; onAskChatGPT?: (prompt: string) => boolean | void | Promise<boolean | void> }
export async function optimizeRoomImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.');
  if (file.size > 12_000_000) throw new Error('Choose an image up to 12 MB.');
  let source: ImageBitmap | HTMLImageElement;
  if (typeof createImageBitmap === 'function') source = await createImageBitmap(file);
  else {
    const url = URL.createObjectURL(file);
    try { source = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('That image couldn’t open. Try another one.')); image.src = url; }); }
    finally { URL.revokeObjectURL(url); }
  }
  try {
    const width = source.width, height = source.height;
    if (!width || !height) throw new Error('That image couldn’t open. Try another one.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser couldn’t prepare this image. Try another browser.');
    let maxDimension = 1600;
    for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt++) {
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = '#eadbc5'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (let quality = .82; quality >= .33; quality -= .08) {
        const result = canvas.toDataURL('image/jpeg', quality);
        if (result.length <= 930_000) return result;
      }
      maxDimension = Math.round(maxDimension * .8);
    }
    throw new Error('This image couldn’t be optimized. Try a simpler image.');
  } finally { if ('close' in source) source.close(); }
}
export function useModalFocus(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button,input')?.focus();
    const key = (event: KeyboardEvent) => {
      if (consumeDismissEscape(event, ref.current)) close.current();
      if (event.key === 'Tab' && !event.defaultPrevented && isTopmostDismissTarget(ref.current)) {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select, a[href], [tabindex="0"]') ?? []).filter(node => node.offsetParent !== null);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow; window.removeEventListener('keydown', key);
      requestAnimationFrame(() => { if (previous?.isConnected && isTopmostDismissTarget(previous)) previous.focus({ preventScroll: true }); });
    };
  }, [ref]);
}

// Failed saves may be dismissed, but must reopen with the student's work intact.
// This is memory-only, owner-scoped, and bounded to four small appearance drafts.
const failedAppearanceDrafts = new Map<string, WorkspaceSpace>();
function appearanceDraftKey(owner: string, space: WorkspaceSpace) {
  return JSON.stringify([owner, space.name, space.tagline, space.theme, space.room ?? null, space.accent, space.companion, space.layout, space.decorations, space.backgroundImage ?? null]);
}
function retainFailedAppearance(key: string, draft: WorkspaceSpace) {
  const value = structuredClone(draft);
  if (key.length > 1_100_000 || JSON.stringify(value).length > 1_100_000) return false;
  failedAppearanceDrafts.delete(key); failedAppearanceDrafts.set(key, value);
  while (failedAppearanceDrafts.size > 4) failedAppearanceDrafts.delete(failedAppearanceDrafts.keys().next().value!);
  return true;
}

export default function PersonalizePanel({ space, onSave, onClose, onAskChatGPT }: PersonalizePanelProps) {
  const owner = useContext(DraftRecoveryScope);
  const origin = useRef({ owner, key: appearanceDraftKey(owner, space) });
  if (origin.current.owner !== owner) origin.current = { owner, key: appearanceDraftKey(owner, space) };
  const [draft, setDraft] = useCrashDraft<WorkspaceSpace>('personalize:space', () => structuredClone(failedAppearanceDrafts.get(origin.current.key) ?? { ...defaultSpace, ...space, decorations: space.decorations ?? defaultSpace.decorations }));
  const failedSave = useRef(false), saveInFlight = useRef(false), closeRequested = useRef(false), mounted = useRef(true);
  const lifetime = useRef(owner); lifetime.current = owner;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { failedSave.current = false; saveInFlight.current = false; closeRequested.current = false; setSaving(false); setError(''); }, [owner]);
  const [roomCategory, setRoomCategory] = useState<RoomCategory | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generationStyle, setGenerationStyle] = useCrashDraft('personalize:style', 'anime');
  const generator = useRef<HTMLElement>(null);
  const generatorLaunch = useRef<HTMLButtonElement>(null);
  const [prompt, setPrompt] = useCrashDraft('personalize:prompt', '');
  const [promptStatus, setPromptStatus] = useState('');
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const modal = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const softDismiss = useSoftDismiss(modal, () => { if (mounted.current && lifetime.current === owner) onClose(); });
  function dismiss() {
    if (!mounted.current || lifetime.current !== owner) return;
    if (saveInFlight.current) { closeRequested.current = true; return; }
    closeRequested.current = false;
    if (failedSave.current && !retainFailedAppearance(origin.current.key, draft)) { setError('Your draft is too large to keep after closing. Keep this panel open and retry saving.'); return; }
    softDismiss();
  }
  const dismissLatest = useRef(dismiss); dismissLatest.current = dismiss;
  const backdrop = useBackdropDismiss<HTMLDivElement>(() => dismiss());
  useModalFocus(modal, () => dismiss());
  function patch(value: Partial<WorkspaceSpace>) { setDraft(previous => ({ ...previous, ...value })); setError(''); }
  async function save() {
    if (saveInFlight.current) return;
    if (!draft.name.trim()) { setError('Give your nook a name.'); return; }
    const savedOwner = owner, savedKey = origin.current.key;
    const current = () => mounted.current && lifetime.current === savedOwner;
    saveInFlight.current = true; failedSave.current = false; setSaving(true); setError('');
    try {
      await onSave({ ...draft, name: draft.name.trim(), tagline: draft.tagline.trim() });
      if (!current()) return;
      failedAppearanceDrafts.delete(savedKey); failedSave.current = false; dismiss();
    }
    catch (reason) {
      if (!current()) return;
      failedSave.current = true;
      const artworkFailure = reason instanceof Error && ['ARTWORK_LIMIT', 'ARTWORK_CONFLICT'].includes((reason as Error & { code?: string }).code ?? '');
      setError(artworkFailure && reason.message ? `${reason.message} Your design is still here.` : 'Your changes couldn’t save. Your design is still here — try again.');
    }
    finally { if (current()) { saveInFlight.current = false; setSaving(false); if (closeRequested.current) dismissLatest.current(); } }
  }
  async function upload(image?: File) {
    if (!image || uploading) return;
    setUploading(true); setUploadStatus('Optimizing your image for this nook…'); setError('');
    try { patch({ backgroundImage: await optimizeRoomImage(image) }); setUploadStatus('Image resized and optimized. Your original file stays unchanged.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'That image couldn’t open. Try another one.'); setUploadStatus(''); }
    finally { setUploading(false); }
  }
  const generationStyles = [{ id: 'anime', title: 'Anime', detail: 'Painted background art, soft cinematic light' }, { id: 'illustrated', title: 'Illustrated', detail: 'Cozy hand-drawn storybook illustration' }, { id: 'watercolor', title: 'Watercolor', detail: 'Gentle pigment washes and paper texture' }, { id: 'pixel', title: 'Pixel', detail: 'Detailed pixel art with a warm retro palette' }, { id: 'dreamlike', title: 'Dreamlike', detail: 'Whimsical, luminous, gently surreal scenery' }, { id: 'photoreal', title: 'Photoreal', detail: 'Natural realistic materials and soft photographic light' }];
  const roomPrompt = `Use ChatGPT's built-in image generation to create one original widescreen 16:9 landscape background for my study nook in Nooks. Style: ${generationStyles.find(style => style.id === generationStyle)?.detail}. My nook idea: ${prompt.trim() || 'A cozy quiet place to study'}. Create an immersive full-bleed nook with believable perspective, a calm central area for later floating study controls, and warm natural surfaces. No interface controls, text, logos, watermarks, recognizable existing characters, or people. Make a single complete scene, not a collage. If built-in image generation is unavailable, tell me clearly. I will download the finished image and upload it into Nooks; do not claim it has automatically been applied.`;
  function focusGenerator() {
    const section = generator.current;
    const scroll = section?.closest<HTMLElement>('.personalize-scroll');
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (section && scroll) {
      const top = section.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 14;
      scroll.scrollTo({ top: Math.max(0, top), behavior });
    }
    section?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!generatorOpen) return;
    const frame = window.requestAnimationFrame(focusGenerator);
    return () => window.cancelAnimationFrame(frame);
  }, [generatorOpen]);
  function openGenerator() { setGeneratorOpen(true); if (generatorOpen) focusGenerator(); }
  function closeGenerator() { setGeneratorOpen(false); generatorLaunch.current?.focus({ preventScroll: true }); }
  async function copyPrompt() { try { await navigator.clipboard.writeText(roomPrompt); setPromptStatus('Prompt copied. Paste it into your ChatGPT conversation to create this nook.'); } catch { setPromptStatus('Clipboard access is unavailable. Open “View prompt” below and copy the text.'); } }
  async function ask() {
    if (!prompt.trim() || !onAskChatGPT) return;
    setAsking(true); setPromptStatus('');
    try {
      const result = await onAskChatGPT(roomPrompt);
      setPromptStatus(result === false ? 'Nook generation works inside ChatGPT. Copy this prompt into your conversation, then upload the finished image below.' : 'Your nook idea is in ChatGPT. Add the finished image below once it is ready.');
    } catch { setPromptStatus('Your idea couldn’t send. Try again, or copy the prompt into ChatGPT.'); }
    finally { setAsking(false); }
  }
  const roomStyleLabels = { cinematic: 'Painted', anime: 'Anime', illustrated: 'Illustrated', watercolor: 'Watercolor', pixel: 'Pixel', dreamlike: 'Dreamlike', photoreal: 'Photoreal' };
  const visibleRooms = roomScenes.filter(room => roomCategory === 'all' || room.category === roomCategory);
  const activeRoom = getRoomScene(draft);
  return <div className="personalize-overlay" {...backdrop}><div className="personalize-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="personalize-heading" onClick={event => event.stopPropagation()}><button type="button" className="personalize-close personalize-pinned-close" onClick={() => dismiss()} aria-label="Close customization"><X size={19} /></button><div className="personalize-preview"><div className="personalize-preview-label">Your nook preview<span>LIVE PREVIEW</span></div><SpaceScene space={draft} /><div className="personalize-preview-note"><span>Your nook, your pace.<br/>Your study material stays right where it is.</span></div></div><div className="personalize-controls"><div className="personalize-modal-heading"><div><span className="space-eyebrow">YOUR STUDY NOOK</span><h2 id="personalize-heading">Make it yours.</h2></div></div>
    <div className="personalize-scroll">
    <section className="nook-room-catalog"><div className="personalize-section-heading"><h3>Find your nook</h3><span>{roomScenes.length} illustrated nooks</span></div><button className="nook-generate-launch" ref={generatorLaunch} type="button" aria-expanded={generatorOpen} aria-controls="nook-room-generator" onClick={openGenerator}><strong>Generate a nook</strong><span>Imagine another place to study.</span><ArrowRight size={17}/></button><div className="nook-room-categories" role="group" aria-label="Nook categories">{roomCategories.map(category => <button key={category.id} type="button" aria-pressed={roomCategory === category.id} className={roomCategory === category.id ? 'is-selected' : ''} onClick={() => setRoomCategory(category.id)}>{category.title}</button>)}</div><div className="nook-room-grid">{visibleRooms.map(room => <button key={room.id} type="button" className={`nook-room-card ${!draft.backgroundImage && activeRoom.id === room.id ? 'is-selected' : ''}`} aria-pressed={!draft.backgroundImage && activeRoom.id === room.id} onClick={() => patch({ room: room.id, theme: room.theme, backgroundImage: undefined })}><span className="nook-room-thumbnail"><img src={room.image} alt="" loading="lazy" width={room.width} height={room.height} decoding="async"/><span className="nook-room-style">{roomStyleLabels[room.style]}</span>{!draft.backgroundImage && activeRoom.id === room.id && <i><Check size={13}/></i>}</span><strong>{room.title}</strong><small>{room.caption}</small></button>)}</div><p className="nook-room-count" aria-live="polite">{visibleRooms.length} {visibleRooms.length === 1 ? 'nook' : 'nooks'}{roomCategory !== 'all' ? ` in ${roomCategories.find(category => category.id === roomCategory)?.title}` : ' to settle into'}</p></section>
    {generatorOpen && <section id="nook-room-generator" className="nook-room-generator" ref={generator} aria-label="Generate a nook"><div className="personalize-section-heading"><h3>Generate a nook</h3><button className="nook-generator-close" type="button" aria-label="Close nook generator" onClick={closeGenerator}><X size={15}/></button></div><p>ChatGPT creates it in this conversation. Add the finished image below.</p><div className="nook-generation-styles" role="group" aria-label="Nook art style">{generationStyles.map(style => <button key={style.id} type="button" aria-pressed={generationStyle === style.id} className={generationStyle === style.id ? 'is-selected' : ''} onClick={() => setGenerationStyle(style.id)}>{style.title}</button>)}</div><label className="personalize-label">Describe your nook<textarea value={prompt} maxLength={1000} onChange={event => setPrompt(event.target.value)} rows={3} placeholder="A floating library in the clouds, a rainy anime café, a pixel-art cottage…"/></label><div className="nook-generation-actions"><button type="button" className="personalize-primary" disabled={asking || !prompt.trim() || !onAskChatGPT} onClick={ask}>{asking ? 'Sending to ChatGPT…' : 'Generate in ChatGPT'}</button><button type="button" className="personalize-secondary" onClick={copyPrompt}>Copy prompt</button></div>{!onAskChatGPT && <small>Open Nooks inside ChatGPT to generate a nook. You can copy this prompt from the preview.</small>}{promptStatus && <p className="nook-generation-status" role="status">{promptStatus}</p>}<details className="nook-prompt-details"><summary>View prompt</summary><textarea readOnly value={roomPrompt} rows={6} aria-label="Nook generation prompt" onFocus={event => event.target.select()}/></details></section>}
    <section><div className="personalize-section-heading"><h3>Nook artwork</h3><span>Optional background</span></div><div className="personalize-upload"><ImagePlus size={22} /><div><strong>{draft.backgroundImage ? 'Your background is ready' : 'Upload your nook artwork'}</strong><small>PNG, JPG, WebP · up to 12 MB · optimized automatically</small></div><input type="file" ref={file} accept="image/png,image/jpeg,image/webp" hidden onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /><button disabled={uploading} onClick={() => file.current?.click()}>{uploading ? 'Preparing…' : draft.backgroundImage ? 'Change' : 'Upload'}</button>{draft.backgroundImage && <button className="upload-remove" aria-label="Remove background image" onClick={() => patch({ backgroundImage: undefined })}><Trash2 size={15} /></button>}</div>{uploadStatus && <p className="personalize-upload-status" role="status">{uploadStatus}</p>}</section>
    <section><div className="personalize-section-heading"><h3>Nook name</h3></div><label className="personalize-label">Name<input maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} placeholder="My study nook" /></label><label className="personalize-label">Personal reminder<textarea maxLength={180} rows={2} value={draft.tagline} onChange={event => patch({ tagline: event.target.value })} placeholder="You’re growing, one idea at a time." /></label></section>
    <section><div className="personalize-section-heading"><h3>Layout</h3></div><div className="personalize-layouts">{([{ id: 'calm', name: 'Nook with a desk', caption: 'Study tools and your plan' }, { id: 'focused', name: 'Focus nook', caption: 'An open nook for concentration' }] as const).map(layout => <button key={layout.id} className={draft.layout === layout.id ? 'is-selected' : ''} aria-pressed={draft.layout === layout.id} onClick={() => patch({ layout: layout.id })}><strong>{layout.name}</strong><small>{layout.caption}</small></button>)}</div>{(['sparkles', 'stickers'] as const).map(decoration => <label className="personalize-toggle" key={decoration}><span><strong>{decoration === 'sparkles' ? 'Animated weather' : 'Personal reminder'}</strong><small>{decoration === 'sparkles' ? 'Gentle movement outside your nook' : 'Your message in the nook'}</small></span><input type="checkbox" checked={draft.decorations.includes(decoration)} onChange={event => patch({ decorations: event.target.checked ? [...draft.decorations, decoration] : draft.decorations.filter(item => item !== decoration) })} /><i aria-hidden="true" /></label>)}</section>
    {error && <p className="personalize-error" role="alert">{error}</p>}</div><div className="personalize-footer"><button className="personalize-secondary" onClick={() => dismiss()}>Cancel</button><button className="personalize-primary" disabled={saving || uploading} onClick={save}><Check size={16} /> {saving ? 'Saving…' : 'Save nook'}</button></div></div></div></div>;
}
