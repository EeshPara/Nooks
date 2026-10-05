import { artworkStatus } from './nook-artwork.mjs';

/** Keep the complete UI state out of model context. Reads return only selected data. */
export function modelSafeResult(result) {
  const data = result.structuredContent;
  if (!data || typeof data !== 'object') return result;
  const visible = structuredClone(data);
  // The verified account scope is for local draft recovery in this owner's interface.
  // It is never model context or an identity accepted from tool arguments.
  delete visible.recoveryScope;
  delete visible.workspaceLayout;
  if (visible.artworkRequest) visible.artworkRequest = artworkStatus(visible.artworkRequest);
  if (visible.draft?.artworkRequest) visible.draft.artworkRequest = artworkStatus(visible.draft.artworkRequest);
  if (Array.isArray(visible.drafts)) for (const draft of visible.drafts) if (draft?.artworkRequest) draft.artworkRequest = artworkStatus(draft.artworkRequest);
  if (visible.workspace) {
    const workspace = visible.workspace;
    visible.workspace = {
      updatedAt: workspace.updatedAt,
      backend: workspace.backend,
      library: { count: workspace.artifacts?.length ?? 0 },
      organization: {
        courses: (workspace.organization?.courses ?? []).slice(0, 100).map(({id,title,revision,archived}) => ({id,title,revision,archived})),
        topicCount: workspace.organization?.topics?.length ?? 0,
        savedSessionCount: workspace.organization?.sessions?.length ?? 0,
      },
      stats: workspace.stats,
      guidance: 'Use library_search to find material, artifact_get for a selected item, context_get to resume a selected course or topic, plan_get before modifying existing tasks, and study_status_get for the current nook, focus session or earned rewards. The full workspace is available only to the interface.',
    };
  }
  for (const appearance of [visible.share?.space, visible.space, visible.draft?.space]) if (appearance) { delete appearance.backgroundImage; delete appearance._storedBackground; }
  if (visible.draft) delete visible.draft.scenePrompt;
  return { ...result, structuredContent: visible, _meta: { ...result._meta, notableData: data } };
}
