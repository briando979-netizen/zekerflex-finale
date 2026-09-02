import type { DbaAction, DbaRiskLevel } from "@prisma/client";

export interface DbaWindow {
  start: Date;
  end: Date;
}

export interface DbaMetrics {
  totalMinutes: number;
  totalHours: number;
  engagementCount: number;
  distinctWeeks: number;
  maxConsecutiveWeeks: number;
  averageHoursPerActiveWeek: number;
  /** This branch's tenant share of the freelancer's platform revenue in window. */
  clientRevenueShare: number;
  /** Distinct branches (of any tenant) the freelancer worked in the window. */
  distinctBranchCount: number;
}

export interface DbaThresholds {
  maxHoursPerClient: number;
  warnHoursPerClient: number;
  maxConsecutiveWeeks: number;
  maxClientRevenueShare: number;
}

export interface DbaEvaluation {
  freelancerId: string;
  branchId: string;
  window: DbaWindow;
  metrics: DbaMetrics;
  riskLevel: DbaRiskLevel;
  action: DbaAction;
  rationale: string;
  /** Signals that individually contributed to the risk level. */
  signals: {
    key: string;
    label: string;
    value: number;
    threshold: number;
    breached: boolean;
  }[];
  /** When action is THROTTLE/BLOCK, matching is suppressed until this instant. */
  matchingBlockedUntil: Date | null;
}
