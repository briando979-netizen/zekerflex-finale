import { z } from "zod";

export const mobileOptimization = {
  responsive: {
    breakpoints: {
      xs: 320, sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536
    },
    gridCols: {
      xs: 1, sm: 2, md: 3, lg: 4, xl: 6
    },
    defaultLayout: {
      xs: "stacked",
      sm: "two-column",
      md: "grid"
    }
  },
  touchOptimization: {
    minTouchTarget: 44,
    gestureSupport: ["swipe", "pinch", "long-press"],
    hapticFeedback: true
  },
  offlineMode: {
    enableOfflineCache: true,
    cacheStale: 3600,
    syncOnReconnect: true,
    fallbackData: true
  },
  performance: {
    lazyLoadWidgets: true,
    imageOptimization: true,
    chunkSize: 256,
    prioritizeViewport: true
  }
};

export async function getMobileLayout(dashboardId: string) {
  return {
    layout: "stacked",
    widgets: [],
    refreshInterval: 60000,
    offlineEnabled: true
  };
}

export async function getWidgetsMobile(dashboardId: string) {
  return {
    priority: ["kpi", "alert", "status"],
    hiddenByDefault: ["table", "heatmap"],
    responsive: true,
    touch: true
  };
}

export const mobileSchema = z.object({
  enableOffline: z.boolean().default(true),
  compactMode: z.boolean().default(false),
  dataRefreshInterval: z.number().default(60000),
  touchGestures: z.boolean().default(true),
  hapticFeedback: z.boolean().default(false),
  dataUsageMode: z.enum(["normal", "lite", "ultra-lite"]).default("normal")
});

export async function getMobileSettings(userId: string) {
  return mobileSchema.parse({
    enableOffline: true,
    compactMode: false,
    dataRefreshInterval: 60000,
    touchGestures: true
  });
}
