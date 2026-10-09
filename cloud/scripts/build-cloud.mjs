import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import worker, { ARTWORK_ORIGIN } from '../worker/index.mjs';
import { widgetHtml } from '../server/index.mjs';
import { CURRENT_PROTOCOL_VERSION } from '../server/protocol.mjs';
import { UI_URI, UI_MIME } from '../server/tools.mjs';
await viteBuild({ build: { outDir: '../dist/client', emptyOutDir: true } });
const widget = await widgetHtml(resolve('dist/client'), {assetOrigin: ARTWORK_ORIGIN});
// A conservative project budget, not a documented ChatGPT transport limit.
// Exercise the real modern resources/read envelope locally without backend or
// network access; JSON escaping and protocol/resource metadata count too.
const resourceBudgetBytes = 2 * 1024 * 1024;
const response = await worker.fetch(new Request('https://nooks-build.invalid/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': CURRENT_PROTOCOL_VERSION, 'Mcp-Method': 'resources/read', 'Mcp-Name': UI_URI },
  body: JSON.stringify({ jsonrpc: '2.0', id: 'resource-build-budget', method: 'resources/read', params: { uri: UI_URI, _meta: { 'io.modelcontextprotocol/protocolVersion': CURRENT_PROTOCOL_VERSION, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
}), { ASSETS: { fetch: async request => {
  assert.equal(new URL(request.url).pathname, '/widget.html');
  return new Response(widget, { headers: { 'Content-Type': 'text/html' } });
} } });
assert.equal(response.status, 200, 'Native resource build probe failed');
const resourceBody = await response.text(), resourceEnvelope = JSON.parse(resourceBody);
assert.equal(resourceEnvelope.result?.resultType, 'complete', 'Native modern resource envelope is invalid');
assert.equal(resourceEnvelope.result.contents?.[0]?.mimeType, UI_MIME);
assert.equal(resourceEnvelope.result.contents[0].text, widget, 'Native resource probe changed the widget');
const resourceBytes = Buffer.byteLength(resourceBody);
assert.ok(resourceBytes <= resourceBudgetBytes, `Native serialized resource is ${resourceBytes} bytes; project budget is ${resourceBudgetBytes} bytes. Reduce the resource before publishing.`);
await writeFile('dist/client/widget.html', widget);
await mkdir('dist/server', { recursive: true });
await build({ entryPoints: ['worker/index.mjs'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
console.log(`Nooks Worker built. Inline interface code: ${(Buffer.byteLength(widget) / 1024 / 1024).toFixed(2)} MiB. Modern resource envelope: ${resourceBytes}/${resourceBudgetBytes} bytes (project budget).`);
