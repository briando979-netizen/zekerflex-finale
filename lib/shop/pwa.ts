// Progressive Web App utilities

export interface PWAConfig {
  name: string;
  shortName: string;
  description: string;
  startUrl: string;
  display: "fullscreen" | "standalone" | "minimal-ui" | "browser";
  orientation: "any" | "portrait" | "landscape";
  backgroundColor: string;
  themeColor: string;
  icons: PWAIcon[];
  screenshots: PWAScreenshot[];
}

export interface PWAIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface PWAScreenshot {
  src: string;
  sizes: string;
  type: string;
  form_factor: "narrow" | "wide";
}

export const PWA_CONFIG: PWAConfig = {
  name: "ZekerFlex Shop",
  shortName: "ZF Shop",
  description: "Modern e-commerce platform met abonnementen, loyaliteit en marketplace",
  startUrl: "/shop",
  display: "standalone",
  orientation: "portrait-primary",
  backgroundColor: "#ffffff",
  themeColor: "#004E89",
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-192-maskable.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  screenshots: [
    {
      src: "/screenshots/shop-narrow.png",
      sizes: "540x720",
      type: "image/png",
      form_factor: "narrow",
    },
    {
      src: "/screenshots/shop-wide.png",
      sizes: "1280x720",
      type: "image/png",
      form_factor: "wide",
    },
  ],
};

export function getManifest(): string {
  return JSON.stringify(PWA_CONFIG, null, 2);
}

export const SERVICE_WORKER_STRATEGIES = {
  NETWORK_FIRST: "network_first",
  CACHE_FIRST: "cache_first",
  STALE_WHILE_REVALIDATE: "stale_while_revalidate",
};

export const CACHEABLE_ROUTES = [
  "/shop",
  "/shop/products",
  "/shop/checkout",
  "/api/shop/products",
  "/api/shop/cart",
];
