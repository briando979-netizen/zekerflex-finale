// Advanced PWA with offline, background sync, rich notifications
import { unstable_noStore } from 'next/cache';

interface ServiceWorkerConfig {
  cacheName: string;
  version: string;
  maxAge: number;
}

const SW_CONFIG: ServiceWorkerConfig = {
  cacheName: 'zf-v3',
  version: '3.0.0',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Service Worker registration & lifecycle
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // Notify user of update
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('pwa:update', { detail: { newWorker } })
            );
          }
        }
      });
    });

    // Periodic background sync (every 24h)
    if ('periodicSync' in reg) {
      try {
        await reg.periodicSync.register('sync-data', { minInterval: 24 * 60 * 60 * 1000 });
      } catch (e) {
        console.log('Periodic sync registration failed:', e);
      }
    }

    return reg;
  } catch (e) {
    console.error('SW registration failed:', e);
  }
}

// Offline-first data sync queue
export class OfflineSyncQueue {
  private static readonly QUEUE_KEY = 'zf-sync-queue';
  private static readonly MAX_RETRIES = 5;

  static async enqueue(action: {
    id: string;
    endpoint: string;
    method: 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    timestamp: number;
  }) {
    try {
      const queue = this.getQueue();
      queue.push({ ...action, retries: 0 });
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to enqueue:', e);
    }
  }

  static getQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  static async procesQueue() {
    const queue = this.getQueue();
    const remaining = [];

    for (const action of queue) {
      if (action.retries >= this.MAX_RETRIES) continue;

      try {
        const res = await fetch(action.endpoint, {
          method: action.method,
          headers: { 'Content-Type': 'application/json' },
          body: action.body ? JSON.stringify(action.body) : undefined,
        });

        if (!res.ok) {
          action.retries++;
          remaining.push(action);
        }
      } catch (e) {
        action.retries++;
        remaining.push(action);
      }
    }

    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(remaining));
    return queue.length - remaining.length;
  }
}

// Background sync manager
export class BackgroundSyncManager {
  static async sync(tag: string) {
    try {
      const processed = await OfflineSyncQueue.procesQueue();
      console.log(`Synced ${processed} items (tag: ${tag})`);
      return { success: true, processed };
    } catch (e) {
      console.error('Background sync failed:', e);
      return { success: false, processed: 0 };
    }
  }

  static async registerSync(tag: string) {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      if ('sync' in reg) {
        await (reg as any).sync.register(tag);
      }
    } catch (e) {
      console.error('Sync registration failed:', e);
    }
  }
}

// Rich push notifications
export interface RichNotificationPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  vibrate: number[];
  data: Record<string, unknown>;
  actions: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  image?: string;
  video?: string;
  requireInteraction?: boolean;
}

export class RichNotificationManager {
  static async requestPermission() {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission !== 'default') return Notification.permission;

    const perm = await Notification.requestPermission();
    return perm;
  }

  static async subscribe(vapidKey: string) {
    if (!('serviceWorker' in navigator)) return null;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await (reg as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidKey),
      });
      return sub;
    } catch (e) {
      console.error('Push subscription failed:', e);
      return null;
    }
  }

  static async show(payload: RichNotificationPayload) {
    const perm = await this.requestPermission();
    if (perm !== 'granted') return;

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      return reg.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        vibrate: payload.vibrate,
        data: payload.data,
        actions: payload.actions,
        image: payload.image,
        requireInteraction: payload.requireInteraction ?? false,
      });
    }

    return new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      tag: payload.tag,
      vibrate: payload.vibrate,
    });
  }

  private static urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
  }
}

// App installation & splash
export class AppInstallManager {
  static async checkInstallability() {
    return {
      installable: 'beforeinstallprompt' in window,
      standalone: window.navigator.standalone ?? false,
      displayMode: window.matchMedia('(display-mode: standalone)').matches
        ? 'standalone'
        : 'browser',
    };
  }

  static listenForInstallPrompt(onPrompt: (e: any) => void) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      onPrompt(e);
    });
  }

  static onAppInstalled(callback: () => void) {
    window.addEventListener('appinstalled', callback);
  }
}

export const PWA_CONFIG = SW_CONFIG;
