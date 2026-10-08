/** Fixed destination and Build Output API contract. These are public project identifiers, not credentials. */
export const previewProject = Object.freeze({
  projectId: 'prj_o4Y1xDImjiuXMB3EDdwPfoZO2Lud',
  orgId: 'team_lNkAWhjTs7JjsRzUB4lY4UjQ',
  projectName: 'nooks-study-space',
});
export const previewScope = 'eeshpara-1663s-projects';
export const previewApiEntry = "import { createBrowserApiHandler } from './server/browser-api.mjs';\nexport default createBrowserApiHandler();\n";
export const previewFunctionConfig = { runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 90 };
export const previewProjectConfig = { version: 2, framework: null };
export const previewOutputConfig = { version: 3, routes: [
  { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }, continue: true },
  { src: '/api(?:/.*)?', dest: '/api/index' },
  { src: '/nooks-release\\.json', headers: { 'Cache-Control': 'no-store' }, continue: true },
  { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' }, continue: true },
  { handle: 'filesystem' },
  // Missing immutable assets must never become a cacheable SPA document.
  { src: '/assets(?:/.*)?', status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } },
  { src: '/.*', dest: '/index.html' },
] };
