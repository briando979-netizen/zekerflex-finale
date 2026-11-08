import { cache } from 'react';

export const optimizeRouteCodeSplit = (routePath: string): string => {
  return `dynamic(() => import('@/${routePath}'), { loading: () => <LoadingFallback /> })`;
};

export const criticalCSSConfig = {
  extraction: {
    enabled: true,
    threshold: 15000,
    inline: true,
  },
  purging: {
    enabled: true,
    safeList: ['[data-theme]', '[aria-hidden]'],
  },
};

export const imageOptimizationConfig = {
  formats: ['webp', 'avif', 'jpg'],
  sizes: [320, 640, 1024, 1920],
  quality: { webp: 80, avif: 75, jpg: 85 },
  lazy: true,
  priority: ['hero', 'above-fold'],
};

export const fontOptimization = {
  strategy: 'swap',
  preload: ['Inter', 'Roboto'],
  display: 'swap',
  subsets: ['latin'],
};

export const scriptOptimization = {
  defer: true,
  async: ['analytics', 'tracking'],
  preload: ['critical-lib'],
  inline: ['hydration-data'],
};

export const prefetchStrategy = {
  routes: ['next-page', 'common-paths'],
  resources: ['api-calls', 'cdn-assets'],
  dns: ['third-party-domains'],
};

export const cacheKeyStrategy = (key: string): string => `v1:${key}:${Date.now() / 86400000 | 0}`;

export const getRevalidateTime = (contentType: 'static' | 'user' | 'dynamic'): number => {
  return { static: 604800, user: 3600, dynamic: 300 }[contentType];
};
