import { readWorkspaceView, type WorkspaceView } from './workspace-navigation';

/** Commands operate on this mounted view; they never open a host tab. */
export type AppPresentTarget =
  | { artifactId: string; alongsideArtifactId?: string; view?: never; draftId?: never; presentation?: never }
  | { view: WorkspaceView; artifactId?: never; alongsideArtifactId?: never; draftId?: never; presentation?: never }
  | { draftId: string; artifactId?: never; alongsideArtifactId?: never; view?: never; presentation?: never }
  | { presentation: 'opening'; artifactId?: never; alongsideArtifactId?: never; view?: never; draftId?: never };
export type AppPresentOutcome = { status: 'presented' | 'queued' };
export type AppToolHandlers = {
  // Resolve owned IDs through the authenticated server and retain dirty-note guards.
  present: (target: AppPresentTarget) => Promise<AppPresentOutcome | void> | AppPresentOutcome | void;
  state: () => unknown | Promise<unknown>;
};
export type AppToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

const views: WorkspaceView[] = ['study', 'library', 'explore', 'focus', 'plan', 'collection', 'music', 'people'];
const identifierPattern = '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
const identifier = new RegExp(identifierPattern);
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const idSchema = { type: 'string', minLength: 1, maxLength: 128, pattern: identifierPattern, not: { enum: [...reserved] } };
const descriptors = [
  {
    name: 'nooks_present',
    title: 'Show in this Nooks tab',
    description: 'Present a saved study item, a named view, or an owned nook creator draft in this already-open Nooks tab. Use IDs confirmed by the connected Nooks server. After nook_artwork_receive, present its draftId so the studio can automatically import the authorized image. Optionally show a second study item alongside the first. For an explicit request to watch the Nooks intro, use presentation="opening" alone: it plays an overlay while preserving the current study work. This does not open another tab, generate or save content. Unsaved writing can queue ordinary navigation.',
    inputSchema: {
      type: 'object',
      properties: { artifactId: idSchema, draftId: idSchema, view: { type: 'string', enum: views }, alongsideArtifactId: idSchema, presentation: { type: 'string', enum: ['opening'] } },
      additionalProperties: false,
      oneOf: [{ required: ['artifactId'] }, { required: ['view'] }, { required: ['draftId'] }, { required: ['presentation'] }],
      allOf: [{ anyOf: [{ not: { required: ['alongsideArtifactId'] } }, { required: ['artifactId'] }] }],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'nooks_view_state',
    title: 'Read this Nooks view',
    description: 'Read only the current view, selected study item IDs, pending-edit flag and routing session of this mounted Nooks tab. Does not read note content or the library.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

let registered: AppToolHandlers | null = null;
const listeners = new Set<() => void>();
function changed() { for (const listener of listeners) { try { listener(); } catch { /* A host notification failure must not invalidate the mounted app. */ } } }

export function subscribeAppToolsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function registerAppToolHandlers(handlers: AppToolHandlers): () => void {
  if (typeof handlers?.present !== 'function' || typeof handlers?.state !== 'function') throw new TypeError('Nooks app tool handlers are required.');
  // Each registration gets its own identity: stale React cleanup cannot remove a newer mount.
  const registration = { ...handlers };
  registered = registration;
  changed();
  return () => { if (registered === registration) { registered = null; changed(); } };
}

export function listAppTools() { return registered ? structuredClone(descriptors) : []; }

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && identifier.test(value) && !reserved.has(value);
}
function targetFrom(value: unknown): AppPresentTarget | null {
  if (!record(value) || Object.keys(value).some(key => !['artifactId', 'draftId', 'view', 'alongsideArtifactId', 'presentation'].includes(key))) return null;
  if (Object.hasOwn(value, 'presentation')) return Object.keys(value).length === 1 && value.presentation === 'opening' ? { presentation: 'opening' } : null;
  const artifact = Object.hasOwn(value, 'artifactId');
  const view = Object.hasOwn(value, 'view');
  const reference = Object.hasOwn(value, 'alongsideArtifactId');
  if (Object.hasOwn(value, 'draftId')) return !artifact && !view && !reference && validId(value.draftId) ? { draftId: value.draftId } : null;
  if (artifact === view || (reference && !artifact)) return null;
  if (view) { const selected = readWorkspaceView(value.view); return selected ? { view: selected } : null; }
  if (!validId(value.artifactId) || (reference && !validId(value.alongsideArtifactId))) return null;
  return { artifactId: value.artifactId, ...(reference ? { alongsideArtifactId: value.alongsideArtifactId as string } : {}) };
}

/** Even an over-broad callback cannot disclose a library, artwork or draft body. */
function referencesOnly(value: unknown): Record<string, unknown> {
  if (!record(value)) return {};
  const state: Record<string, unknown> = {};
  const view = readWorkspaceView(value.view);
  if (view) state.view = view;
  for (const key of ['artifactId', 'alongsideArtifactId', 'draftId', 'sessionId']) if (validId(value[key])) state[key] = value[key];
  if (typeof value.unsavedChanges === 'boolean') state.unsavedChanges = value.unsavedChanges;
  if (value.presentation === 'opening') state.presentation = 'opening';
  return state;
}
function failure(code: string, message: string): AppToolResult {
  return { isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: { code, message } } };
}

export async function callAppTool(name: string, args: unknown = {}): Promise<AppToolResult> {
  if (name !== 'nooks_present' && name !== 'nooks_view_state') return failure('UNKNOWN_TOOL', 'This Nooks view does not provide that tool.');
  const handlers = registered;
  if (!handlers) return failure('APP_UNAVAILABLE', 'This Nooks view is not ready or has closed.');
  if (name === 'nooks_present') {
    const target = targetFrom(args);
    if (!target) return failure('INVALID_ARGUMENTS', 'Choose one saved artifactId, nook draftId, named view, or opening presentation. A second artifact ID can only accompany the first.');
    try {
      const outcome = await handlers.present(structuredClone(target));
      if (registered !== handlers) return failure('APP_UNAVAILABLE', 'This Nooks view changed before the request completed.');
      if (outcome !== undefined && (!record(outcome) || (outcome.status !== 'presented' && outcome.status !== 'queued'))) return failure('APP_ERROR', 'Nooks could not confirm the view change.');
      const status = outcome?.status ?? 'presented';
      return { content: [{ type: 'text', text: status === 'queued' ? target.presentation === 'opening' ? 'Opening film requested in this Nooks tab. Current study work stays in place.' : 'Ready in this Nooks tab; navigation is waiting for the current note to save.' : 'Shown in this Nooks tab.' }], structuredContent: { status, target } };
    } catch {
      return failure('APP_ERROR', 'Nooks could not confirm this view change. Retry when the connection is ready.');
    }
  }
  if (!record(args) || Object.keys(args).length) return failure('INVALID_ARGUMENTS', 'This view-state tool does not accept arguments.');
  try {
    const value = await handlers.state();
    if (registered !== handlers) return failure('APP_UNAVAILABLE', 'This Nooks view changed before the request completed.');
    return { content: [{ type: 'text', text: 'Current Nooks view references.' }], structuredContent: { viewState: referencesOnly(value) } };
  } catch {
    return failure('APP_ERROR', 'Nooks could not read the current view.');
  }
}
