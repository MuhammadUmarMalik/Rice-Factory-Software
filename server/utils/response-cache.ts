import type { Request, Response, NextFunction } from "express";

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

type CacheOptions = {
  ttlMs: number;
  keyPrefix?: string;
};

const responseCache = new Map<string, CacheEntry>();
const maxEntries = 500;

function buildCacheKey(req: Request, keyPrefix = "cache") {
  const userId = req.user?.id ?? "anon";
  const query = req.originalUrl || req.url;
  return `${keyPrefix}:${userId}:${req.method}:${query}`;
}

/** Remove every cached entry that belongs to the given key prefix. */
export function invalidateCache(keyPrefix: string) {
  const prefix = `${keyPrefix}:`;
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

/** Remove all cached responses (e.g. before a backup restore). */
export function clearResponseCache() {
  responseCache.clear();
}

export function cacheResponse({ ttlMs, keyPrefix }: CacheOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    if (req.headers["cache-control"] === "no-store") return next();

    const key = buildCacheKey(req, keyPrefix);
    const cached = responseCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached.payload);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        responseCache.set(key, { expiresAt: now + ttlMs, payload: body });
        if (responseCache.size > maxEntries) {
          const oldestKey = responseCache.keys().next().value;
          if (oldestKey) responseCache.delete(oldestKey);
        }
        res.setHeader("X-Cache", "MISS");
      }
      return originalJson(body);
    };

    next();
  };
}
