/**
 * Tiny in-memory TTL cache.
 *
 * Tavily's free tier is 1000 searches/month and each app search spends 4 of
 * them, so repeating an identical query must not cost another upstream request.
 * Also covers the suggestions endpoint, which the same prefixes hit constantly
 * while typing. Good enough for one instance - swap for Redis if this ever runs
 * multi-instance.
 */

/**
 * Bump this whenever result shaping changes (filtering, ordering, url rewriting).
 * Without it, cached entries keep serving the old shape for a full TTL after a
 * code change, which reads as "my fix did not work".
 */
export const CACHE_VERSION = 17;

const store = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 200;

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet(key, value) {
  // Cheap eviction: drop the oldest insertion when full.
  if (store.size >= MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
  store.set(key, { value, expires: Date.now() + TTL_MS });
}
