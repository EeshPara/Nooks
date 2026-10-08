import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { DraftRecoveryScope, useCrashDraft } from '../WorkspaceErrorBoundary';
import { nooksAccount } from '../account/client';
import { getNativeRecoveryScope } from '../study/studyRecoveryScope';
import { createArtworkCancellationStore } from './artworkCancellationStore';
import { getAuthorizedFileDownloadUrl, getFileCapabilities, isEmbedded, isPublicPreview, requestChatGPT, selectAuthorizedFiles } from '../bridge';
import { importArtworkFile } from './artworkImport';
import { artworkIntent, awaitingArtwork, cancelSavedArtwork, createArtworkRequestController, mergeCompletedArtwork, type ArtworkImportState, type ArtworkRequest } from './artworkRequests';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Copy, Plus, Search, Upload, X } from 'lucide-react';
import { optimizeRoomImage } from '../personalization/PersonalizePanel';
import { defaultSpace, roomCategories, allRoomScenes, roomScenes, safeBackgroundImage } from '../personalization/types';
import type { RoomScene, WorkspaceSpace } from '../personalization/types';
import { errorMessage, resultData, shortDate } from '../organization/types';
import type { OrganizationTool } from '../organization/types';
import { useSoftDismiss } from '../world/useSoftDismiss';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import './NookStudio.css';

type ArtStyle = 'illustration' | 'anime' | 'watercolor' | 'pixel' | 'realistic' | 'cinematic';
type ArtworkMode = 'curated' | 'upload' | 'chatgpt';
type Visibility = 'private' | 'public';
type Draft = { id: string; title: string; description: string; revision: number; space: WorkspaceSpace; style: ArtStyle; artworkMode: ArtworkMode; scenePrompt: string; visibility: Visibility; pathTemplate: 'none'; artworkRequest?: ArtworkRequest; createdAt?: string; updatedAt?: string };
type DraftSummary = Pick<Draft, 'id' | 'title' | 'description' | 'revision' | 'style' | 'artworkMode' | 'visibility' | 'createdAt' | 'updatedAt'> & { roomId: string; hasArtwork: boolean };
type Publication = { id: string; draftId: string; draftRevision: number; visibility: Visibility; status: 'prepared' | 'publishing' | 'retry-needed' | 'published' | 'failed' | 'discarded'; nookId?: string; createdAt?: string; manifest?: { title: string; description: string; roomId: string; visibility: Visibility } };
type Readiness = { readyToPublish: boolean; blockers: { code: string; message: string }[] };
export interface NookStudioProps { open?: boolean; onClose: () => void; onTool: OrganizationTool; onPublished?: (nook: any) => void; onPreview?: (space: WorkspaceSpace, presentation?: { isCurrent: () => boolean }) => void | Promise<void>; canPublish?: boolean; initialDraftId?: string; initialDraftRequest?: number; onDraftSelected?: (id: string) => void }
const styleLabels: Record<ArtStyle, string> = { illustration: 'Illustration', anime: 'Anime', watercolor: 'Watercolor', pixel: 'Pixel art', realistic: 'Realistic', cinematic: 'Cinematic' };
const sceneStyle = (scene: RoomScene): ArtStyle => scene.style === 'illustrated' ? 'illustration' : scene.style === 'photoreal' ? 'realistic' : scene.style === 'dreamlike' ? 'cinematic' : scene.style;
const newDraft = (): Draft => ({ id: crypto.randomUUID(), title: '', description: '', revision: 0, space: { ...defaultSpace, room: roomScenes[0].id, theme: roomScenes[0].theme, accent: '#e9ab86', companion: 'none', decorations: [] }, style: sceneStyle(roomScenes[0]), artworkMode: 'chatgpt', scenePrompt: '', visibility: 'private', pathTemplate: 'none' });
function payload(draft: Draft) {
  const { theme, room, accent, companion, layout, decorations, backgroundImage } = draft.space;
  return { id: draft.id, title: draft.title.trim(), description: draft.description.trim(), space: { theme, room, accent, companion, layout, decorations, ...(backgroundImage !== undefined ? { backgroundImage } : {}) }, style: draft.style, artworkMode: draft.artworkMode, scenePrompt: draft.scenePrompt.trim(), visibility: draft.visibility, pathTemplate: 'none' as const };
}
const snapshot = (draft: Draft) => JSON.stringify(payload(draft));
function summarized(draft: Draft): DraftSummary { return { id: draft.id, title: draft.title, description: draft.description, revision: draft.revision, style: draft.style, artworkMode: draft.artworkMode, visibility: draft.visibility, createdAt: draft.createdAt, updatedAt: draft.updatedAt, roomId: draft.space.backgroundImage ? 'custom' : draft.space.room ?? roomScenes[0].id, hasArtwork: !!draft.space.backgroundImage }; }
const publicationPending = (item: Publication) => ['prepared', 'publishing', 'retry-needed'].includes(item.status);

export default function NookStudio({ open = true, onClose, onTool, onPublished, onPreview, canPublish = false, initialDraftId, initialDraftRequest = 0, onDraftSelected }: NookStudioProps) {
  const [draft, setDraft] = useCrashDraft<Draft>('nook-studio:draft', newDraft); const [savedSnapshot, setSavedSnapshot] = useCrashDraft('nook-studio:snapshot', () => '');
  const [drafts, setDrafts] = useState<DraftSummary[]>([]); const [publications, setPublications] = useState<Publication[]>([]);
  const [stage, setStage] = useState<'edit' | 'review' | 'confirm' | 'published'>('edit');
  const [review, setReview] = useState<Draft | null>(null); const [intent, setIntent] = useState<Publication | null>(null); const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [published, setPublished] = useState<any>(null); const [conflict, setConflict] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [loadingDrafts, setLoadingDrafts] = useState(true); const [listError, setListError] = useState('');
  const [category, setCategory] = useState('all'); const [sceneSearch, setSceneSearch] = useState(''); const [showPrompt, setShowPrompt] = useState(false); const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const visibility = useRef({ propOpen: open, visible: open, epoch: 0 });
  if (visibility.current.propOpen !== open) { visibility.current = { propOpen: open, visible: open, epoch: visibility.current.epoch + 1 }; }
  const dismissRef = useRef<(() => void) | null>(null);
  const handledInitialDraft = useRef<{ id?: string; request: number }>({ request: -1 });
  const leavePrompt = useRef<HTMLElement>(null);
  const owner = useContext(DraftRecoveryScope), ownerRef = useRef(owner); ownerRef.current = owner;
  const currentDraft = useRef(draft); currentDraft.current = draft;
  const currentSnapshot = useRef(savedSnapshot); currentSnapshot.current = savedSnapshot;
  const currentBusy = useRef(busy); currentBusy.current = busy;
  const [artworkState, setArtworkState] = useState<ArtworkImportState>({ phase: 'waiting' });
  const artworkController = useRef<ReturnType<typeof createArtworkRequestController<Draft>> | null>(null);
  const cancelingArtwork = useRef<Promise<unknown> | null>(null);
  const cancellationStore = useMemo(() => createArtworkCancellationStore(owner), [owner]);
  const localCancellation = useRef<{ scope: string; draftId: string; requestId: string } | null>(null), cancellationUnsafe = useRef(false);
  const [, refreshCancellation] = useState(0);
  const cancelPending = pendingCancellation(draft);
  const artworkRequestKeys = useRef(new Map<string, string>());
  const uploadInput = useRef<HTMLInputElement>(null); const promptField = useRef<HTMLTextAreaElement>(null); const tool = useRef(onTool); tool.current = onTool;
  const requests = useRef(new Map<string, string>()); const headingId = useId(); const mounted = useRef(true);
  const dirty = savedSnapshot ? snapshot(draft) !== savedSnapshot : !!(draft.title.trim() || draft.description.trim() || draft.scenePrompt.trim() || draft.space.backgroundImage);
  const existingPending = publications.find(item => item.draftId === draft.id && item.draftRevision === draft.revision && publicationPending(item));
  const locked = existingPending && ['publishing', 'retry-needed'].includes(existingPending.status);
  const scene = allRoomScenes.find(item => item.id === draft.space.room) ?? roomScenes[0];
  const displayDraft = stage === 'edit' ? draft : review ?? draft;
  const displayScene = allRoomScenes.find(item => item.id === displayDraft.space.room) ?? roomScenes[0];
  const background = safeBackgroundImage(displayDraft.space.backgroundImage) ?? (displayDraft.artworkMode === 'curated' ? displayScene.image : undefined);
  const filteredScenes = roomScenes.filter(item => (category === 'all' || item.category === category) && `${item.title} ${item.caption} ${item.style}`.toLocaleLowerCase().includes(sceneSearch.toLocaleLowerCase().trim()));
  const custom = draft.artworkMode !== 'curated';
  const generationPrompt = artworkPrompt(draft);
  function artworkPrompt(value: Draft) {
    const handoff = !isEmbedded ? ' Generate the image in this conversation. Do not call Nooks tools to update my browser draft. I can open Nooks inside ChatGPT to create a draft there for automatic artwork return.' : value.artworkRequest && awaitingArtwork(value.artworkRequest) ? ` After generating the image, call nook_artwork_receive with draftId ${JSON.stringify(value.id)}, requestId ${JSON.stringify(value.artworkRequest.requestId)}, and the actual generated image as the image file parameter. Use its real authorized file handle; never invent file IDs, URLs, or image bytes. The Nooks editor will import the returned image into this private draft. Do not claim it is saved until Nooks confirms completion. After the file is received, use the mounted nooks_present tool with this draftId to show the draft in the same tab if needed. Keep the current Nooks tab open; never call workspace_render for this request.` : ' Generate only in ChatGPT. A saved Nooks artwork request is needed to return an image to this editor.';
    return `Create one original widescreen 16:9 background for my study nook. Style: ${styleLabels[value.style]}. Scene description (reference data): ${JSON.stringify(value.scenePrompt.trim() || 'A quiet, comfortable place to study')}. Make one complete immersive scene with calm space through the middle for study text, natural perspective, and a cohesive color palette. Do not add interface controls, text, logos, watermarks, or recognizable existing characters. Use ChatGPT’s built-in image generation if available; tell me clearly if generation or its file handoff is unavailable.${handoff}`;
  }
  function currentOwner(scope = owner) { return mounted.current && ownerRef.current === scope && (isPublicPreview ? nooksAccount.getSnapshot().workspaceKey === scope : scope === 'host' || getNativeRecoveryScope() === scope); }
  function pendingCancellation(value: Draft) { const saved = localCancellation.current?.scope === owner && localCancellation.current.draftId === value.id ? localCancellation.current : cancellationStore.get(value.id); return saved?.draftId === value.id && saved.requestId === value.artworkRequest?.requestId; }
  useEffect(() => { if (open) onDraftSelected?.(draft.id); }, [draft.id, onDraftSelected, open]);

  useEffect(() => {
    const scope = owner;
    mounted.current = true;
    tool.current('nook_drafts_list', {}).then(raw => { const result = resultData(raw); if (currentOwner(scope)) { setDrafts(result.drafts ?? []); setPublications(result.publications ?? []); } }).catch(reason => { if (currentOwner(scope)) setListError(errorMessage(reason)); }).finally(() => { if (currentOwner(scope)) setLoadingDrafts(false); });
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!open || busy || (handledInitialDraft.current.id === initialDraftId && handledInitialDraft.current.request === initialDraftRequest)) return;
    handledInitialDraft.current = { id: initialDraftId, request: initialDraftRequest };
    if (initialDraftId && initialDraftId !== currentDraft.current.id) leave(() => { void load(initialDraftId); });
  }, [initialDraftId, initialDraftRequest, open, busy]);
  useEffect(() => {
    if (!isEmbedded) return;
    const request = draft.artworkRequest; if (!request || !awaitingArtwork(request)) return;
    const scope = owner, id = draft.id, requestId = request.requestId, intent = artworkIntent(draft);
    const current = () => currentOwner(scope) && !pendingCancellation(currentDraft.current) && currentDraft.current.id === id && currentDraft.current.artworkRequest?.requestId === requestId && awaitingArtwork(currentDraft.current.artworkRequest) && artworkIntent(currentDraft.current) === intent;
    const controller = createArtworkRequestController<Draft>({
      draftId: id, requestId, current, hidden: () => document.hidden, blocked: () => !!currentBusy.current,
      read: async () => resultData(await tool.current('nook_draft_get', { draftId: id })).draft,
      importFile: (file, signal) => importArtworkFile(file, { getDownloadUrl: getAuthorizedFileDownloadUrl, optimize: optimizeRoomImage, signal }),
      complete: async (fileId, backgroundImage) => resultData(await tool.current('nook_artwork_complete', { draftId: id, requestId, fileId, backgroundImage })).draft,
      request: incoming => {
        if (!current()) return;
        const next = { ...currentDraft.current, artworkRequest: incoming }; currentDraft.current = next; setDraft(next);
      },
      accept: incoming => {
        if (!current()) return false;
        let baseline: Draft; try { baseline = JSON.parse(currentSnapshot.current); } catch { setConflict(incoming); return false; }
        const merged = mergeCompletedArtwork(currentDraft.current, baseline, incoming);
        if (!merged) { setConflict(incoming); return false; }
        currentDraft.current = merged; setDraft(merged); currentSnapshot.current = snapshot(incoming); setSavedSnapshot(currentSnapshot.current);
        setDrafts(items => [summarized(incoming), ...items.filter(item => item.id !== id)]); setConflict(null);
        setNotice(snapshot(merged) === snapshot(incoming) ? 'Your artwork is saved and ready to preview.' : 'Your artwork is saved. Your other edits are still here; save them when you are ready.');
        return true;
      },
      state: state => { if (currentOwner(scope) && currentDraft.current.id === id) setArtworkState(state); },
    });
    artworkController.current = controller; controller.start();
    const wake = () => controller.wake(); document.addEventListener('visibilitychange', wake);
    return () => { controller.stop(); document.removeEventListener('visibilitychange', wake); if (artworkController.current === controller) artworkController.current = null; };
  }, [owner, draft.id, draft.artworkRequest?.requestId, awaitingArtwork(draft.artworkRequest)]);
  function cancelArtwork(value = currentDraft.current) {
    const request = value.artworkRequest; if (!request || !awaitingArtwork(request)) return value;
    artworkController.current?.stop();
    if (cancelingArtwork.current) return value;
    const scope = owner, id = value.id, record = { draftId: id, requestId: request.requestId };
    localCancellation.current = { ...record, scope };
    let retained = false; try { retained = cancellationStore.retain(record); } catch { /* The selected request stays paused in its mounted editor. */ }
    cancellationUnsafe.current = !retained;
    refreshCancellation(version => version + 1);
    setArtworkState({ phase: 'checking', message: retained ? 'Canceling this image request…' : 'Canceling this image request… Keep this Nooks tab open until cancellation is confirmed.' });
    const promise = cancelSavedArtwork<Draft>({ ...record, current: () => currentOwner(scope), cancel: async () => resultData(await tool.current('nook_artwork_cancel', record)).draft, read: async () => resultData(await tool.current('nook_draft_get', { draftId: id })).draft }).then(incoming => {
      cancellationStore.acknowledge(record); if (localCancellation.current?.scope === scope && localCancellation.current?.requestId === record.requestId) { localCancellation.current = null; cancellationUnsafe.current = false; }
      if (!currentOwner(scope) || currentDraft.current.id !== id || currentDraft.current.artworkRequest?.requestId !== request.requestId) return;
      refreshCancellation(version => version + 1);
      if (incoming.artworkRequest?.status === 'completed') {
        let baseline: Draft; try { baseline = JSON.parse(currentSnapshot.current); } catch { setConflict(incoming); return; }
        const merged = mergeCompletedArtwork(currentDraft.current, baseline, incoming);
        if (merged) { currentDraft.current = merged; setDraft(merged); currentSnapshot.current = snapshot(incoming); setSavedSnapshot(currentSnapshot.current); }
        else setConflict(incoming);
        setArtworkState({ phase: 'error', message: 'This image finished saving before cancellation. Review the saved image, or remove or replace it in your draft.' });
      } else {
        const next = { ...currentDraft.current, artworkRequest: incoming.artworkRequest }; currentDraft.current = next; setDraft(next);
        setArtworkState({ phase: 'waiting' }); setNotice('Image request canceled. Your draft is still here.');
      }
    }).catch(() => {
      if (currentOwner(scope) && currentDraft.current.id === id) setArtworkState({ phase: 'error', message: 'Cancellation is not confirmed. Automatic image import is paused. Retry canceling when the connection is ready.' });
    }).finally(() => { if (cancelingArtwork.current === promise) cancelingArtwork.current = null; if (currentOwner(scope)) refreshCancellation(version => version + 1); });
    cancelingArtwork.current = promise; return value;
  }
  function patch(change: Partial<Draft>) {
    let value = currentDraft.current;
    if (artworkIntent({ ...value, ...change }) !== artworkIntent(value)) value = cancelArtwork(value);
    const next = { ...value, ...change }; currentDraft.current = next; setDraft(next); setNotice(''); setError(''); setConflict(null); setReadiness(null);
  }
  function requestClose() {
    if (!visibility.current.visible) return;
    // Closing only hides this retained editor. It never discards the draft,
    // interrupts a save, or needs a second confirmation to leave the screen.
    visibility.current.visible = false; visibility.current.epoch++;
    setPendingLeave(null);
    dismissRef.current?.();
  }
  function currentPresentation(ticket: number, scope = owner) { return currentOwner(scope) && visibility.current.visible && visibility.current.epoch === ticket; }
  useEffect(() => {
    if (!pendingLeave) return;
    leavePrompt.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    leavePrompt.current?.focus({ preventScroll: true });
  }, [pendingLeave]);
  function completeLeave() {
    if (pendingCancellation(currentDraft.current) && cancellationUnsafe.current) {
      setError('Keep this editor open and retry cancellation before leaving; this browser could not retain that request.');
      return;
    }
    const action = pendingLeave; setPendingLeave(null); action?.();
  }
  function leave(action: () => void) { if (busy) return; if (pendingCancellation(currentDraft.current) && cancellationUnsafe.current) { setError('Keep this editor open and retry cancellation before leaving; this browser could not retain that request.'); return; } if (dirty) setPendingLeave(() => action); else action(); }
  function adopt(value: Draft) { currentDraft.current = value; currentSnapshot.current = snapshot(value); setDraft(value); setSavedSnapshot(currentSnapshot.current); setDrafts(items => [summarized(value), ...items.filter(item => item.id !== value.id)]); setConflict(null); }
  async function refreshDrafts() { const scope = owner; setLoadingDrafts(true); setListError(''); try { const value = resultData(await onTool('nook_drafts_list', {})); if (!currentOwner(scope)) return; setDrafts(value.drafts ?? []); setPublications(value.publications ?? []); } catch (reason) { if (currentOwner(scope)) setListError(errorMessage(reason)); } finally { if (currentOwner(scope)) setLoadingDrafts(false); } }
  async function operate(key: string, work: () => Promise<void>) { currentBusy.current = key; setBusy(key); setError(''); setNotice(''); try { await work(); } catch (reason) { if (mounted.current) setError(errorMessage(reason)); } finally { currentBusy.current = ''; if (mounted.current) setBusy(''); } }
  async function saveDraft() {
    // Keep the focused button mounted and enabled, while synchronously rejecting
    // repeated activation before React has committed the busy presentation.
    if (currentBusy.current || locked || !currentDraft.current.title.trim()) return;
    await operate('save', async () => { await save(currentDraft.current); setNotice('Private draft saved.'); });
  }
  async function load(id: string) {
    const scope = owner;
    await operate('load', async () => { const result = resultData(await onTool('nook_draft_get', { draftId: id })); if (!currentOwner(scope)) return; adopt(result.draft); setReadiness(result.readiness); setStage('edit'); setReview(null); setIntent(null); setDeleteConfirm(false); });
  }
  function startNew() { artworkController.current?.stop(); const next = newDraft(); currentDraft.current = next; currentSnapshot.current = ''; setDraft(next); setSavedSnapshot(''); setStage('edit'); setReview(null); setIntent(null); setConflict(null); setDeleteConfirm(false); setError(''); setNotice(''); }
  async function save(candidate = draft): Promise<Draft> {
    const scope = owner;
    if (!candidate.title.trim()) throw new Error('Give your nook a name before saving.');
    if (candidate === draft && !dirty && draft.revision > 0) return draft;
    if (candidate.revision > 0 && snapshot(candidate) === currentSnapshot.current) return candidate;
    if (cancelingArtwork.current) await cancelingArtwork.current;
    if (!currentOwner(scope)) throw new Error('This nook editor has closed.');
    const submitted = payload(candidate);
    try {
      const result = resultData(await onTool('nook_draft_save', { draft: submitted, expectedRevision: candidate.revision })); if (!currentOwner(scope)) throw new Error('This nook editor has closed.'); adopt(result.draft); setReadiness(result.readiness); return result.draft;
    } catch (reason) {
      // A save response may be lost after it commits. The stable UUID lets us recover
      // that exact content without creating another draft or force-writing a revision.
      try {
        if (!currentOwner(scope)) throw reason;
        const latest = resultData(await onTool('nook_draft_get', { draftId: candidate.id })).draft as Draft;
        if (!currentOwner(scope)) throw reason;
        if (snapshot(latest) === JSON.stringify(submitted)) { adopt(latest); return latest; }
        if (latest.revision !== draft.revision) setConflict(latest);
      } catch { /* Keep the original save failure and the student's current draft. */ }
      throw reason;
    }
  }
  async function preview() {
    if (!onPreview) return;
    const scope = owner, ticket = visibility.current.epoch;
    await operate('preview', async () => {
      const saved = await save(); const result = resultData(await onTool('nook_draft_preview', { draftId: saved.id }));
      if (!currentPresentation(ticket, scope)) return;
      if (result.draft.revision !== saved.revision) { setConflict(result.draft); throw new Error('This draft changed on another screen. Review the saved version before using it.'); }
      if (result.draft.artworkMode !== 'curated' && !result.draft.space.backgroundImage) throw new Error('Choose your finished image first.');
      await onPreview({ ...result.draft.space, name: result.draft.title, tagline: result.draft.description }, { isCurrent: () => currentPresentation(ticket, scope) });
      if (currentOwner(scope)) setNotice('Your study backdrop is saved.');
    });
  }
  async function reviewPublication() {
    const scope = owner;
    await operate('review', async () => {
      const saved = await save(); const result = resultData(await onTool('nook_draft_preview', { draftId: saved.id }));
      if (!currentOwner(scope)) return;
      if (result.draft.revision !== saved.revision) { setConflict(result.draft); throw new Error('This draft changed after saving. Review the saved version before publishing.'); }
      const pending = publications.find(item => item.draftId === saved.id && item.draftRevision === saved.revision && publicationPending(item));
      setReview(pending ? { ...result.draft, visibility: pending.visibility } : result.draft); setReadiness(result.readiness); setIntent(pending ?? null); setStage('review');
    });
  }
  async function prepare() {
    if (!review || !canPublish || !readiness?.readyToPublish) return;
    const scope = owner;
    await operate('prepare', async () => {
      if (intent && intent.draftId === review.id && intent.draftRevision === review.revision && publicationPending(intent)) { setStage('confirm'); return; }
      const key = `${review.id}:${review.revision}:${review.visibility}`;
      let requestId = requests.current.get(key); if (!requestId) { requestId = crypto.randomUUID(); requests.current.set(key, requestId); }
      const result = resultData(await onTool('nook_publish_prepare', { draftId: review.id, expectedRevision: review.revision, requestId, visibility: review.visibility, reviewed: true }));
      if (!currentOwner(scope)) return;
      if (!result.prepared) { setReadiness(result.readiness); throw new Error('This draft is not ready to publish. Your private draft is saved.'); }
      setIntent(result.publication); setPublications(items => [result.publication, ...items.filter(item => item.id !== result.publication.id)]); setStage('confirm');
    });
  }
  async function publish() {
    if (!intent || !review || !canPublish || !readiness?.readyToPublish) return;
    const scope = owner, ticket = visibility.current.epoch;
    await operate('publish', async () => {
      let result: any;
      try { result = resultData(await onTool('nook_publish_commit', { intentId: intent.id, confirmed: true })); }
      catch (reason) {
        // Recover after an uncertain response using the already-reviewed intent. Never
        // prepare a fresh key merely because the previous publication timed out.
        let latest: Publication | undefined;
        try {
          const state = resultData(await onTool('nook_drafts_list', {}));
          if (!currentOwner(scope)) return;
          setDrafts(state.drafts ?? []); setPublications(state.publications ?? []);
          latest = (state.publications as Publication[] | undefined)?.find(item => item.id === intent.id);
        } catch { /* A failed status check must retain the original publication key. */ }
        if (!currentOwner(scope)) return;
        if (latest?.status === 'published' && latest.nookId) result = { publication: { ...intent, ...latest, manifest: intent.manifest ?? { title: review.title, description: review.description, roomId: review.artworkMode === 'curated' ? review.space.room : 'custom', visibility: review.visibility } } };
        else {
          const recoverable = { ...intent, ...latest, status: latest?.status ?? 'retry-needed' } as Publication;
          setIntent(recoverable); setPublications(items => [recoverable, ...items.filter(item => item.id !== intent.id)]);
          throw reason;
        }
      }
      if (!currentOwner(scope)) return;
      if (result.publication?.status !== 'published' || !result.publication.nookId) throw new Error('Publication has not been confirmed. Retry this same publication.');
      const manifest = result.publication.manifest;
      // A recovered receipt routes to a fresh membership/scene read. Its private
      // review manifest is not a directory entry and must not become UI appearance.
      const nook = result.nook ?? { id: result.publication.nookId, title: manifest?.title ?? review.title, description: manifest?.description ?? review.description, roomId: manifest?.roomId ?? (review.artworkMode === 'curated' ? review.space.room : 'custom'), visibility: result.publication.visibility, joined: true };
      setPublished(nook); setIntent(result.publication); setPublications(items => [result.publication, ...items.filter(item => item.id !== intent.id)]); setStage('published'); if (currentPresentation(ticket, scope)) onPublished?.(nook);
    });
  }
  async function upload(file?: File) {
    if (!file) return;
    const scope = owner;
    await operate('upload', async () => { const image = await optimizeRoomImage(file); if (!currentOwner(scope)) return; if (!safeBackgroundImage(image)) throw new Error('This image could not be prepared safely. Try another image.'); patch({ space: { ...draft.space, backgroundImage: image }, artworkMode: draft.artworkMode === 'chatgpt' ? 'chatgpt' : 'upload' }); setNotice('Image ready. Save your draft to keep it.'); });
  }
  async function askForArt() {
    const scope = owner, ticket = visibility.current.epoch;
    await operate('generate', async () => {
      if (!isEmbedded) {
        await save({ ...currentDraft.current, title: currentDraft.current.title.trim() || 'My custom study nook' });
        if (!currentOwner(scope)) return;
        setShowPrompt(true); setNotice('Your draft is saved here. Copy the drawing prompt into ChatGPT. Open Nooks inside ChatGPT to return artwork automatically.');
        return;
      }
      if (pendingCancellation(currentDraft.current)) throw new Error('Finish canceling the previous image request before asking for another image.');
      const saved = await save({ ...currentDraft.current, title: currentDraft.current.title.trim() || 'My custom study nook' });
      if (!currentOwner(scope)) return;
      let requested = saved;
      if (!awaitingArtwork(saved.artworkRequest)) {
        const key = `${saved.id}:${saved.revision}:${artworkIntent(saved)}:${['canceled', 'expired'].includes(saved.artworkRequest?.status ?? '') ? saved.artworkRequest?.requestId : ''}`;
        let requestId = artworkRequestKeys.current.get(key); if (!requestId) { requestId = crypto.randomUUID(); artworkRequestKeys.current.set(key, requestId); }
        requested = resultData(await onTool('nook_artwork_request', { draftId: saved.id, expectedRevision: saved.revision, requestId })).draft;
      }
      if (!currentOwner(scope) || currentDraft.current.id !== saved.id) return;
      if (!requested?.artworkRequest?.requestId || !awaitingArtwork(requested.artworkRequest)) throw new Error('The artwork request could not be opened. Your private draft is saved.');
      adopt(requested); setArtworkState({ phase: 'waiting' });
      if (!currentPresentation(ticket, scope)) return;
      const sent = await requestChatGPT(artworkPrompt(requested)); if (!currentOwner(scope)) return;
      setNotice(sent ? 'Request sent to ChatGPT. This editor will look for the returned image.' : 'Your draft is waiting for artwork. Copy this prompt into ChatGPT to continue.'); if (!sent) setShowPrompt(true);
    });
  }
  async function chooseChatGPTFile() {
    const scope = owner;
    await operate('choose-artwork', async () => {
      const files = await selectAuthorizedFiles(); if (!currentOwner(scope) || !files?.length) return;
      const file = files[0];
      const saved = await save({ ...currentDraft.current, title: currentDraft.current.title.trim() || 'My custom study nook', artworkMode: 'chatgpt', scenePrompt: currentDraft.current.scenePrompt.trim() || 'Use my selected artwork for this study nook.' });
      if (!currentOwner(scope)) return;
      const requested = resultData(await onTool('nook_artwork_request', { draftId: saved.id, expectedRevision: saved.revision, requestId: crypto.randomUUID() })).draft as Draft;
      if (!currentOwner(scope) || currentDraft.current.id !== saved.id) return;
      adopt(requested);
      if (!requested.artworkRequest?.requestId) throw new Error('The artwork request could not be opened. Your private draft is saved.');
      let downloadUrl: string | null;
      try { downloadUrl = await getAuthorizedFileDownloadUrl(file.fileId); } catch { throw new Error('ChatGPT could not authorize this file. Try selecting it again.'); }
      if (!currentOwner(scope)) return;
      if (!downloadUrl) throw new Error('This ChatGPT host cannot provide the selected file’s download yet. You can choose another image.');
      const received = resultData(await onTool('nook_artwork_receive', { draftId: saved.id, requestId: requested.artworkRequest.requestId, image: { file_id: file.fileId, download_url: downloadUrl, ...(file.mimeType ? { mime_type: file.mimeType } : {}), ...(file.fileName ? { file_name: file.fileName } : {}) } })).draft as Draft;
      if (!currentOwner(scope) || currentDraft.current.id !== saved.id) return;
      adopt(received); setArtworkState({ phase: 'waiting' }); setNotice('Selected image received. This editor will import it.'); artworkController.current?.wake();
    });
  }
  async function copyPrompt() { try { await navigator.clipboard.writeText(generationPrompt); setNotice('Prompt copied.'); } catch { setShowPrompt(true); setNotice('Select and copy the prompt below.'); requestAnimationFrame(() => promptField.current?.select()); } }
  function chooseScene(value: typeof roomScenes[number]) { patch({ space: { ...draft.space, room: value.id, theme: value.theme, backgroundImage: '' }, style: sceneStyle(value), artworkMode: 'curated' }); }
  async function discardDraft() { await operate('delete', async () => { resultData(await onTool('nook_draft_delete', { draftId: draft.id, expectedRevision: draft.revision })); setDrafts(items => items.filter(item => item.id !== draft.id)); startNew(); setNotice('Private draft deleted.'); }); }

  return open ? createPortal(<StudioSurface headingId={headingId} onClose={onClose} onRequestClose={requestClose} dismissRef={dismissRef}>
    <header className="nooks-studio-header"><div><h1 id={headingId}>Nook studio</h1><span>{stage === 'edit' ? 'A study place of your own' : stage === 'published' ? 'Your nook is published' : 'Review before sharing'}</span></div><button className="nooks-studio-icon" aria-label="Close nook studio" onClick={requestClose}><X size={19}/></button></header>
    <div className="nooks-studio-layout"><aside className="nooks-studio-drafts"><div className="nooks-studio-drafts-heading"><span>Your drafts</span><button aria-label="New nook draft" disabled={!!busy} onClick={() => leave(startNew)}><Plus size={16}/></button></div><button className="nooks-studio-new" disabled={!!busy} onClick={() => leave(startNew)}><Plus size={14}/> New nook</button>{loadingDrafts && <p role="status">Loading drafts…</p>}{listError && <div className="nooks-studio-list-error"><p>{listError}</p><button disabled={loadingDrafts} onClick={refreshDrafts}>Try again</button></div>}{drafts.map(item => <button key={item.id} disabled={!!busy} className={`nooks-studio-draft${item.id === draft.id ? ' is-selected' : ''}`} onClick={() => leave(() => { void load(item.id); })}><span className="nooks-studio-draft-thumbnail">{item.roomId === 'custom' ? <span>Custom</span> : <img src={(allRoomScenes.find(value => value.id === item.roomId) ?? roomScenes[0]).image} alt="" loading="lazy"/>}</span><span><strong>{item.title}</strong><small>{shortDate(item.updatedAt)} · Private draft</small></span></button>)}{!loadingDrafts && !drafts.length && !listError && <p className="nooks-studio-draft-empty">Saved drafts will be here when you return.</p>}{publications.some(item => item.status === 'published') && <p className="nooks-studio-published-count">{publications.filter(item => item.status === 'published').length} {publications.filter(item => item.status === 'published').length === 1 ? 'nook' : 'nooks'} published</p>}</aside>
    <main className="nooks-studio-main">
      {pendingLeave && <section ref={leavePrompt} tabIndex={-1} className="nooks-studio-leave" aria-label="Unsaved changes"><p>You have changes that are not saved yet.</p><div><button disabled={!!busy} onClick={() => setPendingLeave(null)}>Keep editing</button><button disabled={!!busy} onClick={completeLeave}>Leave without saving</button><button className="is-primary" disabled={!!busy || !draft.title.trim()} onClick={() => operate('save', async () => { await save(); completeLeave(); })}>Save and continue</button></div></section>}
      {(error || notice) && <div className={`nooks-studio-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><button aria-label="Dismiss message" onClick={() => { setError(''); setNotice(''); }}><X size={14}/></button></div>}
      {isEmbedded && (awaitingArtwork(draft.artworkRequest) || artworkState.phase === 'error' || draft.artworkRequest?.status === 'expired') && <section className="nooks-studio-artwork-status" aria-label="Artwork request"><p role={artworkState.phase === 'error' ? 'alert' : 'status'}>{artworkState.message ?? (cancelPending ? 'Cancellation is waiting for confirmation. Automatic image import is paused.' : draft.artworkRequest?.status === 'expired' ? 'This artwork request expired. Ask ChatGPT for a new image when you are ready.' : artworkState.phase === 'importing' ? 'Importing your image…' : artworkState.phase === 'saving' ? 'Saving your image to this private draft…' : 'Waiting for ChatGPT’s image. Your draft is saved; you can keep editing its name and description.')}</p><div>{cancelPending ? <button type="button" disabled={!!busy || !!cancelingArtwork.current} onClick={() => cancelArtwork()}>Retry cancellation</button> : awaitingArtwork(draft.artworkRequest) && <><button type="button" disabled={!!busy || artworkState.phase === 'importing' || artworkState.phase === 'saving'} onClick={() => artworkController.current?.retry()}>{artworkState.phase === 'error' ? 'Retry image import' : 'Check for image'}</button><button type="button" disabled={!!busy} onClick={() => { cancelArtwork(); }}>Cancel image request</button>{draft.artworkRequest?.status === 'pending' && <button type="button" disabled={!!busy} onClick={askForArt}>Send prompt again</button>}</>}</div></section>}
      {conflict && <section className="nooks-studio-conflict"><p>A newer saved version is available. Your edits are still on this screen.</p><div><button disabled={!!busy} onClick={() => { adopt(conflict); setStage('edit'); setError(''); }}>Load saved version {conflict.revision}</button><button disabled={!!busy} onClick={() => { setDraft(value => ({ ...value, id: crypto.randomUUID(), revision: 0, createdAt: undefined, updatedAt: undefined })); setSavedSnapshot(''); setConflict(null); setError(''); setNotice('Your edits are now a separate draft. Save it when you are ready.'); }}>Keep my edits as a new draft</button></div></section>}
      {stage !== 'edit' && stage !== 'published' && <button className="nooks-studio-back" disabled={!!busy} onClick={() => { setStage('edit'); setError(''); }}><ArrowLeft size={14}/> Back to draft</button>}
      <div className={`nooks-studio-preview${background ? '' : ' is-empty'}`}>
        {background ? <><img src={background} alt={displayDraft.artworkMode === 'curated' ? displayScene.title : 'Your selected nook artwork'}/><div className="nooks-studio-preview-caption"><span>{stage === 'edit' ? 'YOUR NOOK' : displayDraft.visibility === 'public' ? 'PUBLIC NOOK' : 'INVITATION-ONLY NOOK'}</span><h2>{displayDraft.title.trim() || 'Your next study nook'}</h2>{displayDraft.description.trim() && <p>{displayDraft.description}</p>}</div></> : <div><Upload size={24}/><h2>Your artwork goes here</h2><p>{isEmbedded && awaitingArtwork(draft.artworkRequest) ? 'Waiting for the image from ChatGPT. It will appear here after import and saving.' : 'Describe a scene or choose an image to see your nook.'}</p><button disabled={!!busy} onClick={() => uploadInput.current?.click()}>Choose image</button></div>}
      </div>
      {stage === 'edit' ? <>
        {existingPending && <div className="nooks-studio-pending"><p>{locked ? 'A publication needs to be finished before this draft can be edited.' : 'This version has a publication ready to review.'}</p><button disabled={!!busy || !canPublish} onClick={reviewPublication}>Review publication<ArrowRight size={14}/></button></div>}
        <fieldset className="nooks-studio-editor" disabled={!!busy || !!locked}><div className="nooks-studio-fields"><label>Nook name<input maxLength={54} value={draft.title} placeholder="After-hours café" onChange={event => patch({ title: event.target.value })}/></label><label>Description <span>Optional</span><textarea rows={2} maxLength={220} value={draft.description} placeholder="A quiet place for late-night work and good company." onChange={event => patch({ description: event.target.value })}/></label></div>
        <div className="nooks-studio-source-tabs" aria-label="Choose nook artwork">{([['chatgpt', 'Generate with AI'], ['curated', 'Choose a scene'], ['upload', 'Upload']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={draft.artworkMode === value} className={draft.artworkMode === value ? 'is-active' : ''} onClick={() => patch({ artworkMode: value, ...(value === 'curated' ? { space: { ...draft.space, backgroundImage: '' } } : {}) })}>{label}</button>)}</div>
        {draft.artworkMode === 'curated' ? <section className="nooks-studio-scenes"><div className="nooks-studio-scene-tools"><div aria-label="Scene category"><button className={category === 'all' ? 'is-active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>{roomCategories.filter(item => item.id !== 'all').map(item => <button key={item.id} className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.title}</button>)}</div><label><Search size={14}/><input type="search" aria-label="Search nook scenes" value={sceneSearch} onChange={event => setSceneSearch(event.target.value)} placeholder="Find a scene"/></label></div><div className="nooks-studio-scene-grid">{filteredScenes.map(item => <button key={item.id} className={item.id === scene.id ? 'is-selected' : ''} aria-pressed={item.id === scene.id} onClick={() => chooseScene(item)}><span><img src={item.thumbnail} alt="" loading="lazy" width={item.width} height={item.height}/>{item.id === scene.id && <i><Check size={13}/></i>}</span><strong>{item.title}</strong></button>)}</div>{!filteredScenes.length && <p className="nooks-studio-empty">No scenes match that search.</p>}</section> : <section className="nooks-studio-art">
          {draft.artworkMode === 'chatgpt' && <><div className="nooks-studio-styles" aria-label="Artwork style">{(Object.keys(styleLabels) as ArtStyle[]).map(value => <button key={value} className={draft.style === value ? 'is-active' : ''} aria-pressed={draft.style === value} onClick={() => patch({ style: value })}>{styleLabels[value]}</button>)}</div><label className="nooks-studio-setting">Describe your setting<textarea rows={3} maxLength={2000} value={draft.scenePrompt} onChange={event => patch({ scenePrompt: event.target.value })} placeholder="A tiny bookshop on a rainy street, warm desk lamps, a window seat…"/></label><div className="nooks-studio-generate-actions"><button className="nooks-studio-primary" disabled={!draft.scenePrompt.trim() || !!busy || isEmbedded && awaitingArtwork(draft.artworkRequest)} onClick={askForArt}>{busy === 'generate' ? isEmbedded ? 'Sending…' : 'Saving…' : isEmbedded ? 'Generate my nook' : 'Prepare drawing prompt'}</button><button className="nooks-studio-text-button" onClick={copyPrompt}><Copy size={13}/> Copy prompt</button></div><p className="nooks-studio-help">{isEmbedded ? 'ChatGPT creates the image in your conversation and returns its file to this private draft. Keep this Nooks tab open to import it. If your ChatGPT host cannot return a file, you can select an image instead.' : 'Copy a drawing prompt into ChatGPT, or upload an image here. Open Nooks inside ChatGPT to return artwork automatically.' + (isPublicPreview ? ' Website drafts stay in their separate library.' : '')}</p><details open={showPrompt} onToggle={event => setShowPrompt(event.currentTarget.open)}><summary>View the prompt</summary><textarea ref={promptField} readOnly value={generationPrompt} rows={5} aria-label="Image generation prompt" onFocus={event => event.target.select()}/></details></>}
          {isEmbedded && getFileCapabilities().select && <button type="button" className="nooks-studio-secondary" disabled={!!busy} onClick={chooseChatGPTFile}>Choose from ChatGPT</button>}<div className="nooks-studio-upload"><div><strong>{draft.space.backgroundImage ? 'Artwork selected' : 'Or upload an image'}</strong><span>PNG, JPG or WebP · up to 12 MB · optimized before saving</span></div><button className="nooks-studio-secondary" disabled={!!busy} onClick={() => uploadInput.current?.click()}>{busy === 'upload' ? 'Preparing…' : draft.space.backgroundImage ? 'Change image' : 'Choose image'}</button>{draft.space.backgroundImage && <button className="nooks-studio-text-button" aria-label="Remove selected artwork" onClick={() => patch({ space: { ...draft.space, backgroundImage: '' } })}>Remove</button>}</div><p className="nooks-studio-help">Custom artwork is saved privately. Shared nooks currently use gallery scenes.</p>
        </section>}
        <fieldset className="nooks-studio-audience"><legend>When you publish, who can join?</legend><label><input type="radio" name="nook-visibility" value="private" checked={draft.visibility === 'private'} onChange={() => patch({ visibility: 'private' })}/><span><strong>Only people you invite</strong><small>Private and invitation-only.</small></span></label><label><input type="radio" name="nook-visibility" value="public" checked={draft.visibility === 'public'} onChange={() => patch({ visibility: 'public' })}/><span><strong>Anyone</strong><small>Public listing with your nook’s name, description, and artwork.</small></span></label><p>Your draft stays private until you publish. Your notes and study materials are never part of this listing.</p></fieldset>
        </fieldset>
        {!canPublish && <p className="nooks-studio-availability">Connect your account to publish a shared nook. You can save a private draft now.</p>}
        {deleteConfirm && <section className="nooks-studio-delete"><p>Delete this private draft? Any nook already published from it will stay available.</p><div><button disabled={!!busy} onClick={() => setDeleteConfirm(false)}>Keep draft</button><button disabled={!!busy} onClick={discardDraft}>{busy === 'delete' ? 'Deleting…' : 'Delete draft'}</button></div></section>}
        <footer className="nooks-studio-footer"><div><span>{busy === 'save' ? 'Saving…' : dirty ? 'Unsaved changes' : draft.revision ? `Saved · Version ${draft.revision}` : 'Private draft'}</span>{draft.revision > 0 && !locked && <button disabled={!!busy} onClick={() => setDeleteConfirm(true)}>Delete draft</button>}</div><button className="nooks-studio-secondary" disabled={!!locked || !draft.title.trim()} aria-disabled={!!busy || !!locked || !draft.title.trim()} aria-busy={busy === 'save'} onClick={saveDraft}>Save draft</button>{onPreview && <button className="nooks-studio-secondary" disabled={!!busy || !draft.title.trim() || custom && !draft.space.backgroundImage} onClick={preview}>{busy === 'preview' ? 'Opening…' : 'Use this look'}</button>}<button className="nooks-studio-primary" disabled={!!busy || !draft.title.trim() || custom && !draft.space.backgroundImage || !canPublish} onClick={reviewPublication}>{busy === 'review' ? 'Opening…' : existingPending ? 'Review publication' : 'Review & publish'}<ArrowRight size={14}/></button></footer>
      </> : stage === 'published' ? <section className="nooks-studio-success"><h2>{published?.title ?? displayDraft.title} is ready.</h2><p>{displayDraft.visibility === 'public' ? 'People can discover and join this nook.' : 'Your nook is private. Invite people from its community panel.'}</p><button className="nooks-studio-primary" onClick={requestClose}>Done</button>{onPublished && published?.id && <button className="nooks-studio-secondary" onClick={() => onPublished(published)}>Study here</button>}</section> : <section className="nooks-studio-review"><h2>{stage === 'confirm' ? 'Publish this nook?' : 'Check your nook'}</h2><dl><div><dt>Name</dt><dd>{displayDraft.title}</dd></div><div><dt>Description</dt><dd>{displayDraft.description || 'No description'}</dd></div><div><dt>Scene</dt><dd>{displayDraft.artworkMode === 'curated' ? displayScene.title : 'Your selected artwork'}</dd></div><div><dt>Audience</dt><dd>{displayDraft.visibility === 'public' ? 'Anyone can discover and join' : 'Only invited people can join'}</dd></div></dl><p>{displayDraft.visibility === 'public' ? 'Publishing makes this name, description, and artwork publicly discoverable.' : 'Publishing creates an invitation-only study nook. It will not appear in public discovery.'} Your private notes, quizzes, flashcards, and artwork prompt stay private.</p><p className="nooks-studio-help">This creates a new community. Changes to this draft do not update an already published nook. Creator reward paths are not available yet.</p>{!readiness?.readyToPublish && <div className="nooks-studio-message is-error" role="alert">{readiness?.blockers.length ? <ul>{readiness.blockers.map(item => <li key={item.code}>{item.message}</li>)}</ul> : <p>This draft is not ready to publish. Return to your draft and try reviewing it again.</p>}</div>}{!canPublish && <p className="nooks-studio-availability">Connect your account to publish a shared nook.</p>}<footer><button className="nooks-studio-secondary" disabled={!!busy} onClick={() => setStage(stage === 'confirm' ? 'review' : 'edit')}>Back</button><button className="nooks-studio-primary" disabled={!!busy || !readiness?.readyToPublish || !canPublish} onClick={stage === 'confirm' ? publish : prepare}>{busy === 'publish' ? 'Publishing…' : busy === 'prepare' ? 'Preparing…' : stage === 'confirm' ? displayDraft.visibility === 'public' ? 'Publish publicly' : 'Publish invitation-only' : 'I reviewed these details'}</button></footer>{stage === 'confirm' && <small>If a connection fails, retry here to recover this same publication.</small>}</section>}
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden ref={uploadInput} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/>
    </main></div>
  </StudioSurface>, document.body) : null;
}


/** Remount just the dialog shell so each opening gets a fresh exit animation. */
function StudioSurface({ headingId, onClose, onRequestClose, dismissRef, children }: { headingId: string; onClose: () => void; onRequestClose: () => void; dismissRef: { current: (() => void) | null }; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useSoftDismiss(dialog, onClose);
  dismissRef.current = dismiss;
  const backdrop = useBackdropDismiss<HTMLDialogElement>(onRequestClose, true);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current; element?.showModal();
    return () => {
      if (dismissRef.current === dismiss) dismissRef.current = null;
      element?.close();
      window.requestAnimationFrame(() => {
        if (document.querySelector('dialog[open],[aria-modal="true"]')) return;
        const target = previous?.isConnected && previous !== document.body && !previous.matches(':disabled')
          ? previous : document.querySelector<HTMLElement>('[data-nooks-tab],[aria-label="Create study material"]');
        target?.focus({ preventScroll: true });
      });
    };
  }, [dismiss, dismissRef]);
  return <dialog ref={dialog} className="nooks-studio" aria-modal="true" aria-labelledby={headingId} onCancel={event => { event.preventDefault(); onRequestClose(); }} {...backdrop}>{children}</dialog>;
}
