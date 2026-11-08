/**
 * App Shell Architecture Subsystem
 *
 * Minimal initial load with cached shell structure. Dynamic content loads separately.
 * Reduces Time to Interactive (TTI) and improves perceived performance.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ===== Shell Structure =====

export interface AppShellContent {
  key: string;
  content: Record<string, unknown>;
  etag: string;
  version: number;
  expiresAt: number;
}

/**
 * Cache app shell metadata (navigation, user profile, settings)
 */
export async function cacheAppShellContent(
  userId: string,
  key: string,
  content: Record<string, unknown>,
  ttlSeconds: number = 3600,
): Promise<void> {
  try {
    const etag = generateEtag(content);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await prisma.appShellCache.upsert({
      where: { userId_key: { userId, key } },
      create: {
        userId,
        key,
        content,
        version: 1,
        etag,
        expiresAt,
      },
      update: {
        content,
        version: { increment: 1 },
        etag,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    logger.info("App shell content cached", {
      userId,
      key,
      version: 1,
    });
  } catch (error) {
    logger.warn("Failed to cache app shell content", {
      error: (error as Error).message,
      userId,
      key,
    });
  }
}

/**
 * Get cached app shell content
 */
export async function getAppShellContent(
  userId: string,
  key: string,
): Promise<AppShellContent | null> {
  try {
    const cached = await prisma.appShellCache.findUnique({
      where: { userId_key: { userId, key } },
    });

    if (!cached) return null;

    // Check expiration
    if (cached.expiresAt < new Date()) {
      // Async cleanup
      prisma.appShellCache
        .delete({ where: { userId_key: { userId, key } } })
        .catch(() => {
          /* Ignore */
        });
      return null;
    }

    return {
      key: cached.key,
      content: cached.content as Record<string, unknown>,
      etag: cached.etag || "",
      version: cached.version,
      expiresAt: cached.expiresAt.getTime(),
    };
  } catch (error) {
    logger.warn("Failed to get app shell content", {
      error: (error as Error).message,
      userId,
      key,
    });
    return null;
  }
}

/**
 * Get all app shell content for a user
 */
export async function getAllAppShellContent(userId: string) {
  try {
    return await prisma.appShellCache.findMany({
      where: { userId },
      select: {
        key: true,
        content: true,
        version: true,
        etag: true,
        expiresAt: true,
      },
    });
  } catch (error) {
    logger.warn("Failed to get all app shell content", {
      error: (error as Error).message,
      userId,
    });
    return [];
  }
}

// ===== Shell Routes =====

export const SHELL_KEYS = {
  NAVIGATION: "shell-nav",
  USER_PROFILE: "user-profile",
  DASHBOARD_META: "dashboard-meta",
  FAVORITES: "favorites",
  BLOCKED: "blocked",
  SETTINGS: "settings",
} as const;

/**
 * Build minimal navigation shell
 */
export function buildNavShell(userRole: string) {
  return {
    role: userRole,
    sections: [
      {
        id: "main",
        items: userRole === "FREELANCER"
          ? [
              { id: "dashboard", label: "Dashboard", icon: "home", href: "/dashboard" },
              { id: "shifts", label: "Klussen", icon: "briefcase", href: "/dashboard/klussen" },
              { id: "chat", label: "Berichten", icon: "chat", href: "/chat" },
              { id: "profile", label: "Profiel", icon: "user", href: "/dashboard/profiel" },
            ]
          : [
              { id: "dashboard", label: "Dashboard", icon: "home", href: "/werkgever/dashboard" },
              { id: "team", label: "Team", icon: "users", href: "/werkgever/team" },
              { id: "calendar", label: "Kalender", icon: "calendar", href: "/werkgever/kalender" },
              { id: "chat", label: "Berichten", icon: "chat", href: "/chat" },
            ],
      },
    ],
  };
}

/**
 * Build user profile shell
 */
export function buildProfileShell(profile: {
  id: string;
  name: string;
  avatar?: string;
  email: string;
  role: string;
}) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    avatar: profile.avatar,
    role: profile.role,
  };
}

/**
 * Build dashboard metadata shell
 */
export function buildDashboardMetaShell(meta: {
  unreadMessages: number;
  pendingActions: number;
  upcomingShifts: number;
}) {
  return {
    badges: {
      messages: meta.unreadMessages,
      actions: meta.pendingActions,
    },
    stats: {
      upcoming: meta.upcomingShifts,
    },
  };
}

// ===== Dynamic Content Loading =====

export interface DynamicContentBatch {
  key: string;
  url: string;
  priority: "high" | "normal" | "low";
  cacheStrategy: "network-first" | "cache-first" | "stale-while-revalidate";
}

/**
 * Define content batches to load after shell
 */
export const DYNAMIC_CONTENT_BATCHES: Record<string, DynamicContentBatch[]> = {
  dashboard: [
    {
      key: "shifts-list",
      url: "/api/shifts?limit=10",
      priority: "high",
      cacheStrategy: "network-first",
    },
    {
      key: "messages-preview",
      url: "/api/chat/preview",
      priority: "high",
      cacheStrategy: "network-first",
    },
    {
      key: "stats",
      url: "/api/profile/stats",
      priority: "normal",
      cacheStrategy: "cache-first",
    },
  ],
};

/**
 * Load dynamic content with priority queue
 */
export async function loadDynamicContent(
  batch: DynamicContentBatch[],
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();

  // Sort by priority
  const sorted = [...batch].sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Load in parallel with priority grouping
  const highPriority = sorted.filter((b) => b.priority === "high");
  const normalPriority = sorted.filter((b) => b.priority === "normal");
  const lowPriority = sorted.filter((b) => b.priority === "low");

  // Load high priority first, then others
  const loadBatch = async (items: DynamicContentBatch[]) => {
    await Promise.all(
      items.map(async (item) => {
        try {
          const response = await fetch(item.url, {
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            results.set(item.key, await response.json());
          }
        } catch (error) {
          logger.warn("Failed to load dynamic content", {
            key: item.key,
            error: (error as Error).message,
          });
        }
      }),
    );
  };

  await loadBatch(highPriority);
  // Continue with normal/low priority in background
  loadBatch(normalPriority).catch(() => {
    /* Non-critical */
  });
  loadBatch(lowPriority).catch(() => {
    /* Non-critical */
  });

  return results;
}

// ===== Shell Size Optimization =====

/**
 * Calculate shell overhead
 */
export function calculateShellSize(shell: Record<string, unknown>): number {
  return JSON.stringify(shell).length;
}

/**
 * Compress shell for transmission
 */
export function compressShell(shell: Record<string, unknown>): string {
  // Could use gzip, but for small shells JSON is fine
  return JSON.stringify(shell);
}

/**
 * Monitor shell performance
 */
export interface ShellMetrics {
  shellSizeBytes: number;
  shellLoadTimeMs: number;
  contentLoadTimeMs: number;
  tti: number; // Time to Interactive
}

// ===== Utilities =====

function generateEtag(content: Record<string, unknown>): string {
  const str = JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `"${hash.toString(16)}"`;
}

/**
 * Clean up expired shell cache (run in cron)
 */
export async function cleanupExpiredShellCache(): Promise<number> {
  try {
    const result = await prisma.appShellCache.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    logger.info("Cleaned up expired app shell cache", { count: result.count });
    return result.count;
  } catch (error) {
    logger.error("Cleanup failed", {
      error: (error as Error).message,
    });
    return 0;
  }
}

/**
 * Invalidate shell cache for user (after login/logout)
 */
export async function invalidateShellCache(userId: string): Promise<void> {
  try {
    await prisma.appShellCache.deleteMany({ where: { userId } });
    logger.info("Shell cache invalidated", { userId });
  } catch (error) {
    logger.warn("Failed to invalidate shell cache", {
      error: (error as Error).message,
      userId,
    });
  }
}
