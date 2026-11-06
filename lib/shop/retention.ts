// Retention metrics & win-back campaigns

export interface RetentionCohort {
  cohortMonth: string; // "2026-01"
  cohortSize: number;
  retention: Record<number, number>; // month => retention %
  churnRate: number; // monthly average
}

export interface ChurnSignal {
  customerId: string;
  signal: "paused" | "usage_drop" | "payment_failed" | "support_ticket" | "no_activity";
  severity: "low" | "medium" | "high";
  detectedAt: Date;
  actionTaken?: string;
}

export interface WinBackCampaign {
  id: string;
  targetSegment: "at_risk" | "churned_7d" | "churned_30d";
  offer: {
    type: "discount" | "free_month" | "loyalty_bonus";
    value: number; // percentage or points
  };
  emailSubject: string;
  status: "draft" | "active" | "ended";
  conversionRate: number;
}

export const CHURN_SIGNALS = {
  paused: { points: 3, message: "Subscription paused" },
  usage_drop: { points: 2, message: "50%+ usage drop" },
  payment_failed: { points: 5, message: "Failed payment" },
  support_ticket: { points: 2, message: "Support issue raised" },
  no_activity: { points: 1, message: "No activity 30+ days" },
};

export function calculateChurnRisk(signals: ChurnSignal[]): number {
  return signals.reduce((score, signal) => {
    const points = CHURN_SIGNALS[signal.signal]?.points || 0;
    const multiplier = signal.severity === "high" ? 2 : signal.severity === "medium" ? 1.5 : 1;
    return score + points * multiplier;
  }, 0);
}

export const WIN_BACK_CAMPAIGNS: WinBackCampaign[] = [
  {
    id: "at_risk_save10",
    targetSegment: "at_risk",
    offer: { type: "discount", value: 10 },
    emailSubject: "We miss you! 10% off to come back",
    status: "active",
    conversionRate: 0.15,
  },
  {
    id: "churned_free_month",
    targetSegment: "churned_7d",
    offer: { type: "free_month", value: 1 },
    emailSubject: "One free month to return",
    status: "active",
    conversionRate: 0.08,
  },
];
