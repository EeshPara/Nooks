import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{descriptors,ARTWORK_ORIGIN} from '../worker/index.mjs';
import { CURRENT_PROTOCOL_VERSION } from '../server/protocol.mjs';
const request=(method,params={},headers={})=>new Request('https://nooks.example/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
test('cloud publishes complete schemas without pretending self-hosted OAuth is configured',async()=>{
 const tools=descriptors();assert.equal(new Set(tools.map(x=>x.name)).size,tools.length);
 for(const name of ['context_get','note_revision_get','nook_publish_commit','nook_snapshot'])assert.ok(tools.find(x=>x.name===name));
 assert.ok(tools.every(x=>!x.securitySchemes&&!x._meta.securitySchemes));
 assert.equal(tools.find(x=>x.name==='focus_start').annotations.idempotentHint,false);
});
test('cloud denies anonymous study data and fails closed before missing database configuration',async()=>{
 const missing=await worker.fetch(request('tools/call',{name:'workspace_get'}),{});assert.equal(missing.status,401);
 const configuredIdentity=await worker.fetch(request('tools/call',{name:'workspace_get'},{'oai-authenticated-user-id':'trusted-test-subject'}),{});
 const result=(await configuredIdentity.json()).result;assert.equal(result.isError,true);assert.equal(result.structuredContent.error.code,'BACKEND_NOT_CONFIGURED');assert.equal(result.structuredContent.workspace,undefined);
 const health=await worker.fetch(new Request('https://nooks.example/health'),{});assert.equal((await health.json()).configured,false);
});
test('cloud serves only known UI resources with declared sandbox capabilities',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('<main>Nooks</main>')}};
 const unknown=await worker.fetch(request('resources/read',{uri:'ui://other'}),env);assert.equal((await unknown.json()).error.code,-32602);
 const result=await worker.fetch(request('resources/read',{uri:'ui://notable/workspace-v1.html'}),env);
 const resource=(await result.json()).result.contents[0];assert.match(resource.text,/Nooks/);assert.equal(resource.mimeType,'text/html;profile=mcp-app');
 assert.deepEqual(resource._meta['openai/ui'].availableDisplayModes,['fullscreen']);assert.deepEqual(resource._meta.ui.csp.frameDomains,['https://open.spotify.com']);
});

test('cloud current UI uses the restored fullscreen layout and a bounded public artwork origin',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('<main>Nooks</main>')}};
 const response=await worker.fetch(request('resources/read',{uri:'ui://notable/workspace-v2.html'}),env);
 const resource=(await response.json()).result.contents[0];
 assert.deepEqual(resource._meta.ui.csp.resourceDomains,[ARTWORK_ORIGIN]);
 assert.deepEqual(resource._meta.ui.csp.connectDomains,['https://files.oaiusercontent.com','https://sdmntprwestus.oaiusercontent.com','https://sdmntprcentralus.oaiusercontent.com']);
 assert.deepEqual(resource._meta['openai/widgetCSP'].connect_domains,resource._meta.ui.csp.connectDomains);
 assert.deepEqual(resource._meta['openai/ui'].availableDisplayModes,['fullscreen']);
 assert.equal(resource._meta['openai/ui'].preferredDisplayMode,undefined);
});

const modernRequest = (method, params = {}, authenticated = false) => request(method, {
 ...params,
 _meta: { 'io.modelcontextprotocol/protocolVersion': CURRENT_PROTOCOL_VERSION, 'io.modelcontextprotocol/clientCapabilities': {} },
}, {
 'MCP-Protocol-Version': CURRENT_PROTOCOL_VERSION, 'Mcp-Method': method,
 ...(method === 'tools/call' ? { 'Mcp-Name': params.name } : method === 'resources/read' ? { 'Mcp-Name': params.uri } : {}),
 ...(authenticated ? { 'oai-authenticated-user-id': 'trusted-test-subject' } : {}),
});

test('current native host can discover tools and read the UI without a legacy handshake',async()=>{
 const discovery = await worker.fetch(modernRequest('server/discover'),{});
 assert.equal(discovery.status,200);
 const details = (await discovery.json()).result;
 assert.ok(details.supportedVersions.includes(CURRENT_PROTOCOL_VERSION));
 assert.equal(details.resultType,'complete');
 assert.equal(details._meta['io.modelcontextprotocol/serverInfo'].name,'nooks');
 const listed = await worker.fetch(modernRequest('tools/list'),{});
 assert.equal(listed.status,200);
 assert.ok((await listed.json()).result.tools.some(tool=>tool.name==='workspace_render'));
 const ui = await worker.fetch(modernRequest('resources/read',{uri:'ui://notable/workspace-v2.html'}),{ASSETS:{fetch:async()=>new Response('<main>Nooks</main>')}});
 assert.equal(ui.status,200);
 const resource=(await ui.json()).result;
 assert.equal(resource.resultType,'complete');
 assert.equal(resource.cacheScope,'private');
 assert.equal(resource.contents[0]._meta.ui.prefersBorder,false);
});

test('current host tool calls reach backend checks instead of rejecting their protocol',async()=>{
 const response=await worker.fetch(modernRequest('tools/call',{name:'workspace_get',arguments:{}},true),{});
 assert.equal(response.status,200);
 const result=(await response.json()).result;
 assert.equal(result.resultType,'complete');
 assert.equal(result.isError,true);
 assert.equal(result.structuredContent.error.code,'BACKEND_NOT_CONFIGURED');
 const anonymous=await worker.fetch(modernRequest('tools/call',{name:'workspace_get',arguments:{}}),{});
 assert.equal(anonymous.status,401);
});

test('cloud still rejects unknown versions and conflicting request metadata',async()=>{
 const unsupported=await worker.fetch(request('tools/list',{}, {'MCP-Protocol-Version':'2099-01-01'}),{});
 assert.equal(unsupported.status,400);
 const error=(await unsupported.json()).error;
 assert.equal(error.code,-32022);
 assert.ok(error.data.supported.includes(CURRENT_PROTOCOL_VERSION));
 const mismatch=await worker.fetch(request('tools/list',{_meta:{'io.modelcontextprotocol/protocolVersion':CURRENT_PROTOCOL_VERSION,'io.modelcontextprotocol/clientCapabilities':{}}},{'MCP-Protocol-Version':'2025-11-25'}),{});
 assert.equal(mismatch.status,400);
 assert.equal((await mismatch.json()).error.code,-32020);
});

test('Sites can load native UI when its dispatcher omits mirrored routing headers',async()=>{
 const params={uri:'ui://notable/workspace-v2.html',_meta:{'io.modelcontextprotocol/protocolVersion':CURRENT_PROTOCOL_VERSION,'io.modelcontextprotocol/clientCapabilities':{}}};
 const headers={'MCP-Protocol-Version':CURRENT_PROTOCOL_VERSION};
 const env={ASSETS:{fetch:async()=>new Response('<main>Nooks</main>')}};
 const response=await worker.fetch(request('resources/read',params,headers),env);
 assert.equal(response.status,200);
 const result=(await response.json()).result;
 assert.equal(result.resultType,'complete');
 assert.match(result.contents[0].text,/Nooks/);
 for(const extra of [{'Mcp-Method':'tools/list'},{'Mcp-Name':'ui://other'}]){
  const mismatch=await worker.fetch(request('resources/read',params,{...headers,...extra}),env);
  assert.equal(mismatch.status,400);
 }
});

test('Sites header compatibility does not authenticate client metadata or permit missing protocol metadata',async()=>{
 const headers={'MCP-Protocol-Version':CURRENT_PROTOCOL_VERSION};
 const params={name:'workspace_get',arguments:{},_meta:{'io.modelcontextprotocol/protocolVersion':CURRENT_PROTOCOL_VERSION,'io.modelcontextprotocol/clientCapabilities':{},'oai-authenticated-user-id':'forged'}};
 const anonymous=await worker.fetch(request('tools/call',params,headers),{});
 assert.equal(anonymous.status,401);
 const noMetadata=await worker.fetch(request('tools/list',{},headers),{});
 assert.equal(noMetadata.status,400);
 const connected=await worker.fetch(request('tools/call',params,{...headers,'oai-authenticated-user-id':'trusted-test-subject'}),{});
 assert.equal(connected.status,200);
 assert.equal((await connected.json()).result.structuredContent.error.code,'BACKEND_NOT_CONFIGURED');
});
