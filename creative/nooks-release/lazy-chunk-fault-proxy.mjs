/** Local QA only: inject one failed editor download, then forward normal bytes. */
import { createServer } from 'node:http';

if (!process.argv.includes('--run-chunk-fault')) {
  console.log('Use --run-chunk-fault with the device-only preview running on 127.0.0.1:5190.');
  process.exit(0);
}
let injected = 0;
let editorRequests = 0;
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:5191');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  if (url.pathname === '/__qa/fault-state') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ injected, editorRequests }));
    return;
  }
  if (/^\/assets\/(?:NoteWorkspace|study-content)-[^/]+\.js$/.test(url.pathname)) {
    editorRequests += 1;
    if (injected === 0) {
      injected += 1;
      response.writeHead(503, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      response.end('One intentional local editor-download failure.');
      return;
    }
  }
  try {
    const upstream = await fetch(`http://127.0.0.1:5190${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers.range ? { Range: request.headers.range } : {},
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const headers = { 'cache-control': 'no-store' };
    for (const name of ['content-type', 'content-range', 'accept-ranges']) {
      if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
    }
    response.writeHead(upstream.status, headers);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    response.writeHead(502, { 'content-type': 'text/plain' });
    response.end('Local preview unavailable.');
  }
}).listen(5191, '127.0.0.1', () => console.log('Local one-shot chunk failure proxy: http://127.0.0.1:5191'));
