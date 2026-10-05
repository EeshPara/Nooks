import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync(new URL('./artworkImport.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { authorizedArtworkUrl, inspectArtworkBytes, importArtworkFile } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const file = { fileId: 'file-test', downloadUrl: 'https://files.oaiusercontent.com/OLD_SIGNED_SENTINEL', mimeType: 'image/png', fileName: 'PRIVATE_FILENAME_SENTINEL.png' };
const prepared = 'data:image/jpeg;base64,/9j/';
function png(width = 1672, height = 941) { const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]); bytes.set(new TextEncoder().encode('IHDR'),12); const view = new DataView(bytes.buffer); view.setUint32(16,width); view.setUint32(20,height); return bytes; }
test('only the evidenced credential-free HTTPS image origins are accepted', () => {
  for (const value of ['https://files.oaiusercontent.com/image?token=private', 'https://sdmntprwestus.oaiusercontent.com/files/image', 'https://sdmntprcentralus.oaiusercontent.com/files/image']) assert.equal(authorizedArtworkUrl(value), value);
  for (const value of ['https://sdmntprcentralus.oaiusercontent.com.evil.example/image','https://user:pass@sdmntprcentralus.oaiusercontent.com/image','https://other.oaiusercontent.com/image','https://files.oaiusercontent.com.evil.example/image','https://evil.example/files.oaiusercontent.com','http://files.oaiusercontent.com/image','https://user:pass@files.oaiusercontent.com/image','https://files.oaiusercontent.com:444/image','https://files.oaiusercontent.com/image#fragment','https://files.oaiusercontent.com/'+'a'.repeat(8192)]) assert.throws(() => authorizedArtworkUrl(value));
});
test('authorized fresh link takes precedence, downloads without credentials/referrer/redirects and prepares bounded file', async () => {
  let fetched = 0, optimized = 0;
  const result = await importArtworkFile(file, { getDownloadUrl: async id => { assert.equal(id,file.fileId); return 'https://sdmntprwestus.oaiusercontent.com/FRESH'; }, fetchImpl: async (url, init) => { fetched++; assert.equal(url,'https://sdmntprwestus.oaiusercontent.com/FRESH'); assert.equal(init.credentials,'omit'); assert.equal(init.referrerPolicy,'no-referrer'); assert.equal(init.redirect,'error'); assert.equal(init.cache,'no-store'); return new Response(png(),{headers:{'content-type':'image/png'}}); }, optimize: async value => { optimized++; assert.equal(value.type,'image/png'); assert.equal(value.size,33); assert.doesNotMatch(value.name,/PRIVATE/); return prepared; } });
  assert.equal(result,prepared); assert.equal(fetched,1); assert.equal(optimized,1);
});
test('unavailable helper may use original allowed link; explicit authorization denial never falls back', async () => {
  let fetched = 0;
  const options = { getDownloadUrl: async () => null, fetchImpl: async url => { fetched++; assert.equal(url,file.downloadUrl); return new Response(png()); }, optimize: async () => prepared };
  assert.equal(await importArtworkFile(file,options),prepared); assert.equal(fetched,1);
  options.getDownloadUrl = async () => { throw new Error('DENIED_PRIVATE_URL_SENTINEL'); };
  await assert.rejects(importArtworkFile(file,options), error => !error.message.includes('SENTINEL'));
  assert.equal(fetched,1,'no request can bypass an explicit host refusal');
});
test('unknown refreshed origin is refused before fetch, without exposing temporary capabilities', async () => {
  let fetched = false;
  await assert.rejects(importArtworkFile(file,{getDownloadUrl:async()=> 'https://unapproved.example/PRIVATE_URL_SENTINEL',fetchImpl:async()=> {fetched=true;return new Response(png());},optimize:async()=>prepared}),error=>!error.message.includes('SENTINEL'));
  assert.equal(fetched,false);
});
test('content length and streamed byte caps stop before image optimization', async () => {
  for (const advertised of [true,false]) {
    let optimized = false, canceled = false;
    const body = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6_000_001));controller.enqueue(new Uint8Array(6_000_001));},cancel(){canceled=true;}});
    await assert.rejects(importArtworkFile(file,{getDownloadUrl:async()=>null,fetchImpl:async()=>new Response(body,{headers:advertised?{'content-length':'12000002'}:{}}),optimize:async()=>{optimized=true;return prepared;}}),/12 MB/);
    assert.equal(optimized,false); if (!advertised) assert.equal(canceled,true);
  }
});
test('malformed/MIME-mismatched and huge decoded dimensions are rejected before optimization', async () => {
  for (const [bytes,mime] of [[png(8193,10),'image/png'],[png(8000,8000),'image/png'],[png(),'text/html'],[new Uint8Array([1,2,3]),'image/png']]) {
    let optimized=false;
    await assert.rejects(importArtworkFile(file,{getDownloadUrl:async()=>null,fetchImpl:async()=>new Response(bytes,{headers:{'content-type':mime}}),optimize:async()=>{optimized=true;return prepared;}})); assert.equal(optimized,false);
  }
  assert.deepEqual(inspectArtworkBytes(png()),{mime:'image/png',width:1672,height:941});
});
test('timeouts, canceled downloads and optimizer errors never return a ready image or private error details', async () => {
  let fetched=false;
  await assert.rejects(importArtworkFile(file,{getDownloadUrl:()=>new Promise(()=>{}),fetchImpl:async()=>{fetched=true;return new Response(png());},optimize:async()=>prepared,timeoutMs:5}),/stopped/); assert.equal(fetched,false);
  const abort=new AbortController(); let canceled=false;
  const pending=importArtworkFile(file,{getDownloadUrl:async()=>null,signal:abort.signal,fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(png());},cancel(){canceled=true;}})),optimize:async()=>prepared});
  await new Promise(resolve=>setImmediate(resolve)); abort.abort(); await assert.rejects(pending,/stopped/); assert.equal(canceled,true);
  await assert.rejects(importArtworkFile(file,{getDownloadUrl:async()=>null,fetchImpl:async()=>new Response(png()),optimize:async()=>{throw new Error('PRIVATE_FILENAME_SENTINEL');}}),error=>!error.message.includes('SENTINEL'));
});
