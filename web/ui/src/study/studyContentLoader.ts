/** The URL comes only from our build registry; saved/user data cannot select code. */
export function createStudyContentLoader<T>(compiledUrl: string, origin: string, development = false,
  importModule: (url: string) => Promise<T> = url => import(/* @vite-ignore */ url)) {
  const base = new URL(compiledUrl, origin);
  const allowedPath = /^\/assets\/study-content-[A-Za-z0-9_-]+\.js$/.test(base.pathname)
    || (development && base.pathname === '/src/study/DeferredStudyContent.tsx');
  if (base.origin !== origin || !/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash || !allowedPath) throw new Error('Unknown study module.');
  let pending: Promise<T> | undefined, attempt = 0;
  return () => {
    if (pending) return pending;
    const url = new URL(base);
    // Chrome caches failed module URLs. A fresh lazy type alone cannot retry one.
    if (attempt) url.searchParams.set('nooks_retry', String(attempt));
    const request = Promise.resolve().then(() => importModule(url.href));
    const shared = request.catch(error => { if (pending === shared) pending = undefined; attempt++; throw error; });
    pending = shared;
    return shared;
  };
}
