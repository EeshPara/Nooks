/** A bounded, process-local guard; authenticated account quotas live in the database. */
export function createRequestLimiter({ limit, windowMs = 60000, maxKeys = 10000 }) {
  const buckets = new Map();
  return (key, now = Date.now()) => {
    // Entries stay ordered by the start of their window, so cleanup visits only expired keys.
    for (const [oldKey, bucket] of buckets) {
      if (now - bucket.startedAt < windowMs) break;
      buckets.delete(oldKey);
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      // Token/address churn must not grow this map without a bound or evict an active limit.
      if (buckets.size >= maxKeys) return { allowed: false, retryAfter: Math.max(1, Math.ceil((buckets.values().next().value.startedAt + windowMs - now) / 1000)) };
      bucket = { startedAt: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count = Math.min(limit + 1, bucket.count + 1);
    return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000)) };
  };
}
