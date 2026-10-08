import http from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore } from './store.mjs';
import { StudyEngine, InputError } from './engine.mjs';
import { createIntrospectionVerifier, requestIdentity } from './auth.mjs';
import { NookCreator, creatorToolNames } from './nook-creator.mjs';
import { listNookCreatorTools } from './nook-creator-tools.mjs';
import { communityTools, isCommunityTool, invokeCommunity } from './community-tools.mjs';
import { listTools, toolNames, UI_URI, LEGACY_UI_URI, UI_MIME, UI_ICON } from './tools.mjs';
import { studyInstructions } from './study-instructions.mjs';
import { createRequestLimiter } from './request-limiter.mjs';
import { createOperationalMonitor, failureStatus } from './operations.mjs';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
import { LEGACY_PROTOCOL_VERSIONS, validateMcpRequest, mcpResult, discoverResult } from './protocol.mjs';
const types = { '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
const json = (response, status, value, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); response.end(JSON.stringify(value)); };

import { modelSafeResult } from './model-result.mjs';
export { modelSafeResult } from './model-result.mjs';

async function body(request) {
  let length = 0; const parts = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 2 * 1024 * 1024) throw new InputError('Request too large.', 'TOO_LARGE');
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new InputError('Request body must be valid JSON.', 'INVALID_JSON'); }
}

function replaceAssetLiterals(code, url, replacement) {
  const parts = []; let cursor = 0; let index = 0; let references = 0; let expressionExpected = true;
  // A streaming scanner avoids regexp recursion over large embedded strings.
  while (index < code.length) {
    if (code.startsWith('//', index)) { const end = code.indexOf('\n', index + 2); index = end < 0 ? code.length : end + 1; continue; }
    if (code.startsWith('/*', index)) { const end = code.indexOf('*/', index + 2); index = end < 0 ? code.length : end + 2; continue; }
    const quote = code[index];
    if (quote === '/' && expressionExpected) {
      index++; let characterClass = false;
      while (index < code.length) {
        const char = code[index++];
        if (char === '\\') { index++; continue; }
        if (char === '[') characterClass = true;
        if (char === ']') characterClass = false;
        if (char === '/' && !characterClass) break;
      }
      while (/[a-z]/i.test(code[index] ?? '') && index < code.length) index++;
      expressionExpected = false; continue;
    }
    if (!['"', "'", '`'].includes(quote)) {
      if (/\s/.test(quote)) { index++; continue; }
      if (/[a-z_$]/i.test(quote)) {
        const start = index++;
        while (index < code.length && /[\w$]/.test(code[index])) index++;
        expressionExpected = /^(return|throw|yield|await|case|delete|void|typeof|new|in|instanceof|of)$/.test(code.slice(start, index));
        continue;
      }
      if (/[0-9]/.test(quote)) { while (index < code.length && /[\w.]/.test(code[index])) index++; expressionExpected = false; continue; }
      expressionExpected = ![']', ')', '}'].includes(quote);
      index++; continue;
    }
    const start = index++;
    while (index < code.length && code[index] !== quote) index += code[index] === '\\' ? 2 : 1;
    if (code.slice(start + 1, index) === url) { parts.push(code.slice(cursor, start), replacement); cursor = index + 1; references++; }
    index++; expressionExpected = false;
  }
  parts.push(code.slice(cursor));
  return { code: parts.join(''), references };
}

/** Inline the compiled entry to make the widget self-contained in its isolated iframe. */
export async function widgetHtml(distDirectory, { assetOrigin = null } = {}) {
  if (assetOrigin) {
    const parsed = new URL(assetOrigin);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Widget assets require a configured HTTPS origin.');
    assetOrigin = parsed.origin;
  }
  let html = await readFile(join(distDirectory, 'index.html'), 'utf8');
  for (const match of [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
    const source = resolve(distDirectory, match[1].replace(/^\//, ''));
    if (!source.startsWith(distDirectory + sep)) throw new Error('Unsafe widget asset path.');
    const code = (await readFile(source, 'utf8')).replace(/<\/script/gi, '<\\/script');
    html = html.replace(match[0], () => `<script type="module">${code}</script>`);
  }
  for (const match of [...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)]) {
    if (!/rel="stylesheet"/.test(match[0])) continue;
    const source = resolve(distDirectory, match[1].replace(/^\//, ''));
    if (!source.startsWith(distDirectory + sep)) throw new Error('Unsafe widget asset path.');
    const css = (await readFile(source, 'utf8')).replace(/<\/style/gi, '<\\/style');
    html = html.replace(match[0], () => `<style>${css}</style>`);
  }
  // Public assets otherwise point at the iframe host. Compiled JS references share
  // one embedded data URL per asset rather than repeating megabytes of room art.
  const assets = {};
  let assetSequence = 0;
  const walk = async (directory, prefix = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(join(directory, entry.name), `${relative}/`);
      else if (entry.isFile() && /\.(png|jpe?g|webp|svg|ico|woff2?|ttf|otf|mp4|mp3)$/i.test(entry.name)) {
        const url = '/' + relative;
        if (!html.includes(url)) continue;
        if (assetOrigin && /\.(png|jpe?g|webp|svg|ico|mp4|mp3)$/i.test(entry.name)) {
          // Only files found in the trusted build registry are rewritten. No tool
          // argument or user-provided URL can broaden the widget's asset origin.
          html = html.split(url).join(assetOrigin + url);
          continue;
        }
        // Videos stay streamed in local previews; never embed the movie in the widget HTML.
        if (/\.mp4$/i.test(entry.name)) continue;
        const mime = types[extname(entry.name).toLowerCase()];
        const bytes = await readFile(join(directory, entry.name));
        const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
        const key = `asset${++assetSequence}`;
        let references = 0;
        html = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (_, opening, code, closing) => {
          const rewritten = replaceAssetLiterals(code, url, `globalThis.__notableAssets.${key}`);
          references += rewritten.references;
          return opening + rewritten.code + closing;
        });
        if (references) assets[key] = dataUrl;
        // CSS/font URLs and nonliteral references keep their original representation.
        html = html.split(url).join(dataUrl);
      }
    }
  };
  await walk(distDirectory);
  if (Object.keys(assets).length) {
    const bootstrap = `<script>globalThis.__notableAssets=Object.freeze(${JSON.stringify(assets)});</script>`;
    html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, opening => opening + bootstrap) : bootstrap + html;
  }
  // Vite's single entry is already embedded; preloads would fetch from the host origin.
  return html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, '');
}

export function createNotableServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const demo = options.demo === true;
  if (demo && !loopback(host)) throw new Error('Demo mode can only bind to a loopback host.');
  const publicUrl = !demo && options.publicUrl ? new URL(options.publicUrl) : null;
  if (publicUrl && (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash)) throw new Error('Public MCP URL must use HTTPS without credentials, query or fragment.');
  const config = { demo, host, publicUrl, verifyToken: options.verifyToken ?? null, issuer: options.issuer ?? null };
  const oauthConfigured = !!(config.verifyToken && config.issuer && publicUrl);
  const distDirectory = resolve(options.distDirectory ?? join(PROJECT_ROOT, 'dist'));
  const store = options.store ?? new WorkspaceStore(options.dataDirectory ?? join(PROJECT_ROOT, '.notable-data'), { clock: options.clock, seeded: demo });
  const engine = new StudyEngine(store, { clock: options.clock, shareBaseUrl: publicUrl?.origin ?? `http://127.0.0.1:${options.port ?? 8787}` });
  const rateLimits = createRequestLimiter({ limit: 300 });
  const monitor = createOperationalMonitor({ configured: demo || oauthConfigured, operations: [...toolNames, ...creatorToolNames, ...communityTools.map(tool => tool.name)], clock: options.clock, logger: options.logger });
  const requestContexts = new WeakMap();
  const resourceMetadataUrl = publicUrl ? new URL('/.well-known/oauth-protected-resource', publicUrl).href : '';
  const failure = (error, request) => {
    const code = error instanceof InputError ? error.code : 'SERVER_ERROR';
    const context = requestContexts.get(request);
    const status = failureStatus(error, 500);
    monitor.failure(context, error, { code, status, transportStatus: request.url?.split('?', 1)[0] === '/mcp' ? 200 : status });
    const result = { isError: true, content: [{ type: 'text', text: error instanceof InputError ? error.message : 'Nooks could not complete this request. Your saved data has not been replaced.' }], structuredContent: { error: { code, message: error instanceof InputError ? error.message : 'Server error.', requestId: context.requestId } } };
    if (oauthConfigured && ['AUTH_REQUIRED', 'INSUFFICIENT_SCOPE'].includes(code)) result._meta = { 'mcp/www_authenticate': [`Bearer resource_metadata="${resourceMetadataUrl}", error="${code === 'AUTH_REQUIRED' ? 'invalid_token' : 'insufficient_scope'}", error_description="Connect your Nooks account to continue"`] };
    return result;
  };
  const invoke = async (name, args, request) => {
    const context = requestContexts.get(request);
    monitor.setOperation(context, name);
    if (!toolNames.has(name) && !creatorToolNames.has(name) && !(options.storeForIdentity && isCommunityTool(name))) throw new InputError('Unknown Nooks tool.', 'UNKNOWN_TOOL');
    context.phase = 'authentication';
    const user = await requestIdentity(request, config);
    if (isCommunityTool(name)) {
      if (!user?.id) throw new InputError('Connect your account to use study communities.', 'AUTH_REQUIRED');
      const scope = communityTools.find(tool=>tool.name===name).annotations.readOnlyHint ? 'notable.read' : 'notable.write';
      if (!user.scopes?.includes(scope)) throw new InputError(`The connected account needs ${scope} permission.`, 'INSUFFICIENT_SCOPE');
    }
    context.phase = 'backend';
    const requestStore = options.storeForIdentity && user ? await options.storeForIdentity(user) : store;
    const requestEngine = requestStore === store ? engine : new StudyEngine(requestStore, {clock:options.clock,shareBaseUrl:publicUrl?.origin});
    const structuredContent = creatorToolNames.has(name) ? await new NookCreator(requestStore,{clock:options.clock}).call(name,args,user) : isCommunityTool(name) ? await invokeCommunity(requestStore,name,args) : await requestEngine.call(name,args,user);
    if (user?.id) monitor.success();
    if (structuredContent.workspace?.artworkWarnings?.length) monitor.artworkUnavailable(context, { count: structuredContent.workspace.artworkWarnings.length });
    if (structuredContent.workspace) structuredContent.workspace.backend = options.storeForIdentity && user ? 'supabase' : demo ? 'local-demo' : 'local';
    return { structuredContent, content: [{ type: 'text', text: name === 'workspace_render' ? 'Your study nook is ready.' : name === 'workspace_get' ? `${structuredContent.workspace.artifacts.length} study items loaded${user ? '' : ' in read-only preview'}.` : 'Your study space is updated.' }] };
  };
  const serverInfo = { name: 'notable-study-space', title: 'Nooks', version: '0.1.0', icons: [{ src: UI_ICON, mimeType: 'image/svg+xml' }] };
  const capabilities = { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } };
  const instructions = studyInstructions({ connectedCommunity: !!options.storeForIdentity });
  const rpc = async (message, request, protocol) => {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && typeof message.id !== 'string' && typeof message.id !== 'number')) return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    if (message.id === undefined) return null;
    const reply = result => ({ jsonrpc: '2.0', id: message.id, result: mcpResult(result, { version: protocol.version, serverInfo, method: message.method }) });
    switch (message.method) {
      case 'server/discover': return reply(discoverResult({ serverInfo, capabilities, instructions }));
      case 'initialize': {
        if (protocol.modern) return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Modern MCP uses server/discover instead of initialize.' } };
        return reply({ protocolVersion: LEGACY_PROTOCOL_VERSIONS.includes(message.params?.protocolVersion) ? message.params.protocolVersion : LEGACY_PROTOCOL_VERSIONS[0], capabilities, serverInfo, instructions });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: [...listTools({ demo, oauthConfigured }), ...listNookCreatorTools({demo,oauthConfigured}), ...(options.storeForIdentity ? communityTools.map(tool=>{const securitySchemes=oauthConfigured?[{type:'oauth2',scopes:tool.annotations.readOnlyHint?['notable.read']:['notable.read','notable.write']}]:[{type:'noauth'}];return {...tool,securitySchemes,_meta:{...tool._meta,securitySchemes}};}) : [])] });
      case 'tools/call': {
        if (!message.params || typeof message.params.name !== 'string') return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Tool name required' } };
        try { return reply(modelSafeResult(await invoke(message.params.name, message.params.arguments ?? {}, request))); }
        catch (error) { return reply(failure(error, request)); }
      }
      case 'resources/list': return reply({ resources: [{ uri: UI_URI, name: 'notable-study-workspace', title: 'Nooks study space', description: 'Interactive notes, quizzes, flashcards, study games, planning and focus workspace.', mimeType: UI_MIME }] });
      case 'resources/templates/list': return reply({ resourceTemplates: [] });
      case 'resources/read': {
        const context = requestContexts.get(request); monitor.setOperation(context, 'resources_read'); context.phase = 'resource';
        if (![UI_URI, LEGACY_UI_URI].includes(message.params?.uri)) return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Unknown resource' } };
        try {
          const text = await widgetHtml(distDirectory, { assetOrigin: publicUrl?.origin });
          const resourceDomains = publicUrl ? [publicUrl.origin] : [];
          // Spotify owns the optional user-loaded player; it receives no study API access.
          const frameDomains = ['https://open.spotify.com'];
          return reply({ contents: [{ uri: message.params.uri, mimeType: UI_MIME, text, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [...resourceDomains, 'https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com'], resourceDomains, frameDomains } }, 'openai/ui': { availableDisplayModes: ['fullscreen'] }, 'openai/widgetDescription': 'Nooks study workspace with saved learning materials, practice modes, focus timers, nook-specific collections and sample community lobbies.', 'openai/widgetPrefersBorder': false, 'openai/widgetCSP': { connect_domains: [...resourceDomains, 'https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com'], resource_domains: resourceDomains, frame_domains: frameDomains } } }] });
        } catch (error) { monitor.failure(context, error, { status: 500, transportStatus: 200 }); return { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Build the frontend before reading the UI resource.', data: { requestId: context.requestId } } }; }
      }
      default: return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    }
  };
  const server = http.createServer(async (request, response) => {
    const context = monitor.start(); requestContexts.set(request, context);
    response.setHeader('X-Request-Id', context.requestId);
    try {
      const requestedHost = new URL(`http://${request.headers.host ?? 'invalid'}`).hostname;
      const allowedHost = publicUrl ? requestedHost === publicUrl.hostname : loopback(requestedHost);
      if (!allowedHost) return json(response, 403, { error: 'Invalid host.' });
      const requestedPath = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
      const publicMedia = !!publicUrl && request.method === 'GET' && (/^\/(?:images|assets)\/.+\.(?:png|jpe?g|webp|svg|ico|mp3)$/i.test(requestedPath) || /^\/media\/(?:opening-film|nooks)\/[a-z0-9-]+\.mp4$/i.test(requestedPath));
      const origin = request.headers.origin;
      if (origin && publicMedia) {
        // Build images and the opening film are public. Sandbox media requests do not
        // opening the authenticated API or MCP transport to other origins.
        response.setHeader('Access-Control-Allow-Origin', '*');
      } else if (origin) {
        let url; try { url = new URL(origin); } catch { return json(response, 403, { error: 'Invalid origin.' }); }
        const allowedOrigin = demo ? loopback(url.hostname) && [5173, 8787, Number(server.address()?.port)].includes(Number(url.port)) : origin === publicUrl?.origin || origin === 'https://chatgpt.com';
        if (!allowedOrigin) return json(response, 403, { error: 'Origin is not allowed.' });
        response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      }
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const remote = request.socket.remoteAddress ?? '';
      const current = Date.now();
      const rateLimit = rateLimits(remote, current);
      if (!rateLimit.allowed) return json(response, 429, { error: 'Please wait before making more requests.' }, { 'Retry-After': String(rateLimit.retryAfter) });
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name' }); return response.end(); }
      if (url.pathname === '/health' && request.method === 'GET') return json(response, 200, { ...monitor.health(), mode: demo ? 'local-demo' : 'production', oauthConfigured });
      if (url.pathname === '/.well-known/oauth-protected-resource' && request.method === 'GET') {
        if (!oauthConfigured) return json(response, 503, { error: 'OAuth provider is not configured. Anonymous preview only.' });
        return json(response, 200, { resource: publicUrl.href, authorization_servers: [config.issuer], scopes_supported: ['notable.read', 'notable.write'], bearer_methods_supported: ['header'], resource_name: 'Nooks study space' });
      }
      if (url.pathname === '/mcp') {
        if (request.method !== 'POST') return json(response, 405, { error: 'This stateless MCP endpoint uses POST; GET streaming is not supported.' }, { Allow: 'POST' });
        if (!(request.headers['content-type'] ?? '').startsWith('application/json')) return json(response, 415, { error: 'Content-Type must be application/json.' });
        const message = await body(request);
        const protocol = validateMcpRequest(message, request.headers);
        if (protocol.error) return json(response, protocol.status, protocol.error);
        const result = await rpc(message, request, protocol);
        if (result === null) { response.writeHead(202); return response.end(); }
        return json(response, protocol.modern && result.error?.code === -32601 ? 404 : 200, result);
      }
      if (url.pathname.startsWith('/api/shared/') && request.method === 'GET') {
        const share = await store.readShare(url.pathname.slice('/api/shared/'.length));
        return share ? json(response, 200, { share }) : json(response, 404, { error: 'This shared space is unavailable or was revoked.' });
      }
      if (url.pathname.startsWith('/api/')) {
        if (!demo) return json(response, 404, { error: 'Local preview API is disabled.' });
        if (url.pathname === '/api/workspace' && request.method === 'GET') return json(response, 200, (await invoke('workspace_get', {}, request)).structuredContent);
        if (url.pathname.startsWith('/api/tools/') && request.method === 'POST') {
          if (!(request.headers['content-type'] ?? '').startsWith('application/json')) return json(response, 415, { error: 'JSON body required.' });
          try { return json(response, 200, (await invoke(url.pathname.slice('/api/tools/'.length), await body(request), request)).structuredContent); }
          catch (error) { const result = failure(error, request); return json(response, failureStatus(error, 500), result.structuredContent); }
        }
        return json(response, 404, { error: 'Unknown preview API.' });
      }
      if (request.method === 'GET') {
        const pathname = decodeURIComponent(url.pathname);
        const filename = resolve(distDirectory, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
        if (!filename.startsWith(distDirectory + sep)) return json(response, 403, { error: 'Invalid asset path.' });
        try {
          if (!(await stat(filename)).isFile()) return json(response, 404, { error: 'Asset not found.' });
          response.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }); response.end(await readFile(filename)); return;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return json(response, 404, { error: 'Not found. Run the frontend build for the preview.' });
    } catch (error) {
      const status = failureStatus(error, 500);
      monitor.failure(context, error, { code: error instanceof InputError ? error.code : 'SERVER_ERROR', status });
      if (error.code === 'INVALID_JSON' && request.url === '/mcp') return json(response, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { requestId: context.requestId } } });
      return json(response, status, { error: error instanceof InputError ? error.message : 'Server error.', requestId: context.requestId });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, engine, store, config };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes('--demo');
  const host = process.env.NOTABLE_HOST ?? '127.0.0.1';
  const publicUrl = process.env.NOTABLE_MCP_PUBLIC_URL;
  const issuer = process.env.NOTABLE_OAUTH_ISSUER;
  const verifyToken = createIntrospectionVerifier({ endpoint: process.env.NOTABLE_TOKEN_INTROSPECTION_URL, issuer, audience: publicUrl, clientId: process.env.NOTABLE_OAUTH_CLIENT_ID, clientSecret: process.env.NOTABLE_OAUTH_CLIENT_SECRET });
  const port = Number(process.env.NOTABLE_PORT ?? 8787);
  const { server } = createNotableServer({ demo, host, publicUrl, issuer, verifyToken, port, dataDirectory: process.env.NOTABLE_DATA_DIRECTORY });
  server.listen(port, host, () => process.stdout.write(`Nooks ${demo ? 'local demo' : 'MCP server'} listening at http://${host}:${port}\n`));
  const shutdown = () => {
    server.close(() => process.exit(0));
    // Finish in-flight persistence before exiting; cap shutdown for stuck clients.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
