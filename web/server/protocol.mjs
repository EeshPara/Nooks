// Dual-era HTTP support. These helpers also run in Workers (no Node imports).
// https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
// https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
export const CURRENT_PROTOCOL_VERSION = '2026-07-28';
export const LEGACY_PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26']);
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([CURRENT_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS]);
const VERSION = 'io.modelcontextprotocol/protocolVersion';
const CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const requestId = message => typeof message?.id === 'string' || Number.isSafeInteger(message?.id) ? message.id : null;
function header(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name);
  const key = Object.keys(headers ?? {}).find(key => key.toLowerCase() === name.toLowerCase());
  // Reserve null for an absent header; an explicitly supplied null is malformed.
  return key === undefined ? null : headers[key] ?? undefined;
}
function reject(message, code, text, data) {
  return { status: 400, error: { jsonrpc: '2.0', id: requestId(message), error: { code, message: text, ...(data ? { data } : {}) } } };
}
function decodedName(value) {
  if (typeof value !== 'string' || !value || !/^[\x20-\x7e\t]+$/.test(value) || value.trim() !== value) throw new Error('Invalid name header');
  if (!value.startsWith('=?base64?') || !value.endsWith('?=')) return value;
  const encoded = value.slice(9, -2);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid Base64 header');
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
}

/** Validate transport metadata without trusting it for authentication or account identity.
 * Only the trusted Sites dispatcher adapter should opt into absent mirror compatibility.
 */
export function validateMcpRequest(message, headers, options = {}) {
  if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || !message.method || (message.id !== undefined && requestId(message) === null) || (message.params !== undefined && !object(message.params))) {
    return reject(message, -32600, 'Invalid Request');
  }
  const meta = message.params?._meta;
  if (meta !== undefined && !object(meta)) return reject(message, -32602, 'Request _meta must be an object.');
  const bodyVersion = meta?.[VERSION];
  const headerVersion = header(headers, 'MCP-Protocol-Version');
  if (bodyVersion !== undefined && typeof bodyVersion !== 'string') return reject(message, -32602, 'Protocol version metadata must be a string.');
  if (headerVersion !== null && typeof headerVersion !== 'string') return reject(message, -32020, 'Malformed MCP-Protocol-Version header.');
  if (bodyVersion !== undefined && headerVersion !== null && bodyVersion !== headerVersion) return reject(message, -32020, 'MCP-Protocol-Version header does not match request metadata.');
  const version = bodyVersion ?? headerVersion ?? '2025-03-26';
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(version)) return reject(message, -32022, 'Unsupported protocol version', { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: version });
  const modern = version === CURRENT_PROTOCOL_VERSION;
  if (modern) {
    const allowMissingMirrors = options?.allowMissingMirroredHeaders === true;
    if (bodyVersion === undefined || !object(meta?.[CAPABILITIES])) return reject(message, -32602, 'Modern requests require protocolVersion and clientCapabilities in params._meta.');
    if (headerVersion === null) return reject(message, -32020, 'MCP-Protocol-Version header is required.');
    const method = header(headers, 'Mcp-Method');
    if (method !== message.method && !(allowMissingMirrors && method === null)) return reject(message, -32020, 'Mcp-Method header is missing or does not match the request.');
    const named = message.method === 'resources/read' ? 'uri' : ['tools/call', 'prompts/get'].includes(message.method) ? 'name' : null;
    if (named) {
      const name = header(headers, 'Mcp-Name');
      if (allowMissingMirrors && name === null) {
        if (typeof message.params?.[named] !== 'string' || !message.params[named]) return reject(message, -32602, `Request ${named} must be a nonempty string.`);
      } else {
        try {
          if (decodedName(name) !== message.params?.[named]) return reject(message, -32020, 'Mcp-Name header does not match the request.');
        } catch { return reject(message, -32020, 'Mcp-Name header is missing or malformed.'); }
      }
    }
  }
  return { version, modern };
}

const cacheableMethods = new Set(['server/discover', 'tools/list', 'prompts/list', 'resources/list', 'resources/templates/list', 'resources/read']);
/** Keep private widget metadata while adding the modern protocol envelope fields. */
export function mcpResult(result, { version, serverInfo, method } = {}) {
  if (version !== CURRENT_PROTOCOL_VERSION) return result;
  return {
    ...result,
    resultType: 'complete',
    ...(cacheableMethods.has(method) ? { ttlMs: 0, cacheScope: 'private' } : {}),
    _meta: { ...result?._meta, 'io.modelcontextprotocol/serverInfo': serverInfo },
  };
}

export function discoverResult({ serverInfo, capabilities, instructions }) {
  return mcpResult({ supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS], capabilities, ...(instructions ? { instructions } : {}) }, { version: CURRENT_PROTOCOL_VERSION, serverInfo, method: 'server/discover' });
}
