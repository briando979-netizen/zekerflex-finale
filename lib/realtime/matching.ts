export interface MatchEvent {
  id: string;
  workerId: string;
  employerId: string;
  jobId: string;
  status: "offered" | "accepted" | "rejected" | "counter";
  timestamp: Date;
}

const matchEvents = new Map<string, MatchEvent[]>();
const matchListeners = new Map<string, Set<(event: MatchEvent) => void>>();

export function subscribeMatches(userId: string, listener: (event: MatchEvent) => void) {
  if (!matchListeners.has(userId)) {
    matchListeners.set(userId, new Set());
  }
  matchListeners.get(userId)?.add(listener);
  return () => matchListeners.get(userId)?.delete(listener);
}

export function recordMatch(event: Omit<MatchEvent, "id" | "timestamp">) {
  const match: MatchEvent = {
    ...event,
    id: `match-${Date.now()}`,
    timestamp: new Date(),
  };

  // Record for both worker and employer
  [event.workerId, event.employerId].forEach((userId) => {
    const events = matchEvents.get(userId) ?? [];
    events.unshift(match);
    if (events.length > 1000) events.pop();
    matchEvents.set(userId, events);

    const listeners = matchListeners.get(userId);
    if (listeners) {
      listeners.forEach((l) => l(match));
    }
  });
}

export function getMatchHistory(userId: string, limit = 50): MatchEvent[] {
  return (matchEvents.get(userId) ?? []).slice(0, limit);
}

export function getPendingMatches(userId: string): MatchEvent[] {
  return (matchEvents.get(userId) ?? []).filter((e) => e.status === "offered");
}

export interface MatchStats {
  totalOffers: number;
  acceptedOffers: number;
  rejectedOffers: number;
  acceptanceRate: number;
  averageResponseTime: number;
}

export function getMatchStats(userId: string): MatchStats {
  const history = getMatchHistory(userId, 1000);

  const totalOffers = history.filter((e) => e.status !== "counter").length;
  const accepted = history.filter((e) => e.status === "accepted").length;
  const rejected = history.filter((e) => e.status === "rejected").length;

  return {
    totalOffers,
    acceptedOffers: accepted,
    rejectedOffers: rejected,
    acceptanceRate: totalOffers > 0 ? accepted / totalOffers : 0,
    averageResponseTime: 0, // Would calculate from timestamps
  };
}
