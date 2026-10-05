type Cancellation = { draftId: string; requestId: string };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const memory = new Map<string, Cancellation[]>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const valid = (value: unknown): value is Cancellation => !!value && typeof value === 'object' && uuid.test((value as Cancellation).draftId) && uuid.test((value as Cancellation).requestId);
function storage() { try { return sessionStorage; } catch { return undefined; } }
/** Separate from writing/practice quotas. Confirmed cancellation markers are
 * exact-account/exact-request and never silently evicted to make room. */
export function createArtworkCancellationStore(scope: string, disk: StorageLike | undefined = storage(), cache = memory) {
  const key = `nooks:artwork-cancellations:v1:${encodeURIComponent(scope)}`;
  const durable = scope === 'device' || /^account:[A-Za-z0-9_-]{1,128}$/.test(scope);
  let transient: Cancellation[] | undefined;
  function read() {
    if (transient) return transient;
    const stored = cache.get(key); if (stored) return stored;
    let records: Cancellation[] = [];
    if (durable && disk) try { const raw = disk.getItem(key); if (raw && raw.length <= 16000) { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length <= 24 && parsed.every(valid)) records = parsed; } } catch {}
    if (cache.size < 256) cache.set(key, records); else transient = records;
    return records;
  }
  function write(records: Cancellation[]) {
    if (cache.has(key) || cache.size < 256) cache.set(key, records); else transient = records;
    if (!durable || !disk) return false;
    try { if (records.length) disk.setItem(key, JSON.stringify(records)); else disk.removeItem(key); return true; } catch { return false; }
  }
  return {
    get: (id: string) => read().find(record => record.draftId === id),
    retain: (record: Cancellation) => {
      if (!valid(record)) throw new Error('The artwork cancellation could not be kept safely. Keep this editor open and retry.');
      const next = read().filter(item => item.draftId !== record.draftId);
      if (next.length >= 24) throw new Error('Finish canceling an earlier image request before closing this editor.');
      next.push({ ...record }); return write(next) && !transient;
    },
    acknowledge: (record: Cancellation) => write(read().filter(item => item.draftId !== record.draftId || item.requestId !== record.requestId)),
  };
}
