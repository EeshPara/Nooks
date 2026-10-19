import { useEffect, useRef, useState } from 'react';
import { errorMessage, resultData, type OrganizationTool } from '../organization/types';

export type StudioDraftSummary = { id: string; title: string; description: string; roomId: string; artworkMode: string; hasArtwork?: boolean; updatedAt?: string; createdAt?: string };
export type StudioDraftListing = { status: 'loading' | 'ready' | 'error'; drafts: StudioDraftSummary[]; error: string };
export const loadingStudioDrafts = (): StudioDraftListing => ({ status: 'loading', drafts: [], error: '' });

// A closed dialog, changed owner, or newer request must invalidate late results.
export function createStudioDraftListing(read: () => Promise<any>, publish: (state: StudioDraftListing) => void, current: () => boolean) {
  let version = 0, disposed = false;
  return {
    async refresh() {
      if (disposed || !current()) return;
      const request = ++version;
      const active = () => !disposed && request === version && current();
      publish(loadingStudioDrafts());
      try {
        const result = resultData(await read());
        if (!Array.isArray(result.drafts) || result.drafts.some((draft: any) => !draft || ['id', 'title', 'description', 'roomId', 'artworkMode'].some(key => typeof draft[key] !== 'string') || !draft.id || !draft.title || (draft.updatedAt !== undefined && typeof draft.updatedAt !== 'string') || (draft.createdAt !== undefined && typeof draft.createdAt !== 'string'))) throw new Error('Your saved drafts could not be loaded. Please try again.');
        if (active()) publish({ status: 'ready', drafts: result.drafts, error: '' });
      } catch (reason) {
        if (active()) publish({ status: 'error', drafts: [], error: errorMessage(reason) });
      }
    },
    dispose() { disposed = true; version++; },
  };
}

export function savedNooksLabel(count: number, status: StudioDraftListing['status']) {
  return status === 'loading' ? 'Loading saved nooks…' : status === 'error' ? 'Saved drafts unavailable' : `${count} saved ${count === 1 ? 'nook' : 'nooks'}`;
}

export function useStudioDraftListing(owner: string, onTool: OrganizationTool, isCurrentOwner: () => boolean) {
  const callbacks = useRef({ owner, onTool, isCurrentOwner }); callbacks.current = { owner, onTool, isCurrentOwner };
  const [state, setState] = useState({ owner, value: loadingStudioDrafts() });
  const controller = useRef<ReturnType<typeof createStudioDraftListing> | null>(null);
  useEffect(() => {
    const listing = createStudioDraftListing(() => callbacks.current.onTool('nook_drafts_list', {}), value => setState({ owner, value }), () => callbacks.current.owner === owner && callbacks.current.isCurrentOwner());
    controller.current = listing; void listing.refresh();
    return () => { listing.dispose(); if (controller.current === listing) controller.current = null; };
  }, [owner]);
  return { ...(state.owner === owner ? state.value : loadingStudioDrafts()), retry: () => { void controller.current?.refresh(); } };
}
