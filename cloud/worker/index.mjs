import { StudyEngine, InputError } from '../server/engine.mjs';
import { listTools, toolNames, UI_URI, LEGACY_UI_URI, UI_MIME, UI_ICONS } from '../server/tools.mjs';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';
import { communityTools, isCommunityTool, invokeCommunity } from '../server/community-tools.mjs';
import { NookCreator, creatorToolNames } from '../server/nook-creator.mjs';
import { listNookCreatorTools } from '../server/nook-creator-tools.mjs';
import { modelSafeResult } from '../server/model-result.mjs';
import { LEGACY_PROTOCOL_VERSIONS, validateMcpRequest, mcpResult, discoverResult } from '../server/protocol.mjs';
import { studyInstructions } from '../server/study-instructions.mjs';
import { createOperationalMonitor, failureStatus } from '../server/operations.mjs';
const operationalMonitors = new Map();
function monitorFor(env) {
 const configured=!!(env.SUPABASE_URL&&env.SUPABASE_SERVICE_KEY);
 if(!operationalMonitors.has(configured))operationalMonitors.set(configured,createOperationalMonitor({configured,operations:[...toolNames,...creatorToolNames,...communityTools.map(t=>t.name)]}));
 return operationalMonitors.get(configured);
}
export const ARTWORK_ORIGIN = 'https://nooks-study-space.vercel.app';
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
export function identity(request) {
  // Only deploy behind the Sites dispatcher, which supplies verified identity.
  const id = request.headers.get('oai-authenticated-user-id');
  return id && id.length <= 256 ? { id, scopes: ['notable.read', 'notable.write'] } : null;
}
export function descriptors() {
  return [...listTools(), ...listNookCreatorTools(), ...communityTools].map(tool => {
    const { securitySchemes, ...result } = tool;
    const { securitySchemes: ignored, ...meta } = tool._meta || {};
    result._meta = meta;
    if (tool.name === 'workspace_get') result.description = 'Read the signed-in student’s private study library, plan, focus history, and nook progress. Requires a connected account.';
    if (tool.name === 'space_share') result.description = result.description.replace('public snapshot', 'snapshot for people who already have access to this private Nooks plugin');
    return result;
  });
}
async function connect(env, user, origin, monitor, context) {
  context.phase='configuration';
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new InputError('Nooks database setup is not complete. Saved study work is unavailable until the project is connected.', 'BACKEND_NOT_CONFIGURED');
  const namespace = env.NOOKS_SITES_NAMESPACE || 'sites:appgprj_6abf1d6c87c08191b8c6f30bc0267fe9';
  const fetchImpl=monitor.wrapFetch(context,fetch,new URL(env.SUPABASE_URL).origin);
  context.phase='authentication';
  const resolveIdentity = createSitesIdentityResolver({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_KEY,namespace,trustedBoundary:'sites-dispatcher',fetchImpl});
  const verified = await resolveIdentity({subject:user.id});
  const store = new SupabaseStore({url:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_KEY,identity:verified,fetchImpl,onArtworkUnavailable:details=>monitor.artworkUnavailable(context,details)});
  context.phase='quota';
  const limit = await store.rpc('nooks_request_limit', { p_account: verified.id, p_bucket: 'api', p_limit: 180, p_window_seconds: 60 });
  if(typeof limit?.allowed!=='boolean')throw new Error('Invalid quota response');
  monitor.success();
  if (limit.allowed !== true) {
    const error = new InputError('Please wait a moment before trying again.', 'RATE_LIMITED');
    error.retryAfter = Number.isSafeInteger(limit?.retryAfter) ? Math.max(1, Math.min(60, limit.retryAfter)) : 60;
    throw error;
  }
  context.phase='backend';
  return {user:verified,store,engine:new StudyEngine(store,{shareBaseUrl:origin})};
}
async function parse(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new InputError('Content-Type must be application/json.', 'CONTENT_TYPE');
  const reader = request.body?.getReader(); let length = 0; const parts = [];
  if (!reader) throw new InputError('JSON body required.');
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new InputError('Request too large.', 'TOO_LARGE'); } parts.push(value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('Invalid JSON.', 'INVALID_JSON'); }
}
function failure(error, monitor, context, transportStatus = 200) {
  const known = error instanceof InputError;
  monitor.failure(context,error,{code:known?error.code:'SERVER_ERROR',status:failureStatus(error),transportStatus});
  const message = known ? error.message : 'Nooks could not complete this request. Your saved work has not been replaced. Please try again.';
  return { isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: { requestId:context.requestId, code: known ? error.code : 'SERVER_ERROR', message, ...(error?.code === 'RATE_LIMITED' ? {retryAfter: error.retryAfter} : {}) } } };
}
async function invoke(name, args, engine, user, store) {
  if (!toolNames.has(name) && !creatorToolNames.has(name) && !isCommunityTool(name)) throw new InputError('Unknown Nooks tool.', 'UNKNOWN_TOOL');
  const structuredContent = creatorToolNames.has(name) ? await new NookCreator(store).call(name,args,user) : isCommunityTool(name) ? await invokeCommunity(store,name,args) : await engine.call(name,args,user);
  if (structuredContent.workspace) structuredContent.workspace.backend='supabase';
  return modelSafeResult({ structuredContent, content: [{ type: 'text', text: name === 'workspace_render' ? 'Your study nook is ready.' : name === 'workspace_get' ? `${structuredContent.workspace.artifacts.length} saved study items loaded.` : 'Your study nook is updated.' }] });
}
const serverDetails = { capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } }, serverInfo: { name: 'nooks', title: 'Nooks', version: '0.2.1', icons: UI_ICONS }, instructions: studyInstructions({ connectedCommunity: true, accountRequired: true, privatePlugin: true }) };
async function rpc(message, request, env, user, protocol, monitor, context) {
  const reply = result => json({ jsonrpc: '2.0', id: message.id, result: mcpResult(result, { version: protocol.version, serverInfo: serverDetails.serverInfo, method: message.method }) },200,{'X-Request-Id':context.requestId});
  const error = (code, text, status = 200) => json({ jsonrpc: '2.0', id: message?.id ?? null, error: { code, message: text, data:{requestId:context.requestId} } }, status, {'X-Request-Id':context.requestId});
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && !['string', 'number'].includes(typeof message.id))) return error(-32600, 'Invalid Request');
  if (message.id === undefined) return new Response(null, { status: 202 });
  if (message.method === 'server/discover') return reply(discoverResult(serverDetails));
  if (message.method === 'initialize') {
    if (protocol.modern) return error(-32601, 'Use server/discover with this protocol version.', 404);
    return reply({ ...serverDetails, protocolVersion: LEGACY_PROTOCOL_VERSIONS.includes(message.params?.protocolVersion) ? message.params.protocolVersion : LEGACY_PROTOCOL_VERSIONS[0] });
  }
  if (message.method === 'ping') return reply({});
  if (message.method === 'tools/list') return reply({ tools: descriptors() });
  if (message.method === 'resources/list') return reply({ resources: [{ uri: UI_URI, name: 'nooks-study-workspace', title: 'Nooks', icons: UI_ICONS, mimeType: UI_MIME }] });
  if (message.method === 'resources/templates/list') return reply({ resourceTemplates: [] });
  if (message.method === 'resources/read') {
    if (![UI_URI, LEGACY_UI_URI].includes(message.params?.uri)) return error(-32602, 'Unknown resource');
    // Only public curated artwork loads from the public Nooks site. Study data stays behind authenticated tools.
    monitor.setOperation(context,'resources_read');context.phase='resource';
    const asset = await env.ASSETS.fetch(new Request(new URL('/widget.html', request.url)));
    if (!asset.ok) {monitor.failure(context,null,{code:'SERVER_ERROR',status:503,transportStatus:200});return error(-32603, 'Nooks interface is temporarily unavailable.');}
    return reply({ contents: [{ uri: message.params.uri, mimeType: UI_MIME, text: await asset.text(), _meta: { ui: { prefersBorder: false, csp: { resourceDomains: [ARTWORK_ORIGIN], connectDomains: [ARTWORK_ORIGIN, 'https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com'], frameDomains: ['https://open.spotify.com'] } }, 'openai/ui': { availableDisplayModes: ['fullscreen'] }, 'openai/widgetDescription': 'Nooks study workspace with notes, quizzes, flashcards, focus sessions, illustrated nooks and account-permissioned study lobbies.', 'openai/widgetPrefersBorder': false, 'openai/widgetCSP': { resource_domains: [ARTWORK_ORIGIN], connect_domains: [ARTWORK_ORIGIN, 'https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com'], frame_domains: ['https://open.spotify.com'] } } }] });
  }
  if (message.method === 'tools/call') {
    if (!user) return json({ error: 'Sign in and connect Nooks to access your study space.' }, 401);
    if (typeof message.params?.name !== 'string') return error(-32602, 'Tool name required');
    monitor.setOperation(context,message.params.name);
    try { const session=await connect(env,user,new URL(request.url).origin,monitor,context); const result=await invoke(message.params.name,message.params.arguments??{},session.engine,session.user,session.store);monitor.success();return reply(result); } catch(e){return reply(failure(e,monitor,context));}
  }
  return error(-32601, 'Method not found', protocol.modern ? 404 : 200);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), user = identity(request), monitor=monitorFor(env), context=monitor.start();
    try {
      if (url.pathname === '/health') return json({...monitor.health(),name:'Nooks',mode:'private-cloud',configured:!!(env.SUPABASE_URL&&env.SUPABASE_SERVICE_KEY),community:'supabase'});
      if (url.pathname === '/mcp') {
        if (request.method !== 'POST') return json({ error: 'Use POST for this stateless MCP endpoint.' }, 405, { Allow: 'POST' });
        const message = await parse(request);
        // Sites currently forwards version/body metadata but omits mirrored routing headers.
        // Authentication still comes only from the dispatcher identity above.
        const protocol = validateMcpRequest(message, request.headers, { allowMissingMirroredHeaders: true });
        if (protocol.error) {
          // Only transport diagnostics: never log arguments, headers or study content.
          context.phase='validation';monitor.failure(context,null,{code:'INVALID_INPUT',status:protocol.status});
          return json({...protocol.error,error:{...protocol.error.error,data:{...protocol.error.error.data,requestId:context.requestId}}}, protocol.status,{'X-Request-Id':context.requestId});
        }
        return await rpc(message, request, env, user, protocol,monitor,context);
      }
      if (url.pathname.startsWith('/api/')) {
        if (!user) return json({ error: 'Sign in to open your private Nooks study space.' }, 401);
        if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin.' }, 403);
        monitor.setOperation(context,url.pathname==='/api/workspace'?'workspace_get':url.pathname.startsWith('/api/shared/')?'shared_read':decodeURIComponent(url.pathname.slice('/api/tools/'.length)));
        const session=await connect(env,user,url.origin,monitor,context); const {store,engine}=session;
        const successful=data=>{monitor.success();return json(data,200,{'X-Request-Id':context.requestId});};
        if (url.pathname === '/api/workspace' && request.method === 'GET') return successful(await invoke('workspace_get', {}, engine, session.user, store));
        if (url.pathname.startsWith('/api/shared/') && request.method === 'GET') { const share = await store.readShare(url.pathname.slice('/api/shared/'.length)); monitor.success();return json(share ? { share } : { error: 'This nook snapshot is unavailable.' }, share ? 200 : 404); }
        if (url.pathname.startsWith('/api/tools/') && request.method === 'POST') return successful(await invoke(decodeURIComponent(url.pathname.slice('/api/tools/'.length)), await parse(request), engine, session.user, store));
        return json({ error: 'Not found.' }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (error) { const status=failureStatus(error);return json(failure(error,monitor,context,status),status, {'X-Request-Id':context.requestId,...(error?.code === 'RATE_LIMITED' ? {'Retry-After': String(error.retryAfter)} : {})}); }
  },
};
