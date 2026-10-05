import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNotableServer } from '../server/index.mjs';
import { UI_URI } from '../server/tools.mjs';
import { CURRENT_PROTOCOL_VERSION as current, LEGACY_PROTOCOL_VERSIONS, SUPPORTED_PROTOCOL_VERSIONS, validateMcpRequest, mcpResult, discoverResult } from '../server/protocol.mjs';

const versionKey = 'io.modelcontextprotocol/protocolVersion';
const capabilitiesKey = 'io.modelcontextprotocol/clientCapabilities';
const identityKey = 'io.modelcontextprotocol/serverInfo';
function request(method = 'tools/list', params = {}, version = current) {
  const message = { jsonrpc: '2.0', id: 'request-1', method, params: { ...params, _meta: { [versionKey]: version, [capabilitiesKey]: {} } } };
  const headers = { 'MCP-Protocol-Version': version, 'Mcp-Method': method };
  if (method === 'resources/read') headers['Mcp-Name'] = params.uri;
  if (['tools/call', 'prompts/get'].includes(method)) headers['Mcp-Name'] = params.name;
  return { message, headers };
}
const check = ({ message, headers }) => validateMcpRequest(message, headers);

test('current requests work without initialization and without optional client identity', () => {
  const fixture = request();
  assert.deepEqual(check(fixture), { version: current, modern: true });
  assert.deepEqual(validateMcpRequest(fixture.message, new Headers(fixture.headers)), { version: current, modern: true });
  assert.deepEqual(validateMcpRequest({ jsonrpc:'2.0', id:1, method:'tools/list' }, {}), { version:'2025-03-26', modern:false });
  for (const version of LEGACY_PROTOCOL_VERSIONS) assert.equal(validateMcpRequest({jsonrpc:'2.0',id:1,method:'tools/list'}, {'mcp-protocol-version':version}).version, version);
});

test('unknown versions return a negotiable modern error, not a generic HTTP message', () => {
  const result = check(request('tools/list', {}, '2099-01-01'));
  assert.equal(result.status, 400);
  assert.equal(result.error.error.code, -32022);
  assert.deepEqual(result.error.error.data, { supported:[...SUPPORTED_PROTOCOL_VERSIONS], requested:'2099-01-01' });
  assert.equal(result.error.id, 'request-1');
});

test('explicit version, method, and name mismatches never reach a tool', () => {
  const versionMismatch = request(); versionMismatch.headers['MCP-Protocol-Version'] = '2025-11-25';
  assert.equal(check(versionMismatch).error.error.code, -32020);
  const methodMismatch = request(); methodMismatch.headers['Mcp-Method'] = 'tools/call';
  assert.equal(check(methodMismatch).error.error.code, -32020);
  const nameMismatch = request('tools/call', { name:'workspace_get' }); nameMismatch.headers['Mcp-Name'] = 'artifact_delete';
  assert.equal(check(nameMismatch).error.error.code, -32020);
  const missingHeader = request(); delete missingHeader.headers['Mcp-Method'];
  assert.equal(check(missingHeader).error.error.code, -32020);
  const missingVersionHeader = request(); delete missingVersionHeader.headers['MCP-Protocol-Version'];
  assert.equal(check(missingVersionHeader).error.error.code, -32020);
});

test('modern required metadata is checked but clientInfo stays optional', () => {
  const missingVersion = request(); delete missingVersion.message.params._meta[versionKey];
  assert.equal(check(missingVersion).error.error.code, -32602);
  const missingCapabilities = request(); delete missingCapabilities.message.params._meta[capabilitiesKey];
  assert.equal(check(missingCapabilities).error.error.code, -32602);
  const invalidCapabilities = request(); invalidCapabilities.message.params._meta[capabilitiesKey] = [];
  assert.equal(check(invalidCapabilities).error.error.code, -32602);
  const malformedParams = request(); malformedParams.message.params = [];
  assert.equal(check(malformedParams).error.error.code, -32600);
});

const sitesCheck = ({ message, headers }) => validateMcpRequest(message, headers, { allowMissingMirroredHeaders: true });

test('Sites compatibility accepts absent mirrors only when explicitly enabled', () => {
  for (const [method,params] of [['tools/list',{}],['tools/call',{name:'workspace_get',arguments:{}}],['resources/read',{uri:UI_URI}],['prompts/get',{name:'study'}]]) {
    const fixture = request(method, params);
    delete fixture.headers['Mcp-Method']; delete fixture.headers['Mcp-Name'];
    assert.equal(check(fixture).error.error.code,-32020);
    assert.deepEqual(sitesCheck(fixture),{version:current,modern:true});
    assert.deepEqual(validateMcpRequest(fixture.message,new Headers(fixture.headers),{allowMissingMirroredHeaders:true}),{version:current,modern:true});
    assert.equal(validateMcpRequest(fixture.message,fixture.headers,{allowMissingMirroredHeaders:false}).error.error.code,-32020);
    assert.equal(validateMcpRequest(fixture.message,fixture.headers,{allowMissingMirroredHeaders:'true'}).error.error.code,-32020);
  }
  const onlyMethodMissing=request('tools/call',{name:'workspace_get'});delete onlyMethodMissing.headers['Mcp-Method'];
  assert.equal(sitesCheck(onlyMethodMissing).modern,true);
  const onlyNameMissing=request('tools/call',{name:'workspace_get'});delete onlyNameMissing.headers['Mcp-Name'];
  assert.equal(sitesCheck(onlyNameMissing).modern,true);
});

test('Sites compatibility still rejects supplied mirror conflicts and malformed values', () => {
  for (const badMethod of ['resources/read','',null,undefined,42,[],{}]) {
    const fixture=request('tools/call',{name:'workspace_get'});fixture.headers['Mcp-Method']=badMethod;
    assert.equal(sitesCheck(fixture).error.error.code,-32020);
  }
  for (const badName of ['artifact_delete','',null,undefined,42,[],{},' workspace_get','workspace_get\n','=?base64?/w==?=','=?base64?not base64?=']) {
    const fixture=request('tools/call',{name:'workspace_get'});delete fixture.headers['Mcp-Method'];fixture.headers['Mcp-Name']=badName;
    assert.equal(sitesCheck(fixture).error.error.code,-32020);
  }
  const unicode=request('resources/read',{uri:'nook://学習/notes'});delete unicode.headers['Mcp-Method'];
  unicode.headers['Mcp-Name']='=?base64?'+Buffer.from(unicode.message.params.uri).toString('base64')+'?=';
  assert.equal(sitesCheck(unicode).modern,true);
});

test('Sites compatibility does not relax protocol versions or required metadata', () => {
  const missingHeader=request();delete missingHeader.headers['MCP-Protocol-Version'];
  assert.equal(sitesCheck(missingHeader).error.error.code,-32020);
  const conflict=request();conflict.headers['MCP-Protocol-Version']='2025-11-25';
  assert.equal(sitesCheck(conflict).error.error.code,-32020);
  assert.equal(sitesCheck(request('tools/list',{},'2099-01-01')).error.error.code,-32022);
  const missingVersion=request();delete missingVersion.message.params._meta[versionKey];
  assert.equal(sitesCheck(missingVersion).error.error.code,-32602);
  const missingCapabilities=request();delete missingCapabilities.message.params._meta[capabilitiesKey];
  assert.equal(sitesCheck(missingCapabilities).error.error.code,-32602);
  for (const badCapabilities of [null,[],false,'']) {
    const fixture=request();fixture.message.params._meta[capabilitiesKey]=badCapabilities;
    assert.equal(sitesCheck(fixture).error.error.code,-32602);
  }
  for (const badName of [undefined,null,42,'']) {
    const fixture=request('tools/call',{name:badName});delete fixture.headers['Mcp-Name'];
    assert.equal(sitesCheck(fixture).error.error.code,-32602);
  }
  const malformed=request();malformed.message.params=[];
  assert.equal(sitesCheck(malformed).error.error.code,-32600);
});

test('Mcp-Name supports the specified UTF-8 Base64 sentinel without accepting malformed bytes', () => {
  const fixture = request('resources/read', { uri:'nook://学習/notes' });
  fixture.headers['Mcp-Name'] = '=?base64?' + Buffer.from(fixture.message.params.uri).toString('base64') + '?=';
  assert.equal(check(fixture).modern, true);
  fixture.headers['Mcp-Name'] = '=?base64?/w==?=';
  assert.equal(check(fixture).error.error.code, -32020);
  fixture.headers['Mcp-Name'] = '=?base64?not base64?=';
  assert.equal(check(fixture).error.error.code, -32020);
});

test('modern responses preserve private widget state and apply private, immediately stale cache hints', () => {
  const serverInfo = {name:'nooks',version:'test'};
  const input = {structuredContent:{summary:'visible'},_meta:{notableData:{workspace:{artifacts:[{id:'private-note'}]}}}};
  const result = mcpResult(input,{version:current,serverInfo,method:'tools/call'});
  assert.equal(result.resultType,'complete');
  assert.deepEqual(result._meta.notableData,input._meta.notableData);
  assert.deepEqual(result._meta[identityKey],serverInfo);
  assert.equal(input._meta[identityKey],undefined);
  assert.equal(result.cacheScope,undefined);
  assert.strictEqual(mcpResult(input,{version:'2025-11-25',serverInfo}),input);
  const discovered = discoverResult({serverInfo,capabilities:{tools:{},resources:{}},instructions:'Open Nooks'});
  assert.deepEqual(discovered.supportedVersions,[...SUPPORTED_PROTOCOL_VERSIONS]);
  assert.equal(discovered.cacheScope,'private'); assert.equal(discovered.ttlMs,0);
  for (const method of ['tools/list','resources/list','resources/templates/list','resources/read']) {
    const response=mcpResult({}, {version:current,serverInfo,method});
    assert.equal(response.cacheScope,'private'); assert.equal(response.ttlMs,0);
  }
});

async function serverFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-protocol-'));
  const dist = join(directory,'dist'); await mkdir(dist);
  await writeFile(join(dist,'index.html'),'<div id="root">Nooks test workspace</div>');
  const {server} = createNotableServer({dataDirectory:join(directory,'data'),distDirectory:dist});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/mcp`;
  return async ({message,headers}) => {
    const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(message)});
    return {status:response.status,body:response.status===202?null:await response.json(),headers:response.headers};
  };
}

test('HTTP discovery, tool call, and UI read work directly under the modern protocol', async t => {
  const post=await serverFixture(t);
  const discovery=await post(request('server/discover'));
  assert.equal(discovery.status,200);
  assert.equal(discovery.body.result.resultType,'complete');
  assert.deepEqual(discovery.body.result.supportedVersions,[...SUPPORTED_PROTOCOL_VERSIONS]);
  assert.equal(discovery.body.result._meta[identityKey].name,'notable-study-space');
  const tools=await post(request('tools/list'));
  assert.equal(tools.status,200); assert.equal(tools.body.result.cacheScope,'private');
  assert.equal(tools.body.result.tools.find(tool=>tool.name==='workspace_render')._meta.ui.resourceUri,UI_URI);
  const opened=await post(request('tools/call',{name:'workspace_render',arguments:{}}));
  assert.equal(opened.status,200); assert.equal(opened.body.result.resultType,'complete');
  assert.ok(opened.body.result._meta.notableData.workspace);
  const html=await post(request('resources/read',{uri:UI_URI}));
  assert.equal(html.status,200); assert.match(html.body.result.contents[0].text,/Nooks test workspace/);
  assert.equal(html.body.result.ttlMs,0);
  assert.deepEqual(html.body.result.contents[0]._meta['openai/ui'].availableDisplayModes,['fullscreen']);
  assert.equal(html.headers.get('Mcp-Session-Id'),null);
});

test('HTTP modern failures remain distinguishable and do not bypass account authorization', async t => {
  const post=await serverFixture(t);
  const unsupported=await post(request('tools/list',{},'2099-01-01'));
  assert.equal(unsupported.status,400); assert.equal(unsupported.body.error.code,-32022);
  const missing=await post(request('method/unknown'));
  assert.equal(missing.status,404); assert.equal(missing.body.error.code,-32601);
  const forged=request('tools/call',{name:'artifact_save',arguments:{artifact:{kind:'note',title:'x',subject:'x',content:'x'}}});
  forged.message.params._meta['io.modelcontextprotocol/clientInfo']={name:'admin',version:'1',id:'alice'};
  const denied=await post(forged);
  assert.equal(denied.status,200); assert.equal(denied.body.result.isError,true);
  assert.equal(denied.body.result.structuredContent.error.code,'AUTH_REQUIRED');
  assert.equal(denied.body.result.resultType,'complete');
});

test('legacy initialize still negotiates only legacy revisions alongside stateless requests', async t => {
  const post=await serverFixture(t);
  for(const version of ['2025-11-25','1900-01-01']) {
    const response=await post({message:{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:version}},headers:{}});
    assert.equal(response.status,200);
    assert.equal(response.body.result.protocolVersion,'2025-11-25');
    assert.equal(response.body.result.resultType,undefined);
  }
  const modernInitialize=await post(request('initialize'));
  assert.equal(modernInitialize.status,404);
  assert.equal(modernInitialize.body.error.code,-32601);
  const legacyNotification=await post({message:{jsonrpc:'2.0',method:'notifications/initialized'},headers:{}});
  assert.equal(legacyNotification.status,202);
});
