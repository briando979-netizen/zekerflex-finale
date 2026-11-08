export interface RealtimeNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";
  action?: { type: string; id: string; label: string };
  sound?: boolean;
  read: boolean;
  createdAt: Date;
}

const notificationQueue = new Map<string, RealtimeNotification[]>();
const notificationListeners = new Map<string, Set<(notif: RealtimeNotification) => void>>();

export function subscribeNotifications(userId: string, listener: (notif: RealtimeNotification) => void) {
  if (!notificationListeners.has(userId)) {
    notificationListeners.set(userId, new Set());
  }
  notificationListeners.get(userId)?.add(listener);
  return () => notificationListeners.get(userId)?.delete(listener);
}

export function notify(userId: string, notification: Omit<RealtimeNotification, "id" | "createdAt" | "read">) {
  const notif: RealtimeNotification = {
    ...notification,
    id: `notif-${Date.now()}`,
    read: false,
    createdAt: new Date(),
  };

  const queue = notificationQueue.get(userId) ?? [];
  queue.unshift(notif);
  if (queue.length > 1000) queue.pop();
  notificationQueue.set(userId, queue);

  const listeners = notificationListeners.get(userId);
  if (listeners) {
    listeners.forEach((l) => {
      setTimeout(() => l(notif), 0); // Async to prevent blocking
    });
  }

  // Browser push if enabled
  if (notification.priority === "urgent" || notification.sound) {
    sendBrowserNotification(userId, notification);
  }
}

function sendBrowserNotification(userId: string, notif: any) {
  // Implementation for browser push via service worker
  // Queue it for SW to pick up
  const key = `notif:${userId}:${Date.now()}`;
  // Would store in KV or send via push service
}

export function markRead(userId: string, notifId: string) {
  const queue = notificationQueue.get(userId);
  if (queue) {
    const notif = queue.find((n) => n.id === notifId);
    if (notif) {
      notif.read = true;
      const listeners = notificationListeners.get(userId);
      if (listeners) {
        listeners.forEach((l) => l(notif));
      }
    }
  }
}

export function getNotifications(userId: string, limit = 50): RealtimeNotification[] {
  return (notificationQueue.get(userId) ?? []).slice(0, limit);
}

export function getUnreadCount(userId: string): number {
  return (notificationQueue.get(userId) ?? []).filter((n) => !n.read).length;
}

export function groupNotifications(notifications: RealtimeNotification[]): Record<string, RealtimeNotification[]> {
  const grouped: Record<string, RealtimeNotification[]> = {};
  notifications.forEach((n) => {
    if (!grouped[n.type]) grouped[n.type] = [];
    grouped[n.type].push(n);
  });
  return grouped;
}
