/** Node-style request lifetime; hosted disconnect propagation remains adapter-dependent. */
export function createRequestLifetime(request, response, fetchImpl) {
  const controller = new AbortController();
  const listeners = [];
  const disconnect = () => {
    if (!controller.signal.aborted) controller.abort(new DOMException('Client disconnected.', 'AbortError'));
  };
  const listen = (target, event, listener) => {
    if (typeof target.on !== 'function' || typeof target.removeListener !== 'function') return;
    target.on(event, listener);
    listeners.push(() => target.removeListener(event, listener));
  };
  listen(request, 'aborted', disconnect);
  listen(request, 'close', () => { if (request.complete === false) disconnect(); });
  listen(response, 'close', () => { if (!response.writableFinished) disconnect(); });
  if (request.aborted || (request.destroyed && request.complete === false) || (response.destroyed && !response.writableFinished)) disconnect();
  return {
    get disconnected() { return controller.signal.aborted; },
    async fetch(input, init) {
      const upstreamSignal = init?.signal === undefined ? (input instanceof Request ? input.signal : undefined) : init.signal;
      const signal = upstreamSignal ? AbortSignal.any([controller.signal, upstreamSignal]) : controller.signal;
      signal.throwIfAborted();
      const result = await fetchImpl(input, { ...init, signal });
      // Also stop follow-up work if an injected transport resolved despite the abort.
      signal.throwIfAborted();
      return result;
    },
    dispose() { for (const remove of listeners.splice(0)) remove(); },
  };
}
