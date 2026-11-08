import { z } from 'zod';

interface PushNotification {
  id: string;
  title: string;
  body: string;
  deepLink: string;
  badge: number;
  priority: 'high' | 'normal' | 'low';
  actions: Array<{ id: string; title: string }>;
}

interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  vibration: boolean;
  alert: boolean;
  deepLinking: boolean;
}

const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  deepLink: z.string(),
  badge: z.number(),
  priority: z.enum(['high', 'normal', 'low']),
  actions: z.array(z.object({ id: z.string(), title: z.string() })),
});

export type NotificationData = z.infer<typeof notificationSchema>;

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  return await Notification.requestPermission();
}

export async function sendPushNotification(notification: PushNotification): Promise<void> {
  if (typeof window === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  const options: NotificationOptions = {
    body: notification.body,
    badge: `/badge-${notification.badge}.png`,
    tag: notification.id,
    requireInteraction: notification.priority === 'high',
    actions: notification.actions,
    data: { deepLink: notification.deepLink },
  };

  new Notification(notification.title, options);
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.error('Failed to register service worker:', err);
    return null;
  }
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
  } catch (err) {
    console.error('Failed to subscribe to push notifications:', err);
    return null;
  }
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return {
    enabled: true,
    sound: true,
    vibration: true,
    alert: true,
    deepLinking: true,
  };
}

export async function handleNotificationClick(notification: Notification): Promise<void> {
  const deepLink = (notification.data as any)?.deepLink;
  if (deepLink && typeof window !== 'undefined') {
    window.location.href = deepLink;
  }
}
