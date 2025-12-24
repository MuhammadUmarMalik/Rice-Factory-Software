type CacheEntry = {
  html: string;
  pdf?: Buffer;
  createdAt: number;
};

const cache = new Map<string, CacheEntry>();
const ttlMs = 1000 * 60 * 5;

function isFresh(entry: CacheEntry) {
  return Date.now() - entry.createdAt < ttlMs;
}

export function getCached(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (!isFresh(entry)) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

export function setCached(key: string, entry: CacheEntry) {
  cache.set(key, entry);
}

