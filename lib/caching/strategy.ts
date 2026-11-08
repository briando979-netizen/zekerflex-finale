import { kv } from '@/lib/kv';
import { cache } from 'react';

export const cacheConfig = {
  browser: {
    static: { maxAge: 31536000, immutable: true },
    dynamic: { maxAge: 3600, 'stale-while-revalidate': 86400 },
    api: { maxAge: 300, 'stale-while-revalidate': 600 },
  },
  server: {
    user: 3600,
    shifts: 300,
    profiles: 1800,
    analytics: 600,
  },
};

export const serverCache = cache(async (key: string, fetcher: () => Promise<any>) => {
  const cached = await kv.get(key);
  if (cached) return cached;
  const fresh = await fetcher();
  await kv.set(key, fresh, { ex: cacheConfig.server.shifts });
  return fresh;
});

export const invalidationRules = {
  'user:*': ['user-profile', 'user-shifts', 'user-ratings'],
  'shift:*': ['company-shifts', 'marketplace', 'assignment-feed'],
  'assignment:*': ['shift-status', 'user-dashboard', 'company-dashboard'],
};

export const invalidateCache = async (pattern: string) => {
  const matching = await kv.keys(pattern);
  if (matching.length > 0) await kv.delete(...matching);
};

export const getCacheHeaders = (contentType: 'static' | 'dynamic' | 'api') => {
  const config = cacheConfig.browser[contentType];
  return {
    'Cache-Control': Object.entries(config).map(([k, v]) => `${k}=${v}`).join(', '),
    'Vary': 'Accept-Encoding, Accept',
  };
};

export const staleWhileRevalidate = async (
  key: string,
  fetcher: () => Promise<any>,
  ttl = 3600
): Promise<any> => {
  const cached = await kv.get(key);
  if (cached) {
    fetcher().then(fresh => kv.set(key, fresh, { ex: ttl })).catch(() => {});
    return cached;
  }
  const fresh = await fetcher();
  await kv.set(key, fresh, { ex: ttl });
  return fresh;
};
