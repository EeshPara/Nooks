import { isTutorialPractice, tutorialSeed } from './onboarding/tutorialSession';
import { createTutorialTools } from './preview/tutorial-tools.mjs';
/** Host tools remain native; browser accounts authenticate through the account client. */
import { nooksAccount } from './account/client';
import { legacyLayoutUpdate, mergeHostContext, type HostDisplayMode, type HostInsets } from './world/hostLayout';
import { readToolResult, readLegacyToolResult, readLegacyToolUpdate } from './tool-result';
import { listAppTools, callAppTool, subscribeAppToolsChanged } from './app-tools';
type ToolData = Record<string, any>;
type RpcMessage = { jsonrpc: string; id?: number | string; method?: string; params?: any; result?: any; error?: { message?: string } };
export type AuthorizedFile = { fileId: string; fileName?: string; mimeType?: string };
type LegacyOpenAI = { displayMode?: HostDisplayMode; maxHeight?: number; safeArea?: { insets: HostInsets }; toolOutput?: ToolData; toolResponseMetadata?: ToolData; callTool?: (name: string, args: object) => Promise<any>; sendFollowUpMessage?: (message: { prompt: string }) => Promise<unknown>; getFileDownloadUrl?: (args: { fileId: string }) => Promise<{ downloadUrl: string }>; selectFiles?: () => Promise<AuthorizedFile[]> };
const legacy = () => (window as Window & { openai?: LegacyOpenAI }).openai;
export const isPublicPreview = isTutorialPractice || import.meta.env.VITE_NOOKS_PUBLIC_PREVIEW === '1';
export const isEmbedded = !isPublicPreview && (window.parent !== window || !!legacy());
let hostOrigin: string | null = null;
let sequence = 0;
let initialized = false;
let tornDown = false;
let hostContext: ToolData = {};
let legacyHostContext: ToolData = isEmbedded ? legacyLayoutUpdate(legacy()) : {};
let hostCapabilities: ToolData = {};
let initialData: ToolData | undefined;
let workspaceSessionId: string | null = null;
let selectedModelContext: { title: string; text: string; structuredContent?: Record<string, unknown> } | null = null;
try { initialData = isPublicPreview ? undefined : readLegacyToolResult(legacy()?.toolOutput, legacy()?.toolResponseMetadata); } catch { /* Tool failures remain recoverable through the initial workspace request. */ }
const pending = new Map<number | string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function publish(data: ToolData, origin: 'host' | 'internal' = 'host') {
  if (!data || typeof data !== 'object') return;
  initialData = data;
  window.dispatchEvent(new CustomEvent('notable:workspace', { detail: { data, origin } }));
}
function applyHostContext(update: ToolData) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return;
  hostContext = mergeHostContext(hostContext, update);
  window.dispatchEvent(new CustomEvent('notable:host-context', { detail: getHostContext() }));
}
// Compatibility events provide layout globals only. The MCP Apps values take
// precedence when both bridges are present; no preview URL can enable this path.
window.addEventListener('openai:set_globals', event => {
  if (!isEmbedded || !legacy()) return;
  const globals = (event as CustomEvent<{ globals?: LegacyOpenAI }>).detail?.globals;
  if (globals && (Object.hasOwn(globals, 'toolOutput') || Object.hasOwn(globals, 'toolResponseMetadata'))) {
    try {
      const data = readLegacyToolUpdate(globals, legacy());
      if (data) publish(data);
    } catch { /* A tool error must not replace the current study material. */ }
  }
  const update = legacyLayoutUpdate(globals);
  if (!Object.keys(update).length) return;
  legacyHostContext = mergeHostContext(legacyHostContext, update);
  window.dispatchEvent(new CustomEvent('notable:host-context', { detail: getHostContext() }));
});
window.addEventListener('message', event => {
  if (isPublicPreview || event.source !== window.parent || window.parent === window || (hostOrigin && event.origin !== hostOrigin)) return;
  const message = event.data as RpcMessage;
  if (!message || message.jsonrpc !== '2.0') return;
  // Pin the actual parent origin after its first valid bridge response/notification.
  const knownResponse = !message.method && message.id !== undefined && pending.has(message.id);
  const knownNotification = ['ui/notifications/tool-result', 'ui/notifications/tool-input', 'ui/notifications/host-context-changed'].includes(message.method ?? '');
  const appRequest = message.id !== undefined && ['tools/list', 'tools/call'].includes(message.method ?? '');
  if (!knownResponse && !knownNotification && !appRequest && !['ping', 'ui/resource-teardown'].includes(message.method ?? '')) return;
  if (!hostOrigin && event.origin !== 'null') hostOrigin = event.origin;
  if (knownResponse) {
    const request = pending.get(message.id!)!;
    pending.delete(message.id!); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message || 'ChatGPT could not complete this action.'));
    else request.resolve(message.result);
  } else if (appRequest) {
    const reply = (result: unknown) => { if (!tornDown) window.parent.postMessage({ jsonrpc: '2.0', id: message.id, result }, hostOrigin ?? '*'); };
    if (message.method === 'tools/list') reply({ tools: listAppTools() });
    else void callAppTool(message.params?.name, message.params?.arguments ?? {}).then(reply).catch(() => reply({ isError: true, content: [{ type: 'text', text: 'Nooks could not open that view. Your current work is unchanged.' }] }));
  } else if (message.method === 'ui/notifications/tool-result') {
    try { publish(flatten(message.params)); } catch { /* The caller handles tool errors. */ }
  } else if (message.method === 'ui/notifications/host-context-changed') {
    applyHostContext(message.params);
  } else if (message.method === 'ui/resource-teardown' && message.id !== undefined) {
    tornDown = true;
    window.dispatchEvent(new Event('notable:teardown'));
    window.parent.postMessage({ jsonrpc: '2.0', id: message.id, result: {} }, hostOrigin ?? '*');
  } else if (message.method === 'ping' && message.id !== undefined) {
    window.parent.postMessage({ jsonrpc: '2.0', id: message.id, result: {} }, hostOrigin ?? '*');
  }
}, { passive: true });

function rpc(method: string, params: object, timeout = 15000): Promise<any> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The study space did not receive a response. Please try again.')); }, timeout);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, hostOrigin ?? '*');
  });
}
const connection = isEmbedded && window.parent !== window ? rpc('ui/initialize', {
  appInfo: { name: 'Nooks', version: '0.1.0' },
  appCapabilities: { availableDisplayModes: ['fullscreen'], tools: { listChanged: true } }, protocolVersion: '2026-01-26',
}, 4000).then(result => {
  hostCapabilities = result?.hostCapabilities ?? {};
  applyHostContext(result?.hostContext ?? {});
  initialized = true;
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized' }, hostOrigin ?? '*');
}).catch(() => {}) : Promise.resolve();
subscribeAppToolsChanged(() => { if (initialized) window.parent.postMessage({jsonrpc:'2.0',method:'notifications/tools/list_changed'},hostOrigin??'*'); });

const flatten = readToolResult;
const tutorialTools = tutorialSeed ? createTutorialTools(tutorialSeed.workspace) : null;

export async function callTool(name: string, args: object = {}): Promise<ToolData> {
  if(tutorialTools)return flatten(await tutorialTools(name,args));
  if (isPublicPreview) {
    const initialAccount = nooksAccount.getSnapshot();
    const startingKey = initialAccount.status === 'loading' ? undefined : initialAccount.workspaceKey;
    const transport = await nooksAccount.transport();
    const requireAccount = () => {
      if ((startingKey && startingKey !== transport.workspaceKey) || nooksAccount.getSnapshot().workspaceKey !== transport.workspaceKey) throw new Error('Your account changed. Reopen this action in the current workspace.');
    };
    requireAccount();
    if (transport.mode === 'device') {
      const { callPreviewTool } = await import('./preview/browser-tools.mjs');
      requireAccount();
      const result = await callPreviewTool(name, args as Record<string, unknown>);
      requireAccount();
      return flatten(result);
    }
    const response = await nooksAccount.authenticatedFetch(name === 'workspace_get' ? '/api/workspace' : `/api/tools/${encodeURIComponent(name)}`, name === 'workspace_get' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) }, transport.workspaceKey);
    const result = await response.json();
    requireAccount();
    if (!response.ok) {
      const details = result.structuredContent?.error ?? result.error;
      throw Object.assign(new Error(details?.message || (typeof details === 'string' ? details : '') || 'Nooks could not save this action.'),
        { code: details?.code, currentRevision: details?.currentRevision, retryAfter: details?.retryAfter });
    }
    return flatten(result);
  }
  if (isEmbedded) {
    await connection;
    let result;
    if (initialized) result = await rpc('tools/call', { name, arguments: args });
    else if (legacy()?.callTool) result = await legacy()!.callTool!(name, args);
    else throw new Error('Connect Nooks to ChatGPT to save this action.');
    const data = flatten(result); if (data.workspace) publish(data, 'internal'); return data;
  }
  // Private top-level hosts and the loopback demo use this same REST contract.
  const response = await fetch(name === 'workspace_get' ? '/api/workspace' : `/api/tools/${encodeURIComponent(name)}`, name === 'workspace_get' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const result = await response.json();
  if (!response.ok) {
    const details = result.structuredContent?.error ?? result.error;
    throw Object.assign(new Error(details?.message || (typeof details === 'string' ? details : '') || 'Nooks could not save this action.'),
      { code: details?.code, currentRevision: details?.currentRevision, retryAfter: details?.retryAfter });
  }
  return flatten(result);
}

export async function requestChatGPT(prompt: string): Promise<boolean> {
  if(isTutorialPractice)return false;
  if (!isEmbedded) return false;
  await connection;
  prompt += '\n\nKeep this interaction in the existing Nooks tab. For an explicit request to create study material, save it and immediately present the result without asking whether to create, save, or open it again. If its app-provided nooks_present tool is available, use it to show the saved artifact or view. ' + (workspaceSessionId ? `Otherwise use workspace_navigate with sessionId ${JSON.stringify(workspaceSessionId)}. This is only a UI routing identifier, not study content. Do not call workspace_render again for this action.` : 'If the mounted app cannot be reached, explain that limitation rather than repeatedly opening new tabs.');
  if (initialized) {
    await rpc('ui/message', { role: 'user', content: [{ type: 'text', text: prompt }] });
    return true;
  }
  if (legacy()?.sendFollowUpMessage) { await legacy()!.sendFollowUpMessage!({ prompt }); return true; }
  return false;
}

/** Optional native file APIs; never invent a bridge RPC or a file reference. */
export function getFileCapabilities() {
  const host = isEmbedded && !tornDown ? legacy() : undefined;
  return { download: typeof host?.getFileDownloadUrl === 'function', select: typeof host?.selectFiles === 'function' };
}
export async function getAuthorizedFileDownloadUrl(fileId: string): Promise<string | null> {
  if (!getFileCapabilities().download) return null;
  if (!fileId || fileId.length > 512) throw new Error('This ChatGPT file reference is invalid.');
  try {
    const result = await legacy()!.getFileDownloadUrl!({ fileId });
    if (tornDown || typeof result?.downloadUrl !== 'string' || !result.downloadUrl || result.downloadUrl.length > 8192) throw new Error();
    return result.downloadUrl;
  } catch {
    // Do not expose a signed URL or silently bypass a host authorization denial.
    throw new Error('ChatGPT could not authorize this image. Choose it again from ChatGPT.');
  }
}
export async function selectAuthorizedFiles(): Promise<AuthorizedFile[] | null> {
  if (!getFileCapabilities().select) return null;
  try {
    const result = await legacy()!.selectFiles!();
    if (tornDown || !Array.isArray(result)) throw new Error();
    return result.slice(0, 10).filter(file => file && typeof file.fileId === 'string' && file.fileId.length > 0 && file.fileId.length <= 512)
      .map(file => ({ fileId: file.fileId, ...(typeof file.fileName === 'string' ? { fileName: file.fileName.slice(0, 240) } : {}), ...(typeof file.mimeType === 'string' ? { mimeType: file.mimeType.slice(0, 80) } : {}) }));
  } catch { throw new Error('ChatGPT could not open your files. Please try again.'); }
}

export function getInitialWorkspace(): ToolData | undefined { return initialData?.workspace; }
export function getInitialToolData(): ToolData | undefined { return initialData; }
/** Retry reads a fresh workspace instead of replaying a response that crashed its view. */
export function clearInitialToolData() { initialData = undefined; }
export function getHostContext(): ToolData { return isEmbedded ? { ...legacyHostContext, ...hostContext } : {}; }
export function subscribeHostContext(listener: () => void): () => void {
  if (!isEmbedded) return () => {};
  window.addEventListener('notable:host-context', listener);
  return () => window.removeEventListener('notable:host-context', listener);
}

/** Called only for a user-chosen study item; never silently attaches their library. */
export async function updateModelContext(context: { title: string; text: string; structuredContent?: Record<string, unknown> } | null): Promise<boolean> {
  selectedModelContext = context;
  if (!isEmbedded) return false;
  await connection;
  if (isTutorialPractice || !initialized || !hostCapabilities.updateModelContext?.text) return false;
  const content: ToolData[] = context ? [{ type: 'text', text: context.text, _meta: { 'openai/title': context.title } }] : [];
  if (workspaceSessionId) content.push({type:'text',text:`Nooks is already open in this conversation. Current UI destination: ${JSON.stringify({workspaceSessionId})}. Use the app-provided nooks_present tool when available, otherwise workspace_navigate with this sessionId to show saved material or a view in this same tab. workspace_render is only the initial opener. The session ID is routing metadata, not educational source material.`,annotations:{audience:['assistant']}});
  const params: ToolData = { content };
  if (hostCapabilities.updateModelContext?.structuredContent && (context?.structuredContent || workspaceSessionId)) params.structuredContent = {...context?.structuredContent,...(workspaceSessionId?{workspaceSessionId}:{})};
  await rpc('ui/update-model-context', params);
  return true;
}

export function setWorkspaceSessionContext(sessionId: string | null) {
  workspaceSessionId = sessionId;
  void updateModelContext(selectedModelContext).catch(() => {});
}
export function getWorkspaceSessionId() { return workspaceSessionId; }

export async function requestDisplayMode(mode: 'inline' | 'fullscreen'): Promise<'inline' | 'fullscreen' | null> {
  if (!isEmbedded) return null;
  await connection;
  if (!initialized || !hostContext.availableDisplayModes?.includes(mode)) return null;
  const result = await rpc('ui/request-display-mode', { mode });
  if (result?.mode !== 'inline' && result?.mode !== 'fullscreen') return null;
  applyHostContext({ displayMode: result.mode });
  return result.mode;
}
