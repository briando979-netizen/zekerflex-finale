/**
 * Offline-First Caching Subsystem
 *
 * Manages service worker registration, cache strategies, and IndexedDB
 * for shifts, applications, messages, and profile data. Fallback for
 * network-first operations when offline.
 */

import { logger } from "@/lib/logger";

// ===== Service Worker Registration =====

export interface CacheStrategy {
  name: string;
  maxAge: number; // seconds, 0 = no cache
  priority: "network-first" | "cache-first" | "stale-while-revalidate";
}

const STRATEGIES: Record<string, CacheStrategy> = {
  shifts: {
    name: "shifts-v1",
    maxAge: 5 * 60, // 5 min
    priority: "network-first",
  },
  messages: {
    name: "messages-v1",
    maxAge: 3 * 60, // 3 min
    priority: "network-first",
  },
  profile: {
    name: "profile-v1",
    maxAge: 30 * 60, // 30 min
    priority: "cache-first",
  },
  metadata: {
    name: "metadata-v1",
    maxAge: 60 * 60, // 1 hour
    priority: "stale-while-revalidate",
  },
};

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    logger.debug("Service Worker not available");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none", // Always check for updates
    });

    logger.info("Service Worker registered", {
      scope: registration.scope,
      updateFinding: registration.updateFinding,
    });

    // Check for updates daily
    const lastCheck = localStorage.getItem("sw-check-time");
    const now = Date.now();
    if (!lastCheck || now - parseInt(lastCheck, 10) > 86_400_000) {
      registration.update().catch((e) => {
        logger.warn("Service Worker update check failed", {
          error: (e as Error).message,
        });
      });
      localStorage.setItem("sw-check-time", now.toString());
    }

    return registration;
  } catch (error) {
    logger.error("Service Worker registration failed", {
      error: (error as Error).message,
    });
    return null;
  }
}

export async function unregisterServiceWorker(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    logger.info("Service Workers unregistered");
  }
}

// ===== IndexedDB for Offline Storage =====

const DB_NAME = "zf-offline";
const DB_VERSION = 1;

interface IndexedDBStores {
  shifts: IDBObjectStore;
  messages: IDBObjectStore;
  profile: IDBObjectStore;
  metadata: IDBObjectStore;
  queue: IDBObjectStore;
}

let dbInstance: IDBDatabase | null = null;

export async function initOfflineDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(new Error("Failed to open IndexedDB"));
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Shifts
      if (!db.objectStoreNames.contains("shifts")) {
        const s = db.createObjectStore("shifts", { keyPath: "id" });
        s.createIndex("userId", "userId");
        s.createIndex("createdAt", "createdAt");
      }

      // Messages
      if (!db.objectStoreNames.contains("messages")) {
        const m = db.createObjectStore("messages", { keyPath: "id" });
        m.createIndex("userId", "userId");
        m.createIndex("threadId", "threadId");
        m.createIndex("createdAt", "createdAt");
      }

      // Profile
      if (!db.objectStoreNames.contains("profile")) {
        db.createObjectStore("profile", { keyPath: "userId" });
      }

      // Metadata (nav, settings)
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }

      // Offline queue (pending actions)
      if (!db.objectStoreNames.contains("queue")) {
        const q = db.createObjectStore("queue", { keyPath: "id" });
        q.createIndex("userId", "userId");
        q.createIndex("action", "action");
        q.createIndex("createdAt", "createdAt");
      }
    };
  });
}

export async function cacheData(
  store: keyof IndexedDBStores,
  data: unknown,
  key?: string,
): Promise<void> {
  try {
    const db = await initOfflineDb();
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);

    if (key) {
      os.put({ ...((data as Record<string, unknown>) || {}), key });
    } else {
      os.put(data);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to cache data in ${store}`));
    });
  } catch (error) {
    logger.warn("Offline cache failed", {
      store,
      error: (error as Error).message,
    });
  }
}

export async function getCachedData<T>(
  store: keyof IndexedDBStores,
  key?: string,
): Promise<T | null> {
  try {
    const db = await initOfflineDb();
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);

    return new Promise((resolve, reject) => {
      const req = key ? os.get(key) : os.getAll();
      req.onsuccess = () => resolve((req.result as T) || null);
      req.onerror = () => reject(new Error(`Failed to read from ${store}`));
    });
  } catch (error) {
    logger.warn("Offline read failed", {
      store,
      error: (error as Error).message,
    });
    return null;
  }
}

export async function clearOfflineDb(): Promise<void> {
  try {
    const db = await initOfflineDb();
    const stores = ["shifts", "messages", "profile", "metadata", "queue"];
    const tx = db.transaction(stores, "readwrite");

    for (const store of stores) {
      tx.objectStore(store).clear();
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Failed to clear offline DB"));
    });
  } catch (error) {
    logger.error("Clear offline DB failed", {
      error: (error as Error).message,
    });
  }
}

// ===== Cache Size Management =====

export async function getOfflineStorageSize(): Promise<{
  used: number;
  quota: number;
  percentage: number;
}> {
  try {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      percentage: ((estimate.usage ?? 0) / (estimate.quota ?? 1)) * 100,
    };
  } catch {
    return { used: 0, quota: 0, percentage: 0 };
  }
}

export async function pruneOfflineCache(): Promise<void> {
  try {
    const db = await initOfflineDb();
    const now = Date.now();
    const expireAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Prune shifts older than 30 days
    const tx = db.transaction(["shifts", "messages"], "readwrite");
    const shiftStore = tx.objectStore("shifts");
    const msgStore = tx.objectStore("messages");

    const shiftIndex = shiftStore.index("createdAt");
    const msgIndex = msgStore.index("createdAt");

    const shiftRange = IDBKeyRange.upperBound(now - expireAge, true);
    const msgRange = IDBKeyRange.upperBound(now - expireAge, true);

    shiftIndex.openCursor(shiftRange).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    msgIndex.openCursor(msgRange).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await new Promise((resolve) => {
      tx.oncomplete = () => resolve(undefined);
    });

    logger.info("Offline cache pruned");
  } catch (error) {
    logger.warn("Cache pruning failed", {
      error: (error as Error).message,
    });
  }
}

export function getCacheStrategy(resource: string): CacheStrategy {
  return STRATEGIES[resource] || STRATEGIES.metadata;
}
