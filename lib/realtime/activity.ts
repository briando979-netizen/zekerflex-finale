export interface ActivityEvent {
  id: string;
  userId: string;
  type: string;
  title: string;
  description?: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  visibility: "private" | "team" | "public";
}

const activityStreams = new Map<string, ActivityEvent[]>();
const activityListeners = new Map<string, Set<(event: ActivityEvent) => void>>();

export function subscribeActivity(userId: string, listener: (event: ActivityEvent) => void) {
  if (!activityListeners.has(userId)) {
    activityListeners.set(userId, new Set());
  }
  activityListeners.get(userId)?.add(listener);
  return () => activityListeners.get(userId)?.delete(listener);
}

export function recordActivity(userId: string, event: Omit<ActivityEvent, "id" | "timestamp">) {
  const activity: ActivityEvent = {
    ...event,
    id: `act-${Date.now()}`,
    timestamp: new Date(),
  };

  const stream = activityStreams.get(userId) ?? [];
  stream.unshift(activity);
  if (stream.length > 10000) stream.pop();
  activityStreams.set(userId, stream);

  const listeners = activityListeners.get(userId);
  if (listeners) {
    listeners.forEach((l) => l(activity));
  }
}

export function getActivityFeed(userId: string, limit = 50): ActivityEvent[] {
  return (activityStreams.get(userId) ?? []).slice(0, limit);
}

export interface ActivityAggregate {
  type: string;
  count: number;
  latest: ActivityEvent;
  users: string[];
}

export function aggregateActivity(events: ActivityEvent[], timeWindow = 60000): ActivityAggregate[] {
  const now = Date.now();
  const recent = events.filter((e) => now - e.timestamp.getTime() < timeWindow);

  const grouped: Record<string, ActivityEvent[]> = {};
  recent.forEach((e) => {
    const key = `${e.type}:${JSON.stringify(e.metadata)}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  return Object.entries(grouped).map(([, group]) => ({
    type: group[0].type,
    count: group.length,
    latest: group[0],
    users: Array.from(new Set(group.map((e) => e.userId))),
  }));
}

export function getTeamActivity(teamId: string, limit = 100): ActivityEvent[] {
  const allEvents: ActivityEvent[] = [];
  activityStreams.forEach((stream) => {
    allEvents.push(
      ...stream.filter((e) => e.visibility === "team" && e.metadata.teamId === teamId)
    );
  });
  return allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
}
