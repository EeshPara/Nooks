/** Only named product views from our tool contract may drive native navigation. */
export type WorkspaceView = 'study' | 'library' | 'explore' | 'focus' | 'plan' | 'collection' | 'music' | 'people';
export type WorkspaceUtility = 'focus' | 'sounds' | 'people' | 'collection' | 'today' | 'explore' | 'personalize' | 'settings';
const panels: Record<WorkspaceView, WorkspaceUtility | null> = {
  study: null, library: null, explore: 'explore', focus: 'focus',
  plan: 'today', collection: 'collection', music: 'sounds', people: 'people',
};
export function readWorkspaceView(value: unknown): WorkspaceView | undefined {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(panels, value) ? value as WorkspaceView : undefined;
}
export function panelForWorkspaceView(view: WorkspaceView): WorkspaceUtility | null {
  return panels[view];
}

/** Revisions and autosave echoes update content without replaying navigation. */
export function workspaceSurfaceKey(page: string, artifact: { id: string; kind: string } | null): string {
  return page === 'home' ? artifact ? `artifact:${artifact.kind}:${artifact.id}` : 'study:welcome' : `page:${page}`;
}
