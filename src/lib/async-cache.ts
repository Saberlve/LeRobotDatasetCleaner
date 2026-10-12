/** Bounded, expiring cache that also shares concurrent requests. Failures are
 * evicted so a transient error never prevents retrying an episode. */
export function createAsyncCache<V>(maxEntries: number, ttlMs = 60_000) {
  const entries = new Map<string, { promise: Promise<V>; expiry: number }>();
  return (key: string, load: () => Promise<V>): Promise<V> => {
    const cached = entries.get(key);
    if (cached && cached.expiry > Date.now()) {
      entries.delete(key);
      entries.set(key, cached);
      return cached.promise;
    }
    const promise = load();
    const entry = { promise, expiry: Date.now() + ttlMs };
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > maxEntries)
      entries.delete(entries.keys().next().value!);
    void promise.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return promise;
  };
}
