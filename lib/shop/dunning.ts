// Dunning management — retry failed payments, recover at-risk subscriptions

export type DunningStatus = "pending" | "in_progress" | "recovered" | "failed";

export interface DunningAttempt {
  subscriptionId: string;
  attemptNumber: number;
  status: DunningStatus;
  failureReason: string;
  nextRetryAt: Date;
  createdAt: Date;
}

// Dunning schedule: retry at exponential intervals
export const DUNNING_SCHEDULE = [
  { attemptNumber: 1, delayHours: 24 }, // Retry after 24 hours
  { attemptNumber: 2, delayHours: 72 }, // Then 3 days
  { attemptNumber: 3, delayHours: 168 }, // Then 1 week
  { attemptNumber: 4, delayHours: 336 }, // Then 2 weeks
];

export function getNextRetryTime(previousAttempt: DunningAttempt): Date {
  const nextSchedule = DUNNING_SCHEDULE.find(
    (s) => s.attemptNumber === previousAttempt.attemptNumber + 1
  );
  if (!nextSchedule) {
    // No more retries — cancel subscription
    return new Date();
  }

  const nextRetry = new Date(previousAttempt.createdAt);
  nextRetry.setHours(nextRetry.getHours() + nextSchedule.delayHours);
  return nextRetry;
}

export function shouldCancelSubscription(attempts: DunningAttempt[]): boolean {
  // Cancel after 4 failed attempts (14+ days)
  return attempts.length >= 4 && attempts.every((a) => a.status !== "recovered");
}

// Send dunning emails
export const DUNNING_EMAILS = {
  attempt1: "Betaling mislukt — probeer het opnieuw",
  attempt2: "⚠ Je abonnement staat op het punt te worden geannuleerd",
  attempt3: "Laatste waarschuwing — je abonnement verloopt morgen",
  final: "Je abonnement is geannuleerd",
};
